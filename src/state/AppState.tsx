import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { feetInchesToMeters } from '../lib/height';
import { DEFAULT_FILTERS, type SearchFilters } from '../lib/search';
import type { Trip } from '../lib/trips';
import type { ParkingSpot, SpotReport } from '../lib/types';
import { garageFrom, type Vehicle } from '../lib/vehicles';

export interface Settings {
  /** The active vehicle's name and height (kept in sync with the garage). */
  vehicleName: string;
  vehicleMeters: number;
  /** My garage: every saved vehicle. */
  vehicles: Vehicle[];
  activeVehicleId: string;
  marginMeters: number;
  radiusMiles: number;
  filters: SearchFilters;
  onboarded: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  vehicleName: 'My truck',
  vehicleMeters: feetInchesToMeters(7, 0),
  vehicles: [],
  activeVehicleId: '',
  marginMeters: feetInchesToMeters(0, 3),
  radiusMiles: 2,
  filters: DEFAULT_FILTERS,
  onboarded: false,
};

const KEYS = { settings: 'settings.v1', saved: 'saved.v1', reports: 'reports.v1', trips: 'trips.v1' };

interface AppState {
  ready: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  saved: ParkingSpot[];
  isSaved: (id: string) => boolean;
  save: (spot: ParkingSpot) => void;
  unsave: (id: string) => void;
  reports: Record<string, SpotReport>;
  saveReport: (report: SpotReport) => void;
  deleteReport: (spotId: string) => void;
  /** Adds or updates a garage vehicle. */
  saveVehicle: (vehicle: Vehicle) => void;
  removeVehicle: (id: string) => void;
  selectVehicle: (id: string) => void;
  activeVehicle: Vehicle;
  trips: Trip[];
  /** Adds or updates a trip. */
  saveTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
}

/** Settings with the active vehicle's name/height copied to the top level. */
function withActive(s: Settings): Settings {
  const v = s.vehicles.find((x) => x.id === s.activeVehicleId) ?? s.vehicles[0];
  return v ? { ...s, activeVehicleId: v.id, vehicleName: v.name, vehicleMeters: v.heightMeters } : s;
}

const Ctx = createContext<AppState | null>(null);

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch((e) => console.warn('Failed to save', key, e));
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<ParkingSpot[]>([]);
  const [reports, setReports] = useState<Record<string, SpotReport>>({});
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    (async () => {
      const [s, sv, r, tr] = await Promise.all([
        load(KEYS.settings, DEFAULT_SETTINGS),
        load<ParkingSpot[]>(KEYS.saved, []),
        load<Record<string, SpotReport>>(KEYS.reports, {}),
        load<Trip[]>(KEYS.trips, []),
      ]);
      // Merge so settings added in later versions get defaults; older
      // versions' single vehicle becomes the first garage vehicle.
      const merged = { ...DEFAULT_SETTINGS, ...s, filters: { ...DEFAULT_FILTERS, ...s.filters } };
      setSettings(withActive({ ...merged, ...garageFrom(merged) }));
      setSaved(sv);
      setReports(r);
      setTrips(tr);
      setReady(true);
    })();
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      let next = { ...prev, ...patch };
      // Editing the top-level name/height edits the active vehicle.
      if (patch.vehicleName !== undefined || patch.vehicleMeters !== undefined) {
        next.vehicles = next.vehicles.map((v) =>
          v.id === next.activeVehicleId ? { ...v, name: next.vehicleName, heightMeters: next.vehicleMeters } : v,
        );
      }
      next = withActive(next);
      persist(KEYS.settings, next);
      return next;
    });
  }, []);

  const saveVehicle = useCallback(
    (vehicle: Vehicle) =>
      setSettings((prev) => {
        const exists = prev.vehicles.some((v) => v.id === vehicle.id);
        const vehicles = exists ? prev.vehicles.map((v) => (v.id === vehicle.id ? vehicle : v)) : [...prev.vehicles, vehicle];
        const next = withActive({ ...prev, vehicles });
        persist(KEYS.settings, next);
        return next;
      }),
    [],
  );

  const removeVehicle = useCallback(
    (id: string) =>
      setSettings((prev) => {
        if (prev.vehicles.length <= 1) return prev;
        const next = withActive({ ...prev, vehicles: prev.vehicles.filter((v) => v.id !== id) });
        persist(KEYS.settings, next);
        return next;
      }),
    [],
  );

  const selectVehicle = useCallback(
    (id: string) =>
      setSettings((prev) => {
        const next = withActive({ ...prev, activeVehicleId: id });
        persist(KEYS.settings, next);
        return next;
      }),
    [],
  );

  const saveTrip = useCallback((trip: Trip) => {
    setTrips((prev) => {
      const next = prev.some((t) => t.id === trip.id) ? prev.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...prev];
      persist(KEYS.trips, next);
      return next;
    });
  }, []);

  const deleteTrip = useCallback((id: string) => {
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persist(KEYS.trips, next);
      return next;
    });
  }, []);

  const save = useCallback((spot: ParkingSpot) => {
    setSaved((prev) => {
      const next = [spot, ...prev.filter((s) => s.id !== spot.id)];
      persist(KEYS.saved, next);
      return next;
    });
  }, []);

  const unsave = useCallback((id: string) => {
    setSaved((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(KEYS.saved, next);
      return next;
    });
  }, []);

  const saveReport = useCallback((report: SpotReport) => {
    setReports((prev) => {
      const next = { ...prev, [report.spotId]: report };
      persist(KEYS.reports, next);
      return next;
    });
  }, []);

  const deleteReport = useCallback((spotId: string) => {
    setReports((prev) => {
      const { [spotId]: _, ...next } = prev;
      persist(KEYS.reports, next);
      return next;
    });
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      settings,
      updateSettings,
      saved,
      isSaved: (id) => saved.some((s) => s.id === id),
      save,
      unsave,
      reports,
      saveReport,
      deleteReport,
      saveVehicle,
      removeVehicle,
      selectVehicle,
      activeVehicle: settings.vehicles.find((v) => v.id === settings.activeVehicleId) ?? {
        id: settings.activeVehicleId,
        name: settings.vehicleName,
        type: 'other',
        heightMeters: settings.vehicleMeters,
      },
      trips,
      saveTrip,
      deleteTrip,
    }),
    [ready, settings, updateSettings, saved, save, unsave, reports, saveReport, deleteReport, saveVehicle, removeVehicle, selectVehicle, trips, saveTrip, deleteTrip],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
