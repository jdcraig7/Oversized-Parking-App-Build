import { AD_UNITS, INTERSTITIAL_EVERY_N_VIEWS, INTERSTITIAL_MIN_INTERVAL_MS } from '../config';
import { AdsModule } from '../native';

let initPromise: Promise<boolean> | null = null;

/**
 * Asks for ad consent where the law requires it (Google UMP handles GDPR/US
 * state privacy forms), then starts the ads SDK. Safe to call repeatedly.
 * Resolves to whether ads may be requested.
 */
export function initAds(): Promise<boolean> {
  if (!AdsModule) return Promise.resolve(false);
  initPromise ??= (async () => {
    const { AdsConsent, default: mobileAds } = AdsModule;
    try {
      const consent = await AdsConsent.gatherConsent();
      if (!consent.canRequestAds) return false;
    } catch (e) {
      // Consent forms aren't configured yet in AdMob; ads can still be requested.
      console.warn('Ad consent check failed', e);
    }
    await mobileAds().initialize();
    return true;
  })().catch((e) => {
    console.warn('Ads failed to start', e);
    return false;
  });
  return initPromise;
}

export function bannerUnitId(): string | null {
  if (!AdsModule) return null;
  return __DEV__ || !AD_UNITS.banner ? AdsModule.TestIds.ADAPTIVE_BANNER : AD_UNITS.banner;
}

function interstitialUnitId(): string | null {
  if (!AdsModule) return null;
  return __DEV__ || !AD_UNITS.interstitial ? AdsModule.TestIds.INTERSTITIAL : AD_UNITS.interstitial;
}

// --- Occasional full-screen ad ---------------------------------------------

type Interstitial = ReturnType<NonNullable<typeof AdsModule>['InterstitialAd']['createForAdRequest']>;
let interstitial: Interstitial | null = null;
let loaded = false;
let views = 0;
let lastShownAt = 0;

function preloadInterstitial() {
  const unitId = interstitialUnitId();
  if (!AdsModule || !unitId || interstitial) return;
  const { InterstitialAd, AdEventType } = AdsModule;
  const ad = InterstitialAd.createForAdRequest(unitId);
  ad.addAdEventListener(AdEventType.LOADED, () => (loaded = true));
  ad.addAdEventListener(AdEventType.CLOSED, () => {
    loaded = false;
    ad.load();
  });
  ad.addAdEventListener(AdEventType.ERROR, () => (loaded = false));
  ad.load();
  interstitial = ad;
}

/**
 * Call when a user opens a spot. Shows a full-screen ad rarely: every Nth view
 * and at most once every few minutes, so the app stays pleasant to use.
 */
export async function onSpotViewed(isPro: boolean) {
  if (isPro || !(await initAds())) return;
  preloadInterstitial();
  views += 1;
  const due = views % INTERSTITIAL_EVERY_N_VIEWS === 0 && Date.now() - lastShownAt > INTERSTITIAL_MIN_INTERVAL_MS;
  if (due && loaded && interstitial) {
    lastShownAt = Date.now();
    interstitial.show().catch(() => {});
  }
}
