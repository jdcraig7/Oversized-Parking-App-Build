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
- **Shared driver reports:** drivers report the clearance, price and notes they see on site. Reports are anonymous (no account), work offline (sent when there's signal), and show up for every driver. A spot's clearance uses the **lower** of the map data and the drivers' median report, so one wrong report can't make a low garage look safe.
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

Ways coverage grows:

1. **Shared driver reports** (built in, see *Shared reports setup* below). Every report fills in a missing clearance or price for everyone.
2. **OpenStreetMap edits.** Every spot has a "Fix it on OpenStreetMap" button. Edits there show up in the app within minutes.
3. **Partner APIs for paid garages (not built yet).** SpotHero and ParkWhiz (now Arrive) have live prices and bookable spots, but API access is only for approved partners. Email partner.support@spothero.com and dev@arrive.com with your app details to apply. Once you have keys, add a provider next to [`src/services/parkingApi.ts`](src/services/parkingApi.ts) and merge the results.

**Before launch:** the public Overpass servers are free but rate-limited, and their policies don't allow heavy app traffic. See *Hosting and costs* for the two options. You must also keep the "© OpenStreetMap contributors" credit, which is already in the app.

## Shared reports setup

Shared reports run on [Supabase](https://supabase.com) (hosted Postgres with sign-in built in). Until you set it up, reports stay on each driver's phone and everything else works normally.

1. Create a Supabase project (pick a US region).
2. **Authentication → Sign In / Providers:** turn on **Allow anonymous sign-ins**. Drivers never create an account; each phone gets a random ID.
3. **SQL Editor:** paste and run [`supabase/migrations/20261026000000_spot_reports.sql`](supabase/migrations/20261026000000_spot_reports.sql). (Or, with the Supabase CLI: `supabase link` then `supabase db push`.)
4. **Project settings → API:** copy the Project URL and the `anon` public key into `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The anon key is designed to ship inside apps; the database rules are what protect the data.

How it's protected:
- Nobody can read the raw reports table. The app only gets per-spot summaries (count, median clearance, latest price, last 3 notes) and never sees who reported what.
- Each driver gets one report per spot (editing replaces it) and at most 40 new reports a day.
- To remove spam, open **Table Editor → spot_reports** and set `hidden` to `true`. The row drops out of all summaries.
- Run the security tests against a local Postgres any time with `PGUSER=postgres supabase/tests/run.sh`.

## Hosting and costs

The app itself is installed from the App Store and Google Play, so there's no website to host. The only server pieces are the database for shared reports and, once you have real traffic, the parking data. Prices below were checked in October 2026 and change often, so confirm them on each provider's pricing page.

| Item | What it's for | Cost |
|---|---|---|
| Apple Developer Program | Publish on the App Store | $99/year |
| Google Play Console | Publish on Google Play | $25 one time |
| Supabase | Shared driver reports | **Free** to start (500 MB database, 50,000 monthly users, but the project pauses after a week with no traffic). **Pro: $25/month** for launch (no pausing, 8 GB database, backups). |
| Parking data | Searching OpenStreetMap | Free public servers are fine for testing but not for an app with real users. See the options below. |
| City/address search | Finding the place to search around | **Free**: uses the phone's built-in Apple/Google geocoder |
| Maps | Map view | **Free**: Apple Maps on iOS; Google's native Android map SDK has no charge without a map ID |
| Expo / EAS | Cloud builds and store submission | **Free**: 15 iOS + 15 Android builds a month. Starter is $19/month if you need more |
| RevenueCat | Lifetime purchase handling | Free until about $2,500/month in revenue, then a small percentage |
| Privacy policy page | Required by both stores | Free on GitHub Pages or Google Sites; a custom domain is about $12/year |
| Store commission | Apple/Google's cut of the Pro purchase | 15% under their small-business programs |

**Parking data options** once you launch:
- **A. Load US parking into the Supabase database (recommended next step).** A weekly automated job downloads the US OpenStreetMap extract, keeps only parking and truck stops, and loads them into the same database. This is an estimated 1–2 GB, inside Supabase Pro's 8 GB, so **no extra cost**, and nothing extra to maintain.
- **B. Run your own Overpass server.** The app works with it unchanged (set `EXPO_PUBLIC_OVERPASS_URLS`). A US-sized server needs roughly 16 GB of RAM and 150–250 GB of SSD: an estimated **$20–40/month** at budget hosts like Hetzner, or **$80–150/month** on AWS or DigitalOcean, plus your time to keep it updated.

**Bottom line:** about **$8/month** (the Apple fee averaged out) while you test on free tiers, and about **$35/month** for a solid launch (Apple fee plus Supabase Pro, with parking data on option A). Costs stay low as you grow: the summaries the app loads are tiny, so Pro's included 250 GB of transfer covers a lot of drivers.

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
npm test            # unit tests: height parsing, fit logic, OSM parsing, filters, report merging
npm run typecheck
npm run lint
```

## Going live: checklist

1. **Accounts:** [Apple Developer Program](https://developer.apple.com/programs/) ($99/year), [Google Play Console](https://play.google.com/console) ($25 once), [Expo](https://expo.dev) (free), [AdMob](https://admob.google.com) (free), [RevenueCat](https://app.revenuecat.com) (free tier).
2. **App identity:** pick a final name and bundle ID (`APP_BUNDLE_ID`, default `com.oversizedparking.app`, which can't change after release), and replace the icon and splash images in `assets/`.
3. **Google Maps key for Android:** create one in Google Cloud with "Maps SDK for Android" enabled and set `GOOGLE_MAPS_ANDROID_API_KEY`. iOS uses Apple Maps and needs no key.
4. **AdMob:** create an iOS app and an Android app, a banner unit and an interstitial unit for each, and set up the GDPR and US-states privacy messages under *Privacy & messaging*. Put the IDs in the env vars listed in [`.env.example`](.env.example). Development builds always use Google's test ads.
5. **Shared reports:** follow *Shared reports setup* above.
6. **Lifetime purchase:**
   - App Store Connect: create a **Non-Consumable** in-app purchase (e.g. `pro_lifetime`).
   - Google Play: create a one-time **in-app product** with the same ID.
   - RevenueCat: add both products, create an entitlement named **`pro`**, and add a **Lifetime** package to the *current* offering. Put the public SDK keys in `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`.
7. **Privacy:** publish a privacy policy (location is used only on the device for searching; reports are anonymous; AdMob collects device identifiers for ads) and set `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_CONTACT_EMAIL`. Fill in Apple's *App Privacy* and Google's *Data safety* forms to match, then add the full SKAdNetwork list from Google's AdMob docs in `app.config.ts`.
8. **Set the env vars in EAS** (`eas env:create`) so cloud builds pick them up, then build and submit:
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
    report/[id].tsx    Report clearance / price seen on site (shared or private)
    upgrade.tsx        Pro paywall
    onboarding.tsx     First-run vehicle height setup
  lib/                 Pure logic, unit tested (no React Native imports)
    height.ts          Parse "6'8\"", "2.1 m", etc.; fit check
    osm.ts             OpenStreetMap → ParkingSpot
    search.ts          Filters and sorting
    community.ts       Combining your, other drivers' and map data
  services/            Network: parking data, place search, shared reports (Supabase)
  state/               App settings, saved spots, reports, driver summaries, Pro status
supabase/              Database schema and security tests for shared reports
  ads/                 AdMob banner and occasional full-screen ad
  ui/                  Shared components and theme
tests/                 Node test runner tests for src/lib
```

## Safety note

The app tells drivers to obey posted clearance signs and that data can be out of date, and phone map apps don't route around low bridges. Keep those messages; they matter for safety and for your liability.
