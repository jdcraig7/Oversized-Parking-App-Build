import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { CommunitySummary } from '../lib/community';
import type { SpotReport } from '../lib/types';
import { communityEnabled, fetchSummaries, flushQueue, shareReport, unshareReport } from '../services/communityReports';

const REFRESH_AFTER_MS = 10 * 60 * 1000;

interface CommunityState {
  enabled: boolean;
  summaries: Record<string, CommunitySummary>;
  /** Loads summaries for these spots (skips ones fetched recently). */
  load: (spotIds: string[], force?: boolean) => Promise<void>;
  share: (report: SpotReport) => Promise<void>;
  unshare: (spotId: string) => Promise<void>;
}

const Ctx = createContext<CommunityState | null>(null);

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<Record<string, CommunitySummary>>({});
  const fetchedAt = useRef(new Map<string, number>());

  // Send reports queued while offline: at launch and whenever the app returns.
  useEffect(() => {
    if (!communityEnabled) return;
    flushQueue();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && flushQueue());
    return () => sub.remove();
  }, []);

  const load = useCallback(async (spotIds: string[], force = false) => {
    if (!communityEnabled) return;
    const now = Date.now();
    const ids = spotIds.filter((id) => force || now - (fetchedAt.current.get(id) ?? 0) > REFRESH_AFTER_MS);
    if (ids.length === 0) return;
    ids.forEach((id) => fetchedAt.current.set(id, now));
    try {
      const found = await fetchSummaries(ids);
      setSummaries((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        for (const s of found) next[s.spotId] = s;
        return next;
      });
    } catch (e) {
      ids.forEach((id) => fetchedAt.current.delete(id));
      console.warn('Could not load driver reports', e);
    }
  }, []);

  const share = useCallback(
    async (report: SpotReport) => {
      await shareReport(report);
      await load([report.spotId], true);
    },
    [load],
  );

  const unshare = useCallback(
    async (spotId: string) => {
      await unshareReport(spotId);
      await load([spotId], true);
    },
    [load],
  );

  const value = useMemo(
    () => ({ enabled: communityEnabled, summaries, load, share, unshare }),
    [summaries, load, share, unshare],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommunity(): CommunityState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCommunity must be used inside CommunityProvider');
  return ctx;
}
