// Where to stand and which way to look in Street View to see a garage's
// entrance (and its clearance sign). Pure functions, unit tested.

import type { LatLng } from './types';

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Compass bearing from a to b, 0-360. */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `meters` from `p` in direction `bearingDeg`. */
export function offset(p: LatLng, bearingDeg: number, meters: number): LatLng {
  const d = meters / R;
  const b = rad(bearingDeg);
  const lat1 = rad(p.latitude);
  const lon1 = rad(p.longitude);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: deg(lat2), longitude: deg(lon2) };
}

/**
 * With a mapped entrance: stand ~20 m outside it (away from the building's
 * middle, i.e. on the street) and look back at it. Without one: the
 * building's middle, letting Google pick the nearest street photo.
 */
export function streetViewTarget(spot: LatLng & { entrance?: LatLng }): { viewpoint: LatLng; heading?: number } {
  if (!spot.entrance) return { viewpoint: { latitude: spot.latitude, longitude: spot.longitude } };
  const out = bearing(spot, spot.entrance);
  const viewpoint = offset(spot.entrance, out, 20);
  return { viewpoint, heading: Math.round(bearing(viewpoint, spot.entrance)) };
}

const ll = (p: LatLng) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/** Links to try in order: the Google Maps app's Street View first, then the web. */
export function streetViewUrls(spot: LatLng & { entrance?: LatLng }, platform: 'ios' | 'android' | string): string[] {
  const { viewpoint, heading } = streetViewTarget(spot);
  const web = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll(viewpoint)}${heading != null ? `&heading=${heading}` : ''}`;
  if (platform === 'android') return [`google.streetview:cbll=${ll(viewpoint)}&cbp=0,${heading ?? 0},0,0,0`, web];
  if (platform === 'ios') return [`comgooglemaps://?center=${ll(viewpoint)}&mapmode=streetview`, web];
  return [web];
}
