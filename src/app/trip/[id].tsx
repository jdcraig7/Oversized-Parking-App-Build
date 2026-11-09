// One trip: an ordered list of parking stops with nights at each, dates,
// a fit check against the trip's vehicle, and directions for the route.

import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatFeetInches } from '../../lib/height';
import { evaluate } from '../../lib/search';
import { dayLabel, isoDay, legs, moveStop, routeUrl, schedule, totalNights, type Trip, type TripStop } from '../../lib/trips';
import { useAppState } from '../../state/AppState';
import { useCommunity } from '../../state/Community';
import { Button, Card, Chip, FitBadge, SectionTitle } from '../../ui/components';
import { colors, radius } from '../../ui/theme';

const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips, saveTrip, deleteTrip, settings, reports } = useAppState();
  const { summaries, load } = useCommunity();
  const trip = trips.find((t) => t.id === id);
  const [name, setName] = useState(trip?.name ?? '');

  const stopIds = trip?.stops.map((s) => s.spot.id).join(',') ?? '';
  useEffect(() => {
    if (stopIds) load(stopIds.split(','));
  }, [stopIds, load]);

  const vehicle = settings.vehicles.find((v) => v.id === trip?.vehicleId) ?? settings.vehicles.find((v) => v.id === settings.activeVehicleId);
  const vehicleMeters = vehicle?.heightMeters ?? settings.vehicleMeters;
  // The React Compiler memoizes this; no useMemo needed.
  const fits = (trip?.stops ?? []).map(
    (s) => evaluate(s.spot, s.spot, vehicleMeters, settings.marginMeters, reports[s.spot.id], summaries[s.spot.id]).fit,
  );

  if (!trip) {
    return (
      <View style={styles.missing}>
        <Text style={styles.body}>This trip was deleted.</Text>
        <Button title="Back to trips" onPress={() => router.back()} />
      </View>
    );
  }

  const update = (patch: Partial<Trip>) => saveTrip({ ...trip, ...patch });
  const setStops = (stops: TripStop[]) => update({ stops });
  const setStop = (i: number, patch: Partial<TripStop>) => setStops(trip.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const dates = schedule(trip);
  const nights = totalNights(trip);
  const tooLow = fits.filter((f) => f.status === 'too-low').length;

  const pickDate = () => {
    const value = trip.startDate ? new Date(`${trip.startDate}T12:00:00`) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        onChange: (e, d) => e.type === 'set' && d && update({ startDate: isoDay(d.getTime() - d.getTimezoneOffset() * 60_000) }),
      });
    }
  };

  const directions = () => {
    const points = trip.stops.map((s) => s.spot);
    const parts = legs(points, 10);
    if (parts.length === 1) return Linking.openURL(routeUrl(points)!);
    Alert.alert(
      'Long trip',
      `Google Maps takes up to 10 stops at a time, so this trip opens in ${parts.length} parts. Phone map apps don’t avoid low bridges; use a truck or RV GPS if your vehicle is very tall.`,
      [
        ...parts.slice(0, 2).map((p, i) => ({ text: `Part ${i + 1} (stops ${i * 9 + 1}–${i * 9 + p.length})`, onPress: () => Linking.openURL(routeUrl(p)!) })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const remove = () =>
    Alert.alert(`Delete ${trip.name}?`, 'Its stops stay in Saved if you saved them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTrip(trip.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: trip.name || 'Trip' }} />

      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={() => update({ name: name.trim() || trip.name })}
        placeholder="Trip name"
        placeholderTextColor={colors.muted}
        style={styles.nameInput}
        accessibilityLabel="Trip name"
      />

      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={[styles.body, { flex: 1 }]}>Arrive at first stop</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={trip.startDate ? new Date(`${trip.startDate}T12:00:00`) : new Date()}
              mode="date"
              display="compact"
              onChange={(_, d) => d && update({ startDate: isoDay(d.getTime() - d.getTimezoneOffset() * 60_000) })}
            />
          ) : (
            <Pressable onPress={pickDate} accessibilityRole="button" style={styles.dateBtn}>
              <Text style={styles.dateText}>{trip.startDate ? dayLabel(trip.startDate) : 'Pick a date'}</Text>
            </Pressable>
          )}
        </View>
        {settings.vehicles.length > 1 && (
          <View style={{ gap: 8 }}>
            <Text style={styles.small}>Vehicle for this trip</Text>
            <View style={styles.chipRow}>
              {settings.vehicles.map((v) => (
                <Chip
                  key={v.id}
                  label={`${v.name} · ${formatFeetInches(v.heightMeters)}`}
                  active={v.id === vehicle?.id}
                  onPress={() => update({ vehicleId: v.id })}
                />
              ))}
            </View>
          </View>
        )}
        <Text style={styles.small}>
          {trip.stops.length} {trip.stops.length === 1 ? 'stop' : 'stops'} · {nights} {nights === 1 ? 'night' : 'nights'}
          {vehicle ? ` · checked for ${vehicle.name} (${formatFeetInches(vehicle.heightMeters)})` : ''}
        </Text>
        {tooLow > 0 && (
          <Text style={styles.warn}>
            {tooLow} {tooLow === 1 ? 'stop is' : 'stops are'} too low for this vehicle.
          </Text>
        )}
      </Card>

      <SectionTitle>Stops, in order</SectionTitle>
      {trip.stops.length === 0 && (
        <Card>
          <Text style={styles.body}>
            Add garages and lots in the order you&apos;ll stay at them. Find one in Search and tap &ldquo;Add to trip&rdquo;, or add
            from your saved spots.
          </Text>
        </Card>
      )}
      {trip.stops.map((s, i) => (
        <Card key={s.id} style={styles.stop}>
          <View style={styles.stopHead}>
            <View style={styles.num}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/spot/[id]', params: { id: s.spot.id } })}
              accessibilityRole="button"
            >
              <Text style={styles.stopName} numberOfLines={2}>
                {s.spot.name}
              </Text>
              {!!s.spot.address && (
                <Text style={styles.small} numberOfLines={1}>
                  {s.spot.address}
                </Text>
              )}
              {dates && (
                <Text style={styles.dates}>
                  {s.nights > 0 ? `${dayLabel(dates[i].arrive)} → ${dayLabel(dates[i].leave)}` : `${dayLabel(dates[i].arrive)} · stop on the way`}
                </Text>
              )}
            </Pressable>
            <FitBadge fit={fits[i]} />
          </View>
          <View style={styles.stopTools}>
            <View style={styles.stepper}>
              <IconBtn icon="remove" label="Fewer nights" onPress={() => setStop(i, { nights: Math.max(0, s.nights - 1) })} />
              <Text style={styles.nights}>
                {s.nights} {s.nights === 1 ? 'night' : 'nights'}
              </Text>
              <IconBtn icon="add" label="More nights" onPress={() => setStop(i, { nights: Math.min(60, s.nights + 1) })} />
            </View>
            <View style={styles.row}>
              {!!s.spot.phone && <IconBtn icon="call-outline" label={`Call ${s.spot.name}`} onPress={() => Linking.openURL(telUrl(s.spot.phone!))} />}
              <IconBtn icon="arrow-up" label="Move up" disabled={i === 0} onPress={() => setStops(moveStop(trip.stops, i, i - 1))} />
              <IconBtn
                icon="arrow-down"
                label="Move down"
                disabled={i === trip.stops.length - 1}
                onPress={() => setStops(moveStop(trip.stops, i, i + 1))}
              />
              <IconBtn icon="close" label="Remove stop" onPress={() => setStops(trip.stops.filter((_, j) => j !== i))} />
            </View>
          </View>
        </Card>
      ))}

      <View style={{ gap: 10, marginTop: 16 }}>
        {trip.stops.length > 0 && <Button title="Directions for the whole trip" icon="navigate" onPress={directions} />}
        <Button title="Add from saved spots" icon="bookmark-outline" variant="secondary" onPress={() => router.push({ pathname: '/trip/add', params: { tripId: trip.id } })} />
        <Button title="Find parking to add" icon="search" variant="secondary" onPress={() => router.navigate('/')} />
        <Button title="Delete trip" icon="trash-outline" variant="secondary" onPress={remove} />
      </View>
    </ScrollView>
  );
}

function IconBtn({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, (pressed || disabled) && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  nameInput: { fontSize: 22, fontWeight: '800', color: colors.text, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted },
  warn: { fontSize: 14, color: '#B91C1C', fontWeight: '700' },
  dateBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius, backgroundColor: colors.bg },
  dateText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  stop: { gap: 10 },
  stopHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  numText: { color: colors.primaryText, fontWeight: '800' },
  stopName: { fontSize: 16, fontWeight: '700', color: colors.text },
  dates: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: 4 },
  stopTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nights: { fontSize: 14, fontWeight: '700', color: colors.text, minWidth: 64, textAlign: 'center' },
  iconBtn: { padding: 8, borderRadius: radius, backgroundColor: colors.bg },
});
