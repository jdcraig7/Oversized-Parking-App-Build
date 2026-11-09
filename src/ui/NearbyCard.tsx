import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { METERS_PER_MILE } from '../lib/geo';
import { formatFeetInches } from '../lib/height';
import { blockingClearances, type DumpStation, type LowClearance } from '../lib/nearby';
import type { LatLng } from '../lib/types';
import { nearbyFor } from '../services/parkingApi';
import { Card, SectionTitle } from './components';
import { colors } from './theme';

const WARN_RADIUS = METERS_PER_MILE; // low clearances on the way in
const DUMP_RADIUS = 5 * METERS_PER_MILE;
const miles = (m: number) => `${(m / METERS_PER_MILE).toFixed(m < METERS_PER_MILE ? 1 : 0)} mi`;
const openMap = (p: LatLng, label: string) =>
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}&query_place_id=${encodeURIComponent(label)}`);

/** Low bridges/barriers around a parking spot that the vehicle won't fit under, and the nearest RV dump station. */
export function NearbyCard({ spot, vehicleMeters, marginMeters, vehicleName }: { spot: LatLng; vehicleMeters: number; marginMeters: number; vehicleName: string }) {
  const [data, setData] = useState<{ lowClearances: LowClearance[]; dumpStations: DumpStation[] } | null | undefined>(undefined);
  const { latitude, longitude } = spot;
  useEffect(() => {
    let live = true;
    nearbyFor({ latitude, longitude }, DUMP_RADIUS).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [latitude, longitude]);

  if (!data) return null; // loading, offline, or outside the library
  const blocking = blockingClearances(data.lowClearances, vehicleMeters, marginMeters, WARN_RADIUS);
  const dump = data.dumpStations[0];

  return (
    <>
      <SectionTitle>On the way in</SectionTitle>
      <Card style={{ gap: 10 }}>
        {blocking.length ? (
          <>
            <View style={styles.row}>
              <Ionicons name="warning" size={20} color="#B91C1C" />
              <Text style={[styles.body, styles.warn]}>
                {blocking.length} low {blocking.length === 1 ? 'clearance' : 'clearances'} within 1 mi that {vehicleName} won&apos;t fit under. Plan your route
                around {blocking.length === 1 ? 'it' : 'them'}.
              </Text>
            </View>
            {blocking.slice(0, 5).map((c) => (
              <Pressable key={c.id} style={styles.item} onPress={() => openMap(c, c.name ?? c.what)} accessibilityRole="link">
                <Text style={styles.height}>{formatFeetInches(c.meters)}</Text>
                <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                  {c.what}
                  {c.name ? ` · ${c.name}` : ''}
                </Text>
                <Text style={styles.small}>{miles(c.distance)}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          <View style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#166534" />
            <Text style={[styles.body, { flex: 1 }]}>No low bridges or height barriers under {formatFeetInches(vehicleMeters + marginMeters)} on record within 1 mi.</Text>
          </View>
        )}
        <Text style={styles.small}>From map data, which can miss some. Phone map apps don&apos;t route around low bridges; use a truck or RV GPS for tall vehicles.</Text>
        {dump && (
          <Pressable style={[styles.row, styles.dump]} onPress={() => openMap(dump, dump.name)} accessibilityRole="link">
            <Ionicons name="water-outline" size={20} color={colors.primary} />
            <Text style={[styles.body, { flex: 1 }]} numberOfLines={2}>
              Nearest RV dump station: {dump.name}
              {dump.fee === 'no' ? ' (free)' : ''} · {miles(dump.distance)}
            </Text>
          </Pressable>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dump: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  warn: { flex: 1, color: '#991B1B', fontWeight: '700' },
  height: { fontSize: 15, fontWeight: '800', color: '#B91C1C', minWidth: 52 },
  small: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
