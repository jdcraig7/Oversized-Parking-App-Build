import { parseListingRow, type ListingRow, type SponsoredListing } from '../lib/sponsors';
import type { LatLng } from '../lib/types';
import { supabase } from './supabase';

export const sponsorsEnabled = !!supabase;

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; listings: SponsoredListing[] }>();
// Listings seen this session, so details screens can look one up by id.
const byId = new Map<string, SponsoredListing>();
const bySpotId = new Map<string, SponsoredListing>();

export const getCachedListing = (id: string) => byId.get(id);
/** The sponsored listing promoting this map spot, if one was loaded. */
export const listingForSpot = (spotId: string) => bySpotId.get(spotId);

/** Active sponsored listings whose target area covers this point. Never throws. */
export async function fetchSponsored(center: LatLng): Promise<SponsoredListing[]> {
  if (!supabase) return [];
  // ~1 km buckets: sponsors target areas of several miles.
  const key = `${center.latitude.toFixed(2)},${center.longitude.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.listings;
  const { data, error } = await supabase.rpc('get_sponsored_listings', { lat: center.latitude, lon: center.longitude });
  if (error) {
    console.warn('Could not load sponsors', error);
    return [];
  }
  const listings = ((data ?? []) as ListingRow[]).map(parseListingRow);
  for (const l of listings) {
    byId.set(l.id, l);
    if (l.spotId) bySpotId.set(l.spotId, l);
  }
  cache.set(key, { at: Date.now(), listings });
  return listings;
}

// --- View / tap counts for sponsor reports ----------------------------------

const pending = { view: new Set<string>(), tap: new Set<string>() };
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (!supabase) return;
  for (const event of ['view', 'tap'] as const) {
    const ids = [...pending[event]];
    pending[event].clear();
    // The server takes up to 10 ids per call.
    for (let i = 0; i < ids.length; i += 10) {
      supabase
        .rpc('record_sponsor_events', { listing_ids: ids.slice(i, i + 10), event })
        .then(({ error }) => error && console.warn('Sponsor event not recorded', error));
    }
  }
}

export function recordSponsorEvent(listingId: string, event: 'view' | 'tap') {
  if (!supabase) return;
  pending[event].add(listingId);
  timer ??= setTimeout(flush, 3000);
}
