import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { PRIVACY_POLICY_URL, SUPPORT_EMAIL } from '../../config';
import { feetInchesToMeters, formatFeetInches, metersToTotalInches } from '../../lib/height';
import { MARGIN_OPTIONS, RADIUS_OPTIONS } from '../../lib/vehicles';
import { useAppState } from '../../state/AppState';
import { usePro } from '../../state/Pro';
import { Button, Card, Chip, SectionTitle } from '../../ui/components';
import { HeightPicker } from '../../ui/HeightPicker';
import { colors, radius } from '../../ui/theme';

export default function SettingsScreen() {
  const { settings, updateSettings } = useAppState();
  const pro = usePro();

  const restore = async () => {
    try {
      const ok = await pro.restore();
      Alert.alert(ok ? 'Pro restored' : 'No purchase found', ok ? 'Thanks for your support!' : 'We couldn’t find a Pro purchase for this store account.');
    } catch {
      Alert.alert('Restore failed', 'Please check your connection and try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Pro */}
      {pro.isPro ? (
        <Card style={styles.proCard}>
          <Ionicons name="star" size={22} color={colors.accent} />
          <Text style={styles.proText}>Pro unlocked. No ads, unlimited saved spots. Thank you!</Text>
        </Card>
      ) : (
        <Pressable onPress={() => router.push('/upgrade')} accessibilityRole="button">
          <Card style={styles.proCard}>
            <Ionicons name="star" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.proTitle}>Go Pro: {pro.price} once, forever</Text>
              <Text style={styles.proText}>Remove ads and save unlimited spots.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </Pressable>
      )}

      <SectionTitle>Vehicle</SectionTitle>
      <Card style={{ gap: 14 }}>
        <TextInput
          value={settings.vehicleName}
          onChangeText={(vehicleName) => updateSettings({ vehicleName })}
          placeholder="Vehicle name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="Vehicle name"
        />
        <HeightPicker meters={settings.vehicleMeters} onChange={(vehicleMeters) => updateSettings({ vehicleMeters })} />
      </Card>

      <SectionTitle>Safety margin</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Text style={styles.body}>
          Extra room we require above your vehicle before calling a spot a fit. Spots within the margin show as “Tight”.
        </Text>
        <View style={styles.chipRow}>
          {MARGIN_OPTIONS.map((inches) => (
            <Chip
              key={inches}
              label={inches === 0 ? 'None' : formatFeetInches(feetInchesToMeters(0, inches))}
              active={metersToTotalInches(settings.marginMeters) === inches}
              onPress={() => updateSettings({ marginMeters: feetInchesToMeters(0, inches) })}
            />
          ))}
        </View>
      </Card>

      <SectionTitle>Search radius</SectionTitle>
      <Card>
        <View style={styles.chipRow}>
          {RADIUS_OPTIONS.map((miles) => (
            <Chip key={miles} label={`${miles} mi`} active={settings.radiusMiles === miles} onPress={() => updateSettings({ radiusMiles: miles })} />
          ))}
        </View>
      </Card>

      <SectionTitle>Purchases</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Button title="Restore purchase" icon="refresh" variant="secondary" onPress={restore} disabled={pro.busy} />
        {pro.devSetPro && (
          <View style={styles.switchRow}>
            <Text style={styles.body}>Dev: simulate Pro</Text>
            <Switch value={pro.isPro} onValueChange={pro.devSetPro} />
          </View>
        )}
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Text style={styles.body}>
          Parking data comes from OpenStreetMap, built by volunteers, plus clearances and prices reported by drivers like you.
          Coverage varies by city. Every report and “Fix it on OpenStreetMap” edit makes it better for the next driver.
        </Text>
        <Text style={styles.body}>Always obey posted clearance signs. You are responsible for knowing your vehicle’s height.</Text>
        <Button title="Contact support" icon="mail-outline" variant="secondary" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Button title="Privacy policy" icon="shield-checkmark-outline" variant="secondary" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} />
        <Text style={styles.small}>Map data © OpenStreetMap contributors (ODbL)</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  proCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  proTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  proText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: 12, fontSize: 16, color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20, flexShrink: 1 },
  small: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
