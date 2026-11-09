// Fetches parking for states that the OpenStreetMap extract mirror doesn't
// carry (Alaska and Hawaii) from the Overpass API, and writes them in the same
// GeoJSON-sequence format as `osmium export --add-unique-id=type_id`, so the
// library builder reads them like any other region.
//
//   npx tsx scripts/fetch-overpass-states.ts out.geojsonseq [US-AK US-HI ...]

import { writeFileSync } from 'node:fs';

const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

interface Element {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** osmium's ids: n<id>, w<id>, and a<2*id+1> for relation areas. */
export function toFeatureLine(e: Element): string | null {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat === undefined || lon === undefined || !e.tags) return null;
  const id = e.type === 'node' ? `n${e.id}` : e.type === 'way' ? `w${e.id}` : `a${2 * e.id + 1}`;
  return JSON.stringify({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: e.tags });
}

async function query(states: string[]): Promise<Element[]> {
  const areas = states.map((s) => `area["ISO3166-2"="${s}"];`).join('');
  const q = `[out:json][timeout:600];(${areas})->.s;(nwr["amenity"="parking"](area.s);nwr["amenity"="fuel"]["hgv"~"^(yes|designated)$"](area.s);nwr["amenity"="sanitary_dump_station"](area.s);way["highway"]["maxheight"](area.s);node["barrier"="height_restrictor"](area.s);node["amenity"="parking_entrance"](area.s););out tags center;`;
  let last: unknown;
  for (const server of SERVERS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(server, { method: 'POST', body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(660_000) });
        if (!res.ok) throw new Error(`${server}: HTTP ${res.status}`);
        const body = (await res.json()) as { elements: Element[]; remark?: string };
        if (body.remark && /error|timed out/i.test(body.remark)) throw new Error(`${server}: ${body.remark}`);
        return body.elements;
      } catch (e) {
        last = e;
        console.error(String(e));
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
  }
  throw last;
}

async function main() {
  const [out, ...args] = process.argv.slice(2);
  if (!out) {
    console.error('usage: fetch-overpass-states.ts <out.geojsonseq> [US-AK US-HI ...]');
    process.exit(2);
  }
  const states = args.length ? args : ['US-AK', 'US-HI'];
  const elements = await query(states);
  const lines = elements.map(toFeatureLine).filter((l): l is string => l !== null);
  if (lines.length < 100) throw new Error(`only ${lines.length} places for ${states.join(', ')}; refusing to continue`);
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`${states.join(', ')}: ${lines.length} places`);
}

if (process.argv[1]?.endsWith('fetch-overpass-states.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
