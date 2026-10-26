import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { feetInchesToMeters } from '../../lib/height';
import type { ParkingSpot } from '../../lib/types';
import { getCachedSpot } from '../../services/parkingApi';
import { useAppState } from '../../state/AppState';
import { Button, Card, SectionTitle } from '../../ui/components';
import { HeightPicker } from '../../ui/HeightPicker';
import { colors, radius } from '../../ui/theme';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { saved, reports, saveReport, deleteReport } = useAppState();
  const spot: ParkingSpot | undefined = getCachedSpot(id) ?? saved.find((s) => s.id === id);
  const existing = reports[id];

  const startHeight =
    existing?.clearanceMeters ?? (spot?.clearance.status === 'limited' ? spot.clearance.meters : feetInchesToMeters(7, 0));
  const [hasClearance, setHasClearance] = useState(existing?.clearanceMeters != null || spot?.clearance.status !== 'open');
  const [clearance, setClearance] = useState(startHeight);
  const [price, setPrice] = useState(existing?.price ?? '');
  const [note, setNote] = useState(existing?.note ?? '');

  const submit = () => {
    saveReport({
      spotId: id,
      clearanceMeters: hasClearance ? clearance : undefined,
      price: price.trim() || undefined,
      note: note.trim() || undefined,
      updatedAt: new Date().toISOString(),
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {spot && <Text style={styles.title}>{spot.name}</Text>}
        <Text style={styles.body}>Enter what the signs on site say. This is saved on your phone and used whenever you view this spot.</Text>

        <SectionTitle>Posted clearance</SectionTitle>
        <Card style={{ gap: 12 }}>
          <View style={styles.switchRow}>
            <Text style={styles.label}>I saw a clearance sign</Text>
            <Switch value={hasClearance} onValueChange={setHasClearance} />
          </View>
          {hasClearance && <HeightPicker meters={clearance} onChange={setClearance} />}
        </Card>

        <SectionTitle>Price</SectionTitle>
        <TextInput value={price} onChangeText={setPrice} placeholder="e.g. $4/hr, $18 daily max, free after 6pm" placeholderTextColor={colors.muted} style={styles.input} />

        <SectionTitle>Note (optional)</SectionTitle>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Use the north entrance, low pipes on level 2"
          placeholderTextColor={colors.muted}
          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
        />

        <Button title="Save report" icon="checkmark" onPress={submit} style={{ marginTop: 24 }} />
        {existing && (
          <Button
            title="Delete my report"
            variant="secondary"
            onPress={() => {
              deleteReport(id);
              router.back();
            }}
            style={{ marginTop: 8 }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 },
  body: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, color: colors.text, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
});
