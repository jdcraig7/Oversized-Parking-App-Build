import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMiles } from '../lib/geo';
import { kindLabel } from '../lib/osm';
import type { SpotResult } from '../lib/search';
import { clearanceText, FeeBadge, FitBadge, KIND_ICONS } from './components';
import { colors, radius } from './theme';

export function SpotCard({ result, onPress }: { result: SpotResult; onPress: () => void }) {
  const { spot, fit, clearance, distance, price, driverReports } = result;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spot.name}, ${clearanceText(clearance)}, ${formatMiles(distance)} away`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={KIND_ICONS[spot.kind]} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {spot.name}
          </Text>
          <Text style={styles.distance}>{formatMiles(distance)}</Text>
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {kindLabel(spot.kind)} · {clearanceText(clearance)}
        </Text>
        {price ? (
          <Text style={styles.price} numberOfLines={1}>
            {price}
          </Text>
        ) : null}
        <View style={styles.badges}>
          <FitBadge fit={fit} />
          <FeeBadge fee={spot.fee} />
          {driverReports > 0 && (
            <View style={styles.tag}>
              <Ionicons name="people" size={12} color="#374151" />
              <Text style={styles.tagText}>{driverReports}</Text>
            </View>
          )}
          {spot.hours === '24/7' && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>24/7</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  distance: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  sub: { fontSize: 13, color: colors.muted },
  price: { fontSize: 13, color: colors.text, fontWeight: '600' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F3F4F6' },
  tagText: { fontSize: 12, fontWeight: '700', color: '#374151' },
});
