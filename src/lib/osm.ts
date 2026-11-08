// Turns OpenStreetMap (Overpass API) data into ParkingSpot records.
// This file has no React Native imports so it can be unit tested in Node.

import { parseHeight, type Clearance } from './height';
import type { AccessLevel, FeeStatus, ParkingSpot, ResearchNote, SpotKind } from './types';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
  /** Set by the server when a query ran into trouble, e.g. "runtime error: Query timed out". */
  remark?: string;
}

/**
 * Returns a short reason when an HTTP 200 response is really a failure. Overpass
 * reports timeouts and memory limits in `remark` and may return partial
 * results, which would hide parking that exists.
 */
export function overpassFailure(response: OverpassResponse): string | null {
  if (!response || !Array.isArray(response.elements)) return 'unexpected response';
  const remark = response.remark ?? '';
  if (/runtime (error|remark)|timed out|out of memory/i.test(remark)) {
    return /timed out/i.test(remark) ? 'server busy (query timed out)' : 'server error';
  }
  return null;
}

/**
 * Builds an Overpass QL query for public parking and truck stops within
 * `radiusMeters` of a point. Private lots are excluded at the server.
 */
export function buildParkingQuery(latitude: number, longitude: number, radiusMeters: number): string {
  const around = `(around:${Math.round(radiusMeters)},${latitude.toFixed(5)},${longitude.toFixed(5)})`;
  const notPrivate = '["access"!~"^(private|no|delivery)$"]';
  return [
    '[out:json][timeout:25];',
    '(',
    `  nwr["amenity"="parking"]${notPrivate}${around};`,
    `  nwr["amenity"="fuel"]["hgv"~"^(yes|designated)$"]${around};`,
    ');',
    'out center tags;',
  ].join('\n');
}

const KIND_LABELS: Record<SpotKind, string> = {
  garage: 'Parking garage',
  underground: 'Underground garage',
  rooftop: 'Rooftop parking',
  carport: 'Covered parking',
  surface: 'Open-air lot',
  street: 'Street parking',
  truck: 'Truck parking',
  'truck-stop': 'Truck stop',
};

export function kindLabel(kind: SpotKind): string {
  return KIND_LABELS[kind];
}

const yes = (v?: string) => v === 'yes' || v === 'designated' || v === 'only';

function classify(tags: Record<string, string>): SpotKind {
  if (tags.amenity === 'fuel') return 'truck-stop';
  if (yes(tags.hgv) || yes(tags['access:hgv']) || tags.parking === 'truck') return 'truck';
  switch (tags.parking) {
    case 'multi-storey':
      return 'garage';
    case 'underground':
      return 'underground';
    case 'rooftop':
      return 'rooftop';
    case 'carports':
      return 'carport';
    case 'street_side':
    case 'lane':
    case 'on_kerb':
    case 'half_on_kerb':
    case 'shoulder':
      return 'street';
  }
  if (tags.covered === 'yes') return 'carport';
  return 'surface';
}

/** Kinds that have no roof, so nothing limits height unless a sign says so. */
const OPEN_AIR: ReadonlySet<SpotKind> = new Set(['surface', 'street', 'truck', 'truck-stop']);

function clearanceFor(kind: SpotKind, tags: Record<string, string>): { clearance: Clearance; raw?: string } {
  const raw = tags.maxheight ?? tags['maxheight:physical'] ?? tags['maxheight:signed'];
  const parsed = parseHeight(raw);
  if (parsed.kind === 'meters') return { clearance: { status: 'limited', meters: parsed.meters }, raw };
  if (parsed.kind === 'none') return { clearance: { status: 'open' }, raw };
  // Rooftop decks are deliberately not open-air: you drive through the garage
  // below to reach them, so they stay unknown unless a clearance is posted.
  if (OPEN_AIR.has(kind) && tags.covered !== 'yes') return { clearance: { status: 'open' }, raw };
  return { clearance: { status: 'unknown' }, raw };
}

function feeFor(tags: Record<string, string>): { fee: FeeStatus; feeHours?: string } {
  const fee = tags.fee?.toLowerCase();
  if (fee === 'no') return { fee: tags.charge ? 'paid' : 'free' };
  if (fee === 'yes' || tags.charge || tags['fee:conditional']) {
    return { fee: 'paid', feeHours: tags['fee:conditional'] };
  }
  // `fee` sometimes holds opening-hours syntax for when fees apply.
  if (fee && /\d/.test(fee)) return { fee: 'paid', feeHours: tags.fee };
  return { fee: 'unknown' };
}

const RESTRICTED_ACCESS = /^(private|no|employees?|staff|residents?|permit|delivery|military|agricultural|forestry)$/;
const CUSTOMER_ACCESS = /^(customers?|destination|visitors?|guests?|patients?)$/;
const PUBLIC_ACCESS = /^(yes|public|permissive)$/;
const RESTRICTED_NAME = /\b(employees?|staff|residents?|resident's|tenants?|permit|reserved|monthly parking only|physicians?|faculty)\b/i;
const CUSTOMER_NAME = /\b(customers?|visitors?|guests?|patients?|patrons?|members?|shoppers?)\b/i;
const PUBLIC_NAME = /\b(public|municipal|city|county|park\s*(and|&|n)\s*ride|metro|transit)\b|\blot\s*#?\d+\b/i;
const PUBLIC_OPERATOR = /\b(city|county|town|village|municipal|state|transit|metro|caltrans|department|authority|parks?)\b/i;

/**
 * Most lots in OpenStreetMap have no access tag at all, and those are usually
 * store, restaurant or apartment lots. A place only counts as public when
 * something says so: tags, a fee (paid parking is open to anyone who pays),
 * a public operator, park & ride, truck parking, or a name like "City Lot 6".
 */
function accessFor(kind: SpotKind, tags: Record<string, string>, fee: FeeStatus): AccessLevel {
  const a = (tags.access ?? '').toLowerCase().split(';')[0].trim();
  const name = tags.name ?? '';
  if (RESTRICTED_ACCESS.test(a) || RESTRICTED_NAME.test(name)) return 'restricted';
  if (CUSTOMER_ACCESS.test(a) || CUSTOMER_NAME.test(name)) return 'customers';
  if (PUBLIC_ACCESS.test(a)) return 'public';
  if (kind === 'truck' || kind === 'truck-stop' || kind === 'street') return 'public';
  if (tags.park_ride && tags.park_ride !== 'no') return 'public';
  if (fee === 'paid') return 'public';
  if (PUBLIC_OPERATOR.test(tags.operator ?? '') || PUBLIC_NAME.test(name)) return 'public';
  return 'unverified';
}

/** Research notes are merged into the library as research:* tags (scripts/build-parking-library.ts). */
function researchFor(tags: Record<string, string>): ResearchNote | undefined {
  const source = tags['research:source'];
  if (source !== 'sign' && source !== 'operator' && source !== 'listing') return undefined;
  return {
    source,
    url: tags['research:url'],
    checked: tags['research:checked'],
    note: tags['research:note'],
  };
}

function addressFor(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const cityLine = [tags['addr:city'], [tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const full = [street, cityLine].filter(Boolean).join(', ');
  return full || undefined;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  coins: 'Coins',
  credit_cards: 'Credit cards',
  debit_cards: 'Debit cards',
  contactless: 'Contactless',
  app: 'Mobile app',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  parkmobile: 'ParkMobile',
};

function paymentFor(tags: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tags)) {
    if (!key.startsWith('payment:') || value !== 'yes') continue;
    const method = key.slice('payment:'.length);
    out.push(PAYMENT_LABELS[method] ?? method.replace(/_/g, ' '));
  }
  return [...new Set(out)];
}

function amenitiesFor(kind: SpotKind, tags: Record<string, string>): string[] {
  const out: string[] = [];
  if (tags.supervised === 'yes' || tags.surveillance) out.push('Supervised / cameras');
  if (tags.lit === 'yes') out.push('Lit at night');
  if (tags.covered === 'yes' || kind === 'garage' || kind === 'underground') out.push('Covered');
  if (tags['capacity:disabled'] && tags['capacity:disabled'] !== 'no') out.push('Accessible spaces');
  if (tags['capacity:charging'] || tags['motorcar:charging']) out.push('EV charging');
  if (tags.toilets === 'yes') out.push('Restrooms');
  if (tags.shower === 'yes' || tags.shower === 'hot') out.push('Showers');
  if (kind === 'truck-stop' && tags['fuel:diesel'] === 'yes') out.push('Diesel');
  if (tags.park_ride === 'yes' || (tags.park_ride && tags.park_ride !== 'no')) out.push('Park & ride');
  return out;
}

function toInt(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cleanUrl(v?: string): string | undefined {
  if (!v) return undefined;
  const first = v.split(';')[0].trim();
  return /^https?:\/\//i.test(first) ? first : `https://${first}`;
}

export function elementToSpot(el: OverpassElement, fetchedAt: string): ParkingSpot | null {
  const tags = el.tags ?? {};
  const latitude = el.lat ?? el.center?.lat;
  const longitude = el.lon ?? el.center?.lon;
  if (latitude == null || longitude == null) return null;

  const kind = classify(tags);
  const { clearance, raw } = clearanceFor(kind, tags);
  const { fee, feeHours } = feeFor(tags);
  const givenName = tags.name ?? tags.brand ?? tags.operator;

  return {
    id: `osm:${el.type}/${el.id}`,
    name: givenName ?? kindLabel(kind),
    unnamed: !givenName,
    kind,
    latitude,
    longitude,
    clearance,
    clearanceRaw: raw,
    fee,
    price: tags.charge,
    feeHours,
    hours: tags.opening_hours,
    access: accessFor(kind, tags, fee),
    capacity: toInt(tags.capacity),
    truckCapacity: toInt(tags['capacity:hgv']),
    maxStay: tags.maxstay,
    truckFriendly: kind === 'truck' || kind === 'truck-stop' || yes(tags.hgv) || yes(tags.bus) || yes(tags.motorhome),
    covered: clearance.status !== 'open',
    address: addressFor(tags),
    operator: tags.operator && tags.operator !== givenName ? tags.operator : undefined,
    phone: tags.phone ?? tags['contact:phone'],
    website: cleanUrl(tags.website ?? tags['contact:website'] ?? tags.url),
    payment: paymentFor(tags),
    amenities: amenitiesFor(kind, tags),
    description: tags.description,
    research: researchFor(tags),
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    fetchedAt,
  };
}

/** Very small lots (a handful of car spaces) are noise for oversized vehicles. */
const MIN_CAPACITY = 4;

export function parseOverpass(response: OverpassResponse, fetchedAt = new Date().toISOString()): ParkingSpot[] {
  const seen = new Set<string>();
  const spots: ParkingSpot[] = [];
  for (const el of response.elements) {
    const spot = elementToSpot(el, fetchedAt);
    if (!spot || seen.has(spot.id)) continue;
    if (spot.capacity != null && spot.capacity < MIN_CAPACITY && !spot.truckFriendly) continue;
    // Unnamed, untagged street-side strips add clutter without useful info.
    if (spot.kind === 'street' && spot.unnamed && spot.fee === 'unknown') continue;
    seen.add(spot.id);
    spots.push(spot);
  }
  return spots;
}
