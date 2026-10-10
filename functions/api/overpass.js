// Same-origin proxy for OpenStreetMap Overpass queries (browsers are blocked by some Overpass servers).
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
export async function onRequestPost({ request }) {
  const body = await request.text();
  if (body.length > 4000) return new Response('query too large', { status: 413 });
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
        if (t.trim().startsWith('{')) return new Response(t, { headers: { 'Content-Type': 'application/json' } });
        last = 'non-json from ' + url;
      } else last = 'HTTP ' + r.status + ' from ' + url;
    } catch (e) { last = String(e); }
  }
  return new Response(JSON.stringify({ error: last }), { status: 502, headers: { 'Content-Type': 'application/json' } });
}
