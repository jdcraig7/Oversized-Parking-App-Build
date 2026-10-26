import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FREE_SAVED_LIMIT } from '../config';
import { usePro } from '../state/Pro';
import { Button, type IconName } from '../ui/components';
import { colors } from '../ui/theme';

const PERKS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'eye-off-outline', title: 'No ads, ever', text: 'A clean screen when you’re trying to park.' },
  { icon: 'bookmark-outline', title: 'Unlimited saved spots', text: `Free accounts can save ${FREE_SAVED_LIMIT}. Saved spots work offline.` },
  { icon: 'infinite-outline', title: 'Pay once, keep it forever', text: 'No subscription. Restores on new phones with the same store account.' },
  { icon: 'heart-outline', title: 'Support the app', text: 'Helps keep coverage growing in every US city.' },
];

export default function UpgradeScreen() {
  const pro = usePro();

  const buy = async () => {
    try {
      const outcome = await pro.purchase();
      if (outcome === 'purchased') {
        Alert.alert('You’re Pro!', 'Thanks for your support. Ads are gone for good.');
        router.back();
      } else if (outcome === 'unavailable') {
        Alert.alert('Store unavailable', 'The purchase couldn’t be started. Please try again later.');
      }
    } catch {
      Alert.alert('Purchase failed', 'You were not charged. Please try again.');
    }
  };

  const restore = async () => {
    try {
      if (await pro.restore()) router.back();
      else Alert.alert('No purchase found', 'We couldn’t find a Pro purchase for this store account.');
    } catch {
      Alert.alert('Restore failed', 'Please check your connection and try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Ionicons name="star" size={44} color={colors.accent} />
        <Text style={styles.title}>Oversized Parking Pro</Text>
        <Text style={styles.price}>{pro.price}</Text>
        <Text style={styles.once}>one-time purchase</Text>
      </View>

      {PERKS.map((p) => (
        <View key={p.title} style={styles.perk}>
          <Ionicons name={p.icon} size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.perkTitle}>{p.title}</Text>
            <Text style={styles.perkText}>{p.text}</Text>
          </View>
        </View>
      ))}

      {pro.isPro ? (
        <Text style={styles.already}>You already have Pro. Thank you!</Text>
      ) : (
        <>
          <Button title={pro.busy ? 'Working…' : `Unlock Pro for ${pro.price}`} variant="gold" onPress={buy} disabled={pro.busy || !pro.storeAvailable} style={{ marginTop: 24 }} />
          {!pro.storeAvailable && (
            <Text style={styles.note}>Purchases are available in the App Store / Google Play version of the app.</Text>
          )}
          <Button title="Restore purchase" variant="secondary" onPress={restore} disabled={pro.busy} style={{ marginTop: 8 }} />
        </>
      )}
      <Text style={styles.note}>Every search feature stays free. Pro just removes ads and the saved-spot limit.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 4, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 8 },
  price: { fontSize: 36, fontWeight: '900', color: colors.text, marginTop: 8 },
  once: { fontSize: 14, color: colors.muted },
  perk: { flexDirection: 'row', gap: 14, paddingVertical: 12 },
  perkTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  perkText: { fontSize: 14, color: colors.muted, marginTop: 2, lineHeight: 19 },
  already: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 24 },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
});
