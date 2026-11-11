// Builds research/queue.csv: garages with no height on record, in the order
// the daily research job should look them up (biggest metros first, then the
// largest garages). Garages already looked up (research/searched.csv) and
// ones already in research/garages.csv are skipped.
//
//   npx tsx scripts/research-queue.ts <library-dir>

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseCsv } from './build-parking-library';
import type { ParkingTile } from '../src/lib/tiles';

/** Largest US metros (approximate centers), most populous first. */
const METROS: [string, number, number][] = [
  ['New York', 40.75, -73.99], ['Los Angeles', 34.05, -118.25], ['Chicago', 41.88, -87.63], ['Dallas', 32.78, -96.8],
  ['Houston', 29.76, -95.37], ['Washington DC', 38.9, -77.03], ['Philadelphia', 39.95, -75.16], ['Atlanta', 33.75, -84.39],
  ['Miami', 25.77, -80.19], ['Phoenix', 33.45, -112.07], ['Boston', 42.36, -71.06], ['Riverside', 33.95, -117.4],
  ['San Francisco', 37.78, -122.42], ['Detroit', 42.33, -83.05], ['Seattle', 47.61, -122.33], ['Minneapolis', 44.98, -93.27],
  ['Tampa', 27.95, -82.46], ['San Diego', 32.72, -117.16], ['Denver', 39.74, -104.99], ['Baltimore', 39.29, -76.61],
  ['Orlando', 28.54, -81.38], ['Charlotte', 35.23, -80.84], ['St. Louis', 38.63, -90.2], ['San Antonio', 29.42, -98.49],
  ['Austin', 30.27, -97.74], ['Portland', 45.52, -122.68], ['Sacramento', 38.58, -121.49], ['Pittsburgh', 40.44, -79.99],
  ['Las Vegas', 36.17, -115.14], ['Cincinnati', 39.1, -84.51], ['Kansas City', 39.1, -94.58], ['Columbus', 39.96, -83.0],
  ['Indianapolis', 39.77, -86.16], ['Cleveland', 41.5, -81.69], ['Nashville', 36.16, -86.78], ['San Jose', 37.34, -121.89],
  ['Virginia Beach', 36.85, -75.98], ['Jacksonville', 30.33, -81.66], ['Providence', 41.82, -71.41], ['Raleigh', 35.78, -78.64],
  ['Milwaukee', 43.04, -87.91], ['Oklahoma City', 35.47, -97.52], ['Memphis', 35.15, -90.05], ['Louisville', 38.25, -85.76],
  ['Richmond', 37.54, -77.44], ['Salt Lake City', 40.76, -111.89], ['New Orleans', 29.95, -90.07], ['Hartford', 41.76, -72.67],
  ['Buffalo', 42.89, -78.88], ['Birmingham', 33.52, -86.8], ['Rochester', 43.16, -77.61], ['Tucson', 32.22, -110.97],
  ['Honolulu', 21.31, -157.86], ['Tulsa', 36.15, -95.99], ['Fresno', 36.74, -119.79], ['Omaha', 41.26, -95.94],
  ['Albuquerque', 35.08, -106.65], ['Bakersfield', 35.37, -119.02], ['Boise', 43.62, -116.2], ['Madison', 43.07, -89.4],
];
const METRO_RADIUS_M = 40_000;

const dist = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.hypot((bLon - aLon) * 111_320 * Math.cos((aLat * Math.PI) / 180), (bLat - aLat) * 111_320);

const csvCell = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function main() {
  const lib = process.argv[2];
  if (!lib) {
    console.error('usage: research-queue.ts <library-dir>');
    process.exit(2);
  }
  const root = join(__dirname, '..', 'research');
  const done = new Set<string>();
  for (const f of ['garages.csv', 'searched.csv']) {
    const p = join(root, f);
    if (existsSync(p)) for (const r of parseCsv(readFileSync(p, 'utf8'))) done.add(r.osm_id);
  }

  const rows: { metroRank: number; metro: string; cap: number; findable: number; cols: (string | number | undefined)[] }[] = [];
  const types = { n: 'node', w: 'way', r: 'relation' } as const;
  for (const la of readdirSync(join(lib, 'v1'))) {
    for (const f of readdirSync(join(lib, 'v1', la))) {
      const tile = JSON.parse(readFileSync(join(lib, 'v1', la, f), 'utf8')) as ParkingTile;
      for (const [t, id, lat, lon, tags] of tile.records) {
        if (!(t in types) || tags.amenity !== 'parking') continue;
        if (!/^(multi-storey|underground|rooftop)$/.test(tags.parking ?? '')) continue;
        if (/^(private|no|customers|delivery)$/.test(tags.access ?? '')) continue;
        if (tags.maxheight || tags['maxheight:physical']) continue;
        const osmId = `${types[t as keyof typeof types]}/${id}`;
        if (done.has(osmId)) continue;
        const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
        // A name, operator or street address is needed to look a garage up.
        if (!tags.name && !tags.operator && !tags['addr:street']) continue;
        let metroRank = METROS.length;
        let metro = '';
        METROS.forEach(([name, mLat, mLon], i) => {
          if (i < metroRank && dist(lat, lon, mLat, mLon) <= METRO_RADIUS_M) {
            metroRank = i;
            metro = name;
          }
        });
        const cap = Number(tags.capacity) || 0;
        // How likely a height is published for it: a named garage with a known
        // operator or website almost always has a page; park & rides and
        // unnamed structures rarely do (measured: ~6% vs ~35% found).
        const name = tags.name ?? '';
        const findable =
          (name ? 2 : 0) +
          (tags.operator || tags.website || tags['contact:website'] ? 1 : 0) +
          (/garage|parking structure|parkade|deck|ramp|center|plaza|airport|terminal/i.test(name) ? 1 : 0) -
          (/park.?(and|&|n).?ride|park-n-ride|station|transit|employee|staff|resident/i.test(name) ? 2 : 0);
        rows.push({
          metroRank,
          metro,
          cap,
          findable,
          cols: [osmId, tags.name, tags.operator, address, metro, lat, lon, cap || '', tags.website ?? tags['contact:website']],
        });
      }
    }
  }
  // Round-robin across metros so every big city gets its largest garages done
  // early: each metro's #1 garage, then each metro's #2, ... Garages outside
  // the listed metros come last, largest first.
  rows.sort((a, b) => a.metroRank - b.metroRank || b.findable - a.findable || b.cap - a.cap);
  const position = new Map<(typeof rows)[number], number>();
  const seenPerMetro = new Map<number, number>();
  for (const r of rows) {
    const n = seenPerMetro.get(r.metroRank) ?? 0;
    position.set(r, r.metro ? n : Number.MAX_SAFE_INTEGER);
    seenPerMetro.set(r.metroRank, n + 1);
  }
  // Within each round, the most findable first; low-findability garages
  // (unnamed, park & rides) only after every metro's findable ones.
  const tier = (r: (typeof rows)[number]) => (r.findable >= 2 ? 0 : 1);
  rows.sort((a, b) => tier(a) - tier(b) || position.get(a)! - position.get(b)! || a.metroRank - b.metroRank || b.cap - a.cap);
  const header = 'rank,osm_id,name,operator,address,metro,lat,lon,capacity,website';
  const lines = rows.map((r, i) => [i + 1, ...r.cols].map(csvCell).join(','));
  writeFileSync(join(root, 'queue.csv'), [header, ...lines].join('\n') + '\n');
  const inMetros = rows.filter((r) => r.metro).length;
  console.log(`queue: ${rows.length} garages to research (${inMetros} in the top ${METROS.length} metros)`);
}

main();
