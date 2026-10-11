// Same-origin proxy for OpenStreetMap Overpass queries (browsers are blocked by some Overpass servers).
const MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
export async function onRequestPost({ request }) {
  const body = await request.text();
  if (body.length > 4000) return new Response('query too large', { status: 413 });
  const cache = caches.default;
  const key = new Request('https://cartroute.cache/overpass?q=' + encodeURIComponent(body));
  const hit = await cache.match(key);
  if (hit) return hit;
  let last = 'no response';
  for (const url of [...MIRRORS, ...MIRRORS]) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CartRoute/1.0 (cartroute.pages.dev)', Accept: '*/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const t = await r.text();
        if (t.trim().startsWith('{') && !/"remark"/.test(t.slice(0, 2000))) {
          const res = new Response(t, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
          await cache.put(key, res.clone());
          return res;
        }
        last = 'bad response from ' + url;
      } else last = 'HTTP ' + r.status + ' from ' + url;
    } catch (e) { last = String(e); }
  }
  return new Response(JSON.stringify({ error: last }), { status: 502, headers: { 'Content-Type': 'application/json' } });
}
