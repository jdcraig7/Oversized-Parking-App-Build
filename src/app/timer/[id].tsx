// Start a parking timer for a spot. Route: /timer/<spot id>

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { durationChoices, durationLabel, parseMaxStay } from '../../lib/timer';
import { getCachedSpot } from '../../services/parkingApi';
import { useAppState } from '../../state/AppState';
import { useParkingTimer } from '../../state/Timer';
import { Button, Card, Chip } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function TimerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { saved, trips } = useAppState();
  const { start } = useParkingTimer();
  const spot = getCachedSpot(id) ?? saved.find((s) => s.id === id) ?? trips.flatMap((t) => t.stops.map((s) => s.spot)).find((s) => s.id === id);
  const posted = parseMaxStay(spot?.maxStay);
  const [minutes, setMinutes] = useState(posted ?? 120);
  const [openedAt] = useState(() => Date.now());

  if (!spot) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>This spot is no longer loaded.</Text>
        <Button title="Close" onPress={() => router.back()} />
      </View>
    );
  }

  const go = async () => {
    const notified = await start(spot, minutes);
    router.back();
    if (!notified) {
      Alert.alert('Timer started without alerts', 'Notifications are off for this app, so the timer will only show inside the app. Turn them on in your phone’s Settings to get a reminder.');
    }
  };

  const ends = new Date(openedAt + minutes * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title} numberOfLines={2}>
        {spot.name}
      </Text>
      {posted ? (
        <Text style={styles.body}>Posted max stay: {spot.maxStay}</Text>
      ) : (
        <Text style={styles.body}>Pick how long you paid for or plan to stay.</Text>
      )}
      <Card style={{ gap: 12, marginTop: 12 }}>
        <View style={styles.chips}>
          {durationChoices(spot.maxStay).map((m) => (
            <Chip key={m} label={durationLabel(m)} active={m === minutes} onPress={() => setMinutes(m)} />
          ))}
        </View>
        <View style={styles.row}>
          <Ionicons name="alarm-outline" size={20} color={colors.primary} />
          <Text style={styles.body}>
            Ends at <Text style={{ fontWeight: '800' }}>{ends}</Text>. We&apos;ll remind you 15 minutes before and when time is up.
          </Text>
        </View>
      </Card>
      <Button title="Start timer" icon="play" onPress={go} style={{ marginTop: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
