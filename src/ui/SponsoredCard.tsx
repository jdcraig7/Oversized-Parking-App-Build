import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { distanceMeters, formatMiles } from '../lib/geo';
import { checkFit } from '../lib/height';
import type { SponsorPick } from '../lib/sponsors';
import type { LatLng } from '../lib/types';
import { clearanceText, FitBadge } from './components';
import { colors, radius } from './theme';

/** The one sponsored placement at the top of a search. Always labeled "Sponsored". */
export function SponsoredCard({
  pick,
  origin,
  vehicleMeters,
  marginMeters,
  onPress,
}: {
  pick: SponsorPick;
  origin: LatLng;
  vehicleMeters: number;
  marginMeters: number;
  onPress: () => void;
}) {
  const { listing, result } = pick;
  const isSpot = listing.kind === 'spot';
  const clearance = result?.clearance ?? listing.clearance;
  const fit = result?.fit ?? checkFit(clearance, vehicleMeters, marginMeters);
  const subtitle = isSpot ? clearanceText(clearance) : listing.category;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sponsored: ${listing.title}${listing.offer ? `. ${listing.offer}` : ''}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.labelRow}>
        <View style={styles.label}>
          <Text style={styles.labelText}>Sponsored</Text>
        </View>
        <Text style={styles.distance}>{formatMiles(distanceMeters(origin, listing))}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={isSpot ? 'star' : 'storefront'} size={20} color={colors.sponsor} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.title} numberOfLines={1}>
            {listing.title}
          </Text>
          {!!subtitle && (
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {!!listing.tagline && (
            <Text style={styles.sub} numberOfLines={2}>
              {listing.tagline}
            </Text>
          )}
          {!!listing.offer && (
            <View style={styles.offer}>
              <Ionicons name="pricetag" size={13} color={colors.sponsor} />
              <Text style={styles.offerText} numberOfLines={2}>
                {listing.offer}
              </Text>
            </View>
          )}
          {isSpot && <FitBadge fit={fit} />}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.sponsorBg,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 8,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { backgroundColor: colors.sponsor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  labelText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  distance: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  offerText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.sponsor },
});
