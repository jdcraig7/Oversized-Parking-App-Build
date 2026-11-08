import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
  // Small phones (e.g. 320pt wide) get slightly smaller buttons so nothing crowds the number.
  const compact = useWindowDimensions().width < 360;
  const btn = [styles.stepBtn, compact && styles.stepBtnCompact];
  const icon = compact ? 22 : 26;
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={onMinus} style={btn} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} hitSlop={8}>
          <Ionicons name="remove" size={icon} color={colors.primary} />
        </Pressable>
        <Text style={[styles.stepValue, compact && styles.stepValueCompact]}>{value}</Text>
        <Pressable onPress={onPlus} style={btn} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} hitSlop={8}>
          <Ionicons name="add" size={icon} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  stepper: { flex: 1, minWidth: 0, backgroundColor: colors.card, borderRadius: radius, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  stepLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  // Buttons keep their size; the number takes whatever width is left, so the row fits any card.
  stepRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between', gap: 4, marginTop: 6 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, minWidth: 0, fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center' },
  stepBtnCompact: { width: 34, height: 34, borderRadius: 17 },
  stepValueCompact: { fontSize: 26 },
  summary: { textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text },
  metric: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
