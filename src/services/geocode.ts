import * as Location from 'expo-location';

import { CUSTOM_GEOCODER_URL, NOMINATIM_URL, USER_AGENT } from '../config';
import { isInUnitedStates } from '../lib/geo';
import type { LatLng } from '../lib/types';

export interface Place extends LatLng {
  id: string;
  title: string;
  subtitle: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

/** Any Nominatim-compatible geocoder (your own server, LocationIQ, etc.). */
async function searchNominatim(baseUrl: string, q: string): Promise<Place[]> {
  const url = `${baseUrl}?format=jsonv2&addressdetails=1&countrycodes=us&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US' } });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const results = (await res.json()) as NominatimResult[];
  return results.map((r) => {
    const a = r.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county;
    const title = r.name || city || r.display_name.split(',')[0];
    const subtitle = [city !== title ? city : undefined, a.state, a.postcode].filter(Boolean).join(', ');
    return { id: String(r.place_id), title, subtitle, latitude: Number(r.lat), longitude: Number(r.lon) };
  });
}

/** The phone's own geocoder (Apple / Google). Free, no server needed. */
async function searchDevice(q: string): Promise<Place[]> {
  const hits = (await Location.geocodeAsync(`${q}, USA`)).filter(isInUnitedStates).slice(0, 3);
  return Promise.all(
    hits.map(async (h, i) => {
      const [a] = await Location.reverseGeocodeAsync(h).catch(() => []);
      const title = a?.city ?? a?.name ?? q;
      const subtitle = [a?.region, a?.postalCode].filter(Boolean).join(', ');
      return { id: `device-${i}-${h.latitude},${h.longitude}`, title, subtitle, latitude: h.latitude, longitude: h.longitude };
    }),
  );
}

/** Looks up a US city, address, ZIP code or landmark. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  if (CUSTOM_GEOCODER_URL) return searchNominatim(CUSTOM_GEOCODER_URL, q);
  try {
    const found = await searchDevice(q);
    if (found.length) return found;
  } catch (e) {
    console.warn('Device geocoder failed', e);
  }
  // Fallback only: the public server allows light use (about 1 request/second).
  return searchNominatim(NOMINATIM_URL, q);
}
