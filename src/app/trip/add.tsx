// Pick saved spots to add to a trip. Route: /trip/add?tripId=<id>

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { newId } from '../../lib/vehicles';
import { useAppState } from '../../state/AppState';
import { Button } from '../../ui/components';
import { colors, radius } from '../../ui/theme';

export default function AddStopsScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { trips, saved, saveTrip } = useAppState();
  const trip = trips.find((t) => t.id === tripId);
  const [picked, setPicked] = useState<string[]>([]);
  const inTrip = new Set(trip?.stops.map((s) => s.spot.id));
  const choices = saved.filter((s) => !inTrip.has(s.id));

  const add = () => {
    if (trip) {
      const spots = picked.map((id) => saved.find((s) => s.id === id)!).filter(Boolean);
      saveTrip({ ...trip, stops: [...trip.stops, ...spots.map((spot) => ({ id: newId(), spot, nights: 1 }))] });
    }
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={choices}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        ListHeaderComponent={
          choices.length ? <Text style={styles.hint}>Tap spots in the order you&apos;ll stay at them.</Text> : undefined
        }
        renderItem={({ item }) => {
          const n = picked.indexOf(item.id);
          return (
            <Pressable
              onPress={() => setPicked((p) => (n >= 0 ? p.filter((x) => x !== item.id) : [...p, item.id]))}
              style={[styles.row, n >= 0 && styles.rowOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: n >= 0 }}
            >
              <View style={[styles.check, n >= 0 && styles.checkOn]}>
                {n >= 0 && <Text style={styles.checkText}>{n + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.address && (
                  <Text style={styles.small} numberOfLines={1}>
                    {item.address}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={40} color={colors.primary} />
            <Text style={styles.hint}>
              {saved.length ? 'All your saved spots are already in this trip.' : 'No saved spots yet. Save spots from Search, or tap “Add to trip” on any spot.'}
            </Text>
          </View>
        }
      />
      <View style={styles.footer}>
        <Button title={picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'stop' : 'stops'}` : 'Done'} icon="checkmark" onPress={add} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rowOn: { borderColor: colors.primary },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { color: colors.primaryText, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
});
