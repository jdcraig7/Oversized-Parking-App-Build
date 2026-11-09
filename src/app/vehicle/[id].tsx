// Add or edit a vehicle in My garage. Route: /vehicle/new or /vehicle/<id>.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { feetInchesToMeters } from '../../lib/height';
import { guessType, newId, VEHICLE_TYPES, type Vehicle, type VehicleType } from '../../lib/vehicles';
import { useAppState } from '../../state/AppState';
import { Button, Card, SectionTitle } from '../../ui/components';
import { HeightPicker } from '../../ui/HeightPicker';
import { colors, radius } from '../../ui/theme';

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, saveVehicle, removeVehicle, selectVehicle } = useAppState();
  const existing = settings.vehicles.find((v) => v.id === id);
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<VehicleType>(existing?.type ?? 'pickup');
  const [meters, setMeters] = useState(existing?.heightMeters ?? feetInchesToMeters(7, 0));
  const [length, setLength] = useState(existing?.lengthFeet ? String(existing.lengthFeet) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const save = () => {
    const lengthFeet = Number(length);
    const vehicle: Vehicle = {
      id: existing?.id ?? newId(),
      name: name.trim() || VEHICLE_TYPES.find((t) => t.type === type)!.label,
      type,
      heightMeters: meters,
      lengthFeet: length && Number.isFinite(lengthFeet) && lengthFeet > 0 ? Math.round(lengthFeet * 10) / 10 : undefined,
      notes: notes.trim() || undefined,
    };
    saveVehicle(vehicle);
    // A vehicle you just added is probably the one you're driving.
    if (isNew) selectVehicle(vehicle.id);
    router.back();
  };

  const remove = () =>
    Alert.alert(`Remove ${existing!.name}?`, 'It will be removed from My garage.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeVehicle(existing!.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Add vehicle' : 'Edit vehicle' }} />

      <SectionTitle>Type</SectionTitle>
      <View style={styles.types}>
        {VEHICLE_TYPES.map((t) => (
          <Pressable
            key={t.type}
            onPress={() => setType(t.type)}
            style={[styles.type, type === t.type && styles.typeActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === t.type }}
            accessibilityLabel={t.label}
          >
            <MaterialCommunityIcons name={t.icon as never} size={28} color={type === t.type ? colors.primaryText : colors.primary} />
            <Text style={[styles.typeText, type === t.type && { color: colors.primaryText }]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>Name</SectionTitle>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. F-250 with rack, Winnebago"
        placeholderTextColor={colors.muted}
        style={styles.input}
        accessibilityLabel="Vehicle name"
      />

      <SectionTitle>Total height</SectionTitle>
      <Card>
        <HeightPicker
          meters={meters}
          onChange={setMeters}
          onPreset={(label) => {
            if (!name) setName(label);
            setType(guessType(label));
          }}
        />
      </Card>

      <SectionTitle>Length in feet (optional)</SectionTitle>
      <View style={styles.row}>
        <TextInput
          value={length}
          onChangeText={(v) => setLength(v.replace(/[^\d.]/g, ''))}
          placeholder="e.g. 32"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          style={[styles.input, { width: 110 }]}
          accessibilityLabel="Length in feet"
        />
        <Text style={styles.unit}>ft, with any trailer</Text>
      </View>

      <SectionTitle>Notes (optional)</SectionTitle>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Plate, trailer details, anything to remember"
        placeholderTextColor={colors.muted}
        style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
        multiline
        accessibilityLabel="Notes"
      />

      <Button title={isNew ? 'Add to My garage' : 'Save'} icon="checkmark" onPress={save} style={{ marginTop: 24 }} />
      {!isNew && settings.vehicles.length > 1 && (
        <Button title="Remove vehicle" icon="trash-outline" variant="secondary" onPress={remove} style={{ marginTop: 10 }} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: {
    width: '23%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  typeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontSize: 12, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unit: { fontSize: 14, color: colors.muted },
});
