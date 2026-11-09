import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deleteSharedPhoto, fetchSharedPhotos, photosShared, reportPhoto, type SharedPhoto } from '../services/signPhotos';
import { Button, Card, SectionTitle } from './components';
import { colors, radius } from './theme';

/** Sign/entrance photos for a spot: the driver's own, plus shared ones from other drivers. */
export function SignPhotos({ spotId, mine }: { spotId: string; mine: string[] }) {
  const [shared, setShared] = useState<SharedPhoto[]>([]);
  const [open, setOpen] = useState<{ uri: string; photo?: SharedPhoto } | null>(null);

  useEffect(() => {
    let live = true;
    if (photosShared) fetchSharedPhotos(spotId).then((p) => live && setShared(p)).catch(() => {});
    return () => {
      live = false;
    };
  }, [spotId]);

  const others = shared.filter((p) => !p.mine);
  const all: { uri: string; photo?: SharedPhoto }[] = [...mine.map((uri) => ({ uri })), ...others.map((p) => ({ uri: p.url, photo: p }))];

  const report = (p: SharedPhoto) =>
    Alert.alert('Report this photo?', 'Use this for photos that are wrong, unrelated or inappropriate. It will be hidden after review.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          reportPhoto(p.id).catch(() => {});
          setShared((s) => s.filter((x) => x.id !== p.id));
          setOpen(null);
        },
      },
    ]);

  return (
    <>
      <SectionTitle>Sign photos</SectionTitle>
      <Card style={{ gap: 10 }}>
        {all.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {all.map((p) => (
              <Pressable key={p.uri} onPress={() => setOpen(p)} accessibilityRole="imagebutton" accessibilityLabel="Open sign photo">
                <Image source={{ uri: p.uri }} style={styles.thumb} />
                {!p.photo && <Text style={styles.yours}>Yours</Text>}
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.body}>No photos yet. A photo of the clearance sign helps every driver who comes after you.</Text>
        )}
        <Button title="Add a photo" icon="camera-outline" variant="secondary" onPress={() => router.push({ pathname: '/report/[id]', params: { id: spotId } })} />
      </Card>

      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={styles.viewer}>
          {open && <Image source={{ uri: open.uri }} style={styles.full} resizeMode="contain" />}
          <View style={styles.viewerBar}>
            {open?.photo && !open.photo.mine && <Button title="Report" icon="flag-outline" variant="secondary" onPress={() => report(open.photo!)} />}
            {open?.photo?.mine && (
              <Button
                title="Delete"
                icon="trash-outline"
                variant="secondary"
                onPress={() => {
                  deleteSharedPhoto(open.photo!).catch(() => {});
                  setShared((s) => s.filter((x) => x.id !== open.photo!.id));
                  setOpen(null);
                }}
              />
            )}
            <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 110, height: 110, borderRadius: radius, backgroundColor: colors.border },
  yours: { position: 'absolute', left: 6, bottom: 6, fontSize: 11, fontWeight: '800', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  viewerBar: { position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 10, alignItems: 'center' },
  close: { padding: 6 },
});
