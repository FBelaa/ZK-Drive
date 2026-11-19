import { onRequest } from './functions/api/[[route]].js';

// Workers KV statt R2: gleiche Schnittstelle (get/put/delete), die die API erwartet.
const kv = ns => ({
  async get(k) { const b = await ns.get(k, 'arrayBuffer'); return b && { size: b.byteLength, body: new Response(b).body }; },
  put: (k, v) => ns.put(k, v),
  delete: ks => Promise.all([].concat(ks).map(k => ns.delete(k)))
});

export default {
  fetch(request, env, ctx) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const e = Object.assign(Object.create(env), { BUCKET: kv(env.FILES) });
    return onRequest({ request, env: e, waitUntil: p => ctx.waitUntil(p) });
  }
};
