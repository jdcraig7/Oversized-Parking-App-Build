// Serves the parking library (manifest.json and v1/<lat>/<lon>.json tiles)
// from Cloudflare KV. Deployed by scripts/deploy-parking-library.ts.
// The app asks for tiles as v1/<lat>/<lon>.json?v=<hash>, so a changed tile
// has a new URL; reads re-check KV every minute so updates show quickly.
const KEY = /^(manifest\.json|v1\/-?\d+\/-?\d+\.json)$/;

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const key = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!KEY.test(key)) return new Response('Not found', { status: 404 });
    const isManifest = key === 'manifest.json';
    const body = await env.LIBRARY.get(key, { cacheTtl: 60 });
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isManifest ? 'public, max-age=300' : 'public, max-age=86400',
    };
    if (body === null) return new Response('Not found', { status: 404, headers });
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};
