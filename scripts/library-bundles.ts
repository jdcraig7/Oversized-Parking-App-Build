// Packs tile files into bundles (see library-worker/worker.js for the format
// and why). Used by deploy-parking-library.ts.

import { createHash } from 'node:crypto';

import { BUNDLE_TILES } from '../src/lib/tiles';

export function bundleKeyOf(tileKey: string): string {
  const [la, lo] = tileKey.split('/').map(Number);
  return `${Math.floor(la / BUNDLE_TILES)}/${Math.floor(lo / BUNDLE_TILES)}`;
}

/** "<10-digit header length>\n<header JSON><tile bytes>..." */
export function packBundle(tiles: [key: string, json: string][]): Buffer {
  const index: Record<string, [number, number]> = {};
  const parts: Buffer[] = [];
  let offset = 0;
  for (const [key, json] of [...tiles].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const bytes = Buffer.from(json, 'utf8');
    index[key] = [offset, bytes.length];
    parts.push(bytes);
    offset += bytes.length;
  }
  const header = Buffer.from(JSON.stringify(index), 'utf8');
  return Buffer.concat([Buffer.from(`${String(header.length).padStart(10, '0')}\n`, 'utf8'), header, ...parts]);
}

export const bundleHash = (bundle: Buffer) => createHash('sha1').update(bundle).digest('hex').slice(0, 16);

/** Groups tile files ("v1/<lat>/<lon>.json" -> JSON) into packed bundles. */
export function makeBundles(tileFiles: Map<string, string>): Map<string, { data: Buffer; hash: string; tiles: string[] }> {
  const groups = new Map<string, [string, string][]>();
  for (const [path, json] of tileFiles) {
    const m = /^v1\/(-?\d+\/-?\d+)\.json$/.exec(path);
    if (!m) continue;
    const b = bundleKeyOf(m[1]);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push([m[1], json]);
  }
  const out = new Map<string, { data: Buffer; hash: string; tiles: string[] }>();
  for (const [b, tiles] of groups) {
    const data = packBundle(tiles);
    out.set(b, { data, hash: bundleHash(data), tiles: tiles.map(([k]) => k) });
  }
  return out;
}
