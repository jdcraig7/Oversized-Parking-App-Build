import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { onSpotViewed } from '../../ads/ads';
import { AdBanner } from '../../ads/AdBanner';
import { FREE_SAVED_LIMIT, SHOW_SPONSORS_TO_PRO } from '../../config';
import { resolveClearance, resolvePrice } from '../../lib/community';
import { checkFit, describeFit, formatFeetInches } from '../../lib/height';
import { kindLabel } from '../../lib/osm';
import type { ParkingSpot } from '../../lib/types';
import { getCachedSpot } from '../../services/parkingApi';
import { getCachedListing, listingForSpot } from '../../services/sponsors';
import { useAppState } from '../../state/AppState';
import { useCommunity } from '../../state/Community';
import { usePro } from '../../state/Pro';
import { Button, Card, clearanceText, FeeBadge, InfoRow, KIND_ICONS, SectionTitle, type IconName } from '../../ui/components';
import { MiniMap } from '../../ui/MiniMap';
import { colors, fitColors } from '../../ui/theme';

const ACCESS_TEXT = {
  public: 'Open to the public',
  customers: 'Customers / visitors only',
  restricted: 'Employees, residents or permit holders only',
  unverified: 'Not confirmed: may be a business lot',
} as const;

const RESEARCH_SOURCE_TEXT = {
  sign: 'a photo of the posted sign',
  operator: "the operator's official information",
  listing: 'a third-party parking listing (not verified by us)',
} as const;

export default function SpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, saved, isSaved, save, unsave, reports } = useAppState();
  const { isPro } = usePro();
  const community = useCommunity();
  const { load: loadCommunity } = community;
  const spot: ParkingSpot | undefined = getCachedSpot(id) ?? saved.find((s) => s.id === id);

  useEffect(() => {
    onSpotViewed(isPro);
    // Count each opened spot once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadCommunity([id]);
  }, [id, loadCommunity]);

  if (!spot) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This spot is no longer loaded. Search again to see it.</Text>
        <Button title="Back to search" onPress={() => router.back()} />
      </View>
    );
  }

  const report = reports[spot.id];
  const drivers = community.summaries[spot.id];
  const { clearance, source } = resolveClearance(spot, report, drivers);
  const phone = spot.phone ?? report?.phone;
  const call = () => Linking.openURL(`tel:${phone!.replace(/[^\d+]/g, '')}`);
  // No number on record: search the web for it (name + address).
  const findPhone = () =>
    Linking.openURL(
      `https://www.google.com/search?q=${encodeURIComponent(`${spot.unnamed ? 'parking' : spot.name} ${spot.address ?? `${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`} phone`)}`,
    );
  const price = resolvePrice(spot, report, drivers);
  const fit = checkFit(clearance, settings.vehicleMeters, settings.marginMeters);
  const fitStyle = fitColors[fit.status];
  const savedNow = isSaved(spot.id);
  // A place that only exists as a sponsor listing (not in the map data).
  const sponsorOnly = spot.id.startsWith('sponsor:');
  const sponsor =
    !isPro || SHOW_SPONSORS_TO_PRO
      ? sponsorOnly
        ? getCachedListing(spot.id.slice('sponsor:'.length))
        : listingForSpot(spot.id)
      : undefined;

  const toggleSave = () => {
    if (savedNow) return unsave(spot.id);
    if (!isPro && saved.length >= FREE_SAVED_LIMIT) {
      Alert.alert('Saved spots are full', `Free accounts can save ${FREE_SAVED_LIMIT} spots. Go Pro for unlimited saved spots and no ads.`, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go Pro', onPress: () => router.push('/upgrade') },
      ]);
      return;
    }
    save(spot);
  };

  const directions = () => {
    const { latitude: lat, longitude: lon } = spot;
    const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Could not open maps'));
    const options = [
      ...(Platform.OS === 'ios' ? [{ text: 'Apple Maps', onPress: () => open(`http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`) }] : []),
      { text: 'Google Maps', onPress: () => open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`) },
      { text: 'Waze', onPress: () => open(`https://waze.com/ul?ll=${lat},${lon}&navigate=yes`) },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('Get directions', 'Phone map apps don’t avoid low bridges. If your vehicle is very tall, use a truck GPS or route.', options);
  };

  const share = () =>
    Share.share({
      message: `${spot.name}: ${clearanceText(clearance)}${spot.address ? `, ${spot.address}` : ''}\nhttps://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`,
    });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.kindIcon}>
            <Ionicons name={KIND_ICONS[spot.kind]} size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{spot.name}</Text>
            <Text style={styles.subtitle}>{kindLabel(spot.kind)}{spot.address ? ` · ${spot.address}` : ''}</Text>
          </View>
        </View>

        <MiniMap latitude={spot.latitude} longitude={spot.longitude} onPress={directions} />

        {spot.access !== 'public' && (
          <Card style={styles.accessWarning}>
            <Ionicons name="warning-outline" size={20} color="#92400E" />
            <Text style={styles.accessWarningText}>
              {spot.access === 'customers'
                ? 'Customers only. This lot is for people visiting the business, so don’t leave your vehicle here long-term.'
                : spot.access === 'restricted'
                  ? 'Not open to the public (employees, residents or permit holders).'
                  : 'Public access isn’t confirmed. Many lots like this belong to stores or apartments; check the signs before you park.'}
            </Text>
          </Card>
        )}

        {sponsor && (
          <Card style={styles.sponsor}>
            <View style={styles.sponsorLabel}>
              <Text style={styles.sponsorLabelText}>Sponsored</Text>
            </View>
            {!!sponsor.tagline && <Text style={styles.body}>{sponsor.tagline}</Text>}
            {!!sponsor.offer && (
              <View style={styles.sponsorOffer}>
                <Ionicons name="pricetag" size={16} color={colors.sponsor} />
                <Text style={styles.sponsorOfferText}>{sponsor.offer}</Text>
              </View>
            )}
          </Card>
        )}

        {/* The answer to "will my truck fit?" */}
        <Card style={[styles.verdict, { backgroundColor: fitStyle.bg, borderColor: fitStyle.pin }]}>
          <View style={styles.verdictRow}>
            <Ionicons name={fitStyle.icon as IconName} size={26} color={fitStyle.fg} />
            <Text style={[styles.verdictText, { color: fitStyle.fg }]}>{describeFit(fit)}</Text>
          </View>
          <View style={styles.compare}>
            <Measure label="Clearance" value={clearance.status === 'limited' ? formatFeetInches(clearance.meters) : clearance.status === 'open' ? 'No limit' : '?'} />
            <Measure label="Your vehicle" value={formatFeetInches(settings.vehicleMeters)} />
            <Measure label="Margin" value={formatFeetInches(settings.marginMeters)} />
          </View>
          <Text style={styles.verdictNote}>
            {source === 'you'
              ? 'Using the clearance you reported.'
              : source === 'drivers'
                ? `Based on ${drivers?.clearanceReports} driver report${drivers?.clearanceReports === 1 ? '' : 's'} (median)${spot.clearance.status === 'limited' ? `. Map data says ${formatFeetInches(spot.clearance.meters)}; we use the lower value` : ''}.`
                : clearance.status === 'open'
                ? 'Open-air parking: nothing overhead is recorded. Watch for entry barriers, trees and wires.'
                : clearance.status === 'unknown'
                  ? `No clearance on record for this structure yet. Standard garages are often around 7 ft${settings.vehicleMeters >= 2.08 ? ', so a vehicle your height may not fit' : ''}. Check the sign at the entrance (tap Street View on the map above to look first), or call ahead.`
                  : spot.research
                    ? `Clearance from ${RESEARCH_SOURCE_TEXT[spot.research.source]}${spot.research.checked ? `, checked ${spot.research.checked}` : ''}. ${spot.research.note ? `${spot.research.note} ` : ''}Always check the posted sign.`
                    : `Published clearance: ${spot.clearanceRaw}.`}
          </Text>
          {clearance.status === 'unknown' && !sponsorOnly && (
            <View style={styles.unknownActions}>
              {!!phone && (
                <Button title="Call to ask" icon="call-outline" variant="secondary" onPress={call} style={{ flex: 1 }} />
              )}
              <Button title="I know the clearance" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/report/[id]', params: { id: spot.id } })} style={{ flex: 1 }} />
            </View>
          )}
          {!!spot.research?.url && clearance.status === 'limited' && source === 'map' && (
            <Text style={styles.sourceLink} onPress={() => Linking.openURL(spot.research!.url!)}>
              View source
            </Text>
          )}
        </Card>

        <View style={styles.actions}>
          <Button title="Directions" icon="navigate" onPress={directions} style={{ flex: 1 }} />
          <Button title={savedNow ? 'Saved' : 'Save'} icon={savedNow ? 'bookmark' : 'bookmark-outline'} variant="secondary" onPress={toggleSave} style={{ flex: 1 }} />
          <Button title="" accessibilityLabel="Share" icon="share-outline" variant="secondary" onPress={share} style={{ width: 52 }} />
        </View>
        <View style={[styles.actions, { marginTop: 8 }]}>
          <Button title="Add to trip" icon="map-outline" variant="secondary" onPress={() => router.push({ pathname: '/trip/choose', params: { spotId: spot.id } })} style={{ flex: 1 }} />
          {phone ? (
            <Button title="Call" icon="call-outline" variant="secondary" onPress={call} style={{ flex: 1 }} />
          ) : (
            <Button title="Find phone" icon="search-outline" variant="secondary" onPress={findPhone} style={{ flex: 1 }} />
          )}
        </View>

        <SectionTitle>Price & hours</SectionTitle>
        <Card>
          <View style={{ paddingBottom: 4 }}>
            <FeeBadge fee={spot.fee} />
          </View>
          <InfoRow
            icon="cash-outline"
            label="Rates"
            value={
              price.price
                ? `${price.price}${price.source === 'you' ? ' (your report)' : price.source === 'drivers' ? ` (reported by a driver${drivers?.latestPriceAt ? ` ${new Date(drivers.latestPriceAt).toLocaleDateString()}` : ''})` : ''}`
                : spot.fee === 'free'
                  ? 'Free'
                  : 'Rates not published. Check signs on site.'
            }
          />
          <InfoRow icon="time-outline" label="Fees charged" value={spot.feeHours} />
          <InfoRow icon="calendar-outline" label="Open hours" value={spot.hours ?? 'Not published'} />
          <InfoRow icon="hourglass-outline" label="Max stay" value={spot.maxStay} />
          <InfoRow icon="card-outline" label="Payment" value={spot.payment.length ? spot.payment.join(', ') : undefined} />
        </Card>

        <SectionTitle>Details</SectionTitle>
        <Card>
          <InfoRow icon="people-outline" label="Access" value={ACCESS_TEXT[spot.access]} />
          <InfoRow icon="grid-outline" label="Spaces" value={spot.capacity ? String(spot.capacity) : undefined} />
          <InfoRow icon="bus-outline" label="Truck / bus spaces" value={spot.truckCapacity ? String(spot.truckCapacity) : spot.truckFriendly ? 'Trucks welcome' : undefined} />
          <InfoRow icon="business-outline" label="Operator" value={spot.operator} />
          <InfoRow icon="star-outline" label="Features" value={spot.amenities.length ? spot.amenities.join(' · ') : undefined} />
          <InfoRow icon="document-text-outline" label="Notes" value={spot.description} />
          <InfoRow icon="chatbubble-outline" label="Your note" value={report?.note} />
          <InfoRow icon="call-outline" label="Phone" value={phone ? `${phone}${!spot.phone ? ' (you added)' : ''}` : 'Not on record'} />
          {phone ? (
            <Button title={`Call ${phone}`} icon="call-outline" variant="secondary" onPress={call} style={{ marginTop: 8 }} />
          ) : (
            <View style={[styles.actions, { marginTop: 8 }]}>
              <Button title="Search for number" icon="search-outline" variant="secondary" onPress={findPhone} style={{ flex: 1 }} />
              <Button title="Add number" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/report/[id]', params: { id: spot.id } })} style={{ flex: 1 }} />
            </View>
          )}
          {spot.website && <Button title="Website" icon="globe-outline" variant="secondary" onPress={() => Linking.openURL(spot.website!)} style={{ marginTop: 8 }} />}
        </Card>

        {drivers && (
          <>
            <SectionTitle>Driver reports</SectionTitle>
            <Card>
              <InfoRow icon="people-outline" label="Reports" value={`${drivers.reportCount} · last ${new Date(drivers.lastReportAt).toLocaleDateString()}`} />
              <InfoRow
                icon="resize-outline"
                label="Reported clearance"
                value={drivers.medianClearanceMeters != null ? `${formatFeetInches(drivers.medianClearanceMeters)} (median of ${drivers.clearanceReports})` : undefined}
              />
              {drivers.recentNotes.length > 0 && (
                <InfoRow icon="chatbubbles-outline" label="Recent notes" value={drivers.recentNotes.map((n) => `“${n}”`).join('\n')} />
              )}
            </Card>
          </>
        )}

        {!sponsorOnly && (
          <>
            <SectionTitle>Help other drivers</SectionTitle>
            <Card style={{ gap: 10 }}>
              <Text style={styles.body}>
                {community.enabled
                  ? 'See a different clearance sign or price? Report what you saw to help every driver who comes after you.'
                  : 'See a different clearance sign or price? Save what you saw — the app will use it for this spot.'}
              </Text>
              <Button title={report ? 'Edit my report' : 'Report clearance or price'} icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/report/[id]', params: { id: spot.id } })} />
              {spot.id.startsWith('osm:') ? (
                <Button title="Fix it on OpenStreetMap" icon="open-outline" variant="secondary" onPress={() => Linking.openURL(spot.sourceUrl)} />
              ) : !!spot.sourceUrl && (
                <Button title="View our source" icon="open-outline" variant="secondary" onPress={() => Linking.openURL(spot.sourceUrl)} />
              )}
            </Card>
          </>
        )}

        <Text style={styles.footnote}>
          {sponsorOnly
            ? 'Details provided by the sponsor. Always obey posted clearance signs.'
            : `Data © OpenStreetMap contributors, fetched ${new Date(spot.fetchedAt).toLocaleDateString()}. Always obey posted clearance signs; information may be out of date.`}
        </Text>
      </ScrollView>
      <AdBanner />
    </View>
  );
}

function Measure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.measure}>
      <Text style={styles.measureValue}>{value}</Text>
      <Text style={styles.measureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  kindIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  verdict: { gap: 10, borderWidth: 1.5 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unknownActions: { flexDirection: 'row', gap: 8 },
  sourceLink: { fontSize: 13, fontWeight: '700', color: colors.primary },
  accessWarning: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderColor: '#FCD34D', marginBottom: 12 },
  accessWarningText: { flex: 1, fontSize: 14, color: '#78350F', lineHeight: 20 },
  verdictText: { flex: 1, fontSize: 20, fontWeight: '800' },
  verdictNote: { fontSize: 13, color: colors.text, lineHeight: 18 },
  compare: { flexDirection: 'row', gap: 8 },
  measure: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  measureValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  measureLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  sponsor: { gap: 8, marginBottom: 12, backgroundColor: colors.sponsorBg, borderColor: '#DDD6FE' },
  sponsorLabel: { alignSelf: 'flex-start', backgroundColor: colors.sponsor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sponsorLabelText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  sponsorOffer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sponsorOfferText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.sponsor },
  footnote: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 20, lineHeight: 17 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  missingText: { fontSize: 16, color: colors.text, textAlign: 'center' },
});
