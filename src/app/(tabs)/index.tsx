import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdBanner } from '../../ads/AdBanner';
import { SHOW_SPONSORS_TO_PRO } from '../../config';
import { distanceMeters, isInUnitedStates, METERS_PER_MILE } from '../../lib/geo';
import { formatFeetInches } from '../../lib/height';
import { vehicleTypeInfo } from '../../lib/vehicles';
import { applyFilters, evaluate, summarize, type SearchFilters, type SortOrder } from '../../lib/search';
import { listingToSpot, pickSponsored, sponsorSpotId, type SponsoredListing, type SponsorPick } from '../../lib/sponsors';
import type { LatLng, ParkingSpot } from '../../lib/types';
import { searchPlaces, type Place } from '../../services/geocode';
import { cacheSpot, searchParking } from '../../services/parkingApi';
import { fetchSponsored, recordSponsorEvent, sponsorsEnabled } from '../../services/sponsors';
import { useAppState } from '../../state/AppState';
import { useCommunity } from '../../state/Community';
import { usePro } from '../../state/Pro';
import { Button, Chip } from '../../ui/components';
import { SponsoredCard } from '../../ui/SponsoredCard';
import { SpotCard } from '../../ui/SpotCard';
import { colors, fitColors, radius } from '../../ui/theme';

const SORT_LABELS: Record<SortOrder, string> = {
  distance: 'Nearest',
  'best-fit': 'Best fit',
  'free-first': 'Free first',
};
const SORT_CYCLE: SortOrder[] = ['distance', 'best-fit', 'free-first'];
const NO_SPOTS: ParkingSpot[] = [];
const NO_LISTINGS: SponsoredListing[] = [];
/** Map selection id for the sponsored pin. */
const SPONSOR_SELECTED = '__sponsor__';

export default function SearchScreen() {
  const { settings, updateSettings, reports, activeVehicle, selectVehicle } = useAppState();

  // One tap to switch between the vehicles in My garage.
  const [showVehicles, setShowVehicles] = useState(false);
  const switchVehicle = () => (settings.vehicles.length < 2 ? router.push('/settings') : setShowVehicles((s) => !s));
  const { filters } = settings;
  const community = useCommunity();
  const { load: loadCommunity } = community;
  const { isPro } = usePro();
  const showSponsors = sponsorsEnabled && (!isPro || SHOW_SPONSORS_TO_PRO);

  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);

  // What we're searching around. Results are fetched whenever this or the radius changes.
  const [center, setCenter] = useState<LatLng | null>(null);
  const [centerLabel, setCenterLabel] = useState('');
  const [result, setResult] = useState<{ key: string; spots: ParkingSpot[]; error: string | null }>({
    key: '',
    spots: [],
    error: null,
  });
  const [refreshCount, setRefreshCount] = useState(0);
  const [locating, setLocating] = useState(false);
  // Problems that happen before a search starts (no location, outside the US).
  const [notice, setNotice] = useState<string | null>(null);
  const [sponsored, setSponsored] = useState<{ key: string; listings: SponsoredListing[] }>({ key: '', listings: [] });

  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  const radiusMeters = settings.radiusMiles * METERS_PER_MILE;
  const searchKey = center ? `${center.latitude},${center.longitude},${radiusMeters},${refreshCount}` : '';
  const searching = !!center && result.key !== searchKey;
  const loading = searching || locating;
  const spots = searching ? NO_SPOTS : result.spots;
  const error = searching ? null : result.error;

  useEffect(() => {
    if (!center) return;
    let alive = true;
    searchParking(center, radiusMeters, { force: refreshCount > 0 }).then(
      (found) => alive && setResult({ key: searchKey, spots: found, error: null }),
      (e) => alive && setResult({ key: searchKey, spots: [], error: e instanceof Error ? e.message : 'Search failed.' }),
    );
    return () => {
      alive = false;
    };
  }, [center, radiusMeters, refreshCount, searchKey]);

  // Sponsors targeting this area (never blocks or breaks the search).
  const centerKey = center ? `${center.latitude},${center.longitude}` : '';
  useEffect(() => {
    if (!center || !showSponsors) return;
    let alive = true;
    fetchSponsored(center).then((listings) => alive && setSponsored({ key: centerKey, listings }));
    return () => {
      alive = false;
    };
  }, [center, centerKey, showSponsors]);
  const listings = showSponsors && sponsored.key === centerKey ? sponsored.listings : NO_LISTINGS;

  // Pull shared driver reports for whatever we found.
  useEffect(() => {
    if (spots.length) loadCommunity(spots.map((s) => s.id));
  }, [spots, loadCommunity]);

  const runSearch = useCallback((point: LatLng, label: string) => {
    setMapCenter(null);
    setSelectedId(null);
    setRefreshCount(0);
    if (!isInUnitedStates(point)) {
      setCenter(null);
      setNotice('This app currently covers the United States only.');
      return;
    }
    setNotice(null);
    setCenter(point);
    setCenterLabel(label);
  }, []);

  const locateMe = useCallback(
    async (askPermission: boolean) => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' && askPermission) status = (await Location.requestForegroundPermissionsAsync()).status;
        if (status !== 'granted') {
          if (askPermission) setNotice('Location is off. Search for a city, address or ZIP code instead.');
          return;
        }
        setLocating(true);
        const pos =
          (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        runSearch({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, 'Near you');
      } catch {
        setNotice("Couldn't get your location. Try searching for a city instead.");
      } finally {
        setLocating(false);
      }
    },
    [runSearch],
  );

  // If location was already allowed, start with nearby results.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === 'granted') locateMe(false);
      })
      .catch(() => {});
  }, [locateMe]);

  // Keep the map centered on each new search.
  useEffect(() => {
    if (center) mapRef.current?.animateToRegion(regionFor(center, radiusMeters), 400);
  }, [center, radiusMeters]);

  const onSubmitQuery = async () => {
    Keyboard.dismiss();
    if (!query.trim()) return;
    setPlacesLoading(true);
    try {
      const found = await searchPlaces(query);
      if (found.length === 1) {
        pickPlace(found[0]);
      } else {
        setPlaces(found);
      }
    } catch {
      setPlaces([]);
    } finally {
      setPlacesLoading(false);
    }
  };

  const pickPlace = (p: Place) => {
    setPlaces(null);
    setQuery(p.subtitle ? `${p.title}, ${p.subtitle}` : p.title);
    runSearch(p, p.title);
  };

  const setFilter = (patch: Partial<SearchFilters>) => updateSettings({ filters: { ...filters, ...patch } });

  const evaluated = useMemo(() => {
    if (!center) return [];
    return spots.map((s) =>
      evaluate(s, center, settings.vehicleMeters, settings.marginMeters, reports[s.id], community.summaries[s.id]),
    );
  }, [spots, center, settings.vehicleMeters, settings.marginMeters, reports, community.summaries]);

  // At most one sponsor per search, and only parking the vehicle fits (see pickSponsored).
  const pick: SponsorPick | null = useMemo(
    () =>
      // No sponsor on a failed search: an ad above an error message looks broken.
      loading || error || listings.length === 0
        ? null
        : pickSponsored(listings, evaluated, settings.vehicleMeters, settings.marginMeters, searchKey),
    [loading, error, listings, evaluated, settings.vehicleMeters, settings.marginMeters, searchKey],
  );

  // The promoted spot appears once, in the sponsored slot, not again in the list.
  const results = useMemo(() => {
    const promoted = pick?.result?.spot.id;
    return applyFilters(promoted ? evaluated.filter((r) => r.spot.id !== promoted) : [...evaluated], filters);
  }, [evaluated, filters, pick]);

  const stats = useMemo(() => summarize(results), [results]);
  const selected = results.find((r) => r.spot.id === selectedId);

  const openSpot = (id: string) => router.push({ pathname: '/spot/[id]', params: { id } });

  // Count one view per search the sponsor appears in.
  const pickedId = pick?.listing.id;
  useEffect(() => {
    if (pickedId) recordSponsorEvent(pickedId, 'view');
  }, [pickedId, searchKey]);

  const openSponsor = (p: SponsorPick) => {
    recordSponsorEvent(p.listing.id, 'tap');
    if (p.listing.kind === 'business') {
      router.push({ pathname: '/sponsor/[id]', params: { id: p.listing.id } });
    } else if (p.result) {
      openSpot(p.result.spot.id);
    } else {
      cacheSpot(listingToSpot(p.listing));
      openSpot(sponsorSpotId(p.listing.id));
    }
  };

  const sponsoredCard = (p: SponsorPick) =>
    center ? (
      <SponsoredCard
        pick={p}
        origin={center}
        vehicleMeters={settings.vehicleMeters}
        marginMeters={settings.marginMeters}
        onPress={() => openSponsor(p)}
      />
    ) : undefined;

  const showSearchHere = mode === 'map' && !!center && !!mapCenter && distanceMeters(center, mapCenter) > radiusMeters * 0.3;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Search bar */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (!t) setPlaces(null);
            }}
            onSubmitEditing={onSubmitQuery}
            placeholder="City, address or ZIP"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Search for a city, address or ZIP code"
          />
          {placesLoading ? (
            <ActivityIndicator size="small" />
          ) : query ? (
            <Pressable onPress={() => { setQuery(''); setPlaces(null); }} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable style={styles.locateBtn} onPress={() => locateMe(true)} accessibilityLabel="Use my location">
          <Ionicons name="locate" size={22} color={colors.primaryText} />
        </Pressable>
      </View>

      {/* Vehicle summary */}
      <Pressable style={styles.vehicleBar} onPress={switchVehicle} accessibilityRole="button" accessibilityHint="Switch vehicle">
        <MaterialCommunityIcons name={vehicleTypeInfo(activeVehicle.type).icon as never} size={20} color={colors.primary} />
        <Text style={styles.vehicleText}>
          {settings.vehicleName}: <Text style={{ fontWeight: '800' }}>{formatFeetInches(settings.vehicleMeters)}</Text>
          {settings.marginMeters > 0 ? ` + ${formatFeetInches(settings.marginMeters)} margin` : ''}
        </Text>
        <Text style={styles.vehicleEdit}>{settings.vehicles.length > 1 ? 'Switch' : 'Change'}</Text>
      </Pressable>

      {showVehicles && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          {settings.vehicles.map((v) => (
            <Chip
              key={v.id}
              label={`${v.name} · ${formatFeetInches(v.heightMeters)}`}
              active={v.id === settings.activeVehicleId}
              onPress={() => {
                selectVehicle(v.id);
                setShowVehicles(false);
              }}
            />
          ))}
          <Chip label="My garage" icon="settings-outline" onPress={() => router.push('/settings')} />
        </ScrollView>
      )}

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        <Chip label="Public only" icon="people" active={filters.publicOnly} onPress={() => setFilter({ publicOnly: !filters.publicOnly })} />
        <Chip label="Fits my vehicle" icon="checkmark" active={filters.hideTooLow} onPress={() => setFilter({ hideTooLow: !filters.hideTooLow })} />
        <Chip label="Known clearance" active={filters.hideUnknown} onPress={() => setFilter({ hideUnknown: !filters.hideUnknown })} />
        <Chip label="Free" icon="pricetag" active={filters.freeOnly} onPress={() => setFilter({ freeOnly: !filters.freeOnly })} />
        <Chip label="Open-air lots" icon="sunny" active={filters.lotsOnly} onPress={() => setFilter({ lotsOnly: !filters.lotsOnly, garagesOnly: false })} />
        <Chip label="Garages" icon="business" active={filters.garagesOnly} onPress={() => setFilter({ garagesOnly: !filters.garagesOnly, lotsOnly: false })} />
        <Chip label="Truck / RV" icon="bus" active={filters.truckOnly} onPress={() => setFilter({ truckOnly: !filters.truckOnly })} />
        <Chip
          label={`Sort: ${SORT_LABELS[filters.sort]}`}
          icon="swap-vertical"
          onPress={() => setFilter({ sort: SORT_CYCLE[(SORT_CYCLE.indexOf(filters.sort) + 1) % SORT_CYCLE.length] })}
        />
      </ScrollView>

      {/* Place picker */}
      {places && (
        <View style={styles.places}>
          {places.length === 0 ? (
            <Text style={styles.muted}>No US places matched “{query}”. Try a city and state, like “Denver, CO”.</Text>
          ) : (
            places.map((p) => (
              <Pressable key={p.id} style={styles.placeRow} onPress={() => pickPlace(p)}>
                <Ionicons name="location" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeTitle}>{p.title}</Text>
                  {!!p.subtitle && <Text style={styles.muted}>{p.subtitle}</Text>}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Results header */}
      {center && !places && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsText} numberOfLines={1}>
            {loading ? 'Searching…' : `${stats.total} spots${centerLabel ? ` · ${centerLabel}` : ''} · within ${settings.radiusMiles} mi`}
          </Text>
          <View style={styles.toggle}>
            {(['list', 'map'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.toggleBtn, mode === m && styles.toggleActive]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
                <Ionicons name={m === 'list' ? 'list' : 'map'} size={16} color={mode === m ? colors.primaryText : colors.text} />
                <Text style={[styles.toggleText, mode === m && { color: colors.primaryText }]}>{m === 'list' ? 'List' : 'Map'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Body */}
      <View style={{ flex: 1 }}>
        {!center && !loading && !places && (
          <View style={styles.empty}>
            <Ionicons name="car-sport-outline" size={56} color={colors.primary} />
            <Text style={styles.emptyTitle}>Find parking that fits</Text>
            <Text style={styles.emptyText}>
              Search any US city, address or ZIP code. We&apos;ll show garages with their clearance, open-air lots with no height limit, and truck parking.
            </Text>
            <Button title="Use my location" icon="locate" onPress={() => locateMe(true)} style={{ alignSelf: 'stretch' }} />
            {notice && <Text style={styles.error}>{notice}</Text>}
          </View>
        )}

        {center && !places && mode === 'list' && (
          <FlatList
            data={results}
            keyExtractor={(r) => r.spot.id}
            contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 24 }}
            renderItem={({ item }) => <SpotCard result={item} onPress={() => openSpot(item.spot.id)} />}
            ListHeaderComponent={pick ? sponsoredCard(pick) : undefined}
            refreshing={loading}
            onRefresh={() => setRefreshCount((n) => n + 1)}
            ListEmptyComponent={
              loading ? undefined : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>{error ? 'Something went wrong' : 'No matching spots'}</Text>
                  <Text style={styles.emptyText}>
                    {error ??
                      (filters.publicOnly
                        ? 'No confirmed public parking here. Try a wider area, or turn off "Public only" to see store and business lots too.'
                        : 'Try a bigger search radius in Vehicle settings, or turn off a filter.')}
                  </Text>
                  {!!error && <Button title="Try again" icon="refresh" onPress={() => setRefreshCount((n) => n + 1)} />}
                  {!error && settings.radiusMiles < 10 && (
                    <Button title="Search a wider area" variant="secondary" onPress={() => updateSettings({ radiusMiles: Math.min(10, settings.radiusMiles * 2) })} />
                  )}
                </View>
              )
            }
            ListFooterComponent={
              results.length > 0 ? (
                <Text style={styles.footnote}>
                  Data © OpenStreetMap contributors. Clearances and prices can change — always check posted signs before entering.
                </Text>
              ) : undefined
            }
          />
        )}

        {center && !places && mode === 'map' && (
          <View style={{ flex: 1 }}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              showsUserLocation
              initialRegion={regionFor(center, radiusMeters)}
              onRegionChangeComplete={(r: Region) => setMapCenter({ latitude: r.latitude, longitude: r.longitude })}
              onPress={() => setSelectedId(null)}
            >
              {results.map((r) => (
                <Marker
                  key={r.spot.id}
                  coordinate={r.spot}
                  pinColor={fitColors[r.fit.status].pin}
                  tracksViewChanges={false}
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedId(r.spot.id);
                  }}
                />
              ))}
              {pick && (
                <Marker
                  key={`sponsor-${pick.listing.id}`}
                  coordinate={pick.listing}
                  pinColor={colors.sponsor}
                  tracksViewChanges={false}
                  onPress={(e) => {
                    e.stopPropagation();
                    setSelectedId(SPONSOR_SELECTED);
                  }}
                />
              )}
            </MapView>
            {showSearchHere && (
              <Pressable style={styles.searchHere} onPress={() => mapCenter && runSearch(mapCenter, 'This area')}>
                <Ionicons name="refresh" size={16} color={colors.primaryText} />
                <Text style={styles.searchHereText}>Search this area</Text>
              </Pressable>
            )}
            {loading && <ActivityIndicator style={styles.mapSpinner} size="large" />}
            {!loading && !!error && (
              <View style={styles.mapError}>
                <Text style={styles.mapErrorTitle}>Couldn&apos;t load parking</Text>
                <Text style={styles.mapErrorText}>{error}</Text>
                <Button title="Try again" icon="refresh" onPress={() => setRefreshCount((n) => n + 1)} />
              </View>
            )}
            {pick && selectedId === SPONSOR_SELECTED && <View style={styles.mapCard}>{sponsoredCard(pick)}</View>}
            {selected && (
              <View style={styles.mapCard}>
                <SpotCard result={selected} onPress={() => openSpot(selected.spot.id)} />
              </View>
            )}
          </View>
        )}
      </View>

      <AdBanner />
    </SafeAreaView>
  );
}

function regionFor(center: LatLng, radiusMeters: number): Region {
  const latDelta = (radiusMeters * 2.2) / 111320;
  const lonDelta = latDelta / Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  return { ...center, latitudeDelta: latDelta, longitudeDelta: lonDelta };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
  locateBtn: { width: 48, height: 48, borderRadius: radius, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  vehicleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: radius,
  },
  vehicleText: { flex: 1, color: colors.text, fontSize: 14 },
  vehicleEdit: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  places: { marginHorizontal: 12, backgroundColor: colors.card, borderRadius: radius, padding: 8, borderWidth: 1, borderColor: colors.border },
  placeRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10 },
  placeTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { color: colors.muted, fontSize: 13, padding: 4 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  resultsText: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '600' },
  toggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 2 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.text },
  empty: { alignItems: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  error: { color: colors.danger, textAlign: 'center' },
  footnote: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: 16, paddingTop: 8 },
  searchHere: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  searchHereText: { color: colors.primaryText, fontWeight: '700' },
  mapSpinner: { position: 'absolute', top: '45%', alignSelf: 'center' },
  mapCard: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  mapError: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 60,
    gap: 8,
    padding: 16,
    borderRadius: radius,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapErrorTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  mapErrorText: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
