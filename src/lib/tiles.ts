// Our own parking library: OpenStreetMap parking data cut into small grid
// tiles that the app downloads from a static host (no query server needed).
// Shared by the app and the build script (scripts/build-parking-library.ts).
// No React Native imports, so it's unit tested in Node.

import { distanceMeters } from './geo';
import type { OverpassElement } from './osm';
import { lowClearanceFrom, type DumpStation, type LowClearance } from './nearby';
import type { LatLng } from './types';

export const TILE_FORMAT_VERSION = 1;
/** Tile size in degrees: ~17 x 14 miles in the continental US. */
export const TILE_DEGREES = 0.25;

/**
 * A place as stored in a tile: [type, id, lat, lon, tags]. Types n/w/r are
 * OpenStreetMap parking nodes/ways/relations; p is a parking place from our own
 * research (research/places.csv) that OpenStreetMap doesn't have; h is a road,
 * bridge or barrier with a low height limit and d an RV dump station (see
 * lib/nearby.ts). For h and d the tag "osm" holds the OpenStreetMap type.
 */
export type TileRecord = ['n' | 'w' | 'r' | 'p' | 'h' | 'd', number, number, number, Record<string, string>];

export interface ParkingTile {
  v: number;
  /** ISO date of the OpenStreetMap data the tile was built from. */
  updated: string;
  records: TileRecord[];
}

/**
 * The host stores tiles in bundles of BUNDLE_TILES x BUNDLE_TILES (see
 * library-worker/worker.js); a tile's manifest hash is its bundle's hash.
 */
export const BUNDLE_TILES = 8;

export const tileIndex =(degrees: number) => Math.floor(degrees / TILE_DEGREES);
export const tileKey = (latIdx: number, lonIdx: number) => `${latIdx}/${lonIdx}`;
export const tilePath = (key: string) => `v${TILE_FORMAT_VERSION}/${key}.json`;
/**
 * A tile's URL path with its content hash from the manifest, so any cache
 * (the phone's or an HTTP cache) treats an updated tile as a new file.
 */
export const versionedTilePath = (key: string, hash: string) => `${tilePath(key)}?v=${hash}`;

export function tileKeyFor({ latitude, longitude }: LatLng): string {
  return tileKey(tileIndex(latitude), tileIndex(longitude));
}

/** Keys of every tile that a circle of `radiusMeters` around `center` touches. */
export function tilesForCircle(center: LatLng, radiusMeters: number): string[] {
  const dLat = radiusMeters / 111320;
  const dLon = radiusMeters / (111320 * Math.max(0.05, Math.cos((center.latitude * Math.PI) / 180)));
  const keys: string[] = [];
  for (let la = tileIndex(center.latitude - dLat); la <= tileIndex(center.latitude + dLat); la++) {
    for (let lo = tileIndex(center.longitude - dLon); lo <= tileIndex(center.longitude + dLon); lo++) {
      keys.push(tileKey(la, lo));
    }
  }
  return keys;
}

/** The library's index: which tiles exist and how many places each holds. */
export interface LibraryManifest {
  v: number;
  updated: string;
  total: number;
  /** Places per tile. */
  tiles: Record<string, number>;
  /** Content hash per tile (see versionedTilePath). */
  hashes?: Record<string, string>;
}

/**
 * Splits a search's tiles into ones to download and whether the library covers
 * the area at all. Listed tiles hold parking; unlisted ones are empty. If none
 * of the search's tiles is listed, the area is outside the library (e.g. a
 * state not built yet) and the caller should use another source.
 */
export function planTiles(manifest: LibraryManifest, keys: string[]): { covered: boolean; fetch: string[] } {
  const fetch = keys.filter((k) => manifest.tiles[k] !== undefined);
  return { covered: fetch.length > 0, fetch };
}

const TYPES = { n: 'node', w: 'way', r: 'relation', p: 'place' } as const;
const isParking = (r: TileRecord): r is ['n' | 'w' | 'r' | 'p', number, number, number, Record<string, string>] => r[0] in TYPES;

export function recordToElement([t, id, lat, lon, tags]: TileRecord): OverpassElement {
  return { type: TYPES[t as keyof typeof TYPES], id, lat, lon, tags };
}

/** Elements from the given tiles that lie within `radiusMeters` of `center`, de-duplicated. */
export function elementsWithin(tiles: ParkingTile[], center: LatLng, radiusMeters: number): OverpassElement[] {
  const seen = new Set<string>();
  const out: OverpassElement[] = [];
  for (const tile of tiles) {
    for (const r of tile.records) {
      if (!isParking(r)) continue;
      const key = `${r[0]}${r[1]}`;
      if (seen.has(key)) continue;
      if (distanceMeters(center, { latitude: r[2], longitude: r[3] }) > radiusMeters) continue;
      seen.add(key);
      out.push(recordToElement(r));
    }
  }
  return out;
}

/** Low clearances and dump stations from the given tiles within `radiusMeters` of `center`. */
export function extrasWithin(tiles: ParkingTile[], center: LatLng, radiusMeters: number): { lowClearances: LowClearance[]; dumpStations: DumpStation[] } {
  const lowClearances: LowClearance[] = [];
  const dumpStations: DumpStation[] = [];
  const seen = new Set<string>();
  for (const tile of tiles) {
    for (const [t, id, lat, lon, tags] of tile.records) {
      if (t !== 'h' && t !== 'd') continue;
      const key = `${t}${tags.osm ?? ''}${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const distance = distanceMeters(center, { latitude: lat, longitude: lon });
      if (distance > radiusMeters) continue;
      if (t === 'h') {
        const c = lowClearanceFrom(key, lat, lon, tags, center);
        if (c) lowClearances.push(c);
      } else {
        dumpStations.push({ id: key, latitude: lat, longitude: lon, name: tags.name ?? tags.operator ?? 'RV dump station', fee: tags.fee, distance });
      }
    }
  }
  lowClearances.sort((a, b) => a.distance - b.distance);
  dumpStations.sort((a, b) => a.distance - b.distance);
  return { lowClearances, dumpStations };
}

/** Tags kept for low clearances and dump stations. */
const EXTRA_KEYS = new Set(['maxheight', 'maxheight:physical', 'name', 'ref', 'bridge', 'tunnel', 'barrier', 'highway', 'operator', 'fee', 'access', 'opening_hours', 'osm']);
export const slimExtraTags = (tags: Record<string, string>) =>
  Object.fromEntries(Object.entries(tags).filter(([k]) => EXTRA_KEYS.has(k)).map(([k, v]) => [k, v.slice(0, 120)]));

// --- Used by the build script ---------------------------------------------

/** Tag keys the app reads. Everything else is dropped to keep tiles small. */
const KEEP_KEYS = new Set([
  'amenity', 'parking', 'name', 'brand', 'operator', 'access', 'fee', 'charge', 'fee:conditional',
  'opening_hours', 'capacity', 'capacity:hgv', 'capacity:disabled', 'capacity:charging', 'maxstay',
  'maxheight', 'maxheight:physical', 'maxheight:signed', 'covered', 'hgv', 'access:hgv', 'bus', 'motorhome',
  'supervised', 'surveillance', 'lit', 'overnight', 'maxlength', 'caravans', 'capacity:caravans', 'capacity:motorhome', 'toilets', 'shower', 'fuel:diesel', 'park_ride', 'motorcar:charging',
  'phone', 'contact:phone', 'website', 'contact:website', 'url', 'description',
  'addr:housenumber', 'addr:street', 'addr:city', 'addr:state', 'addr:postcode',
]);

export function slimTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (KEEP_KEYS.has(k) || (k.startsWith('payment:') && v === 'yes')) out[k] = v.slice(0, 300);
  }
  return out;
}

/** The same server-side filter the old Overpass query applied. */
export function isLibraryCandidate(tags: Record<string, string>): boolean {
  if (tags.amenity === 'parking') return !/^(private|no|delivery)$/.test(tags.access ?? '');
  if (tags.amenity === 'fuel') return /^(yes|designated)$/.test(tags.hgv ?? '');
  return false;
}
