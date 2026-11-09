import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { FREE_VEHICLE_LIMIT, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from '../../config';
import { feetInchesToMeters, formatFeetInches, metersToTotalInches } from '../../lib/height';
import { MARGIN_OPTIONS, RADIUS_OPTIONS, vehicleTypeInfo } from '../../lib/vehicles';
import { useAppState } from '../../state/AppState';
import { usePro } from '../../state/Pro';
import { Button, Card, Chip, SectionTitle } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function SettingsScreen() {
  const { settings, updateSettings, selectVehicle } = useAppState();
  const pro = usePro();

  const addVehicle = () => {
    if (!pro.isPro && settings.vehicles.length >= FREE_VEHICLE_LIMIT) {
      Alert.alert('My garage is full', `Free accounts can keep ${FREE_VEHICLE_LIMIT} vehicles. Go Pro for unlimited vehicles, trips and saved spots, with no ads.`, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go Pro', onPress: () => router.push('/upgrade') },
      ]);
      return;
    }
    router.push({ pathname: '/vehicle/[id]', params: { id: 'new' } });
  };

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
          <Text style={styles.proText}>Pro unlocked. No ads, unlimited vehicles, trips and saved spots. Thank you!</Text>
        </Card>
      ) : (
        <Pressable onPress={() => router.push('/upgrade')} accessibilityRole="button">
          <Card style={styles.proCard}>
            <Ionicons name="star" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.proTitle}>Go Pro: {pro.price} once, forever</Text>
              <Text style={styles.proText}>No ads, plus unlimited vehicles, trips and saved spots.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </Pressable>
      )}

      <SectionTitle>My garage</SectionTitle>
      <Card style={{ gap: 4, paddingVertical: 6 }}>
        {settings.vehicles.map((v) => {
          const active = v.id === settings.activeVehicleId;
          return (
            <View key={v.id} style={styles.vehicleRow}>
              <Pressable
                style={styles.vehicleMain}
                onPress={() => selectVehicle(v.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${v.name}, ${formatFeetInches(v.heightMeters)}${active ? ', in use' : ''}`}
              >
                <MaterialCommunityIcons name={vehicleTypeInfo(v.type).icon as never} size={28} color={active ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vehicleName, active && { color: colors.primary }]} numberOfLines={1}>
                    {v.name}
                  </Text>
                  <Text style={styles.vehicleMeta}>
                    {formatFeetInches(v.heightMeters)} tall{v.lengthFeet ? ` · ${v.lengthFeet} ft long` : ''}
                  </Text>
                </View>
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.primary : colors.border} />
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: v.id } })}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${v.name}`}
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </Pressable>
            </View>
          );
        })}
        <Button title="Add a vehicle" icon="add" variant="secondary" onPress={addVehicle} style={{ marginVertical: 8 }} />
        <Text style={styles.small}>Tap a vehicle to search with it. Every result is checked against its height.</Text>
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
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  vehicleMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  vehicleName: { fontSize: 16, fontWeight: '700', color: colors.text },
  vehicleMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  editBtn: { padding: 8 },
  body: { fontSize: 14, color: colors.text, lineHeight: 20, flexShrink: 1 },
  small: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
