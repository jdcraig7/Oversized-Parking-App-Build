import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { feetInchesToMeters } from '../lib/height';
import { DEFAULT_FILTERS, type SearchFilters } from '../lib/search';
import type { ParkingSpot, SpotReport } from '../lib/types';

export interface Settings {
  vehicleName: string;
  vehicleMeters: number;
  marginMeters: number;
  radiusMiles: number;
  filters: SearchFilters;
  onboarded: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  vehicleName: 'My truck',
  vehicleMeters: feetInchesToMeters(7, 0),
  marginMeters: feetInchesToMeters(0, 3),
  radiusMiles: 2,
  filters: DEFAULT_FILTERS,
  onboarded: false,
};

const KEYS = { settings: 'settings.v1', saved: 'saved.v1', reports: 'reports.v1' };

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

  useEffect(() => {
    (async () => {
      const [s, sv, r] = await Promise.all([
        load(KEYS.settings, DEFAULT_SETTINGS),
        load<ParkingSpot[]>(KEYS.saved, []),
        load<Record<string, SpotReport>>(KEYS.reports, {}),
      ]);
      // Merge so settings added in later versions get defaults.
      setSettings({ ...DEFAULT_SETTINGS, ...s, filters: { ...DEFAULT_FILTERS, ...s.filters } });
      setSaved(sv);
      setReports(r);
      setReady(true);
    })();
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(KEYS.settings, next);
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
    }),
    [ready, settings, updateSettings, saved, save, unsave, reports, saveReport, deleteReport],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
