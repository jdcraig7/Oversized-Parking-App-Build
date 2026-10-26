import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AdBanner } from '../../ads/AdBanner';
import { FREE_SAVED_LIMIT } from '../../config';
import { evaluate } from '../../lib/search';
import type { LatLng } from '../../lib/types';
import { useAppState } from '../../state/AppState';
import { usePro } from '../../state/Pro';
import { Button } from '../../ui/components';
import { SpotCard } from '../../ui/SpotCard';
import { colors } from '../../ui/theme';

export default function SavedScreen() {
  const { saved, settings, reports } = useAppState();
  const { isPro } = usePro();
  const [here, setHere] = useState<LatLng | null>(null);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => (status === 'granted' ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => pos && setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
      .catch(() => {});
  }, []);

  const results = useMemo(
    () =>
      saved.map((s) =>
        evaluate(s, here ?? s, settings.vehicleMeters, settings.marginMeters, reports[s.id]),
      ),
    [saved, here, settings.vehicleMeters, settings.marginMeters, reports],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={results}
        keyExtractor={(r) => r.spot.id}
        contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
        renderItem={({ item }) => (
          <SpotCard result={item} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.spot.id } })} />
        )}
        ListHeaderComponent={
          saved.length > 0 && !isPro ? (
            <Text style={styles.limit}>
              {saved.length} of {FREE_SAVED_LIMIT} free saved spots used · works offline
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={48} color={colors.primary} />
            <Text style={styles.title}>No saved spots yet</Text>
            <Text style={styles.text}>Tap Save on any parking spot to keep it here. Saved spots are available even without signal.</Text>
            <Button title="Find parking" icon="search" onPress={() => router.navigate('/')} />
          </View>
        }
      />
      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  text: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  limit: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingBottom: 4 },
});
