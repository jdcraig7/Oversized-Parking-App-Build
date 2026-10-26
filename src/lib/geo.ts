import type { LatLng } from './types';

const EARTH_RADIUS_M = 6371000;
export const METERS_PER_MILE = 1609.344;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Rough check that a point is in the US (incl. Alaska, Hawaii, PR). */
export function isInUnitedStates({ latitude, longitude }: LatLng): boolean {
  const lower48 = latitude >= 24 && latitude <= 49.5 && longitude >= -125 && longitude <= -66.5;
  const alaska = latitude >= 51 && latitude <= 72 && (longitude <= -129 || longitude >= 172);
  const hawaii = latitude >= 18.5 && latitude <= 22.5 && longitude >= -161 && longitude <= -154;
  const puertoRico = latitude >= 17.8 && latitude <= 18.6 && longitude >= -67.4 && longitude <= -65.2;
  return lower48 || alaska || hawaii || puertoRico;
}
