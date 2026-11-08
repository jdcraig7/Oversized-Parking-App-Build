import type { ExpoConfig } from 'expo/config';

// Google's sample AdMob app IDs. Replace with your own via env vars before release.
const ADMOB_TEST_IOS = 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_TEST_ANDROID = 'ca-app-pub-3940256099942544~3347511713';

const bundleId = process.env.APP_BUNDLE_ID ?? 'com.oversizedparking.app';

// EAS project in the jdcraig7s-team Expo account (builds and over-the-air updates).
const EAS_PROJECT_ID = '055d950a-e038-45f5-8012-f66b2040d77d';

const config: ExpoConfig = {
  name: 'Oversized Parking',
  slug: 'oversized-parking',
  owner: 'jdcraig7s-team',
  scheme: 'oversizedparking',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Your location is used to find parking near you that fits your vehicle.',
      },
    ],
    [
      'react-native-maps',
      {
        // iOS uses Apple Maps (no key needed). Android needs a Google Maps key.
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        iosAppId: process.env.ADMOB_IOS_APP_ID ?? ADMOB_TEST_IOS,
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? ADMOB_TEST_ANDROID,
        // Lets Apple attribute ad installs without tracking. Add the full list from
        // Google's AdMob docs before release for best ad revenue.
        skAdNetworkItems: ['cstr6suwn9.skadnetwork'],
        userTrackingUsageDescription:
          'This lets us show ads that are more relevant to you. Ads keep the app free. Go Pro to remove them.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
  },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
  },
  // 'sdkVersion' lets Expo Go open published updates as a phone preview.
  // Switch to { policy: 'fingerprint' } once you ship store builds with ads and purchases.
  runtimeVersion: { policy: 'sdkVersion' },
};

export default config;
