// Prints the next garages the daily research job should look up: the first
// rows of research/queue.csv not yet in research/searched.csv or garages.csv.
//
//   npx tsx scripts/research-next.ts [count=50]

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCsv } from './build-parking-library';

const root = join(__dirname, '..', 'research');
const count = Number(process.argv[2] ?? 50);
const done = new Set<string>();
for (const f of ['garages.csv', 'searched.csv']) {
  const p = join(root, f);
  if (existsSync(p)) for (const r of parseCsv(readFileSync(p, 'utf8'))) done.add(r.osm_id);
}
const queue = parseCsv(readFileSync(join(root, 'queue.csv'), 'utf8'));
const next = queue.filter((r) => !done.has(r.osm_id)).slice(0, count);
console.log(`${queue.filter((r) => !done.has(r.osm_id)).length} garages left in the queue; next ${next.length}:`);
for (const r of next) {
  console.log([r.osm_id, r.name || '(no name)', r.operator, r.address, r.metro, `${r.lat},${r.lon}`, r.capacity && `${r.capacity} spaces`, r.website].filter(Boolean).join(' | '));
}
