// Filtering and sorting of search results. Pure functions, unit tested.

import { resolveClearance, resolvePrice, type ClearanceSource, type CommunitySummary } from './community';
import { distanceMeters } from './geo';
import { checkFit, type Clearance, type FitResult } from './height';
import type { LatLng, ParkingSpot, SpotReport } from './types';

export type SortOrder = 'distance' | 'best-fit' | 'free-first';

export interface SearchFilters {
  /** Hide spots the vehicle is too tall for. */
  hideTooLow: boolean;
  /** Hide covered spots with no reported clearance. */
  hideUnknown: boolean;
  freeOnly: boolean;
  /** Show only garages / covered structures. */
  garagesOnly: boolean;
  /** Show only open-air lots, truck parking and truck stops. */
  lotsOnly: boolean;
  truckOnly: boolean;
  sort: SortOrder;
}

export const DEFAULT_FILTERS: SearchFilters = {
  hideTooLow: true,
  hideUnknown: false,
  freeOnly: false,
  garagesOnly: false,
  lotsOnly: false,
  truckOnly: false,
  sort: 'distance',
};

export interface SpotResult {
  spot: ParkingSpot;
  /** The clearance actually used (see resolveClearance). */
  clearance: Clearance;
  clearanceSource: ClearanceSource;
  /** Best known price text, from you, other drivers, or the map. */
  price?: string;
  /** Number of shared driver reports for this spot. */
  driverReports: number;
  fit: FitResult;
  distance: number;
}

const FIT_RANK: Record<FitResult['status'], number> = { fits: 0, tight: 1, unknown: 2, 'too-low': 3 };
const FEE_RANK = { free: 0, unknown: 1, paid: 2 } as const;

export function evaluate(
  spot: ParkingSpot,
  origin: LatLng,
  vehicleMeters: number,
  marginMeters: number,
  report?: SpotReport,
  community?: CommunitySummary,
): SpotResult {
  const { clearance, source } = resolveClearance(spot, report, community);
  return {
    spot,
    clearance,
    clearanceSource: source,
    price: resolvePrice(spot, report, community).price,
    driverReports: community?.reportCount ?? 0,
    fit: checkFit(clearance, vehicleMeters, marginMeters),
    distance: distanceMeters(origin, spot),
  };
}

export function applyFilters(results: SpotResult[], filters: SearchFilters): SpotResult[] {
  const filtered = results.filter(({ spot, fit }) => {
    if (filters.hideTooLow && fit.status === 'too-low') return false;
    if (filters.hideUnknown && fit.status === 'unknown') return false;
    if (filters.freeOnly && spot.fee !== 'free') return false;
    if (filters.garagesOnly && !spot.covered) return false;
    if (filters.lotsOnly && spot.covered) return false;
    if (filters.truckOnly && !spot.truckFriendly) return false;
    return true;
  });

  const byDistance = (a: SpotResult, b: SpotResult) => a.distance - b.distance;
  const sorters: Record<SortOrder, (a: SpotResult, b: SpotResult) => number> = {
    distance: byDistance,
    'best-fit': (a, b) => FIT_RANK[a.fit.status] - FIT_RANK[b.fit.status] || byDistance(a, b),
    'free-first': (a, b) => FEE_RANK[a.spot.fee] - FEE_RANK[b.spot.fee] || byDistance(a, b),
  };
  return filtered.sort(sorters[filters.sort]);
}

export function summarize(results: SpotResult[]): { total: number; fits: number; free: number } {
  return {
    total: results.length,
    fits: results.filter((r) => r.fit.status === 'fits' || r.fit.status === 'tight').length,
    free: results.filter((r) => r.spot.fee === 'free').length,
  };
}
