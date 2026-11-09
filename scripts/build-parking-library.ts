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
import { isDumpStation, isLowClearanceCandidate } from '../src/lib/nearby';
import {
  isLibraryCandidate,
  recordToElement,
  slimExtraTags,
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

const PLACE_KINDS: Record<string, Record<string, string>> = {
  garage: { parking: 'multi-storey' },
  underground: { parking: 'underground' },
  rooftop: { parking: 'rooftop' },
  surface: { parking: 'surface' },
  truck: { hgv: 'designated' },
};

/**
 * Places from research/places.csv: real parking that OpenStreetMap doesn't
 * have yet. Each row's numeric id must stay the same forever (it's the spot id
 * people save and report against).
 */
export function researchPlaces(file: string): TileRecord[] {
  if (!existsSync(file)) return [];
  return parseCsv(readFileSync(file, 'utf8')).map((row) => {
    const id = Number(row.id);
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`places.csv: bad id "${row.id}"`);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`places.csv ${id}: bad coordinates`);
    if (!PLACE_KINDS[row.kind]) throw new Error(`places.csv ${id}: kind must be ${Object.keys(PLACE_KINDS).join(', ')}`);
    if (!['sign', 'operator', 'listing'].includes(row.source)) throw new Error(`places.csv ${id}: source must be sign, operator or listing`);
    if (row.clearance && parseHeight(row.clearance).kind !== 'meters') throw new Error(`places.csv ${id}: can't read clearance "${row.clearance}"`);
    const tags: Record<string, string> = { amenity: 'parking', ...PLACE_KINDS[row.kind], name: row.name, 'research:source': row.source };
    const put = (k: string, v?: string) => {
      if (v) tags[k] = v;
    };
    put('maxheight', row.clearance);
    put('charge', row.price);
    put('fee', row.price ? 'yes' : undefined);
    put('opening_hours', row.hours);
    put('access', row.access);
    put('operator', row.operator);
    put('phone', row.phone);
    put('research:url', row.source_url);
    put('research:checked', row.checked);
    put('research:note', row.note);
    return ['p', id, lat, lon, tags] as TileRecord;
  });
}

/** Merges research/*.csv into the tile records. Returns [applied, not found]. */
function applyResearch(records: Map<string, TileRecord>, dir: string): [number, string[]] {
  if (!existsSync(dir)) return [0, []];
  let applied = 0;
  const missing: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv') && f !== 'places.csv')) {
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
      // A number from our research fills in when the map has none.
      if (row.phone && !tags.phone && !tags['contact:phone']) tags.phone = row.phone;
      // A source can confirm public access (e.g. an operator's page for paid parking).
      if (row.access) tags.access = row.access;
      tags['research:source'] = row.source;
      if (row.source_url) tags['research:url'] = row.source_url;
      if (row.checked) tags['research:checked'] = row.checked;
      if (row.note) tags['research:note'] = row.note;
      applied++;
    }
  }
  return [applied, missing];
}

/**
 * osmium export ids: n123 (node), w123 (way, as a line), and a<N> for areas,
 * where an even N is a way (N/2, already exported as w...) and an odd N is a
 * relation ((N-1)/2). Multipolygon parking (often the biggest garages and
 * lots) only arrives as an odd area id, so those must not be skipped.
 */
export function osmIdOf(id: string): ['n' | 'w' | 'r', number] | null {
  const m = /^([nwa])(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] !== 'a') return [m[1] as 'n' | 'w', n];
  return n % 2 === 1 ? ['r', (n - 1) / 2] : null;
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
  const extras = { h: 0, d: 0 };
  const bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };

  const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.replace(/^\x1e/, '').trim();
    if (!line) continue;
    read++;
    const f = JSON.parse(line) as Feature;
    const tags = f.properties ?? {};
    const extra = isLowClearanceCandidate(tags) ? 'h' : isDumpStation(tags) ? 'd' : null;
    if (!extra && !isLibraryCandidate(tags)) continue;
    const center = centerOf(f.geometry);
    const osm = osmIdOf(f.id ?? '');
    if (!center || !osm) continue;
    if (extra) {
      // Low bridges/barriers and dump stations ride along in the same tiles.
      const rec: TileRecord = [extra, osm[1], Math.round(center[1] * 1e5) / 1e5, Math.round(center[0] * 1e5) / 1e5, slimExtraTags({ ...tags, osm: osm[0] })];
      const key = tileKeyFor({ latitude: rec[2], longitude: rec[3] });
      if (!tiles.has(key)) tiles.set(key, new Map());
      tiles.get(key)!.set(`${extra}${osm[0]}${osm[1]}`, rec);
      extras[extra]++;
      continue;
    }
    const record: TileRecord = [
      osm[0],
      osm[1],
      Math.round(center[1] * 1e5) / 1e5,
      Math.round(center[0] * 1e5) / 1e5,
      slimTags(tags),
    ];
    // Keep only what the app would actually list (drops tiny lots, empty street strips...).
    if (parseOverpass({ elements: [recordToElement(record)] }).length === 0) continue;
    const key = tileKeyFor({ latitude: record[2], longitude: record[3] });
    if (!tiles.has(key)) tiles.set(key, new Map());
    tiles.get(key)!.set(`${record[0]}${record[1]}`, record);
    bounds.minLat = Math.min(bounds.minLat, record[2]);
    bounds.maxLat = Math.max(bounds.maxLat, record[2]);
    bounds.minLon = Math.min(bounds.minLon, record[3]);
    bounds.maxLon = Math.max(bounds.maxLon, record[3]);
    kept++;
  }

  // Places from our own research that OpenStreetMap doesn't have, kept to
  // this region's bounding box (so a later region doesn't re-add them).
  const researchDir = join(dirname(new URL(import.meta.url).pathname), '..', 'research');
  let placesAdded = 0;
  if (bounds.minLat <= bounds.maxLat) {
    for (const record of researchPlaces(join(researchDir, 'places.csv'))) {
      if (record[2] < bounds.minLat || record[2] > bounds.maxLat || record[3] < bounds.minLon || record[3] > bounds.maxLon) continue;
      const key = tileKeyFor({ latitude: record[2], longitude: record[3] });
      if (!tiles.has(key)) tiles.set(key, new Map());
      tiles.get(key)!.set(`p${record[1]}`, record);
      placesAdded++;
    }
  }
  console.log(`research places added: ${placesAdded}`);

  // Our own research (research/*.csv) fills in clearances and prices.
  const byId = new Map<string, TileRecord>();
  for (const records of tiles.values()) for (const [id, r] of records) byId.set(id, r);
  const [applied, missing] = applyResearch(byId, researchDir);
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
    // Parking places only (low clearances and dump stations aren't counted).
    manifest.tiles[key] = tile.records.filter((r) => 'nwrp'.includes(r[0])).length;
    manifest.hashes = { ...manifest.hashes, [key]: createHash('sha1').update(json).digest('hex').slice(0, 16) };
  }
  manifest.updated = updated;
  manifest.total = Object.values(manifest.tiles as Record<string, number>).reduce((a, b) => a + b, 0);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`low clearances: ${extras.h}, dump stations: ${extras.d}`);
  console.log(`features read: ${read}, kept: ${kept}, tiles written: ${tiles.size}, library total: ${manifest.total}`);
}

if (process.argv[1]?.endsWith('build-parking-library.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
