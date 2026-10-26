import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppState } from '../state/AppState';
import { Button } from '../ui/components';
import { HeightPicker } from '../ui/HeightPicker';
import { colors } from '../ui/theme';

export default function OnboardingScreen() {
  const { settings, updateSettings } = useAppState();
  const [meters, setMeters] = useState(settings.vehicleMeters);
  const [name, setName] = useState(settings.vehicleName);

  const done = () => {
    updateSettings({ vehicleMeters: meters, vehicleName: name, onboarded: true });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="car-sport" size={48} color={colors.primary} />
          <Text style={styles.title}>How tall is your vehicle?</Text>
          <Text style={styles.text}>
            We&apos;ll check every garage against this height and only show you parking that fits.
          </Text>
        </View>
        <HeightPicker meters={meters} onChange={setMeters} onPreset={setName} />
        <Button title="Start finding parking" icon="arrow-forward" onPress={done} style={{ marginTop: 28 }} />
        <Text style={styles.small}>You can change this anytime on the Vehicle tab.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 40 },
  hero: { alignItems: 'center', gap: 10, marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
  text: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  small: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
});
