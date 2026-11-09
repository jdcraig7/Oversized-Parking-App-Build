// Photos of clearance signs and garage entrances. Your own photos are always
// kept on the phone; when shared reports are set up (Supabase), photos you
// choose to share are uploaded so other drivers see them too.

import { Directory, File, Paths } from 'expo-file-system';

import { ensureUserId, supabase } from './supabase';

const BUCKET = 'sign-photos';
export const photosShared = !!supabase;

export interface SharedPhoto {
  id: string;
  url: string;
  mine: boolean;
  createdAt: string;
  path: string;
}

/** Copies a picked/taken photo into the app's own folder so it survives cache clears. */
export async function keepPhoto(uri: string, spotId: string): Promise<string> {
  try {
    const dir = new Directory(Paths.document, 'sign-photos');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${spotId.replace(/[^a-z0-9]+/gi, '_')}-${Date.now()}.jpg`);
    await new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri; // web preview, or copy failed: keep the original reference
  }
}

export function deleteLocalPhoto(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

export async function fetchSharedPhotos(spotId: string): Promise<SharedPhoto[]> {
  if (!supabase) return [];
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  const { data, error } = await supabase
    .from('sign_photos')
    .select('id, path, user_id, created_at')
    .eq('spot_id', spotId)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    path: r.path as string,
    url: supabase!.storage.from(BUCKET).getPublicUrl(r.path as string).data.publicUrl,
    mine: r.user_id === me,
    createdAt: r.created_at as string,
  }));
}

/** Uploads a photo for other drivers. Returns the shared photo's id. */
export async function sharePhoto(spotId: string, localUri: string): Promise<string> {
  if (!supabase) throw new Error('Photo sharing is not set up');
  const userId = await ensureUserId();
  const path = `${userId}/${spotId.replace(/[^a-z0-9]+/gi, '_')}/${Date.now()}.jpg`;
  const bytes = await new File(localUri).arrayBuffer();
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from('sign_photos').insert({ spot_id: spotId, path }).select('id').single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data.id as string;
}

export async function deleteSharedPhoto(photo: Pick<SharedPhoto, 'id' | 'path'>) {
  if (!supabase) return;
  await supabase.from('sign_photos').delete().eq('id', photo.id);
  await supabase.storage.from(BUCKET).remove([photo.path]);
}

/** Flags someone else's photo; two flags hide it until reviewed. */
export async function reportPhoto(id: string) {
  if (!supabase) return;
  await ensureUserId();
  const { error } = await supabase.rpc('report_sign_photo', { photo: id });
  if (error) throw error;
}
