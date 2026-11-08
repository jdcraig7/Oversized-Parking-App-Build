// Builds the parking library tiles from an OpenStreetMap extract.
//
//   scripts/build-parking-library.sh <region.osm.pbf> <output-dir>
//
// The shell wrapper filters the extract with osmium and exports GeoJSON lines;
// this script turns each feature into a tile record, keeps only what the app
// would show, and writes <output-dir>/v1/<lat>/<lon>.json plus manifest.json.
// Running it again with another region adds to the same output directory.

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

import { parseHeight } from '../src/lib/height';
import { parseOverpass } from '../src/lib/osm';
import {
  isLibraryCandidate,
  recordToElement,
  slimTags,
  tileKeyFor,
  tilePath,
  TILE_DEGREES,
  TILE_FORMAT_VERSION,
  type ParkingTile,
  type TileRecord,
} from '../src/lib/tiles';

type Position = [number, number];
interface Feature {
  id?: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, string>;
}

/** Average of a ring's vertices (closing vertex excluded): good enough for a pin. */
function ringCenter(ring: Position[]): Position {
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  const sum = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

function centerOf(geometry: Feature['geometry']): Position | null {
  if (!geometry) return null;
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'Point':
      return c as Position;
    case 'LineString':
      return ringCenter(c as Position[]);
    case 'Polygon':
      return ringCenter((c as Position[][])[0]);
    case 'MultiPolygon': {
      // The polygon with the most outer-ring vertices: usually the main lot.
      const polys = c as Position[][][];
      const main = polys.reduce((a, b) => (b[0].length > a[0].length ? b : a));
      return ringCenter(main[0]);
    }
    default:
      return null;
  }
}

/**
 * Minimal CSV reader: commas separate fields; a field that starts with a double
 * quote runs to the closing quote ("" inside it is a literal quote). A quote
 * elsewhere is ordinary text, so values like 6'7" need no quoting.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((f) => f !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += c;
    }
  }
  endRow();
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Merges research/*.csv into the tile records. Returns [applied, not found]. */
function applyResearch(records: Map<string, TileRecord>, dir: string): [number, string[]] {
  if (!existsSync(dir)) return [0, []];
  let applied = 0;
  const missing: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv'))) {
    for (const row of parseCsv(readFileSync(join(dir, file), 'utf8'))) {
      const m = /^(node|way|relation)\/(\d+)$/.exec(row.osm_id ?? '');
      if (!m) throw new Error(`${file}: bad osm_id "${row.osm_id}"`);
      if (!['sign', 'operator', 'listing'].includes(row.source)) throw new Error(`${file} ${row.osm_id}: source must be sign, operator or listing`);
      const record = records.get(`${m[1][0]}${m[2]}`);
      if (!record) {
        missing.push(row.osm_id);
        continue;
      }
      const tags = record[4];
      if (row.clearance) {
        if (parseHeight(row.clearance).kind !== 'meters') throw new Error(`${file} ${row.osm_id}: can't read clearance "${row.clearance}"`);
        // Keep the map's value too: the app uses the lowest of ;-separated values.
        tags.maxheight = tags.maxheight ? `${tags.maxheight};${row.clearance}` : row.clearance;
      }
      if (row.price) tags.charge = row.price;
      if (row.hours) tags.opening_hours = row.hours;
      tags['research:source'] = row.source;
      if (row.source_url) tags['research:url'] = row.source_url;
      if (row.checked) tags['research:checked'] = row.checked;
      if (row.note) tags['research:note'] = row.note;
      applied++;
    }
  }
  return [applied, missing];
}

async function main() {
  const [input, outDir, updated] = process.argv.slice(2);
  if (!input || !outDir || !updated) {
    console.error('usage: build-parking-library.ts <features.geojsonseq> <output-dir> <data-date YYYY-MM-DD>');
    process.exit(2);
  }

  const tiles = new Map<string, Map<string, TileRecord>>();
  let read = 0;
  let kept = 0;

  const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.replace(/^\x1e/, '').trim();
    if (!line) continue;
    read++;
    const f = JSON.parse(line) as Feature;
    const tags = f.properties ?? {};
    if (!isLibraryCandidate(tags)) continue;
    const center = centerOf(f.geometry);
    // osmium ids look like n123 / w123 / r123 (areas built from ways or relations).
    const m = /^([nwr])(\d+)$/.exec(f.id ?? '');
    if (!center || !m) continue;
    const record: TileRecord = [
      m[1] as TileRecord[0],
      Number(m[2]),
      Math.round(center[1] * 1e5) / 1e5,
      Math.round(center[0] * 1e5) / 1e5,
      slimTags(tags),
    ];
    // Keep only what the app would actually list (drops tiny lots, empty street strips...).
    if (parseOverpass({ elements: [recordToElement(record)] }).length === 0) continue;
    const key = tileKeyFor({ latitude: record[2], longitude: record[3] });
    if (!tiles.has(key)) tiles.set(key, new Map());
    tiles.get(key)!.set(`${record[0]}${record[1]}`, record);
    kept++;
  }

  // Our own research (research/*.csv) fills in clearances and prices.
  const byId = new Map<string, TileRecord>();
  for (const records of tiles.values()) for (const [id, r] of records) byId.set(id, r);
  const [applied, missing] = applyResearch(byId, join(dirname(new URL(import.meta.url).pathname), '..', 'research'));
  console.log(`research rows applied: ${applied}${missing.length ? `, not in this region: ${missing.length}` : ''}`);

  // Merge with tiles already in the output (from another region), then write.
  const manifestPath = join(outDir, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { v: TILE_FORMAT_VERSION, tileDegrees: TILE_DEGREES, attribution: '© OpenStreetMap contributors (ODbL)', tiles: {} };
  for (const [key, records] of tiles) {
    const file = join(outDir, tilePath(key));
    const existing: ParkingTile | null = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    for (const r of existing?.records ?? []) if (!records.has(`${r[0]}${r[1]}`)) records.set(`${r[0]}${r[1]}`, r);
    const tile: ParkingTile = { v: TILE_FORMAT_VERSION, updated, records: [...records.values()] };
    const json = JSON.stringify(tile);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, json);
    manifest.tiles[key] = tile.records.length;
    manifest.hashes = { ...manifest.hashes, [key]: createHash('sha1').update(json).digest('hex').slice(0, 16) };
  }
  manifest.updated = updated;
  manifest.total = Object.values(manifest.tiles as Record<string, number>).reduce((a, b) => a + b, 0);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`features read: ${read}, kept: ${kept}, tiles written: ${tiles.size}, library total: ${manifest.total}`);
}

if (process.argv[1]?.endsWith('build-parking-library.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
