import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { feetInchesToMeters, formatFeetInches, metersToTotalInches } from '../lib/height';
import { presetMeters, VEHICLE_PRESETS } from '../lib/vehicles';
import { Chip } from './components';
import { colors, radius } from './theme';

const MIN_IN = 4 * 12;
const MAX_IN = 15 * 12;

/** Big, thumb-friendly feet/inches stepper with common vehicle presets. */
export function HeightPicker({
  meters,
  onChange,
  onPreset,
}: {
  meters: number;
  onChange: (meters: number) => void;
  onPreset?: (label: string) => void;
}) {
  const total = metersToTotalInches(meters);
  const set = (inches: number) => onChange(feetInchesToMeters(0, Math.min(MAX_IN, Math.max(MIN_IN, inches))));

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.row}>
        <Stepper label="Feet" value={Math.floor(total / 12)} onMinus={() => set(total - 12)} onPlus={() => set(total + 12)} />
        <Stepper label="Inches" value={total % 12} onMinus={() => set(total - 1)} onPlus={() => set(total + 1)} />
      </View>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {formatFeetInches(meters)} <Text style={styles.metric}>({meters.toFixed(2)} m)</Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {VEHICLE_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={`${p.label} · ${formatFeetInches(presetMeters(p))}`}
            active={metersToTotalInches(presetMeters(p)) === total}
            onPress={() => {
              onChange(presetMeters(p));
              onPreset?.(p.label);
            }}
          />
        ))}
      </ScrollView>
      <Text style={styles.hint}>
        Measure from the ground to the highest point (racks, lights, antennas, AC units). Presets are typical heights only.
      </Text>
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={onMinus} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} hitSlop={8}>
          <Ionicons name="remove" size={26} color={colors.primary} />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable onPress={onPlus} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} hitSlop={8}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  stepper: { flex: 1, backgroundColor: colors.card, borderRadius: radius, padding: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  stepLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 32, fontWeight: '800', color: colors.text, minWidth: 44, textAlign: 'center' },
  summary: { textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text },
  metric: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
