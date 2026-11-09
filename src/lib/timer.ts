// Parking timer: when to remind, and reading a lot's posted max stay.
// Pure functions, unit tested.

export interface ParkingTimer {
  spotId: string;
  spotName: string;
  latitude: number;
  longitude: number;
  startedAt: number;
  endsAt: number;
  /** Scheduled notification ids, so they can be cancelled. */
  notificationIds: string[];
}

/** Minutes from a posted max stay like "2 hours", "90 min", "4h", "1 day", "2 hrs". */
export function parseMaxStay(text?: string): number | null {
  if (!text) return null;
  const m = /(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const minutes = unit.startsWith('d') ? n * 1440 : unit.startsWith('h') ? n * 60 : n;
  return minutes > 0 && minutes <= 30 * 1440 ? Math.round(minutes) : null;
}

/** Reminder times: a heads-up before the end (if there's room for one) and at the end. */
export function reminderTimes(endsAt: number, now: number, headsUpMinutes = 15): { at: number; kind: 'soon' | 'ended' }[] {
  const out: { at: number; kind: 'soon' | 'ended' }[] = [];
  const soon = endsAt - headsUpMinutes * 60_000;
  if (soon - now >= 60_000) out.push({ at: soon, kind: 'soon' });
  if (endsAt > now) out.push({ at: endsAt, kind: 'ended' });
  return out;
}

/** "1h 05m" / "12m" / "0m" left. */
export function formatRemaining(ms: number): string {
  const mins = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
}

/** Duration choices in minutes; the lot's max stay goes first when known. */
export function durationChoices(maxStay?: string): number[] {
  const base = [30, 60, 120, 180, 240, 480, 720, 1440];
  const posted = parseMaxStay(maxStay);
  return posted && !base.includes(posted) ? [posted, ...base].sort((a, b) => a - b) : base;
}

export const durationLabel = (min: number) => (min % 1440 === 0 ? `${min / 1440} day${min === 1440 ? '' : 's'}` : min % 60 === 0 ? `${min / 60} hr` : `${min} min`);
