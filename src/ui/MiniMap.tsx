import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { colors, radius } from './theme';

/**
 * A small, fixed map of one spot. Satellite view helps drivers see the
 * entrance, ramps and overhangs before they go. Tapping it calls `onPress`
 * (directions).
 */
export function MiniMap({ latitude, longitude, onPress }: { latitude: number; longitude: number; onPress: () => void }) {
  const [satellite, setSatellite] = useState(false);
  const coordinate = { latitude, longitude };
  return (
    <View style={styles.wrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ ...coordinate, latitudeDelta: 0.0035, longitudeDelta: 0.0035 }}
        mapType={satellite ? 'hybrid' : 'standard'}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        onPress={onPress}
        accessibilityLabel="Map of this parking location. Tap for directions."
      >
        <Marker coordinate={coordinate} onPress={onPress} />
      </MapView>
      <View style={styles.toggle}>
        {([false, true] as const).map((sat) => (
          <Pressable
            key={String(sat)}
            onPress={() => setSatellite(sat)}
            style={[styles.toggleBtn, satellite === sat && styles.toggleActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: satellite === sat }}
          >
            <Text style={[styles.toggleText, satellite === sat && { color: colors.primaryText }]}>{sat ? 'Satellite' : 'Map'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable
          // Opens Google's own Street View so drivers can see the entrance and its clearance sign.
          onPress={() => Linking.openURL(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`)}
          style={styles.hint}
          accessibilityRole="button"
          accessibilityLabel="Look at the entrance in Street View"
        >
          <Ionicons name="eye-outline" size={13} color={colors.primary} />
          <Text style={styles.hintText}>Street View</Text>
        </Pressable>
        <Pressable onPress={onPress} style={styles.hint} accessibilityRole="button">
          <Ionicons name="navigate" size={13} color={colors.primary} />
          <Text style={styles.hintText}>Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 190, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 14, backgroundColor: '#E5E7EB' },
  toggle: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999, padding: 2 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 12, fontWeight: '700', color: colors.text },
  actions: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  hintText: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
