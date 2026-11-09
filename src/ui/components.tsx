import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatFeetInches, type Clearance, type FitResult } from '../lib/height';
import type { FeeStatus, SpotKind } from '../lib/types';
import { colors, fitColors, radius, space } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export const KIND_ICONS: Record<SpotKind, IconName> = {
  garage: 'business',
  underground: 'arrow-down-circle',
  rooftop: 'layers',
  carport: 'umbrella',
  surface: 'sunny',
  street: 'git-commit',
  truck: 'bus',
  'truck-stop': 'flame',
};

export function clearanceText(c: Clearance): string {
  if (c.status === 'limited') return `${formatFeetInches(c.meters)} clearance`;
  if (c.status === 'open') return 'No height limit';
  return 'Clearance unknown';
}

/** Badge colors for code-based estimates (no posted height): lighter versions of fits / too low. */
const LIKELY_COLORS = {
  fits: { bg: '#ECFDF5', fg: '#166534', icon: 'checkmark-circle-outline', label: 'Likely fits' },
  'too-low': { bg: '#FEF2F2', fg: '#991B1B', icon: 'close-circle-outline', label: 'Likely too low' },
} as const;

export function FitBadge({ fit, large }: { fit: FitResult; large?: boolean }) {
  const c = fit.status === 'unknown' && fit.likely ? LIKELY_COLORS[fit.likely] : fitColors[fit.status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, large && styles.badgeLarge]}>
      <Ionicons name={c.icon as IconName} size={large ? 18 : 14} color={c.fg} />
      <Text style={[styles.badgeText, { color: c.fg }, large && styles.badgeTextLarge]}>{c.label}</Text>
    </View>
  );
}

export function FeeBadge({ fee }: { fee: FeeStatus }) {
  const label = fee === 'free' ? 'Free' : fee === 'paid' ? 'Paid' : 'Price unknown';
  const bg = fee === 'free' ? '#DBEAFE' : '#F3F4F6';
  const fg = fee === 'free' ? '#1E40AF' : '#374151';
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Ionicons name={fee === 'free' ? 'pricetag' : 'cash-outline'} size={14} color={fg} />
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? colors.primaryText : colors.text} />}
      <Text style={[styles.chipText, active && { color: colors.primaryText }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'gold';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'gold' ? colors.accent : colors.card;
  const fg = variant === 'secondary' ? colors.primary : colors.primaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      {!!title && <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function InfoRow({ icon, label, value }: { icon: IconName; label: string; value?: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.muted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        {typeof value === 'string' ? <Text style={styles.infoValue}>{value}</Text> : value}
      </View>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeLarge: { paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextLarge: { fontSize: 15 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius,
    minHeight: 48,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: space(4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 16, color: colors.text, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space(6), marginBottom: space(2), marginHorizontal: space(1) },
});
