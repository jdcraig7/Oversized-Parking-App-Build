// Serves the parking library (manifest.json and v1/<lat>/<lon>.json tiles)
// from Cloudflare KV. Deployed by scripts/deploy-parking-library.ts.
const KEY = /^(manifest\.json|v1\/-?\d+\/-?\d+\.json)$/;

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const key = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!KEY.test(key)) return new Response('Not found', { status: 404 });
    const body = await env.LIBRARY.get(key, { cacheTtl: 3600 });
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': key === 'manifest.json' ? 'public, max-age=3600' : 'public, max-age=86400',
    };
    if (body === null) return new Response('Not found', { status: 404, headers });
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};
