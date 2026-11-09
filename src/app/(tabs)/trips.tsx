import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdBanner } from '../../ads/AdBanner';
import { dayLabel, schedule, totalNights, type Trip } from '../../lib/trips';
import { useAppState } from '../../state/AppState';
import { useNewTrip } from '../../state/useNewTrip';
import { Button, Card } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function TripsScreen() {
  const { trips } = useAppState();
  const newTrip = useNewTrip();

  const create = () => {
    const id = newTrip();
    if (id) router.push({ pathname: '/trip/[id]', params: { id } });
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
        renderItem={({ item }) => <TripCard trip={item} />}
        ListFooterComponent={trips.length ? <Button title="New trip" icon="add" variant="secondary" onPress={create} /> : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="map-outline" size={48} color={colors.primary} />
            <Text style={styles.title}>Plan your parking ahead</Text>
            <Text style={styles.text}>
              Line up the garages and lots you&apos;ll stay at, in order, with how many nights at each. Every stop is checked
              against your vehicle, and you get turn-by-turn directions for the whole route.
            </Text>
            <Button title="Plan a trip" icon="add" onPress={create} />
          </View>
        }
      />
      <AdBanner />
    </View>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const dates = schedule(trip);
  const nights = totalNights(trip);
  const when =
    dates && dates.length
      ? `${dayLabel(dates[0].arrive)} – ${dayLabel(dates[dates.length - 1].leave)}`
      : trip.startDate
        ? `Starts ${dayLabel(trip.startDate)}`
        : 'No dates yet';
  return (
    <Pressable onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })} accessibilityRole="button">
      <Card style={styles.card}>
        <Ionicons name="map" size={26} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={styles.meta}>
            {trip.stops.length} {trip.stops.length === 1 ? 'stop' : 'stops'}
            {nights ? ` · ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''} · {when}
          </Text>
          {trip.stops.length > 0 && (
            <Text style={styles.route} numberOfLines={1}>
              {trip.stops.map((s) => s.spot.name).join(' → ')}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  text: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  route: { fontSize: 13, color: colors.text, marginTop: 4 },
});
