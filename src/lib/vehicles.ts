import { feetInchesToMeters } from './height';

export interface VehiclePreset {
  label: string;
  feet: number;
  inches: number;
}

/** Typical heights. Users should always measure their own vehicle. */
export const VEHICLE_PRESETS: VehiclePreset[] = [
  { label: 'Full-size pickup', feet: 6, inches: 6 },
  { label: 'Dually / HD pickup', feet: 6, inches: 10 },
  { label: 'Lifted truck', feet: 7, inches: 2 },
  { label: 'Pickup w/ rack or topper', feet: 7, inches: 6 },
  { label: 'High-roof van', feet: 9, inches: 6 },
  { label: 'Class C RV', feet: 11, inches: 6 },
  { label: 'Box truck', feet: 12, inches: 0 },
  { label: 'Semi truck', feet: 13, inches: 6 },
];

export const presetMeters = (p: VehiclePreset) => feetInchesToMeters(p.feet, p.inches);

/** Safety margin options in inches. */
export const MARGIN_OPTIONS = [0, 2, 3, 6, 12];

/** Search radius options in miles. */
export const RADIUS_OPTIONS = [1, 2, 5, 10];
