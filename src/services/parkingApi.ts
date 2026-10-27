import { OVERPASS_URLS, USER_AGENT } from '../config';
import { buildParkingQuery, parseOverpass, type OverpassResponse } from '../lib/osm';
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

/**
 * Finds parking within `radiusMeters` of `center`. Tries each Overpass server in turn.
 * Results are cached briefly; pass `force` to skip the cache (pull to refresh).
 */
export async function searchParking(
  center: LatLng,
  radiusMeters: number,
  { force = false }: { force?: boolean } = {},
): Promise<ParkingSpot[]> {
  const key = cacheKey(center, radiusMeters);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.spots;

  const body = `data=${encodeURIComponent(buildParkingQuery(center.latitude, center.longitude, radiusMeters))}`;
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body,
        },
        30000,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const spots = parseOverpass((await res.json()) as OverpassResponse);
      for (const s of spots) spotIndex.set(s.id, s);
      cache.set(key, { at: Date.now(), spots });
      if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      return spots;
    } catch (e) {
      lastError = e;
    }
  }
  console.warn('Parking search failed', lastError);
  throw new ParkingSearchError("Couldn't load parking right now. Check your connection and try again.");
}
