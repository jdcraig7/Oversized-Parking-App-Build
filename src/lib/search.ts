// Filtering and sorting of search results. Pure functions, unit tested.

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
  /** The clearance actually used: a user's on-site report beats published data. */
  clearance: Clearance;
  fit: FitResult;
  distance: number;
}

const FIT_RANK: Record<FitResult['status'], number> = { fits: 0, tight: 1, unknown: 2, 'too-low': 3 };
const FEE_RANK = { free: 0, unknown: 1, paid: 2 } as const;

export function effectiveClearance(spot: ParkingSpot, report?: SpotReport): Clearance {
  if (report?.clearanceMeters != null) return { status: 'limited', meters: report.clearanceMeters };
  return spot.clearance;
}

export function evaluate(
  spot: ParkingSpot,
  origin: LatLng,
  vehicleMeters: number,
  marginMeters: number,
  report?: SpotReport,
): SpotResult {
  const clearance = effectiveClearance(spot, report);
  return {
    spot,
    clearance,
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
