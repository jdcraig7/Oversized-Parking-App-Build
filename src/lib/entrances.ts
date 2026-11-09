// Garage entrances. Many garages have no height on the garage itself in
// OpenStreetMap, but the height is mapped on its entrance (a parking_entrance
// node), on the ramp leading in (a service road), or on the barrier bar. The
// library build copies that height onto the garage, and records where the
// entrance is so Street View and directions can aim at it.
// Pure functions, unit tested.

import { parseHeight } from './height';
import type { TileRecord } from './tiles';

export interface Entrance {
  lat: number;
  lon: number;
  /** The posted height as mapped (e.g. 6'8"), when there is one. */
  height?: string;
  kind: 'entrance' | 'ramp' | 'barrier';
}

const GARAGE = /^(multi-storey|underground|rooftop)$/;
/** How far from the garage's middle its entrance/ramp/barrier can be (large structures are long). */
const MAX_HEIGHT_MATCH_M = 60;
const MAX_ENTRANCE_MATCH_M = 90;

/** An entrance-like feature, or null. */
export function entranceFrom(tags: Record<string, string>, lat: number, lon: number): Entrance | null {
  const raw = tags.maxheight ?? tags['maxheight:physical'];
  const height = raw && parseHeight(raw).kind === 'meters' ? raw : undefined;
  if (tags.amenity === 'parking_entrance') return { lat, lon, height, kind: 'entrance' };
  if (tags.barrier === 'height_restrictor' && height) return { lat, lon, height, kind: 'barrier' };
  if (tags.highway === 'service' && height) return { lat, lon, height, kind: 'ramp' };
  return null;
}

const metersBetween = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.hypot((bLon - aLon) * 111_320 * Math.cos((aLat * Math.PI) / 180), (bLat - aLat) * 111_320);

/** Grid index for nearest-entrance lookups (cells ~200 m). */
export class EntranceIndex {
  private cells = new Map<string, Entrance[]>();
  private key = (lat: number, lon: number) => `${Math.floor(lat * 500)},${Math.floor(lon * 500)}`;
  add(e: Entrance) {
    const k = this.key(e.lat, e.lon);
    const list = this.cells.get(k);
    if (list) list.push(e);
    else this.cells.set(k, [e]);
  }
  nearest(lat: number, lon: number, maxMeters: number, withHeight: boolean, kind?: Entrance['kind']): Entrance | null {
    const [cy, cx] = this.key(lat, lon).split(',').map(Number);
    let best: Entrance | null = null;
    let bestD = maxMeters;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const e of this.cells.get(`${cy + dy},${cx + dx}`) ?? []) {
          if ((withHeight && !e.height) || (kind && e.kind !== kind)) continue;
          const d = metersBetween(lat, lon, e.lat, e.lon);
          if (d <= bestD) {
            bestD = d;
            best = e;
          }
        }
      }
    }
    return best;
  }
}

/**
 * Copies entrance heights onto garages that have none, and notes each
 * garage's entrance position. Returns how many garages gained a height.
 */
export function applyEntrances(records: Iterable<TileRecord>, index: EntranceIndex): number {
  let gained = 0;
  for (const [type, , lat, lon, tags] of records) {
    if (type === 'h' || type === 'd' || tags.amenity !== 'parking' || !GARAGE.test(tags.parking ?? '')) continue;
    // A mapped entrance point is the best place to aim Street View; a barrier or ramp is next best.
    const door = index.nearest(lat, lon, MAX_ENTRANCE_MATCH_M, false, 'entrance') ?? index.nearest(lat, lon, MAX_ENTRANCE_MATCH_M, false);
    if (door) tags.entrance = `${door.lat.toFixed(5)},${door.lon.toFixed(5)}`;
    if (tags.maxheight || tags['maxheight:physical']) continue;
    const sign = index.nearest(lat, lon, MAX_HEIGHT_MATCH_M, true);
    if (sign?.height) {
      tags.maxheight = sign.height;
      tags['maxheight:source'] = sign.kind;
      gained++;
    }
  }
  return gained;
}
