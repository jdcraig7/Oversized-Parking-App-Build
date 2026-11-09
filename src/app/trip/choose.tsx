// Add one parking spot to a trip. Route: /trip/choose?spotId=<id>

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { newId } from '../../lib/vehicles';
import type { Trip } from '../../lib/trips';
import { getCachedSpot } from '../../services/parkingApi';
import { useAppState } from '../../state/AppState';
import { useNewTrip } from '../../state/useNewTrip';
import { Button } from '../../ui/components';
import { colors, radius } from '../../ui/theme';

export default function ChooseTripScreen() {
  const { spotId } = useLocalSearchParams<{ spotId: string }>();
  const { trips, saved, saveTrip } = useAppState();
  const newTrip = useNewTrip();
  const spot = getCachedSpot(spotId) ?? saved.find((s) => s.id === spotId) ?? trips.flatMap((t) => t.stops.map((s) => s.spot)).find((s) => s.id === spotId);

  if (!spot) {
    return (
      <View style={styles.empty}>
        <Text style={styles.hint}>This spot is no longer loaded. Search for it again.</Text>
        <Button title="Close" onPress={() => router.back()} />
      </View>
    );
  }

  const stop = () => ({ id: newId(), spot, nights: 1 });
  const open = (id: string) => {
    router.back();
    router.push({ pathname: '/trip/[id]', params: { id } });
  };
  const addTo = (trip: Trip) => {
    if (!trip.stops.some((s) => s.spot.id === spot.id)) saveTrip({ ...trip, stops: [...trip.stops, stop()] });
    open(trip.id);
  };
  const create = () => {
    const id = newTrip([stop()]);
    if (id) open(id);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListHeaderComponent={
          <Text style={styles.hint} numberOfLines={2}>
            Add <Text style={{ fontWeight: '800', color: colors.text }}>{spot.name}</Text> as the next stop of:
          </Text>
        }
        renderItem={({ item }) => {
          const already = item.stops.some((s) => s.spot.id === spot.id);
          return (
            <Pressable onPress={() => addTo(item)} style={styles.row} accessibilityRole="button">
              <Ionicons name="map" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.small}>
                  {already ? 'Already in this trip' : `${item.stops.length} ${item.stops.length === 1 ? 'stop' : 'stops'} so far`}
                </Text>
              </View>
              <Ionicons name={already ? 'checkmark-circle' : 'add-circle-outline'} size={24} color={colors.primary} />
            </Pressable>
          );
        }}
        ListFooterComponent={<Button title="New trip" icon="add" variant="secondary" onPress={create} style={{ marginTop: 8 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 15, color: colors.muted, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
});
