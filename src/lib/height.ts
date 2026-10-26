// Height parsing, formatting and "will my vehicle fit?" logic.
// Everything is stored internally in meters (the OpenStreetMap default unit)
// and shown to users in feet and inches.

export const METERS_PER_INCH = 0.0254;

export type ParsedHeight =
  | { kind: 'meters'; meters: number }
  | { kind: 'none' } // explicitly no height restriction
  | { kind: 'unknown' }; // missing, unparseable, or a placeholder like "default"

const NO_LIMIT_VALUES = new Set(['none', 'no', 'unlimited', 'unrestricted']);

export function feetInchesToMeters(feet: number, inches = 0): number {
  return (feet * 12 + inches) * METERS_PER_INCH;
}

export function metersToTotalInches(meters: number): number {
  return Math.round(meters / METERS_PER_INCH);
}

/** Formats meters as e.g. `7' 2"`. Drops the inches when they are zero. */
export function formatFeetInches(meters: number): string {
  const total = metersToTotalInches(Math.abs(meters));
  const feet = Math.floor(total / 12);
  const inches = total % 12;
  const sign = meters < 0 && total > 0 ? '-' : '';
  if (feet === 0) return `${sign}${inches}"`;
  return inches === 0 ? `${sign}${feet}'` : `${sign}${feet}' ${inches}"`;
}

function parseSingle(value: string): ParsedHeight {
  const v = value.trim().toLowerCase().replace(/,/g, '.').replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!v) return { kind: 'unknown' };
  if (NO_LIMIT_VALUES.has(v)) return { kind: 'none' };

  // 2.1 | 2.1m | 2.1 m | 2.1 meters
  let m = v.match(/^(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?$/);
  if (m) return { kind: 'meters', meters: parseFloat(m[1]) };

  // 7' | 7'2" | 7' 2" | 7 ft | 7 ft 2 in | 7ft2in | 7 feet 2 inches
  m = v.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (m) {
    const inches = m[2] ? parseFloat(m[2]) : 0;
    if (inches >= 12) return { kind: 'unknown' };
    return { kind: 'meters', meters: feetInchesToMeters(parseFloat(m[1]), inches) };
  }

  // 84" | 84 in
  m = v.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
  if (m) return { kind: 'meters', meters: parseFloat(m[1]) * METERS_PER_INCH };

  return { kind: 'unknown' };
}

/**
 * Parses an OpenStreetMap `maxheight` style value. Handles metric, imperial,
 * "none", and multiple `;`-separated values (the lowest one wins, since that
 * is the one that will hit your roof).
 */
export function parseHeight(raw: string | undefined | null): ParsedHeight {
  if (raw == null) return { kind: 'unknown' };
  const parts = raw.split(';').map(parseSingle);
  const meters = parts.filter((p): p is { kind: 'meters'; meters: number } => p.kind === 'meters');
  if (meters.length > 0) {
    const lowest = Math.min(...meters.map((p) => p.meters));
    // Ignore obviously bad data (under 1.5 m / ~5' or over 10 m / ~33').
    if (lowest < 1.5 || lowest > 10) return { kind: 'unknown' };
    return { kind: 'meters', meters: lowest };
  }
  if (parts.some((p) => p.kind === 'none')) return { kind: 'none' };
  return { kind: 'unknown' };
}

export type Clearance =
  /** A posted/measured clearance. */
  | { status: 'limited'; meters: number }
  /** Open-air lot or explicit "no limit": nothing overhead. */
  | { status: 'open' }
  /** Covered structure with no reported clearance. */
  | { status: 'unknown' };

export type FitStatus = 'fits' | 'tight' | 'too-low' | 'unknown';

export interface FitResult {
  status: FitStatus;
  /** Clearance minus vehicle height, in meters, when the clearance is known. */
  spareMeters?: number;
}

/**
 * Decides whether a vehicle fits.
 * - `fits`: clearance is at least vehicle height + safety margin (or open-air).
 * - `tight`: clears the vehicle but not the margin. Proceed slowly.
 * - `too-low`: clearance is lower than the vehicle.
 */
export function checkFit(clearance: Clearance, vehicleMeters: number, marginMeters: number): FitResult {
  if (clearance.status === 'open') return { status: 'fits' };
  if (clearance.status === 'unknown') return { status: 'unknown' };
  const spare = clearance.meters - vehicleMeters;
  // Compare in whole inches so rounding never turns "exactly equal" into "too low".
  const spareIn = Math.round(spare / METERS_PER_INCH);
  const marginIn = Math.round(marginMeters / METERS_PER_INCH);
  if (spareIn < 0) return { status: 'too-low', spareMeters: spare };
  if (spareIn < marginIn) return { status: 'tight', spareMeters: spare };
  return { status: 'fits', spareMeters: spare };
}

export function describeFit(fit: FitResult): string {
  switch (fit.status) {
    case 'fits':
      return fit.spareMeters == null
        ? 'Fits: no overhead limit'
        : `Fits: ${formatFeetInches(fit.spareMeters)} to spare`;
    case 'tight':
      return `Tight: only ${formatFeetInches(fit.spareMeters ?? 0)} to spare`;
    case 'too-low':
      return `Too low by ${formatFeetInches(-(fit.spareMeters ?? 0))}`;
    default:
      return 'Clearance not reported';
  }
}
