// Ads and in-app purchases need native code that isn't in Expo Go. Load them
// lazily so the rest of the app still runs in Expo Go during development;
// in a development or store build they load normally.

import Constants, { ExecutionEnvironment } from 'expo-constants';

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function tryRequire<T>(load: () => T): T | null {
  if (isExpoGo) return null;
  try {
    return load();
  } catch (e) {
    console.warn('Native module unavailable', e);
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-require-imports -- lazy loading is the point here */
export const AdsModule = tryRequire(
  () => require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads'),
);

export const PurchasesModule = tryRequire(
  () => require('react-native-purchases') as typeof import('react-native-purchases'),
);
/* eslint-enable @typescript-eslint/no-require-imports */
