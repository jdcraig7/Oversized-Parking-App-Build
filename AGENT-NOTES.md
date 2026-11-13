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

## 2026-11-11 (later)
- Task 5 (Alaska/Hawaii): the retry at 09:08 UTC succeeded: `/tmp/ak-hi.geojsonseq` written, 7,224 places. The Monday refresh includes US-AK/US-HI automatically. (The earlier attempt the same day failed with Overpass HTTP 406/429; the mirrors are intermittent.)
- Research runs on 2026-11-11: 8, 50, 50, 50, 50 garages searched (2, 17, 12, 12 heights in the last four). `research/garages.csv` has about 160 rows. All pushed. The queue still has about 5,400 entries; most unnamed ones are not findable by web search.
- The main session asked for full 50-garage runs; I did them directly with parallel searches rather than subagents.

## 2026-11-12
- Alaska/Hawaii Overpass fetch (daily check): succeeded, 7,224 places (one mirror returned 429, another answered).
- Research runs 7-9 pushed (heights found: 12, 11, 7). Run 8 only searched 35 of its 50 entries (documented in its log row); run 9 left unsearched entries out of searched.csv so they requeue. Nothing needed from the owner.
- 2026-11-12: Correction to my earlier queue note: the queue stall was caused by me skipping generic-name garages and stopping runs early, not by the script. Owner confirmed: search every garage in every run (one search each, record each in searched.csv). Doing that from now on; no script change needed.

## 2026-11-13 — Alaska/Hawaii fetch FAILED (retry pending)
- Ran the daily `fetch-overpass-states.ts ... US-AK US-HI`; every Overpass mirror returned HTTP 429 or a fetch error, exit code 1. No new data; the 2026-11-12 output is unchanged.
- Will retry on the next scheduled run and note the result here. Nothing needed from the owner.
- Research run 18 (2026-11-13): 50 garages searched, 8 heights found, pushed.

## 2026-11-13 — Queue reordering + operator-wide hunt (owner approved "1 and 2")
- `scripts/research-next.ts` now orders unsearched garages by likely yield (`scripts/research-score.ts`; website, operator, institution, named). Measured over 838 searched garages: website 34% found a height, operator 25%, institution 24%, named 22%, unnamed/generic 9%. `--by-rank` restores the old queue.csv order. Still search and record every garage; only the order changed. Test added (`tests/research-score.test.ts`).
- Operator-wide lists found for University of Missouri and UT Knoxville (9 garages recorded, 2 more ambiguous). No public per-garage list for UGA, UF, Yale, BART, UNMC, Colonial DC, so those stay per-garage searches.
- Ideas for later (need owner): ask LAZ / SP+ / Centerpark for a clearance sheet; call-in or email requests would be drafted here for the owner to send.

## 2026-11-13 (later) — Alaska/Hawaii fetch failed again
- Second attempt after research run 19: all Overpass mirrors again returned 429 / fetch failed, exit 1. No new data. Will try again after the next run and keep the retries to about once per scheduled run. Nothing needed from the owner.
- Research run 19 (first on the yield-ordered queue): 50 searched, 21 heights found (mostly NYC Centerpark garages via ParkWhiz/Parkmobile listings, which are single-source).

## 2026-11-13 (run 20) — AK/HI fetch failed a third time
- Third attempt today (after runs 18, 19, 20): all Overpass mirrors again 429 / fetch failed, exit 1. The 2026-11-12 output is still the latest. The mirrors look rate-limited from this network, so I'll keep to one attempt per day and note it. Nothing needed from the owner unless this goes on for several days (then the daily AK/HI fetch may need to run from another network).
- Research run 20 (yield-ordered queue): 50 searched, 14 heights found.
