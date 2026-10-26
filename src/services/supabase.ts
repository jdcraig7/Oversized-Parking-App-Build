import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/** Null when Supabase isn't configured; shared reports are then simply off. */
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;

if (supabase) {
  // Only refresh sessions while the app is in the foreground.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

let signingIn: Promise<string> | null = null;

/**
 * Returns this device's user id, signing in anonymously the first time.
 * No email or account is needed to share reports.
 */
export async function ensureUserId(): Promise<string> {
  if (!supabase) throw new Error('Shared reports are not configured');
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  signingIn ??= supabase.auth
    .signInAnonymously()
    .then(({ data: d, error }) => {
      if (error || !d.user) throw error ?? new Error('Anonymous sign-in failed');
      return d.user.id;
    })
    .finally(() => {
      signingIn = null;
    });
  return signingIn;
}
