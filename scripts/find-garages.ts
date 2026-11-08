// Lists garages in a built parking library near a point, optionally matching a
// name, to look up osm_id values for research/garages.csv.
//
//   npx tsx scripts/find-garages.ts <library-dir> <lat> <lon> <radius-km> [name regex]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { distanceMeters } from '../src/lib/geo';
import { formatFeetInches } from '../src/lib/height';
import { kindLabel, parseOverpass } from '../src/lib/osm';
import { recordToElement, type ParkingTile } from '../src/lib/tiles';

const [lib, lat, lon, km, pattern] = process.argv.slice(2);
const center = { latitude: Number(lat), longitude: Number(lon) };
const radius = Number(km) * 1000;
const re = pattern ? new RegExp(pattern, 'i') : null;

const dLat = radius / 111320;
const elements = [];
for (const a of readdirSync(join(lib, 'v1'))) {
  const la = Number(a) * 0.25;
  if (la + 0.25 < center.latitude - dLat || la > center.latitude + dLat) continue;
  for (const f of readdirSync(join(lib, 'v1', a))) {
    const tile = JSON.parse(readFileSync(join(lib, 'v1', a, f), 'utf8')) as ParkingTile;
    elements.push(...tile.records.map(recordToElement));
  }
}
const garages = parseOverpass({ elements })
  .filter((s) => ['garage', 'underground', 'rooftop'].includes(s.kind) && s.access !== 'restricted')
  .filter((s) => distanceMeters(center, s) <= radius)
  .filter((s) => !re || re.test(`${s.name} ${s.operator ?? ''} ${s.address ?? ''}`))
  .sort((a, b) => distanceMeters(center, a) - distanceMeters(center, b));
for (const g of garages) {
  const c = g.clearance.status === 'limited' ? formatFeetInches(g.clearance.meters) : g.clearance.status;
  console.log([g.id.replace('osm:', ''), g.unnamed ? '(unnamed)' : g.name, kindLabel(g.kind), g.access, c, `${g.latitude},${g.longitude}`, g.address ?? '', g.operator ?? ''].join(' | '));
}
console.error(`${garages.length} garages`);
