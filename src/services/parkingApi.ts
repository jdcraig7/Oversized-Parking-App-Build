import AsyncStorage from '@react-native-async-storage/async-storage';

import { OVERPASS_URLS, PARKING_LIBRARY_URL, USER_AGENT } from '../config';
import { buildParkingQuery, overpassFailure, parseOverpass, type OverpassResponse } from '../lib/osm';
import { elementsWithin, planTiles, versionedTilePath, tilesForCircle, type LibraryManifest, type ParkingTile } from '../lib/tiles';
import type { LatLng, ParkingSpot } from '../lib/types';

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20;
const cache = new Map<string, { at: number; spots: ParkingSpot[] }>();

// Spots seen this session, so the detail screen can look one up by id.
const spotIndex = new Map<string, ParkingSpot>();

export function getCachedSpot(id: string): ParkingSpot | undefined {
  return spotIndex.get(id);
}

/** Makes a spot that didn't come from a search (e.g. a sponsor's) openable by id. */
export function cacheSpot(spot: ParkingSpot) {
  spotIndex.set(spot.id, spot);
}

function cacheKey({ latitude, longitude }: LatLng, radius: number) {
  // ~100 m buckets so tiny map nudges reuse the same results.
  return `${latitude.toFixed(3)},${longitude.toFixed(3)},${Math.round(radius)}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class ParkingSearchError extends Error {}

/** Give up on a server that hasn't answered after this long and try the next one. */
const SERVER_TIMEOUT_MS = 12000;
/**
 * Public Overpass servers ban clients that keep querying after being told to
 * slow down (HTTP 429) or refused (403/406), so such a server rests for a while.
 */
const REST_AFTER_REFUSAL_MS = 2 * 60 * 1000;
const restingUntil = new Map<string, number>();

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0];

/**
 * Finds parking within `radiusMeters` of `center`. Tries each Overpass server in turn.
 * Results are cached briefly; pass `force` to skip the cache (pull to refresh).
 * On failure the error message says what each server did, so problems on a
 * phone can be diagnosed from a screenshot.
 */
export async function searchParking(
  center: LatLng,
  radiusMeters: number,
  { force = false }: { force?: boolean } = {},
): Promise<ParkingSpot[]> {
  const key = cacheKey(center, radiusMeters);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.spots;

  const manifest = PARKING_LIBRARY_URL ? await loadManifest(PARKING_LIBRARY_URL, force) : null;
  const plan = manifest ? planTiles(manifest, tilesForCircle(center, radiusMeters)) : null;
  if (PARKING_LIBRARY_URL && plan?.covered) {
    const tiles = await loadTiles(PARKING_LIBRARY_URL, manifest!, plan.fetch);
    const spots = parseOverpass({ elements: elementsWithin(tiles, center, radiusMeters) });
    // Nothing at all usually means the edge of the built area (a border tile
    // holding a few places from the next state), so try the other source too.
    if (spots.length > 0) {
      for (const s of spots) spotIndex.set(s.id, s);
      cache.set(key, { at: Date.now(), spots });
      if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      return spots;
    }
  }
  // Outside the library (or none configured): ask the public Overpass servers.

  const body = `data=${encodeURIComponent(buildParkingQuery(center.latitude, center.longitude, radiusMeters))}`;
  const problems: string[] = [];
  for (const url of OVERPASS_URLS) {
    const host = hostOf(url);
    if ((restingUntil.get(url) ?? 0) > Date.now()) {
      problems.push(`${host}: paused after it asked us to slow down`);
      continue;
    }
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body,
        },
        SERVER_TIMEOUT_MS,
      );
      if (res.status === 429 || res.status === 403 || res.status === 406) {
        restingUntil.set(url, Date.now() + REST_AFTER_REFUSAL_MS);
        problems.push(`${host}: refused (HTTP ${res.status})`);
        continue;
      }
      if (!res.ok) {
        problems.push(`${host}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as OverpassResponse;
      const failure = overpassFailure(json);
      if (failure) {
        // Partial results would silently hide garages, so treat them as a failure.
        problems.push(`${host}: ${failure}`);
        continue;
      }
      const spots = parseOverpass(json);
      for (const s of spots) spotIndex.set(s.id, s);
      cache.set(key, { at: Date.now(), spots });
      if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      return spots;
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'AbortError';
      problems.push(`${host}: ${timedOut ? `no answer in ${SERVER_TIMEOUT_MS / 1000}s` : 'could not connect'}`);
    }
  }
  console.warn('Parking search failed', problems);
  throw new ParkingSearchError(
    `The parking map servers aren't responding right now. Please try again in a minute.\n\nDetails: ${problems.join(' · ')}`,
  );
}

// --- Our own parking library (static tiles) ---------------------------------

// Tiles are named by content hash, so a saved copy is valid for as long as the
// manifest still lists that hash: no expiry needed, and it works offline.
const TILE_STORAGE_PREFIX = 'tile.v2.';
const memoryTiles = new Map<string, ParkingTile>();

async function storedTile(key: string): Promise<{ hash: string; tile: ParkingTile } | null> {
  try {
    const raw = await AsyncStorage.getItem(TILE_STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** How often to check for library updates (new tiles, research). */
const MANIFEST_FRESH_MS = 60 * 60 * 1000;
const MANIFEST_STORAGE_KEY = 'library.manifest.v2';
let manifestCache: { at: number; manifest: LibraryManifest } | null = null;

/** The library index. Never throws: without it the app falls back to Overpass. */
async function loadManifest(baseUrl: string, force = false): Promise<LibraryManifest | null> {
  if (!force && manifestCache && Date.now() - manifestCache.at < MANIFEST_FRESH_MS) return manifestCache.manifest;
  let saved: { at: number; manifest: LibraryManifest } | null = null;
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_STORAGE_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!force && saved && Date.now() - saved.at < MANIFEST_FRESH_MS) {
    manifestCache = saved;
    return saved.manifest;
  }
  try {
    const res = await fetchWithTimeout(`${baseUrl}/manifest.json`, { headers: { 'User-Agent': USER_AGENT } }, SERVER_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = (await res.json()) as LibraryManifest;
    manifestCache = { at: Date.now(), manifest };
    AsyncStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifestCache)).catch(() => {});
    return manifest;
  } catch (e) {
    console.warn('Parking library index unavailable', e);
    return manifestCache?.manifest ?? saved?.manifest ?? null;
  }
}

async function loadTile(baseUrl: string, key: string, hash: string): Promise<ParkingTile> {
  const inMemory = memoryTiles.get(hash);
  if (inMemory) return inMemory;
  const saved = await storedTile(key);
  if (saved?.hash === hash) {
    memoryTiles.set(hash, saved.tile);
    return saved.tile;
  }
  try {
    const res = await fetchWithTimeout(`${baseUrl}/${versionedTilePath(key, hash)}`, { headers: { 'User-Agent': USER_AGENT } }, SERVER_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tile = (await res.json()) as ParkingTile;
    memoryTiles.set(hash, tile);
    AsyncStorage.setItem(TILE_STORAGE_PREFIX + key, JSON.stringify({ hash, tile })).catch(() => {});
    return tile;
  } catch (e) {
    // Offline or host trouble: an older saved copy beats nothing.
    if (saved) return saved.tile;
    throw e;
  }
}

async function loadTiles(baseUrl: string, manifest: LibraryManifest, keys: string[]): Promise<ParkingTile[]> {
  try {
    return await Promise.all(
      keys.map((k) => {
        const hash = manifest.hashes?.[k];
        if (!hash) throw new Error('library index is out of date');
        return loadTile(baseUrl, k, hash);
      }),
    );
  } catch (e) {
    const detail = e instanceof Error && e.name === 'AbortError' ? `no answer in ${SERVER_TIMEOUT_MS / 1000}s` : e instanceof Error ? e.message : 'unknown error';
    throw new ParkingSearchError(`Couldn't load parking. Check your connection and try again.\n\nDetails: parking library: ${detail}`);
  }
}
