// Serves the parking library from Cloudflare KV. Deployed by
// scripts/deploy-parking-library.ts.
//
//   manifest.json                  the library index
//   v1/<lat>/<lon>.json?v=<hash>   one tile (what the app asks for)
//   privacy                        the app's privacy policy page
//
// To stay inside KV's free 1,000 writes/day, tiles are stored in bundles of
// BUNDLE x BUNDLE tiles (about 2 degrees square), each under the KV key
// "b/<bundle>@<bundle hash>". A tile's ?v= is its bundle's hash, so a request
// names an exact, never-changing KV value and no cache can serve a stale one.
// If that version was already replaced (a phone with an older manifest), the
// current bundle from "_bundles.json" is used instead.

/** Tiles per bundle side. Must match BUNDLE_TILES in src/lib/tiles.ts. */
export const BUNDLE = 8;
const TILE = /^v1\/(-?\d+)\/(-?\d+)\.json$/;

export const bundleKeyOf = (latIdx, lonIdx) => `${Math.floor(latIdx / BUNDLE)}/${Math.floor(lonIdx / BUNDLE)}`;

/**
 * A bundle is "<10-digit header length>\n<header JSON><tile><tile>...", where
 * the header maps tile keys to [byte offset, byte length] after the header.
 * Returns the tile's bytes, or null if the bundle doesn't hold it.
 */
export function tileFromBundle(buffer, tileKey) {
  const bytes = new Uint8Array(buffer);
  const headerLength = Number(new TextDecoder().decode(bytes.subarray(0, 10)));
  const index = JSON.parse(new TextDecoder().decode(bytes.subarray(11, 11 + headerLength)));
  const entry = index[tileKey];
  if (!entry) return null;
  const start = 11 + headerLength + entry[0];
  return bytes.slice(start, start + entry[1]);
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');
    const reply = (body, type, cache) =>
      new Response(request.method === 'HEAD' ? null : body, {
        headers: { ...CORS, 'Content-Type': type, 'Cache-Control': cache },
      });
    const notFound = () => new Response('Not found', { status: 404, headers: CORS });

    if (path === 'manifest.json') {
      const body = await env.LIBRARY.get('manifest.json', { cacheTtl: 60 });
      return body === null ? notFound() : reply(body, 'application/json', 'public, max-age=300');
    }
    if (path === 'privacy' || path === 'privacy.html') {
      const body = await env.LIBRARY.get('site/privacy.html', { cacheTtl: 300 });
      return body === null ? notFound() : reply(body, 'text/html; charset=utf-8', 'public, max-age=3600');
    }

    const m = TILE.exec(path);
    if (!m) return notFound();
    const tileKey = `${m[1]}/${m[2]}`;
    const bundle = bundleKeyOf(Number(m[1]), Number(m[2]));
    const version = url.searchParams.get('v');

    let buffer = null;
    if (version && /^[0-9a-f]{16}$/.test(version)) {
      buffer = await env.LIBRARY.get(`b/${bundle}@${version}`, { type: 'arrayBuffer', cacheTtl: 86400 });
    }
    if (buffer === null) {
      const current = await env.LIBRARY.get('_bundles.json', { type: 'json', cacheTtl: 60 });
      const hash = current?.[bundle];
      if (hash) buffer = await env.LIBRARY.get(`b/${bundle}@${hash}`, { type: 'arrayBuffer', cacheTtl: 86400 });
    }
    if (buffer !== null) {
      const tile = tileFromBundle(buffer, tileKey);
      return tile ? reply(tile, 'application/json', 'public, max-age=86400') : notFound();
    }
    // Tiles stored one per key, from before bundles.
    const legacy = await env.LIBRARY.get(path, { cacheTtl: 60 });
    return legacy === null ? notFound() : reply(legacy, 'application/json', 'public, max-age=86400');
  },
};
