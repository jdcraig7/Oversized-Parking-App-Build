// Publishes a built parking library to Cloudflare (free tier): tiles go into
// a KV namespace and library-worker/worker.js serves them on workers.dev.
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx tsx scripts/deploy-parking-library.ts parking-library/
//
// Token needs Workers Scripts: Edit and Workers KV Storage: Edit. Only files
// that changed since the last deploy are written (KV free tier: 1,000 writes/day).

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const NAME = 'oversized-parking-library';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const dir = process.argv[2];
if (!account || !token || !dir) {
  console.error('usage: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... deploy-parking-library.ts <library-dir>');
  process.exit(2);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const body = (await res.json()) as { success: boolean; result: T; errors: { message: string }[] };
  if (!body.success) throw new Error(`${init.method ?? 'GET'} ${path}: ${body.errors.map((e) => e.message).join('; ')}`);
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

  // 2. Write only changed files; a hash index in KV remembers what's there.
  const indexKey = '_hashes.json';
  const old: Record<string, string> = await fetch(`${api}/storage/kv/namespaces/${ns.id}/values/${indexKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => (r.ok ? r.json() : {}));
  const all = files(dir).map((f) => {
    const value = readFileSync(f, 'utf8');
    return { key: relative(dir, f).split('\\').join('/'), value, hash: createHash('sha1').update(value).digest('hex') };
  });
  // Tiles first, manifest last, so the app never sees a manifest listing missing tiles.
  const changed = all.filter((f) => old[f.key] !== f.hash).sort((a, b) => Number(a.key === 'manifest.json') - Number(b.key === 'manifest.json'));
  const hashes = Object.fromEntries(all.map((f) => [f.key, f.hash]));
  const writes = [...changed.map(({ key, value }) => ({ key, value })), { key: indexKey, value: JSON.stringify(hashes) }];
  for (let i = 0; i < writes.length; i += 5000) {
    await cf(`/storage/kv/namespaces/${ns.id}/bulk`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(writes.slice(i, i + 5000)),
    });
  }
  console.log(`KV: ${changed.length} of ${all.length} files changed and written`);

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
