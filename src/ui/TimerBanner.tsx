import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRemaining } from '../lib/timer';
import { useParkingTimer } from '../state/Timer';
import { colors, radius } from './theme';

/** Countdown for the active parking timer, with walk-back directions. */
export function TimerBanner() {
  const { timer, stop } = useParkingTimer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [timer]);
  if (!timer) return null;
  const left = timer.endsAt - now;
  const over = left <= 0;
  return (
    <View style={[styles.bar, over && styles.over]}>
      <Ionicons name={over ? 'alarm' : 'timer-outline'} size={20} color={over ? '#991B1B' : colors.primary} />
      <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: timer.spotId } })} accessibilityRole="button">
        <Text style={[styles.text, over && { color: '#991B1B' }]} numberOfLines={1}>
          {over ? 'Time is up' : `${formatRemaining(left)} left`} · {timer.spotName}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${timer.latitude},${timer.longitude}&travelmode=walking`)}
        accessibilityLabel="Walking directions back to your vehicle"
        hitSlop={8}
      >
        <Ionicons name="walk-outline" size={22} color={colors.primary} />
      </Pressable>
      <Pressable onPress={stop} accessibilityLabel="End parking timer" hitSlop={8}>
        <Ionicons name="close-circle" size={22} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  over: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  text: { fontSize: 14, fontWeight: '700', color: colors.text },
});
