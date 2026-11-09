// Sponsored listings: choosing which one (if any) to show for a search.
// No React Native imports, so it's unit tested in Node.

import { checkFit, type Clearance } from './height';
import type { SpotResult } from './search';
import type { ParkingSpot } from './types';

export interface SponsoredListing {
  id: string;
  /** 'spot' = a parking place; 'business' = a related business (lift shop, RV park). */
  kind: 'spot' | 'business';
  /** The OpenStreetMap spot this listing promotes, if any. */
  spotId?: string;
  title: string;
  tagline?: string;
  offer?: string;
  category?: string;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  website?: string;
  price?: string;
  hours?: string;
  /** What the sponsor says its clearance is. */
  clearance: Clearance;
  weight: number;
}

/** A row from the `get_sponsored_listings` database function. */
export interface ListingRow {
  id: string;
  kind: 'spot' | 'business';
  spot_id: string | null;
  title: string;
  tagline: string | null;
  offer: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  price: string | null;
  hours: string | null;
  clearance_m: number | string | null;
  open_air: boolean;
  weight: number;
}

export function parseListingRow(row: ListingRow): SponsoredListing {
  const meters = row.clearance_m == null ? NaN : Number(row.clearance_m);
  const clearance: Clearance = row.open_air
    ? { status: 'open' }
    : Number.isFinite(meters)
      ? { status: 'limited', meters }
      : { status: 'unknown' };
  return {
    id: row.id,
    kind: row.kind,
    spotId: row.spot_id ?? undefined,
    title: row.title,
    tagline: row.tagline ?? undefined,
    offer: row.offer ?? undefined,
    category: row.category ?? undefined,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    price: row.price ?? undefined,
    hours: row.hours ?? undefined,
    clearance,
    weight: Math.max(1, row.weight),
  };
}

export const sponsorSpotId = (listingId: string) => `sponsor:${listingId}`;

/** A ParkingSpot for a sponsored place that isn't in the map data, so the details screen can show it. */
export function listingToSpot(l: SponsoredListing, fetchedAt = new Date().toISOString()): ParkingSpot {
  return {
    id: sponsorSpotId(l.id),
    name: l.title,
    unnamed: false,
    kind: l.clearance.status === 'open' ? 'surface' : 'garage',
    latitude: l.latitude,
    longitude: l.longitude,
    clearance: l.clearance,
    fee: l.price ? (/free/i.test(l.price) ? 'free' : 'paid') : 'unknown',
    price: l.price,
    hours: l.hours,
    access: 'public',
    truckFriendly: false,
    rvFriendly: false,
    covered: l.clearance.status !== 'open',
    address: l.address,
    phone: l.phone,
    website: l.website,
    payment: [],
    amenities: [],
    description: l.tagline,
    sourceUrl: l.website ?? '',
    fetchedAt,
  };
}

export interface SponsorPick {
  listing: SponsoredListing;
  /** For a 'spot' listing: the search result it promotes (map data plus driver reports). */
  result?: SpotResult;
}

/** Deterministic number in [0, 1) from a string, so a search keeps the same pick. */
export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Chooses at most one sponsored listing for a search.
 * A parking sponsor is only eligible when the vehicle FITS with the safety
 * margin, judged by the lower of the sponsor's claimed clearance and what the
 * map data and driver reports say. Sponsors never get to show a spot that's
 * too low, tight, or unknown. Among eligible listings, `weight` sets the odds.
 */
export function pickSponsored(
  listings: SponsoredListing[],
  results: SpotResult[],
  vehicleMeters: number,
  marginMeters: number,
  seed: string,
): SponsorPick | null {
  const byId = new Map(results.map((r) => [r.spot.id, r]));
  const eligible: SponsorPick[] = [];
  for (const listing of listings) {
    if (listing.kind === 'business') {
      eligible.push({ listing });
      continue;
    }
    const result = listing.spotId ? byId.get(listing.spotId) : undefined;
    if (checkFit(listing.clearance, vehicleMeters, marginMeters).status !== 'fits') continue;
    if (result && result.fit.status !== 'fits') continue;
    eligible.push({ listing, result });
  }
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, e) => s + e.listing.weight, 0);
  let roll = seededRandom(seed) * total;
  for (const e of eligible) {
    roll -= e.listing.weight;
    if (roll < 0) return e;
  }
  return eligible.at(-1) ?? null;
}
