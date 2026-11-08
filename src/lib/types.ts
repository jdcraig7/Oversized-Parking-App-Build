import type { Clearance } from './height';

export type SpotKind =
  | 'garage' // multi-storey structure
  | 'underground'
  | 'rooftop'
  | 'carport' // covered surface parking
  | 'surface' // open-air lot
  | 'street'
  | 'truck' // designated truck / HGV parking
  | 'truck-stop'; // fuel station that serves trucks

export type FeeStatus = 'free' | 'paid' | 'unknown';

/**
 * Who may park here.
 * - public: anyone (tagged public, paid parking, city-run, park & ride, truck parking)
 * - customers: only while visiting a business (store, restaurant, zoo...)
 * - restricted: employees, residents, permit holders: never useful, always hidden
 * - unverified: nothing says either way; most are store or apartment lots
 */
export type AccessLevel = 'public' | 'customers' | 'restricted' | 'unverified';

/** Where a researched value (clearance, price) came from. */
export interface ResearchNote {
  /** 'sign' (posted sign / photo), 'operator' (official site), or 'listing' (third-party site). */
  source: 'sign' | 'operator' | 'listing';
  url?: string;
  /** ISO date the value was checked. */
  checked?: string;
  note?: string;
}

export interface ParkingSpot {
  /** Stable id, e.g. `osm:way/123456`. */
  id: string;
  name: string;
  /** True when the name was generated because the place has none. */
  unnamed: boolean;
  kind: SpotKind;
  latitude: number;
  longitude: number;
  clearance: Clearance;
  /** The raw clearance value as published, for transparency. */
  clearanceRaw?: string;
  fee: FeeStatus;
  /** Price text as published, e.g. "$3/hour; $20/day". */
  price?: string;
  /** Times when a fee applies, if fees are only charged part of the time. */
  feeHours?: string;
  hours?: string;
  access: AccessLevel;
  capacity?: number;
  truckCapacity?: number;
  /** Maximum stay, e.g. "2 hours". */
  maxStay?: string;
  truckFriendly: boolean;
  covered: boolean;
  address?: string;
  operator?: string;
  phone?: string;
  website?: string;
  payment: string[];
  amenities: string[];
  description?: string;
  /** Our own research for this place, when it fills in or corrects map data. */
  research?: ResearchNote;
  /** Where this record came from, e.g. an OpenStreetMap object URL. */
  sourceUrl: string;
  /** ISO date this data was last fetched. */
  fetchedAt: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** A correction a user saved for a spot (clearance or price they saw on site). */
export interface SpotReport {
  spotId: string;
  clearanceMeters?: number;
  price?: string;
  note?: string;
  /** Also shared with other drivers (when shared reports are set up). */
  shared?: boolean;
  updatedAt: string;
}
