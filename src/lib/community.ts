// Shared driver reports: parsing server summaries and deciding which clearance
// and price to trust. No React Native imports, so it's unit tested in Node.

import type { Clearance } from './height';
import type { ParkingSpot, SpotReport } from './types';

export interface CommunitySummary {
  spotId: string;
  reportCount: number;
  clearanceReports: number;
  /** Median reported clearance, so one wrong report can't swing a spot. */
  medianClearanceMeters?: number;
  latestPrice?: string;
  latestPriceAt?: string;
  recentNotes: string[];
  lastReportAt: string;
}

/** A row from the `get_spot_report_summaries` database function. */
export interface SummaryRow {
  spot_id: string;
  report_count: number;
  clearance_reports: number;
  median_clearance_m: number | string | null;
  latest_price: string | null;
  latest_price_at: string | null;
  recent_notes: string[] | null;
  last_report_at: string;
}

export function parseSummaryRow(row: SummaryRow): CommunitySummary {
  // Postgres numerics arrive as strings.
  const median = row.median_clearance_m == null ? undefined : Number(row.median_clearance_m);
  return {
    spotId: row.spot_id,
    reportCount: row.report_count,
    clearanceReports: row.clearance_reports,
    medianClearanceMeters: median != null && Number.isFinite(median) ? median : undefined,
    latestPrice: row.latest_price ?? undefined,
    latestPriceAt: row.latest_price_at ?? undefined,
    recentNotes: row.recent_notes ?? [],
    lastReportAt: row.last_report_at,
  };
}

export type ClearanceSource = 'you' | 'drivers' | 'map';

/**
 * Picks the clearance to judge fit by:
 * 1. Your own on-site report always wins (you saw the sign).
 * 2. Otherwise, if drivers reported a clearance, use the LOWER of their median
 *    and the published map value. When sources disagree, assume the tighter one.
 * 3. Otherwise, the published map data.
 */
export function resolveClearance(
  spot: ParkingSpot,
  own?: SpotReport,
  community?: CommunitySummary,
): { clearance: Clearance; source: ClearanceSource } {
  if (own?.clearanceMeters != null) return { clearance: { status: 'limited', meters: own.clearanceMeters }, source: 'you' };
  const reported = community?.medianClearanceMeters;
  if (reported != null) {
    if (spot.clearance.status === 'limited' && spot.clearance.meters <= reported) {
      return { clearance: spot.clearance, source: 'map' };
    }
    return { clearance: { status: 'limited', meters: reported }, source: 'drivers' };
  }
  return { clearance: spot.clearance, source: 'map' };
}

export function resolvePrice(
  spot: ParkingSpot,
  own?: SpotReport,
  community?: CommunitySummary,
): { price?: string; source?: ClearanceSource } {
  if (own?.price) return { price: own.price, source: 'you' };
  if (community?.latestPrice) return { price: community.latestPrice, source: 'drivers' };
  if (spot.price) return { price: spot.price, source: 'map' };
  return {};
}

/** Rounds to the 2 decimals the database stores. */
export const toDbMeters = (m: number) => Math.round(m * 100) / 100;
