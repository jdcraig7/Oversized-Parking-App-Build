# Daily garage-height research

A scheduled job looks up about 50 garages a day that have no height in the
map data, and records what it finds. The weekly library update builds the
results into the app. This file is the job's instructions; people can follow
it too.

## Each run

1. `git fetch origin claude/oversized-parking-app-3s4btt && git checkout claude/oversized-parking-app-3s4btt && git pull --rebase`
2. `npx tsx scripts/research-next.ts 50` lists the next garages (biggest
   metros in rotation, largest garages first).
3. For each garage, search the web (two searches at most), for example
   `"<name>" <address or metro> parking garage clearance height`, and for
   operators `<operator> <name> garage max vehicle height`.
4. Record the outcome of **every** garage, found or not (see below).
5. `npm test` (checks the CSV files parse), then commit and push:
   `git add research && git commit -m "Research: <n> garages, <m> heights found"`
   and `git push -u origin claude/oversized-parking-app-3s4btt` (on rejection:
   `git pull --rebase`, then push again).
6. Add a line to the log at the end of this file.

Stop after 50 garages or about an hour, whichever comes first.

## What counts

- **operator**: the garage's own site, its operator (SP+, LAZ, ABM, Impark,
  Propark, Towne Park...), a city / parking authority / airport / university
  page. Preferred.
- **listing**: a third-party listing that states a height for this garage
  (ParkWhiz "Max Vehicle Height", SpotHero, Parkopedia, ParkMe, BestParking,
  Apple Maps). Acceptable.
- Not acceptable: forum guesses, "typically about 7 ft" articles, AI-written
  guide sites, heights read from Street View or other photos.
- The source must clearly be **this** garage (same name/address). If not sure,
  record `ambiguous` and move on.
- Sources disagree: use the lowest from an operator page if there is one;
  otherwise record `conflict` with both numbers in the note.
- Several entrances with different heights: record the main entrance in
  `clearance` and the others in `note` ("Level 1 8'2"; upper levels 6'10"").
- While there, also take price, hours and phone from the same source when shown.

## Where to write

- Found → a row in `research/garages.csv` (columns explained in README.md):
  `osm_id,name,clearance,price,hours,access,phone,source,source_url,checked,note`.
  Use `access` = `yes` only when the source shows it's open to the public.
- Every garage searched (found or not) → a row in `research/searched.csv`:
  `osm_id,name,checked,result,note` with `result` one of `found`, `none`,
  `conflict`, `ambiguous`, `closed`.
- Never edit or delete existing rows written by people; add new ones only.

## Log

| Date | Searched | Heights found | Notes |
|---|---|---|---|
| 2026-11-10 | 32 | 10 | Stopped early at 32 (one search each). Many 'none' because heights sit on pages search did not surface. |
| 2026-11-10 (2nd run) | 14 | 5 | One search each; stopped early. |
| 2026-11-10 (3rd run) | 12 | 1 | One search each; stopped early. Many garages' heights are on pages search does not surface. |
| 2026-11-10 (4th run) | 10 | 4 | One search each; stopped early. |
| 2026-11-10 (5th run) | 8 | 5 | One search each; stopped early to resume the task list. |
| 2026-11-11 | 8 | 2 | One search each (Dulles Garage 2 from the earlier Dulles FAQ). |
| 2026-11-11 (full 50) | 50 | 3 | One search each, run directly (no subagents). Low yield: most remaining queue entries are unnamed or lack web pages. |
| 2026-11-11 (2nd full 50) | 50 | 17 | One search each, run directly. Named campus and airport garages gave a much better yield (about a third). |
| 2026-11-11 (3rd full 50) | 50 | 12 | One search each, run directly; two heights taken from pages found in earlier runs. |
| 2026-11-11 (4th full 50) | 50 | 12 | One search each, run directly; two heights reused from pages found in earlier runs. |
| 2026-11-11 (5th full 50) | 50 | 12 | One search each, run directly; Main Gate Garage reused from the University of Arizona page found earlier. |
| 2026-11-11 (6th full 50) | 50 | 10 | One search each, run directly; several queue entries were generic names and not searched. |
| 2026-11-11 (7th full 50) | 43 | 12 | One search each, run directly; 7 generic names not searched. |
| 2026-11-11 (8th full 50) | 35 | 11 | 35 searched (one search each) plus Ohio State 12th Ave and VCU Henry West reused from pages found earlier; the other 15 queue entries were NOT searched but recorded as none in searched.csv, so they may be worth re-queuing. |
| 2026-11-12 (9th full 50) | 33 | 7 | 30 searched (one search each) plus 3 heights reused from pages found earlier. The other 17 queue entries were left unsearched and NOT recorded, so they return in the next queue. |
| 2026-11-12 (10th run) | 29 | 6 | One search each, run directly. 21 queue entries left unsearched and not recorded, so they requeue. |
| 2026-11-12 (11th run) | 28 | 6 | One search each, run directly. 22 queue entries left unsearched and not recorded, so they requeue. |
| 2026-11-12 (12th run) | 24 | 8 | One search each, run directly. 26 queue entries left unsearched and not recorded, so they requeue. |
| 2026-11-12 (13th run) | 24 | 5 | One search each, run directly. 26 queue entries left unsearched and not recorded, so they requeue (the head of the queue is now mostly generic names that keep returning). |
| 2026-11-12 (14th run) | 16 | 4 | One search each, run directly; shorter run. 34 queue entries left unsearched and not recorded, so they requeue. |
| 2026-11-12 (15th run, user asked to search everything) | 50 | 2 | All 50 searched, one search each (including the generic names previously skipped); low yield expected for these. |
| 2026-11-12 (16th run) | 50 | 6 | All 50 searched, one search each. 1 operator source, 5 single-listing sources; 3 ambiguous. |
| 2026-11-12 (17th run) | 50 | 10 | All 50 searched, one search each (6 re-run after rate-limit errors). 5 operator, 5 single-listing sources; 8 ambiguous. |
| 2026-11-13 (18th run) | 50 | 8 | All 50 searched, one search each (1 re-run after a rate-limit error). 3 operator, 5 single-listing sources; 5 ambiguous. |
| 2026-11-13 (operator-wide pass, user-approved) | 11 | 9 | Not a scheduled run. Used University of Missouri and UT Knoxville clearance lists (6 + 3 garages); 2 UT garages ambiguous (older map only). UGA, UF, Yale, BART, UNMC, Colonial DC publish no usable per-garage list. |
| 2026-11-13 (19th run) | 50 | 21 | All 50 searched, one search each (4 re-run after rate-limit errors). First run on the yield-ordered queue: 2 operator, 19 single-listing sources (17 are Centerpark/NYC-area aggregator listings); 2 ambiguous. |
| 2026-11-13 (20th run) | 50 | 14 | All 50 searched, one search each (Frederick's three city garages in one combined query first, then individually; 5 re-run after rate-limit errors). 3 operator, 11 single-listing sources; 3 ambiguous. |
| 2026-11-13 (21st run) | 50 | 15 | All 50 searched, one search each (6 re-run after rate-limit errors). 5 operator, 10 single-listing sources (7 from one Ann Arbor Art Fair page listing the DDA garages); 5 ambiguous. |
