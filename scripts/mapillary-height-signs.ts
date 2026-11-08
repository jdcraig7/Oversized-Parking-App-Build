// Finds Mapillary-detected height-restriction signs near garages in the
// parking library, as leads for research: someone reads the number in the
// linked photo and adds it to research/garages.csv with source "sign".
// Mapillary imagery is CC BY-SA 4.0; credit "© Mapillary contributors".
//
//   MAPILLARY_TOKEN=MLY|... npx tsx scripts/mapillary-height-signs.ts <library-dir> <south> <west> <north> <east> [out.csv]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { distanceMeters } from '../src/lib/geo';
import { kindLabel, parseOverpass } from '../src/lib/osm';
import { recordToElement, type ParkingTile } from '../src/lib/tiles';

const COVERED = new Set(['garage', 'underground', 'rooftop', 'carport']);
const MATCH_METERS = 60;
// Mapillary allows at most 0.01 square degrees per query, and large areas
// time out or come back partial, so the area is searched in small cells.
const CELL = 0.02;
const PARALLEL = 4;
// Mapillary's class for height-restriction signs. An unknown class name makes
// the API ignore the filter and return everything, so results are re-checked.
const HEIGHT_SIGN = 'warning--height-restriction--g2';
const token = process.env.MAPILLARY_TOKEN;

interface Sign { id: string; value: string; lat: number; lon: number; lastSeen: string }

async function mly<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://graph.mapillary.com/${path}`, { headers: { Authorization: `OAuth ${token}` } });
    if (res.ok) return (await res.json()) as T;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Mapillary request failed: ${path}`);
}

async function signsIn(s: number, w: number, n: number, e: number): Promise<{ signs: Sign[]; failedCells: number }> {
  const cells: string[] = [];
  for (let lat = s; lat < n; lat += CELL) {
    for (let lon = w; lon < e; lon += CELL) {
      cells.push([lon, lat, Math.min(lon + CELL, e), Math.min(lat + CELL, n)].map((v) => v.toFixed(5)).join(','));
    }
  }
  const signs = new Map<string, Sign>();
  let failedCells = 0;
  let next = 0;
  const worker = async () => {
    while (next < cells.length) {
      const bbox = cells[next++];
      try {
        const page = await mly<{ data: { id: string; object_value: string; geometry: { coordinates: [number, number] }; last_seen_at: string }[] }>(
          `map_features?fields=id,object_value,geometry,last_seen_at&object_values=${HEIGHT_SIGN}&bbox=${bbox}&limit=2000`,
        );
        for (const f of page.data) {
          if (f.object_value !== HEIGHT_SIGN) continue;
          signs.set(f.id, { id: f.id, value: f.object_value, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], lastSeen: f.last_seen_at });
        }
      } catch {
        failedCells++;
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return { signs: [...signs.values()], failedCells };
}

async function main() {
  const [lib, ...rest] = process.argv.slice(2);
  const [s, w, n, e] = rest.slice(0, 4).map(Number);
  const outFile = rest[4];
  if (!token || !lib || [s, w, n, e].some((v) => !Number.isFinite(v))) {
    console.error('usage: MAPILLARY_TOKEN=... mapillary-height-signs.ts <library-dir> <south> <west> <north> <east> [out.csv]');
    process.exit(2);
  }

  // Garages in the area whose clearance we don't know yet.
  const elements = [];
  for (const a of readdirSync(join(lib, 'v1'))) {
    for (const f of readdirSync(join(lib, 'v1', a))) {
      const tile = JSON.parse(readFileSync(join(lib, 'v1', a, f), 'utf8')) as ParkingTile;
      elements.push(...tile.records.filter((r) => r[2] >= s && r[2] <= n && r[3] >= w && r[3] <= e).map(recordToElement));
    }
  }
  const garages = parseOverpass({ elements }).filter((g) => COVERED.has(g.kind) && g.access !== 'restricted');
  const unknown = garages.filter((g) => g.clearance.status === 'unknown');

  const { signs, failedCells } = await signsIn(s, w, n, e);
  const rows: string[][] = [];
  for (const sign of signs) {
    const near = garages
      .map((g) => ({ g, d: distanceMeters({ latitude: sign.lat, longitude: sign.lon }, g) }))
      .filter((x) => x.d <= MATCH_METERS)
      .sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    const imgs = await mly<{ images?: { data: { id: string }[] } }>(`${sign.id}?fields=images`).catch(() => ({ images: undefined }));
    const image = imgs.images?.data[0]?.id;
    rows.push([
      near.g.id.replace('osm:', ''),
      near.g.name,
      kindLabel(near.g.kind),
      near.g.clearance.status,
      String(Math.round(near.d)),
      sign.value,
      sign.lastSeen.slice(0, 10),
      image ? `https://www.mapillary.com/app/?pKey=${image}` : '',
    ]);
  }

  console.log(`area: ${garages.length} garages (${unknown.length} with unknown clearance); ${signs.length} height signs detected; ${rows.length} near a garage${failedCells ? `; ${failedCells} cells failed` : ''}`);
  for (const r of rows) console.log(' ', r.join(' | '));
  if (outFile) {
    const csv = [['osm_id', 'name', 'kind', 'clearance_now', 'meters_from_sign', 'sign', 'photo_date', 'photo'], ...rows]
      .map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))
      .join('\n');
    writeFileSync(outFile, csv + '\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
