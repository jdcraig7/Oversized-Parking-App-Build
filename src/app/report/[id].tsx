import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { feetInchesToMeters } from '../../lib/height';
import type { ParkingSpot } from '../../lib/types';
import { getCachedSpot } from '../../services/parkingApi';
import { deleteLocalPhoto, keepPhoto, photosShared, sharePhoto } from '../../services/signPhotos';
import { useAppState } from '../../state/AppState';
import { useCommunity } from '../../state/Community';
import { Button, Card, SectionTitle } from '../../ui/components';
import { HeightPicker } from '../../ui/HeightPicker';
import { colors, radius } from '../../ui/theme';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { saved, reports, saveReport, deleteReport } = useAppState();
  const community = useCommunity();
  const spot: ParkingSpot | undefined = getCachedSpot(id) ?? saved.find((s) => s.id === id);
  const existing = reports[id];

  const startHeight =
    existing?.clearanceMeters ?? (spot?.clearance.status === 'limited' ? spot.clearance.meters : feetInchesToMeters(7, 0));
  const [hasClearance, setHasClearance] = useState(existing?.clearanceMeters != null || spot?.clearance.status !== 'open');
  const [clearance, setClearance] = useState(startHeight);
  const [price, setPrice] = useState(existing?.price ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);

  const addPhoto = async (from: 'camera' | 'library') => {
    const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', `Allow ${from === 'camera' ? 'camera' : 'photo'} access in your phone’s Settings to add a photo.`);
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, exif: false };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (res.canceled || !res.assets[0]) return;
    const uri = await keepPhoto(res.assets[0].uri, id);
    setPhotos((p) => [...p, uri].slice(-6));
  };
  const [shared, setShared] = useState(existing?.shared ?? true);

  // Network work runs in the background; reports made offline are queued and sent later.
  const syncInBackground = (work: Promise<void>) => work.catch((e) => console.warn('Report sync failed', e));

  const submit = () => {
    const report = {
      spotId: id,
      clearanceMeters: hasClearance ? clearance : undefined,
      price: price.trim() || undefined,
      note: note.trim() || undefined,
      phone: phone.trim() || undefined,
      photos: photos.length ? photos : undefined,
      shared: community.enabled && shared,
      updatedAt: new Date().toISOString(),
    };
    saveReport(report);
    // Removed photos are deleted from the phone; new ones are shared if sharing is on.
    for (const old of existing?.photos ?? []) if (!photos.includes(old)) deleteLocalPhoto(old);
    if (report.shared && photosShared) {
      for (const p of photos) if (!existing?.photos?.includes(p)) syncInBackground(sharePhoto(id, p).then(() => {}));
    }
    if (report.shared) syncInBackground(community.share(report));
    else if (existing?.shared) syncInBackground(community.unshare(id));
    router.back();
  };

  const remove = () => {
    deleteReport(id);
    if (existing?.shared) syncInBackground(community.unshare(id));
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {spot && <Text style={styles.title}>{spot.name}</Text>}
        <Text style={styles.body}>
          Enter what the signs on site say. The app uses your report whenever you view this spot.
        </Text>

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

        <SectionTitle>Photo of the sign (optional)</SectionTitle>
        <Text style={styles.hint}>A photo of the clearance sign or entrance is the best proof for other drivers.</Text>
        <View style={styles.photos}>
          {photos.map((uri) => (
            <View key={uri}>
              <Image source={{ uri }} style={styles.photo} accessibilityLabel="Sign photo" />
              <Pressable
                onPress={() => setPhotos((p) => p.filter((x) => x !== uri))}
                style={styles.photoRemove}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.photoButtons}>
          <Button title="Take photo" icon="camera-outline" variant="secondary" onPress={() => addPhoto('camera')} style={{ flex: 1 }} />
          <Button title="Choose" icon="images-outline" variant="secondary" onPress={() => addPhoto('library')} style={{ flex: 1 }} />
        </View>

        <SectionTitle>Phone number (optional)</SectionTitle>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. (213) 555-0100"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          style={styles.input}
          accessibilityLabel="Phone number"
        />

        <SectionTitle>Note (optional)</SectionTitle>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Use the north entrance, low pipes on level 2"
          placeholderTextColor={colors.muted}
          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
        />

        {community.enabled && (
          <Card style={{ gap: 6, marginTop: 24 }}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Share with other drivers</Text>
              <Switch value={shared} onValueChange={setShared} />
            </View>
            <Text style={styles.hint}>
              Shared anonymously. Notes are public, so don&apos;t include personal info. Works offline: we&apos;ll send it when you have signal.
            </Text>
          </Card>
        )}

        <Button title="Save report" icon="checkmark" onPress={submit} style={{ marginTop: 24 }} />
        {existing && (
          <Button
            title="Delete my report"
            variant="secondary"
            onPress={remove}
            style={{ marginTop: 8 }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  photo: { width: 96, height: 96, borderRadius: radius, backgroundColor: colors.border },
  photoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12 },
  photoButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 },
  body: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, color: colors.text, fontWeight: '600' },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
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
