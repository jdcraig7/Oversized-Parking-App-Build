// Trip planner: an ordered list of parking stops, each with a number of
// nights, so the app can work out when you'll be at each one. Pure functions,
// unit tested.

import type { ParkingSpot } from './types';

export interface TripStop {
  id: string;
  spot: ParkingSpot;
  /** Nights (or days) parked here before moving on. 0 = just a stop on the way. */
  nights: number;
  note?: string;
}

export interface Trip {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD) of arrival at the first stop, if planned. */
  startDate?: string;
  /** Vehicle used for fit checks on this trip. */
  vehicleId?: string;
  stops: TripStop[];
  createdAt: string;
}

const DAY = 86_400_000;
const parseDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => isoDay(parseDay(iso) + days * DAY);

/** Arrival and departure date of each stop, in order, from the trip's start date. */
export function schedule(trip: Pick<Trip, 'startDate' | 'stops'>): { arrive: string; leave: string }[] | null {
  if (!trip.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) return null;
  let day = trip.startDate;
  return trip.stops.map((s) => {
    const arrive = day;
    day = addDays(day, Math.max(0, s.nights));
    return { arrive, leave: day };
  });
}

export const totalNights = (trip: Pick<Trip, 'stops'>) => trip.stops.reduce((n, s) => n + Math.max(0, s.nights), 0);

/** Moves the stop at `from` to index `to` (both clamped). Returns a new array. */
export function moveStop<T>(stops: T[], from: number, to: number): T[] {
  if (from < 0 || from >= stops.length) return stops;
  const target = Math.max(0, Math.min(stops.length - 1, to));
  const next = [...stops];
  const [s] = next.splice(from, 1);
  next.splice(target, 0, s);
  return next;
}

/**
 * Google Maps driving directions through every stop in order (Google allows
 * up to 9 waypoints between origin and destination; longer trips are split
 * into legs by the caller with `legs`).
 */
export function routeUrl(points: { latitude: number; longitude: number }[]): string | null {
  if (points.length === 0) return null;
  const p = (x: { latitude: number; longitude: number }) => `${x.latitude.toFixed(6)},${x.longitude.toFixed(6)}`;
  const dest = points[points.length - 1];
  const via = points.slice(0, -1);
  const q = new URLSearchParams({ api: '1', destination: p(dest), travelmode: 'driving' });
  if (via.length) q.set('waypoints', via.map(p).join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** Splits stops into legs of at most `max` points that share their end points. */
export function legs<T>(points: T[], max = 10): T[][] {
  if (points.length <= max) return [points];
  const out: T[][] = [];
  for (let i = 0; i < points.length - 1; i += max - 1) out.push(points.slice(i, i + max));
  return out;
}

/** "Fri, Nov 13" style label for an ISO date. */
export function dayLabel(iso: string): string {
  return new Date(parseDay(iso)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Plain-text summary of a trip to send by text or email. */
export function tripShareText(trip: Pick<Trip, 'name' | 'startDate' | 'stops'>, vehicle?: { name: string; height: string }): string {
  const dates = schedule(trip);
  const lines = [`${trip.name}${vehicle ? ` (${vehicle.name}, ${vehicle.height} tall)` : ''}`];
  trip.stops.forEach((s, i) => {
    const when = dates ? (s.nights > 0 ? `${dayLabel(dates[i].arrive)} – ${dayLabel(dates[i].leave)}` : dayLabel(dates[i].arrive)) : `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`;
    const where = s.spot.address ? `, ${s.spot.address}` : '';
    lines.push(`${i + 1}. ${s.spot.name}${where} · ${when}`);
    lines.push(`   https://www.google.com/maps/search/?api=1&query=${s.spot.latitude.toFixed(6)},${s.spot.longitude.toFixed(6)}`);
  });
  const route = routeUrl(trip.stops.slice(0, 10).map((s) => s.spot));
  if (route && trip.stops.length > 1) lines.push('', `Route${trip.stops.length > 10 ? ' (first 10 stops)' : ''}: ${route}`);
  lines.push('', 'Planned with Oversized Parking');
  return lines.join('\n');
}
