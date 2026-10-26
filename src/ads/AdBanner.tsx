import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdsModule } from '../native';
import { usePro } from '../state/Pro';
import { bannerUnitId, initAds } from './ads';

/** A banner ad that hides itself for Pro users and when ads can't load. */
export function AdBanner() {
  const { isPro } = usePro();
  const [canShow, setCanShow] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isPro) return;
    let alive = true;
    initAds().then((ok) => alive && setCanShow(ok));
    return () => {
      alive = false;
    };
  }, [isPro]);

  const unitId = bannerUnitId();
  if (isPro || !canShow || failed || !AdsModule || !unitId) return null;
  const { BannerAd, BannerAdSize } = AdsModule;

  return (
    <View style={styles.wrap}>
      <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} onAdFailedToLoad={() => setFailed(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: '#fff' },
});
