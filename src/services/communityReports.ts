import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSummaryRow, toDbMeters, type CommunitySummary, type SummaryRow } from '../lib/community';
import type { SpotReport } from '../lib/types';
import { ensureUserId, supabase } from './supabase';

export const communityEnabled = !!supabase;

const BATCH = 500;

/** Fetches shared report summaries. Spots with no reports are simply absent. */
export async function fetchSummaries(spotIds: string[]): Promise<CommunitySummary[]> {
  if (!supabase || spotIds.length === 0) return [];
  const out: CommunitySummary[] = [];
  for (let i = 0; i < spotIds.length; i += BATCH) {
    const { data, error } = await supabase.rpc('get_spot_report_summaries', { spot_ids: spotIds.slice(i, i + BATCH) });
    if (error) throw error;
    out.push(...((data ?? []) as SummaryRow[]).map(parseSummaryRow));
  }
  return out;
}

// --- Writes, with an offline queue -------------------------------------------
// Reports are often made in garages with no signal, so writes are queued on the
// device and sent when possible. Only the latest change per spot is kept.

type PendingOp = { op: 'upsert'; report: SpotReport } | { op: 'delete' };
const QUEUE_KEY = 'community.pending.v1';
let flushing: Promise<void> | null = null;

async function readQueue(): Promise<Record<string, PendingOp>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

async function enqueue(spotId: string, op: PendingOp) {
  const queue = await readQueue();
  queue[spotId] = op;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function send(spotId: string, op: PendingOp, userId: string) {
  if (!supabase) return;
  if (op.op === 'delete') {
    const { error } = await supabase.from('spot_reports').delete().eq('spot_id', spotId).eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { report } = op;
  const row = {
    spot_id: spotId,
    user_id: userId,
    clearance_m: report.clearanceMeters != null ? toDbMeters(report.clearanceMeters) : null,
    price: report.price?.slice(0, 120) || null,
    note: report.note?.slice(0, 300) || null,
  };
  if (row.clearance_m == null && !row.price && !row.note) {
    // Nothing left to share: same as deleting.
    return send(spotId, { op: 'delete' }, userId);
  }
  const { error } = await supabase.from('spot_reports').upsert(row, { onConflict: 'spot_id,user_id' });
  if (error) throw error;
}

/** Sends any queued reports. Safe to call often; failures stay queued. */
export function flushQueue(): Promise<void> {
  if (!supabase) return Promise.resolve();
  // Something may have been queued after the running flush read the queue.
  if (flushing) return flushing.then(() => flushQueue());
  flushing = (async () => {
    const queue = await readQueue();
    const ids = Object.keys(queue);
    if (ids.length === 0) return;
    const userId = await ensureUserId();
    for (const spotId of ids) {
      try {
        await send(spotId, queue[spotId], userId);
        const latest = await readQueue();
        // Only clear it if nothing newer was queued while sending.
        if (JSON.stringify(latest[spotId]) === JSON.stringify(queue[spotId])) {
          delete latest[spotId];
          await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(latest));
        }
      } catch (e) {
        console.warn('Report not sent yet', spotId, e);
      }
    }
  })()
    .catch((e) => console.warn('Report sync failed', e))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

export async function shareReport(report: SpotReport) {
  if (!supabase) return;
  await enqueue(report.spotId, { op: 'upsert', report });
  await flushQueue();
}

export async function unshareReport(spotId: string) {
  if (!supabase) return;
  await enqueue(spotId, { op: 'delete' });
  await flushQueue();
}
