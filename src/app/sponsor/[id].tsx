import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { recordSponsorEvent, getCachedListing } from '../../services/sponsors';
import { Button, Card, InfoRow } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function SponsorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = getCachedListing(id);

  if (!listing) {
    return (
      <View style={styles.missing}>
        <Text style={styles.body}>This listing is no longer loaded. Search again to see it.</Text>
        <Button title="Back to search" onPress={() => router.back()} />
      </View>
    );
  }

  const open = (url: string) => {
    recordSponsorEvent(listing.id, 'tap');
    Linking.openURL(url).catch(() => Alert.alert('Could not open link'));
  };
  const { latitude: lat, longitude: lon } = listing;
  const directionsUrl =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.label}>
        <Text style={styles.labelText}>Sponsored</Text>
      </View>
      <View style={styles.titleRow}>
        <View style={styles.icon}>
          <Ionicons name="storefront" size={26} color={colors.sponsor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{listing.title}</Text>
          {!!listing.category && <Text style={styles.sub}>{listing.category}</Text>}
        </View>
      </View>

      {!!listing.tagline && <Text style={styles.body}>{listing.tagline}</Text>}

      {!!listing.offer && (
        <Card style={styles.offer}>
          <Ionicons name="pricetag" size={20} color={colors.sponsor} />
          <Text style={styles.offerText}>{listing.offer}</Text>
        </Card>
      )}

      <Card style={{ marginTop: 16 }}>
        <InfoRow icon="location-outline" label="Address" value={listing.address} />
        <InfoRow icon="time-outline" label="Hours" value={listing.hours} />
        <InfoRow icon="cash-outline" label="Prices" value={listing.price} />
      </Card>

      <View style={{ gap: 8, marginTop: 16 }}>
        <Button title="Directions" icon="navigate" onPress={() => open(directionsUrl)} />
        {!!listing.phone && (
          <Button title={`Call ${listing.phone}`} icon="call-outline" variant="secondary" onPress={() => open(`tel:${listing.phone!.replace(/[^\d+]/g, '')}`)} />
        )}
        {!!listing.website && <Button title="Website" icon="globe-outline" variant="secondary" onPress={() => open(listing.website!)} />}
      </View>

      <Text style={styles.footnote}>
        This business paid to be featured in searches near you. Sponsors never change which parking spots fit your vehicle.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  label: { alignSelf: 'flex-start', backgroundColor: colors.sponsor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 12 },
  labelText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, backgroundColor: colors.sponsorBg, borderColor: '#DDD6FE' },
  offerText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.sponsor },
  footnote: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 24, lineHeight: 17 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
});
