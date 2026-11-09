// Things near a parking spot that matter to tall and long vehicles: low
// bridges / height barriers on the roads around it, and RV dump stations.
// They come from the same library tiles (record types 'h' and 'd').
// Pure functions, unit tested.

import { distanceMeters } from './geo';
import { parseHeight } from './height';
import type { LatLng } from './types';

/** A road, bridge or barrier with a posted height limit. */
export interface LowClearance {
  id: string;
  latitude: number;
  longitude: number;
  meters: number;
  /** "Bridge", "Tunnel", "Height barrier" or "Road". */
  what: string;
  /** Street name or ref, when known. */
  name?: string;
  distance: number;
}

export interface DumpStation {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  fee?: string;
  distance: number;
}

/** Height limits above this aren't a concern for any road-legal vehicle (~15'). */
const MAX_RELEVANT_M = 4.6;

/** Whether an OpenStreetMap object is a road or barrier height limit we keep. */
/** Public roads. Service lanes (garage ramps, drive-throughs, aisles) are left out: their limits are the garage's own entrance. */
const ROADS = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road)(_link)?$/;
/** Bars this low are garage-entrance bars, not road hazards (~8'). */
const MIN_BARRIER_M = 2.4;

export function isLowClearanceCandidate(tags: Record<string, string>): boolean {
  if (tags.amenity) return false; // parking garages are handled as parking
  const barrier = tags.barrier === 'height_restrictor';
  if (!barrier && !ROADS.test(tags.highway ?? '')) return false;
  const h = parseHeight([tags.maxheight, tags['maxheight:physical']].filter(Boolean).join(';') || null);
  return h.kind === 'meters' && h.meters <= MAX_RELEVANT_M && (!barrier || h.meters >= MIN_BARRIER_M);
}

export const isDumpStation = (tags: Record<string, string>) => tags.amenity === 'sanitary_dump_station' && tags.access !== 'private' && tags.access !== 'no';

export function lowClearanceFrom(id: string, lat: number, lon: number, tags: Record<string, string>, origin: LatLng): LowClearance | null {
  const h = parseHeight([tags.maxheight, tags['maxheight:physical']].filter(Boolean).join(';') || null);
  if (h.kind !== 'meters') return null;
  const what =
    tags.barrier === 'height_restrictor'
      ? 'Height barrier'
      : tags.tunnel && tags.tunnel !== 'no'
        ? 'Tunnel'
        : tags.bridge && tags.bridge !== 'no'
          ? 'Bridge'
          : 'Low clearance';
  return {
    id,
    latitude: lat,
    longitude: lon,
    meters: h.meters,
    what,
    name: tags.name ?? tags.ref,
    distance: distanceMeters(origin, { latitude: lat, longitude: lon }),
  };
}

/** Low clearances within `radius` that the vehicle (plus margin) won't fit under, nearest first. */
export function blockingClearances(all: LowClearance[], vehicleMeters: number, marginMeters: number, radius: number): LowClearance[] {
  return all
    .filter((c) => c.distance <= radius && c.meters < vehicleMeters + marginMeters)
    .sort((a, b) => a.distance - b.distance);
}

/** Length like "12", "12 m", "40'", "40 ft" in meters (lot/road length limits). */
export function parseLengthMeters(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|ft|')?\s*$/i.exec(raw);
  if (!m) return undefined;
  const n = Number(m[1]);
  const meters = m[2] && /ft|'/i.test(m[2]) ? n * 0.3048 : n;
  return meters >= 3 && meters <= 40 ? meters : undefined;
}
