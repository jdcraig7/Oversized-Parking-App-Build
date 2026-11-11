# Agent notes

## 2026-11-10
- Setup: branch checked out, `npm install` ok, `git push --dry-run` ok.
- Task 2 (website): added `library-worker/index.html` (landing page, light/dark, mobile) and a `/` route in `library-worker/worker.js` (KV key `site/index.html`). `scripts/deploy-parking-library.ts` now publishes it like privacy.html. Deployed using the live manifest as the library dir (no tiles rebuilt; manifest verified identical). Live at https://oversized-parking-library.oversized-parking-17bb38.workers.dev/ (KV edge cache took ~30s to show it). Contact shown is the address already in the privacy policy (jdcraig7@gmail.com) - owner may want a dedicated support address.

## 2026-11-10 (later)
- Research runs (5 so far today): 32+14+12+10+8 garages searched, 10+5+1+4+5 = 25 heights found, all pushed. Runs use one search per garage and stop early; many garages have no height on pages search surfaces.
- Task 3: wrote `marketing/launch-plan.md` (communities, 6-week calendar, post drafts). Nothing posted or sent. Needs owner: approve plan, create own accounts, choose support email, decide on creator Pro codes.
- Next: task 4 (maintenance), task 5 (Alaska/Hawaii daily try).

## 2026-11-11
- Task 4: `npx expo install --fix` applied the SDK 58 patch updates (expo, expo-dev-client, expo-linking, expo-location, expo-router, expo-system-ui, react-native 0.88.1, safe-area-context, screens). `npm test`, `tsc` and `expo lint` pass. Nothing reverted. `npx expo install --check` is now expected to be clean.
- expo-doctor still reports 3 failures that are identical with and without the update: config schema check, a missing required peer dependency (`expo-font`; doctor suggests `npx expo install expo-font`), and the React Native Directory check (server error). Not changed here because adding a native module affects the build the main session owns. Owner/main session: consider installing expo-font and re-running doctor.
- Task 5 (Alaska/Hawaii), 2026-11-11: failed. overpass-api.de HTTP 406, kumi.systems and private.coffee HTTP 429. Will retry once a day.
- Research run 2026-11-11: 8 searched, 2 found, pushed.
