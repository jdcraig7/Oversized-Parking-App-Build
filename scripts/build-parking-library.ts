// Builds the parking library tiles from an OpenStreetMap extract.
//
//   scripts/build-parking-library.sh <region.osm.pbf> <output-dir>
//
// The shell wrapper filters the extract with osmium and exports GeoJSON lines;
// this script turns each feature into a tile record, keeps only what the app
// would show, and writes <output-dir>/v1/<lat>/<lon>.json plus manifest.json.
// Running it again with another region adds to the same output directory.

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

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
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(tile));
    manifest.tiles[key] = tile.records.length;
  }
  manifest.updated = updated;
  manifest.total = Object.values(manifest.tiles as Record<string, number>).reduce((a, b) => a + b, 0);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`features read: ${read}, kept: ${kept}, tiles written: ${tiles.size}, library total: ${manifest.total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
