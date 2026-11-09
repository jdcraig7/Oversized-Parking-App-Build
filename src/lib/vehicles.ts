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

// --- My garage: several vehicles, one active ---------------------------------

export type VehicleType = 'pickup' | 'van' | 'rv' | 'trailer' | 'box-truck' | 'semi' | 'car' | 'other';

/** Labels and MaterialCommunityIcons names for each vehicle type. */
export const VEHICLE_TYPES: { type: VehicleType; label: string; icon: string }[] = [
  { type: 'pickup', label: 'Pickup', icon: 'car-pickup' },
  { type: 'van', label: 'Van', icon: 'van-utility' },
  { type: 'rv', label: 'RV / motorhome', icon: 'rv-truck' },
  { type: 'trailer', label: 'Truck + trailer', icon: 'caravan' },
  { type: 'box-truck', label: 'Box truck', icon: 'truck' },
  { type: 'semi', label: 'Semi', icon: 'truck-trailer' },
  { type: 'car', label: 'Car / SUV', icon: 'car' },
  { type: 'other', label: 'Other', icon: 'car-side' },
];

export const vehicleTypeInfo = (t: VehicleType) => VEHICLE_TYPES.find((v) => v.type === t) ?? VEHICLE_TYPES[VEHICLE_TYPES.length - 1];

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  /** Total height including racks, AC units, antennas. */
  heightMeters: number;
  /** Overall length (with trailer), for lots that limit length. */
  lengthFeet?: number;
  notes?: string;
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Best guess of a vehicle type from a name or preset label. */
export function guessType(name: string): VehicleType {
  const n = name.toLowerCase();
  if (/\brv\b|motorhome|class [abc]|camper/.test(n)) return 'rv';
  if (/semi|tractor/.test(n)) return 'semi';
  if (/box/.test(n)) return 'box-truck';
  if (/trailer|fifth|5th/.test(n)) return 'trailer';
  if (/van|sprinter|transit|promaster/.test(n)) return 'van';
  if (/pickup|truck|dually|f-?\d50|ram|silverado|tundra|tacoma/.test(n)) return 'pickup';
  if (/car|suv|sedan/.test(n)) return 'car';
  return 'other';
}

/**
 * The garage from saved settings. Older versions stored one vehicle as
 * vehicleName/vehicleMeters; that becomes the first garage vehicle.
 */
export function garageFrom(s: { vehicleName: string; vehicleMeters: number; vehicles?: Vehicle[]; activeVehicleId?: string }): {
  vehicles: Vehicle[];
  activeVehicleId: string;
} {
  const vehicles = s.vehicles?.length
    ? s.vehicles
    : [{ id: 'v1', name: s.vehicleName || 'My vehicle', type: guessType(s.vehicleName), heightMeters: s.vehicleMeters }];
  const activeVehicleId = vehicles.some((v) => v.id === s.activeVehicleId) ? s.activeVehicleId! : vehicles[0].id;
  return { vehicles, activeVehicleId };
}
