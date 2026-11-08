# Parking research

Our own research fills in what OpenStreetMap is missing, mostly garage
clearances and prices. Every weekly library build merges these files in.

## garages.csv

| Column | What to put |
|---|---|
| `osm_id` | The place's OpenStreetMap id, e.g. `way/471844277`. In the app it's at the end of the "Fix it on OpenStreetMap" link. |
| `name` | For people reading the sheet (not shown in the app). |
| `clearance` | As posted: `6'8"`, `7' 2"`, `2.1` (meters). Leave empty if unknown. |
| `price` | Short rate text, e.g. `$3/hr; $15 daily max`. |
| `hours` | `24/7`, or OpenStreetMap opening-hours style like `Mo-Fr 06:00-22:00`. |
| `source` | `sign` (photo of the posted sign), `operator` (the garage's or city's own site), or `listing` (third-party site such as ParkMe, ParkWhiz, Apple Maps). |
| `source_url` | Where it came from. |
| `checked` | Date checked, `YYYY-MM-DD`. |
| `note` | Anything a driver should know: conflicting listings, a lower entrance, etc. |

Rules the build follows:
- If OpenStreetMap already has a clearance, both are kept and the app uses
  the **lower** one.
- When sources disagree, put the lowest clearance in the sheet and explain in `note`.
- `listing` values are shown as "not verified"; prefer `sign` or `operator`.

## Mapillary height-sign scan (tested November 2026)

`scripts/mapillary-height-signs.ts` lists Mapillary-detected height signs
near library garages, with photo links. Tested over Glendale to downtown LA
(312 garages): 904 height signs, 25 detections near 7 garages, and **every
one was a road sign** (freeway overpasses, street underpasses, a tunnel), not
a garage entrance. Mapillary's detector recognizes the yellow diamond road
warning (`warning--height-restriction--g2`) but not the clearance bars and
rectangular signs garages use. So it isn't a source for garage clearances; it
could later power "low bridge or tunnel near this spot" warnings for tall
vehicles. Photos are CC BY-SA 4.0 (credit "© Mapillary contributors").
