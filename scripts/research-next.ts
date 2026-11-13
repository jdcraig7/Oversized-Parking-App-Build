// Prints the next garages the daily research job should look up: the first
// rows of research/queue.csv not yet in research/searched.csv or garages.csv.
//
//   npx tsx scripts/research-next.ts [count=50] [--by-rank]
//
// By default the unsearched rows are ordered by likely yield (see
// research-score.ts; ties keep queue.csv order) so each run finds more heights.
// Every garage still has to be searched and recorded eventually. --by-rank
// restores the plain queue.csv order.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCsv } from './build-parking-library';
import { yieldScore } from './research-score';

const root = join(__dirname, '..', 'research');
const args = process.argv.slice(2);
const byRank = args.includes('--by-rank');
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 50);
const done = new Set<string>();
for (const f of ['garages.csv', 'searched.csv']) {
  const p = join(root, f);
  if (existsSync(p)) for (const r of parseCsv(readFileSync(p, 'utf8'))) done.add(r.osm_id);
}
const queue = parseCsv(readFileSync(join(root, 'queue.csv'), 'utf8'));
const todo = queue.filter((r) => !done.has(r.osm_id));
const ordered = byRank ? todo : todo.map((r, i) => ({ r, i, s: yieldScore(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
const next = ordered.slice(0, count);
console.log(`${todo.length} garages left in the queue; next ${next.length}:`);
for (const r of next) {
  console.log([r.osm_id, r.name || '(no name)', r.operator, r.address, r.metro, `${r.lat},${r.lon}`, r.capacity && `${r.capacity} spaces`, r.website].filter(Boolean).join(' | '));
}
