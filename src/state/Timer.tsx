// The parking timer: one active timer, saved on the phone, with local
// notifications before and when it runs out (no server involved).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { reminderTimes, type ParkingTimer } from '../lib/timer';

const KEY = 'timer.v1';
const CHANNEL = 'parking-timer';

// Show timer alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

interface TimerState {
  timer: ParkingTimer | null;
  /** Starts (or replaces) the timer. Returns false if notifications are off. */
  start: (spot: { id: string; name: string; latitude: number; longitude: number }, minutes: number) => Promise<boolean>;
  stop: () => Promise<void>;
}

const Ctx = createContext<TimerState | null>(null);

async function cancelAll(ids: string[]) {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<ParkingTimer | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const t = raw ? (JSON.parse(raw) as ParkingTimer) : null;
        // Forget timers that ended more than a day ago.
        if (t && t.endsAt > Date.now() - 86_400_000) setTimer(t);
      })
      .catch(() => {});
  }, []);

  const stop = useCallback(async () => {
    setTimer((t) => {
      if (t) cancelAll(t.notificationIds);
      return null;
    });
    await AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  const start = useCallback<TimerState['start']>(async (spot, minutes) => {
    let allowed = (await Notifications.getPermissionsAsync()).granted;
    if (!allowed) allowed = (await Notifications.requestPermissionsAsync()).granted;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Parking timer',
        // Re-exported from NotificationChannelManager.types; the import plugin can't follow it.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
      }).catch(() => {});
    }
    const now = Date.now();
    const endsAt = now + minutes * 60_000;
    const ids: string[] = [];
    if (allowed) {
      for (const r of reminderTimes(endsAt, now)) {
        ids.push(
          await Notifications.scheduleNotificationAsync({
            content: {
              title: r.kind === 'soon' ? 'Parking time ends in 15 minutes' : 'Parking time is up',
              body: r.kind === 'soon' ? `${spot.name}: time to head back or add time.` : `${spot.name}: your parking time has ended.`,
              data: { spotId: spot.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: Math.max(1, Math.round((r.at - now) / 1000)),
              channelId: CHANNEL,
            },
          }),
        );
      }
    }
    const next: ParkingTimer = {
      spotId: spot.id,
      spotName: spot.name,
      latitude: spot.latitude,
      longitude: spot.longitude,
      startedAt: now,
      endsAt,
      notificationIds: ids,
    };
    setTimer((old) => {
      if (old) cancelAll(old.notificationIds);
      return next;
    });
    await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return allowed;
  }, []);

  const value = useMemo(() => ({ timer, start, stop }), [timer, start, stop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useParkingTimer(): TimerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useParkingTimer must be used inside TimerProvider');
  return ctx;
}
