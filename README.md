# Oversized Parking

A free iOS and Android app that helps drivers of tall vehicles (lifted trucks, trucks with racks or toppers, high-roof vans, RVs, box trucks) find parking that **actually fits**: garages with their posted clearance, open-air lots with no height limit, and truck parking, in any US city.

It's built with [Expo](https://expo.dev) / React Native, so one codebase ships to both the App Store and Google Play.

## What the app does

- **Set your vehicle height once.** Feet and inches, with presets (pickup with rack, high-roof van, Class C RV, semi…) and a safety margin (default 3").
- **Search anywhere in the US.** City, address, ZIP, or "use my location".
- **Instant fit check on every spot:** ✅ *Fits*, ⚠️ *Tight* (within your safety margin), ❌ *Too low*, or ❔ *Clearance unknown*. Spots that are too low are hidden by default.
- **Filters:** fits my vehicle, known clearance only, free only, open-air lots, garages, truck/RV parking. Sort by nearest, best fit, or free first.
- **List and map views**, with color-coded pins and a "search this area" button.
- **Spot details:** clearance vs. your height, price/rates, when fees apply, open hours, max stay, payment methods, access rules, number of spaces, truck spaces, features (lit, cameras, restrooms, showers, diesel…), phone, website, and one-tap directions in Apple Maps, Google Maps or Waze.
- **Report what you saw:** if the sign on site says something different, save the real clearance, price and a note. The app uses your report from then on.
- **Saved spots** that work offline.

## How it makes money

| | Free | Pro (one-time purchase) |
|---|---|---|
| All search, filters, details, directions | ✅ | ✅ |
| Ads | Banner ads, plus a full-screen ad at most every 6th spot opened and no more than once every 4 minutes | **None** |
| Saved spots | 10 | Unlimited |

- **Ads:** Google AdMob (`react-native-google-mobile-ads`), with Google's consent form for GDPR / US state privacy laws.
- **Lifetime purchase:** a non-consumable in-app purchase handled through [RevenueCat](https://www.revenuecat.com) (free up to $2.5k/month in revenue), which takes care of both stores, receipts and "Restore purchase". The price is whatever you set in App Store Connect / Google Play; **$14.99** is shown as a fallback. Apple and Google take 15% under their small-business programs.

Tuning knobs (ad frequency, free saved-spot limit, fallback price) are in [`src/config.ts`](src/config.ts).

## Where the parking data comes from (please read)

There's no single public database of every US parking lot with clearance heights and prices, so the app is built on **OpenStreetMap** (via the Overpass API), the best free, legally reusable source:

- Garages with a published `maxheight` show their clearance.
- Open-air surface lots, street parking and truck parking count as "no height limit".
- Garages without a published clearance show as "Clearance unknown" (shown by default, can be hidden).
- **Prices** come from the OSM `charge` tag. Coverage varies a lot by city: many lots say whether they're free or paid, but fewer list exact rates.

Ways to grow coverage, roughly in order of impact:

1. **Partner APIs for paid garages.** SpotHero and ParkWhiz both have partner/affiliate programs with live prices and bookable spots, and many of their garage listings include height restrictions or oversize-vehicle fees. That is also extra revenue (booking commissions). Add a provider next to [`src/services/parkingApi.ts`](src/services/parkingApi.ts) and merge results.
2. **Shared community reports.** Reports are currently saved on the user's phone. Adding a small backend (Supabase or Firebase) would let every user see everyone's reported clearances and prices. The `SpotReport` type in [`src/lib/types.ts`](src/lib/types.ts) is already the record to store.
3. **OpenStreetMap edits.** Every spot has a "Fix it on OpenStreetMap" button. Edits there improve the app for everyone within minutes.

**Before launch:** the public Overpass and Nominatim servers are free but rate-limited, and their policies don't allow heavy app traffic. Once you have real users, run your own Overpass instance (or use a commercial host) and a commercial geocoder, then point `EXPO_PUBLIC_OVERPASS_URLS` / `EXPO_PUBLIC_GEOCODER_URL` at them. You must also keep the "© OpenStreetMap contributors" credit, which is already in the app.

## Run it

Requirements: Node 20+ and a phone.

```bash
npm install
npx expo start
```

- **Quick look (Expo Go):** scan the QR code with the Expo Go app. Search, map, details and saving all work. Ads and purchases are switched off automatically because Expo Go can't load them.
- **Full app (development build)**, needed to test ads and purchases:
  ```bash
  npx eas-cli@latest build --profile development --platform ios   # or android
  ```
  Install the build on your phone, then run `npx expo start` and open it.

Checks:

```bash
npm test            # unit tests: height parsing, fit logic, OSM parsing, filters
npm run typecheck
npm run lint
```

## Going live: checklist

1. **Accounts:** [Apple Developer Program](https://developer.apple.com/programs/) ($99/year), [Google Play Console](https://play.google.com/console) ($25 once), [Expo](https://expo.dev) (free), [AdMob](https://admob.google.com) (free), [RevenueCat](https://app.revenuecat.com) (free tier).
2. **App identity:** pick a final name and bundle ID (`APP_BUNDLE_ID`, default `com.oversizedparking.app`, which can't change after release), and replace the icon and splash images in `assets/`.
3. **Google Maps key for Android:** create one in Google Cloud with "Maps SDK for Android" enabled and set `GOOGLE_MAPS_ANDROID_API_KEY`. iOS uses Apple Maps and needs no key.
4. **AdMob:** create an iOS app and an Android app, a banner unit and an interstitial unit for each, and set up the GDPR and US-states privacy messages under *Privacy & messaging*. Put the IDs in the env vars listed in [`.env.example`](.env.example). Development builds always use Google's test ads.
5. **Lifetime purchase:**
   - App Store Connect: create a **Non-Consumable** in-app purchase (e.g. `pro_lifetime`).
   - Google Play: create a one-time **in-app product** with the same ID.
   - RevenueCat: add both products, create an entitlement named **`pro`**, and add a **Lifetime** package to the *current* offering. Put the public SDK keys in `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`.
6. **Privacy:** publish a privacy policy (location is used only on the device for searching; AdMob collects device identifiers for ads) and set `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_CONTACT_EMAIL`. Fill in Apple's *App Privacy* and Google's *Data safety* forms to match, then add the full SKAdNetwork list from Google's AdMob docs in `app.config.ts`.
7. **Set the env vars in EAS** (`eas env:create`) so cloud builds pick them up, then build and submit:
   ```bash
   npx eas-cli@latest build --profile production --platform all
   npx eas-cli@latest submit --platform all
   ```

## Project layout

```
src/
  app/                 Screens (Expo Router: each file is a route)
    (tabs)/index.tsx   Search: list + map, filters
    (tabs)/saved.tsx   Saved spots
    (tabs)/settings.tsx Vehicle height, margin, radius, purchases, about
    spot/[id].tsx      Spot details and "will it fit?" verdict
    report/[id].tsx    Report clearance / price seen on site
    upgrade.tsx        Pro paywall
    onboarding.tsx     First-run vehicle height setup
  lib/                 Pure logic, unit tested (no React Native imports)
    height.ts          Parse "6'8\"", "2.1 m", etc.; fit check
    osm.ts             OpenStreetMap → ParkingSpot
    search.ts          Filters and sorting
  services/            Network: parking data, place search
  state/               App settings, saved spots, reports, Pro status
  ads/                 AdMob banner and occasional full-screen ad
  ui/                  Shared components and theme
tests/                 Node test runner tests for src/lib
```

## Safety note

The app tells drivers to obey posted clearance signs and that data can be out of date, and phone map apps don't route around low bridges. Keep those messages; they matter for safety and for your liability.
