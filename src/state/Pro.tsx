import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { FALLBACK_PRO_PRICE, PRO_ENTITLEMENT, REVENUECAT_API_KEY } from '../config';
import { PurchasesModule } from '../native';

// Cached so ads stay hidden for Pro users even when they open the app offline.
const PRO_CACHE_KEY = 'pro.v1';

type PurchaseOutcome = 'purchased' | 'cancelled' | 'unavailable';

interface ProState {
  isPro: boolean;
  /** Localized lifetime price from the store, e.g. "$14.99". */
  price: string;
  storeAvailable: boolean;
  busy: boolean;
  purchase: () => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  /** Development only: flip Pro on/off to test both experiences. */
  devSetPro?: (value: boolean) => void;
}

const Ctx = createContext<ProState | null>(null);

const hasPro = (info: CustomerInfo) => info.entitlements.active[PRO_ENTITLEMENT] !== undefined;

export function ProProvider({ children }: { children: ReactNode }) {
  const [isPro, setIsProState] = useState(false);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const Purchases = PurchasesModule?.default;
  const storeAvailable = !!Purchases && !!REVENUECAT_API_KEY;

  const setIsPro = useCallback((value: boolean) => {
    setIsProState(value);
    AsyncStorage.setItem(PRO_CACHE_KEY, value ? '1' : '0').catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PRO_CACHE_KEY)
      .then((v) => v === '1' && setIsProState(true))
      .catch(() => {});

    if (!Purchases || !REVENUECAT_API_KEY) return;
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    const onInfo = (info: CustomerInfo) => setIsPro(hasPro(info));
    Purchases.addCustomerInfoUpdateListener(onInfo);
    Purchases.getCustomerInfo().then(onInfo).catch((e) => console.warn('getCustomerInfo failed', e));
    Purchases.getOfferings()
      .then((o) => setPkg(o.current?.lifetime ?? o.current?.availablePackages[0] ?? null))
      .catch((e) => console.warn('getOfferings failed', e));
    return () => {
      Purchases.removeCustomerInfoUpdateListener(onInfo);
    };
  }, [Purchases, setIsPro]);

  const purchase = useCallback(async (): Promise<PurchaseOutcome> => {
    if (!Purchases || !pkg) return 'unavailable';
    setBusy(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const pro = hasPro(customerInfo);
      setIsPro(pro);
      return pro ? 'purchased' : 'unavailable';
    } catch (e: unknown) {
      if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
      throw e;
    } finally {
      setBusy(false);
    }
  }, [Purchases, pkg, setIsPro]);

  const restore = useCallback(async () => {
    if (!Purchases) return false;
    setBusy(true);
    try {
      const pro = hasPro(await Purchases.restorePurchases());
      setIsPro(pro);
      return pro;
    } finally {
      setBusy(false);
    }
  }, [Purchases, setIsPro]);

  const value = useMemo<ProState>(
    () => ({
      isPro,
      price: pkg?.product.priceString ?? FALLBACK_PRO_PRICE,
      storeAvailable: storeAvailable && !!pkg,
      busy,
      purchase,
      restore,
      devSetPro: __DEV__ ? setIsPro : undefined,
    }),
    [isPro, pkg, storeAvailable, busy, purchase, restore, setIsPro],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePro(): ProState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePro must be used inside ProProvider');
  return ctx;
}
