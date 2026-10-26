import { GEOCODER_URL, USER_AGENT } from '../config';
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

/** Looks up a US city, address, ZIP code or landmark. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${GEOCODER_URL}?format=jsonv2&addressdetails=1&countrycodes=us&limit=6&q=${encodeURIComponent(q)}`;
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
