// Publishes a built parking library to Cloudflare (free tier): tiles go into
// a KV namespace and library-worker/worker.js serves them on workers.dev.
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx tsx scripts/deploy-parking-library.ts parking-library/ [--dry-run]
//
// Token needs Workers Scripts: Edit and Workers KV Storage: Edit. Tiles are
// packed into bundles and only changed bundles are written (KV free tier:
// 1,000 writes/day; MAX_WRITES caps one run, default 900).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { LibraryManifest } from '../src/lib/tiles';
import { bundleKeyOf, makeBundles } from './library-bundles';

const NAME = 'oversized-parking-library';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const dir = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_WRITES = Number(process.env.MAX_WRITES ?? 900);
const MAX_DELETES = 900;
if (!account || !token || !dir) {
  console.error('usage: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... deploy-parking-library.ts <library-dir>');
  process.exit(2);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const body = (await res.json()) as { success: boolean; result: T; errors: { message: string }[] };
  if (!body.success) throw new Error(`${init.method ?? 'GET'} ${path}: ${body.errors.map((e) => e.message).join('; ')}`);
  // Bulk writes can "succeed" while individual keys fail (e.g. the daily write limit).
  const failed = (body.result as { unsuccessful_keys?: string[] } | null)?.unsuccessful_keys ?? [];
  if (failed.length) throw new Error(`${init.method ?? 'GET'} ${path}: ${failed.length} keys not written (${failed.slice(0, 5).join(', ')}...)`);
  return body.result;
}

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(root, e.name)) : e.name.endsWith('.json') ? [join(root, e.name)] : [],
  );
}

async function main() {
  // 1. The KV namespace (created once).
  const namespaces = await cf<{ id: string; title: string }[]>('/storage/kv/namespaces?per_page=100');
  const ns =
    namespaces.find((n) => n.title === NAME) ??
    (await cf<{ id: string; title: string }>('/storage/kv/namespaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: NAME }),
    }));
  const kv = `/storage/kv/namespaces/${ns.id}`;
  const read = (key: string) =>
    fetch(`${api}${kv}/values/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
      r.ok ? r.text() : null,
    );

  // 2. Pack tiles into bundles; write only bundles that changed (KV free
  // tier: 1,000 writes/day, so at most MAX_WRITES per run; the rest go out on
  // the next run and the manifest keeps their old version until then).
  const tileFiles = new Map(files(dir).map((f) => [relative(dir, f).split('\\').join('/'), readFileSync(f, 'utf8')]));
  const built = JSON.parse(tileFiles.get('manifest.json') ?? 'null') as LibraryManifest | null;
  if (!built) throw new Error(`${dir}/manifest.json missing`);
  const bundles = makeBundles(tileFiles);
  const published: Record<string, string> = JSON.parse((await read('_bundles.json')) ?? '{}');
  const oldManifest = JSON.parse((await read('manifest.json')) ?? 'null') as LibraryManifest | null;
  // New areas first, then updates.
  const changed = [...bundles.entries()]
    .filter(([b, x]) => published[b] !== x.hash)
    .sort(([a], [b]) => Number(a in published) - Number(b in published));
  const toWrite = changed.slice(0, MAX_WRITES);
  console.log(`bundles: ${bundles.size}, changed: ${changed.length}, writing now: ${toWrite.length}`);
  if (DRY_RUN) return;

  let batch: { key: string; value: string; base64: true }[] = [];
  let size = 0;
  const flush = async () => {
    if (batch.length) await cf(`${kv}/bulk`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) });
    batch = [];
    size = 0;
  };
  for (const [b, x] of toWrite) {
    const value = x.data.toString('base64');
    if (size + value.length > 40_000_000) await flush();
    batch.push({ key: `b/${b}@${x.hash}`, value, base64: true });
    size += value.length;
  }
  await flush();
  const replaced = toWrite.filter(([b]) => published[b]).map(([b]) => `b/${b}@${published[b]}`);
  for (const [b, x] of toWrite) published[b] = x.hash;

  // The manifest lists each tile with its bundle's hash. Tiles of bundles not
  // written yet keep their entry from the live manifest.
  const manifest: LibraryManifest = { ...built, tiles: {}, hashes: {} };
  for (const [b, x] of bundles) {
    if (published[b] === x.hash) {
      for (const t of x.tiles) {
        manifest.tiles[t] = built.tiles[t];
        manifest.hashes![t] = x.hash;
      }
    } else if (oldManifest) {
      // Not written yet: keep serving what's live (an older bundle, or tiles
      // stored one per key from before bundles).
      for (const [t, n] of Object.entries(oldManifest.tiles)) {
        if (bundleKeyOf(t) === b) {
          manifest.tiles[t] = n;
          const h = published[b] ?? oldManifest.hashes?.[t];
          if (h) manifest.hashes![t] = h;
        }
      }
    }
  }
  manifest.total = Object.values(manifest.tiles).reduce((a, n) => a + n, 0);
  const finalWrites = [
    { key: '_bundles.json', value: JSON.stringify(published) },
    { key: 'manifest.json', value: JSON.stringify(manifest) },
  ];
  const privacy = readFileSync(new URL('../library-worker/privacy.html', import.meta.url), 'utf8');
  if ((await read('site/privacy.html')) !== privacy) finalWrites.push({ key: 'site/privacy.html', value: privacy });
  await cf(`${kv}/bulk`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalWrites) });
  console.log(`KV: ${toWrite.length} bundles written, ${toWrite.length + finalWrites.length} writes; library total ${manifest.total}`);
  if (changed.length > toWrite.length) console.log(`${changed.length - toWrite.length} bundles left for the next run (daily write limit)`);

  // Old bundle versions and pre-bundle tile keys are deleted (deletes have
  // their own 1,000/day allowance). Phones still holding an old manifest get
  // the current bundle (see worker.js).
  const allWritten = changed.length === toWrite.length;
  const legacy = allWritten ? (await cf<{ name: string }[]>(`${kv}/keys?prefix=v1/&limit=1000`)).map((k) => k.name) : [];
  const deletes = [...replaced, ...legacy, ...(allWritten ? ['_hashes.json'] : [])].slice(0, MAX_DELETES);
  if (deletes.length) {
    await cf(`${kv}/bulk`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deletes) });
    console.log(`KV: ${deletes.length} old keys deleted`);
  }

  // 3. The Worker that serves them.
  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({
      main_module: 'worker.js',
      compatibility_date: '2026-10-01',
      bindings: [{ type: 'kv_namespace', name: 'LIBRARY', namespace_id: ns.id }],
    }),
  );
  form.append('worker.js', new Blob([readFileSync(new URL('../library-worker/worker.js', import.meta.url), 'utf8')], { type: 'application/javascript+module' }), 'worker.js');
  await cf(`/workers/scripts/${NAME}`, { method: 'PUT', body: form });

  // 4. A public workers.dev address.
  let sub = await cf<{ subdomain: string }>('/workers/subdomain').catch(() => null);
  if (!sub?.subdomain) {
    sub = await cf<{ subdomain: string }>('/workers/subdomain', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain: `oversized-parking-${account!.slice(0, 6)}` }),
    });
  }
  await cf(`/workers/scripts/${NAME}/subdomain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, previews_enabled: false }),
  });
  console.log(`Library URL: https://${NAME}.${sub.subdomain}.workers.dev`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
