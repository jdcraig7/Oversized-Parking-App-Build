// App-wide configuration. Secrets and IDs come from EXPO_PUBLIC_* environment
// variables (see .env.example) so they never need to be committed.

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const env: Record<string, string | undefined> = process.env;

export const APP_NAME = 'Oversized Parking';

/** Identifies the app to OpenStreetMap services, as their usage policies require. */
export const USER_AGENT = `OversizedParkingApp/${Constants.expoConfig?.version ?? '1.0.0'} (+https://oversized-parking-library.oversized-parking-17bb38.workers.dev/privacy)`;

/**
 * Our own parking library: static tiles built by scripts/build-parking-library.sh
 * and hosted for free (e.g. Cloudflare Pages). When set, the app reads parking
 * from here instead of the public Overpass servers.
 */
export const PARKING_LIBRARY_URL = (
  env.EXPO_PUBLIC_PARKING_LIBRARY_URL ?? 'https://oversized-parking-library.oversized-parking-17bb38.workers.dev'
).replace(/\/+$/, '');

/** Overpass servers to try in order (fallback when no parking library is configured). Point the first one at your own server for production. */
export const OVERPASS_URLS = (env.EXPO_PUBLIC_OVERPASS_URLS ?? 'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

/**
 * City/address search uses the phone's built-in geocoder (free). Set this to a
 * Nominatim-compatible server (e.g. LocationIQ) to use that instead.
 */
export const CUSTOM_GEOCODER_URL = env.EXPO_PUBLIC_GEOCODER_URL;
/** Public OpenStreetMap geocoder, used only when the phone's geocoder finds nothing. */
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Supabase project for shared driver reports. Leave unset to keep reports on-device only. */
export const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// --- Monetization -----------------------------------------------------------

/** RevenueCat public SDK keys (one per store). */
export const REVENUECAT_API_KEY = Platform.select({
  ios: env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

/** The RevenueCat entitlement unlocked by the lifetime purchase. */
export const PRO_ENTITLEMENT = 'pro';

/** Shown if store prices can't be loaded. The real price comes from the store. */
export const FALLBACK_PRO_PRICE = '$14.99';

/** Free users can save this many spots; Pro is unlimited. */
/** Vehicles in My garage without Pro. */
export const FREE_VEHICLE_LIMIT = 2;
/** Trips without Pro (each can have any number of stops). */
export const FREE_TRIP_LIMIT = 1;
export const FREE_SAVED_LIMIT = 10;

/**
 * AdMob ad unit IDs. When unset (or in development) Google's test units are used,
 * so you can never accidentally click your own live ads.
 */
export const AD_UNITS = {
  banner: Platform.select({ ios: env.EXPO_PUBLIC_ADMOB_BANNER_IOS, android: env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID }),
  interstitial: Platform.select({
    ios: env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
    android: env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
  }),
};

/**
 * Sponsored listings are ads, and Pro promises "no ads", so Pro users don't
 * see them. Flip this if you decide featured listings should reach everyone.
 */
export const SHOW_SPONSORS_TO_PRO = false;

/** Show a full-screen ad at most once per this many spot detail views... */
export const INTERSTITIAL_EVERY_N_VIEWS = 6;
/** ...and never more often than this. */
export const INTERSTITIAL_MIN_INTERVAL_MS = 4 * 60 * 1000;

export const PRIVACY_POLICY_URL = env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? `${PARKING_LIBRARY_URL}/privacy`;
export const SUPPORT_EMAIL = env.EXPO_PUBLIC_CONTACT_EMAIL ?? 'jdcraig7@gmail.com';
