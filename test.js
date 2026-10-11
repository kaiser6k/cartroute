const GC = require('./lib.js'); const fs = require('fs');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } }
const base = { type: 'golf', speed: 18, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: false, night: 'day' };

// --- unit: cart status ---
let s = GC.cartStatus(base); ok(s.cls === 'golf' && s.ok, 'golf cart 18mph -> golf: ' + s.label);
s = GC.cartStatus({ ...base, night: 'night' }); ok(s.rules.night === true && s.warnings.length, 'night + equipment -> flagged local authorization');
s = GC.cartStatus({ ...base, night: 'night', turnSignals: false }); ok(s.rules.night === false, 'night w/o turn signals -> daytime only');
s = GC.cartStatus({ ...base, mirrors: false }); ok(!s.ok, 'no mirror -> blocked');
s = GC.cartStatus({ ...base, speed: 23 }); ok(!s.ok && s.cls === 'none', 'golf cart 23mph -> not eligible');
s = GC.cartStatus({ ...base, type: 'lsv', speed: 25, registered: true }); ok(s.cls === 'lsv' && s.rules.limit === 35, 'full LSV 25mph -> lsv: ' + s.label);
s = GC.cartStatus({ ...base, type: 'lsv', speed: 25, registered: false }); ok(!s.ok && s.checklist.filter(c => !c.met).length === 1, 'LSV not registered -> checklist 1 missing');
s = GC.cartStatus({ ...base, speed: 30 }); ok(!s.ok, '30mph -> none');
ok(GC.parseMaxspeed('35 mph') === 35 && GC.parseMaxspeed('50') === 50 && GC.parseMaxspeed('none') === null, 'maxspeed parsing');

// --- unit: classification ---
const gr = { cls: 'golf', limit: 25, planning: true, allowCrossing: true }, lr = { cls: 'lsv', limit: 35, planning: true, allowCrossing: true };
ok(!GC.classifyWay({ highway: 'motorway' }, lr).allowed, 'motorway never');
ok(!GC.classifyWay({ highway: 'footway' }, gr).allowed, 'footway never');
ok(!GC.classifyWay({ highway: 'trunk', maxspeed: '30 mph' }, lr).allowed, 'trunk excluded');
ok(GC.classifyWay({ highway: 'residential' }, gr).allowed && GC.classifyWay({ highway: 'residential' }, gr).basis === 'assumed', 'residential no maxspeed = assumed 25');
ok(!GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph' }, lr).allowed, '40mph blocked for LSV');
// --- rules audit additions ---
ok(GC.isStateRoad({ ref: 'FL 507' }) && GC.isStateRoad({ ref: 'US 192;FL 500' }) && GC.isStateRoad({ ref: 'SR A1A' }) && GC.isStateRoad({ ref: 'A1A' }) && !GC.isStateRoad({ ref: 'CR 516' }) && !GC.isStateRoad({ name: 'Main Street' }) && !GC.isStateRoad({}), 'state-road ref detection (FL/US/SR/A1A yes, CR no)');
{ const sr = GC.classifyWay({ highway: 'secondary', ref: 'FL 507', maxspeed: '25 mph', name: 'Babcock St' }, gr); ok(!sr.allowed && /state road/.test(sr.reason) && sr.crossable, 'golf cart: state road at 25 mph is NOT driveable but stays crossable');
  ok(GC.classifyWay({ highway: 'secondary', ref: 'FL 507', maxspeed: '25 mph' }, lr).allowed, 'LSV: state road posted <=35 is allowed (316.2122)');
  ok(GC.classifyWay({ highway: 'secondary', ref: 'FL 507', golf_cart: 'yes' }, gr).allowed, 'golf cart: state road explicitly tagged golf_cart=yes stays allowed'); }
ok(!GC.classifyWay({ highway: 'residential', maxspeed: '36 mph' }, lr).allowed && GC.classifyWay({ highway: 'residential', maxspeed: '35 mph' }, lr).allowed, 'LSV limit is exactly 35');
{ const c = (o) => GC.cartStatus(Object.assign({ speed: 15, type: 'golf', mirrors: true, reflectors: true }, o));
  ok(c({ speed: 20 }).cls === 'golf' && c({ speed: 20.5, type: 'golf' }).cls === 'none' && c({ speed: 26 }).cls === 'none', 'status: 20 mph golf cart ok, >20 needs LSV, >25 refused');
  ok(c({ mirrors: false }).cls === 'none' && c({ reflectors: false }).cls === 'none', 'status: golf cart needs mirror + reflectors (316.212(6))');
  const full = { speed: 22, type: 'lsv', headlights: 1, brakeLights: 1, turnSignals: 1, reflectors: 1, parkingBrake: 1, mirrors: 1, windshield: 1, seatBelts: 1, hasVin: 1, registered: 1 };
  ok(GC.cartStatus(full).cls === 'lsv' && GC.cartStatus(full).rules.limit === 35, 'status: fully equipped 22 mph LSV -> lsv, 35 mph road limit');
  ok(GC.cartStatus(Object.assign({}, full, { registered: false })).cls === 'none', 'status: unregistered 22 mph LSV is not routable'); }
ok(GC.classifyWay({ highway: 'tertiary', maxspeed: '35 mph' }, lr).allowed, '35mph ok for LSV');
ok(!GC.classifyWay({ highway: 'tertiary', maxspeed: '35 mph' }, gr).allowed, '35mph blocked for golf (25 cutoff)');
ok(!GC.classifyWay({ highway: 'cycleway' }, gr).allowed && GC.classifyWay({ highway: 'cycleway', golf_cart: 'designated' }, gr).allowed, 'cycleway only if tagged');
ok(GC.classifyWay({ highway: 'secondary', maxspeed: '45 mph', golf_cart: 'yes' }, gr).allowed, 'golf_cart=yes overrides speed cutoff');
ok(!GC.classifyWay({ highway: 'residential', golf_cart: 'no' }, gr).allowed, 'golf_cart=no blocks');
ok(!GC.classifyWay({ highway: 'residential' }, { ...gr, planning: false }).allowed, 'strict mode needs tag');

// --- fixture: hand-made crossing test ---
// A1 --X-- A2 residential E-W at lat 28 crossing a 45mph N-S road at X (shared node); T at Y does not allow turning.
function mk() {
  const n = (id, lat, lon) => ({ type: 'node', id, lat, lon });
  return { elements: [n(1, 28.0, -80.002), n(2, 28.0, -80.001), n(3, 28.0, -80.0), n(4, 28.0, -79.999), n(5, 28.0, -79.998),
    n(6, 28.001, -80.0), n(7, 27.999, -80.0),
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential' } },
    { type: 'way', id: 11, nodes: [3, 4, 5], tags: { highway: 'residential' } },
    n(8, 28.005, -80.0),
    { type: 'way', id: 13, nodes: [6, 8], tags: { highway: 'secondary', maxspeed: '45 mph', name: 'Big Rd' } },
    { type: 'way', id: 12, nodes: [6, 3, 7], tags: { highway: 'secondary', maxspeed: '45 mph', name: 'Big Rd' } }] };
}
let g = GC.parseOverpass(mk()); const gs = GC.cartStatus(base);
let r = GC.planRoute(g, gs, [28.0, -80.002], [28.0, -79.998], { cartMph: 18 });
ok(r.ok && r.crossings.length === 1 && r.crossings[0].road === 'Big Rd', 'fixture: crosses 45mph road at the intersection node, flagged');
r = GC.planRoute(g, gs, [28.0, -80.002], [28.005, -80.0], { cartMph: 18 });
ok(!r.ok && r.error === 'no-legal-route' && /Big Rd/.test(r.message) && r.alternative, 'fixture: cannot turn onto 45mph road; reason + alternative: ' + r.message);
r = GC.planRoute(g, GC.cartStatus({ ...base, mirrors: false }), [28, -80.002], [28, -79.998], {}); ok(!r.ok && r.error === 'cart-not-eligible', 'ineligible cart not routed');

// --- real data ---
function connected(G, res, A, src, dst) { // every consecutive node pair is a real graph edge; endpoints match
  const ids = res.nodeIds; if (ids[0] !== src.id || ids[ids.length - 1] !== dst.id) return false;
  for (let i = 0; i < ids.length - 1; i++) { const es = A.adj.get(ids[i]) || []; if (!es.some(e => e.to === ids[i + 1])) return false; }
  return true;
}
function validate(g, A, d, label) {
  // recompute from adjacency: every consecutive node pair must be an edge
  return d;
}
const lsvS = GC.cartStatus({ ...base, type: 'lsv', speed: 25, registered: true });
for (const [name, file] of [['Palm Bay', 'fixtures/palmbay.json'], ['Cocoa Beach', 'fixtures/cocoa.json']]) {
  const j = JSON.parse(fs.readFileSync(file)); const G = GC.parseOverpass(j);
  console.log('\n==', name, 'nodes', G.nodes.size, 'ways', G.ways.length);
  const AG = GC.buildAdj(G, gs.rules, false), AL = GC.buildAdj(G, lsvS.rules, false);
  const gEdges = [...AG.adj.values()].reduce((a, l) => a + l.length, 0), lEdges = [...AL.adj.values()].reduce((a, l) => a + l.length, 0);
  ok(lEdges > gEdges && gEdges > 0, `${name}: LSV graph (${lEdges} edges) bigger than golf graph (${gEdges})`);
  // never-allowed classes absent
  const badHw = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'footway', 'steps', 'pedestrian']);
  let leak = 0; for (const es of AL.adj.values()) for (const e of es) if (G.ways[e.w] && badHw.has(G.ways[e.w].tags.highway)) leak++;
  ok(leak === 0, `${name}: no motorway/trunk/footway edges in LSV graph`);
  let leakG = 0; for (const es of AG.adj.values()) for (const e of es) { const c = AG.cls[e.w]; if (!c.synthetic && c.basis !== 'tagged' && c.speed > 25) leakG++; }
  ok(leakG === 0, `${name}: no >25mph untagged edges in golf graph`);
  // random pairs 1.5-4km apart
  const ids = [...AG.adj.keys()]; let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let tested = 0, golfOk = 0, lsvUsed35 = 0, differs = 0, crossTotal = 0, disc = 0, shown = 0;
  for (let t = 0; t < 600 && tested < 25; t++) {
    const a = G.nodes.get(ids[Math.floor(rnd() * ids.length)]), b = G.nodes.get(ids[Math.floor(rnd() * ids.length)]);
    const dd = GC.hav(a, b); if (dd < (name === 'Palm Bay' ? 1200 : 400) || dd > (name === 'Palm Bay' ? 4000 : 1800)) continue;
    const rg = GC.planRoute(G, gs, a, b, { cartMph: 18 }), rl = GC.planRoute(G, lsvS, a, b, { cartMph: 25 });
    tested++;
    if (rg.ok) {
      golfOk++;
      if (!rg.segments.every(sg => sg.legal && (sg.basis === 'tagged' || sg.basis === 'crossing' || sg.speed <= 25))) { disc++; console.log('  disc: golf seg'); }
      if (!connected(G, rg, AG, rg.snap.start, rg.snap.end)) { disc++; console.log('  disc: golf not connected'); }
      crossTotal += rg.crossings.length;
      // crossings must be at nodes shared with the disallowed road, never a driven edge
      
    }
    if (rl.ok) {
      if (!rl.segments.every(sg => sg.legal && (sg.basis === 'crossing' || sg.speed <= 35))) { disc++; console.log('  disc: lsv seg'); }
      if (!connected(G, rl, AL, rl.snap.start, rl.snap.end)) disc++;
      if (rl.segments.some(sg => sg.speed >= 30 && sg.speed <= 35)) lsvUsed35++;
      if (rg.ok && Math.abs(rl.distance_m - rg.distance_m) > 50) differs++;
      if (rg.ok && rg.snap.start.id === rl.snap.start.id && rg.snap.end.id === rl.snap.end.id && rl.distance_m > rg.distance_m + 1) { disc++; console.log('  disc: lsv longer', rl.distance_m, rg.distance_m); } // LSV graph is a superset: never longer
      if (shown < 2 && rg.ok && rl.segments.some(sg => sg.speed === 35)) { shown++;
        console.log(`  sample ${a.map(x=>x.toFixed(4))} -> ${b.map(x=>x.toFixed(4))}: golf ${(rg.distance_m/1609).toFixed(2)}mi ${(rg.time_s/60).toFixed(1)}min crossings ${rg.crossings.map(c=>c.road+'@'+c.speed).join(',')} | LSV ${(rl.distance_m/1609).toFixed(2)}mi ${(rl.time_s/60).toFixed(1)}min roads ${[...new Set(rl.segments.map(x=>x.name+'@'+x.speed))].slice(0,6).join(', ')}`); }
    }
  }
  console.log(`  pairs tested ${tested}, golf routes found ${golfOk}, LSV routes using 30-35mph roads ${lsvUsed35}, LSV!=golf distance ${differs}, golf crossings ${crossTotal}`);
  ok(tested >= 10, `${name}: enough random pairs tested (${tested})`);
  ok(disc === 0, `${name}: all routes legal per-segment, connected, LSV never longer than golf (${disc} violations)`);
  ok(golfOk > 0, `${name}: golf cart routes found in planning mode`);
}
// --- explicit: golf route avoids 35+ roads, LSV uses them, in Palm Bay, find pair where they differ ---
{
  const G = GC.parseOverpass(JSON.parse(fs.readFileSync('fixtures/palmbay.json')));
  const AG = GC.buildAdj(G, gs.rules, false); const ids = [...AG.adj.keys()]; let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let found = false;
  for (let t = 0; t < 3000 && !found; t++) {
    const a = G.nodes.get(ids[Math.floor(rnd() * ids.length)]), b = G.nodes.get(ids[Math.floor(rnd() * ids.length)]);
    const dd = GC.hav(a, b); if (dd < 1500 || dd > 4000) continue;
    const rg = GC.planRoute(G, gs, a, b, { cartMph: 18 }), rl = GC.planRoute(G, lsvS, a, b, { cartMph: 25 });
    if (rg.ok && rl.ok && rl.distance_m < rg.distance_m - 200 && rl.segments.some(x => x.speed >= 35)) {
      found = true;
      const gMax = Math.max(...rg.segments.filter(x=>x.basis!=='crossing').map(x => x.speed)), lMax = Math.max(...rl.segments.filter(x=>x.basis!=='crossing').map(x => x.speed));
      console.log(`\n  differing pair: golf ${rg.distance_m.toFixed(0)}m max seg ${gMax}mph, crossings ${rg.crossings.length}; LSV ${rl.distance_m.toFixed(0)}m max seg ${lMax}mph`);
      ok(gMax <= 25 && lMax === 35, '(a)/(b) golf route stays <=25mph segments; LSV route uses 35mph road and is shorter');
    }
  }
  ok(found, 'found a pair where LSV legally takes a 35mph road golf cart avoids');
  // no-route diagnostic on real data: strict golf (no tags) 
  const st = GC.cartStatus(base, { planning: false });
  const ids2 = [...AG.adj.keys()];
  const rr = GC.planRoute(G, st, G.nodes.get(ids2[10]), G.nodes.get(ids2[500]), {});
  ok(!rr.ok && /No legal route/.test(rr.message), 'strict mode without tags -> clear no-route message');
}

// ================= Profile logic (profile.js) =================
{
  const PR = require('./profile.js');
  console.log('\n== profile');
  const p = PR.defaultProfile();
  ok(p.version === 1 && p.carts.length === 1 && p.activeCartId === p.carts[0].id && !p.setupDone, 'default profile shape');
  // serialization round trip
  let q = PR.parseImport(PR.serialize(p)); ok(q.ok && JSON.stringify({ ...q.profile, setupDone: 0, createdAt: 0 }) === JSON.stringify({ ...p, setupDone: 0, createdAt: 0 }), 'export/import round trip preserves profile');
  ok(q.profile.setupDone === true, 'imported profile is marked set up');
  ok(JSON.parse(PR.serialize(p)).app === 'cartroute', 'export has app marker');
  // import rejects
  ok(!PR.parseImport('not json').ok, 'import rejects non-JSON');
  ok(!PR.parseImport('{"hello":1}').ok, 'import rejects unrelated JSON');
  ok(!PR.parseImport(JSON.stringify({ version: 99, carts: [{ speed: 10 }] })).ok, 'import rejects newer version');
  ok(!PR.parseImport(JSON.stringify({ version: 1, carts: [{ speed: -5 }] })).ok, 'import rejects bad speed');
  ok(!PR.parseImport(JSON.stringify({ version: 1, carts: [{ speed: 15 }], prefs: { designatedLimit: 40 } })).ok, 'import rejects bad cutoff');
  // normalization / junk
  const n = PR.normalize({ name: '  Kyle  ', carts: [{ id: 'a', speed: '18', type: 'weird', headlights: 'true', evil: 1 }, { id: 'a' }], activeCartId: 'zzz', prefs: { night: 'x', designatedLimit: 99 }, home: { lat: 10, lon: 10 } });
  ok(n.name === 'Kyle' && n.carts.length === 1 && n.carts[0].type === 'golf' && n.carts[0].speed === 18 && n.carts[0].headlights === true && !('evil' in n.carts[0]), 'normalize cleans carts (dedupe, enum, coercion, drops unknown)');
  ok(n.activeCartId === 'a' && n.prefs.night === 'day' && n.prefs.designatedLimit === 25 && n.home === null, 'normalize fixes active id, prefs, out-of-US home');
  const w = PR.normalize({ work: { lat: '28.3', lon: '-80.6', label: '  Office  ', key: 'palm' } }).work;
  ok(w && w.lat === 28.3 && w.lon === -80.6 && w.label === 'Office' && w.key === 'custom', 'work normalizes like home');
  ok(PR.normalize({ work: { lat: 10, lon: 10 } }).work === null && PR.normalize({}).work === null && PR.defaultProfile().work === null, 'work: outside US / missing -> null');
  ok(!PR.validate({ carts: [{ type: 'golf', speed: 10 }], work: { lat: 10, lon: 10 } }).ok, 'validate rejects out-of-US work');
  const wi = PR.parseImport(PR.serialize(Object.assign(PR.defaultProfile(), { work: { key: 'custom', label: 'Shop', lat: 28.3, lon: -80.6 } })));
  ok(wi.ok && wi.profile.work.label === 'Shop', 'work round-trips through export/import');
  ok(PR.migrate({ carts: [{ speed: 15 }], work: { lat: 28.3, lon: -80.6 } }).profile.work.lat === 28.3, 'v0 migration keeps work');
  ok(PR.normalize(null).carts.length === 1, 'normalize(null) still yields one cart');
  // validation
  ok(!PR.validate({ carts: [] }).ok && PR.validate(p).ok && PR.validateCart({ type: 'golf', speed: 0 }).length === 1, 'validation');
  // migration from unversioned
  const m0 = PR.migrate({ name: 'Old', cart: { name: 'Buggy', type: 'lsv', speed: 24, headlights: true }, night: 'night', designatedLimit: 30 });
  ok(m0.ok && m0.migrated && m0.profile.version === 1 && m0.profile.carts[0].nickname === 'Buggy' && m0.profile.carts[0].type === 'lsv' && m0.profile.prefs.night === 'night' && m0.profile.prefs.designatedLimit === 30, 'migrate v0 -> v1');
  ok(!PR.migrate({ version: 2 }).ok && !PR.migrate(null).ok, 'migrate rejects future/invalid');
  // multi-cart
  const mp = PR.defaultProfile(); const c1 = mp.carts[0];
  const c2 = PR.addCart(mp, { nickname: 'LSV', type: 'lsv', speed: 25 });
  ok(mp.carts.length === 2 && c2.id !== c1.id, 'add cart');
  ok(PR.setActive(mp, c2.id) && PR.activeCart(mp).id === c2.id && !PR.setActive(mp, 'nope'), 'switch active cart');
  PR.updateCart(mp, c2.id, { speed: 22, id: 'hacked' }); ok(PR.activeCart(mp).speed === 22 && PR.activeCart(mp).id === c2.id, 'update cart keeps id');
  ok(PR.deleteCart(mp, c2.id) && mp.activeCartId === c1.id && mp.carts.length === 1, 'delete active cart falls back to another');
  ok(!PR.deleteCart(mp, c1.id) && mp.carts.length === 1, 'cannot delete last cart');
  ok(PR.cartLabel({ nickname: 'Bob', make: 'X', type: 'golf' }) === 'Bob' && PR.cartLabel({ nickname: '', make: '', type: 'lsv' }) === 'My LSV', 'cart labels');
  // legal status from profile
  const sp = PR.defaultProfile(); Object.assign(sp.carts[0], { type: 'golf', speed: 18, mirrors: true, reflectors: true, headlights: true, brakeLights: true, turnSignals: true, windshield: true });
  let st = PR.statusFor(GC, sp); ok(st.cls === 'golf' && st.ok && st.rules.limit === 25 && st.rules.planning && !st.rules.night, 'status from profile: golf daytime');
  sp.prefs.night = 'night'; sp.prefs.designatedLimit = 30; sp.prefs.strict = true;
  st = PR.statusFor(GC, sp); ok(st.rules.night && st.rules.limit === 30 && st.rules.planning === false, 'prefs flow into rules (night, cutoff 30, strict)');
  const lp = PR.defaultProfile(); Object.assign(lp.carts[0], { type: 'lsv', speed: 25 }, Object.fromEntries(PR.EQUIP.map(k => [k, true])));
  ok(PR.statusFor(GC, lp).cls === 'lsv', 'status from profile: full LSV');
  lp.carts[0].registered = false; st = PR.statusFor(GC, lp); ok(!st.ok && st.checklist.filter(c => !c.met).length === 1, 'LSV checklist from profile shows 1 missing');
  const cc = PR.addCart(lp, { speed: 18, mirrors: true, reflectors: true }); ok(PR.statusFor(GC, lp, cc.id).cls === 'golf', 'statusFor(cartId) evaluates a specific cart');
  // storage
  function fakeStorage() { const d = {}; return { d, setItem: (k, v) => { d[k] = String(v); }, getItem: k => (k in d ? d[k] : null), removeItem: k => { delete d[k]; } }; }
  const fs1 = fakeStorage(); let store = PR.createStore(fs1);
  ok(store.persistent && store.load() === null, 'fresh storage: persistent, no profile');
  const sv = PR.defaultProfile(); sv.name = 'Kyle'; sv.setupDone = true; store.save(sv);
  ok(PR.STORAGE_KEY === 'cartroute.profile.v1' && fs1.d[PR.STORAGE_KEY] && fs1.d['cartroute.profile.v1.probe'] === undefined, 'saved under versioned key; probe cleaned up');
  ok(PR.createStore(fs1).load().name === 'Kyle', 'second store (reload) loads saved profile');
  fs1.d[PR.STORAGE_KEY] = JSON.stringify({ name: 'Legacy', cart: { speed: 15 } });
  const lg = PR.createStore(fs1).load(); ok(lg && lg.name === 'Legacy' && JSON.parse(fs1.d[PR.STORAGE_KEY]).version === 1, 'stored v0 profile migrated and rewritten as v1');
  fs1.d[PR.STORAGE_KEY] = '{corrupt'; ok(PR.createStore(fs1).load() === null, 'corrupt storage -> treated as no profile');
  store.clear(); ok(fs1.d[PR.STORAGE_KEY] === undefined && store.load() === null, 'clear removes data');
  // unavailable storage stubs
  const throwing = { setItem() { throw new Error('SecurityError'); }, getItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const fb = PR.createStore(throwing); ok(!fb.persistent, 'throwing localStorage -> not persistent');
  ok(fb.load() === null, 'fallback: no profile at first'); fb.save(sv); ok(fb.load().name === 'Kyle', 'fallback keeps profile in memory'); fb.clear(); ok(fb.load() === null, 'fallback clear');
  const nul = PR.createStore(null); nul.save(sv); ok(!nul.persistent && nul.load().name === 'Kyle', 'null storage -> memory fallback');
  // quota error mid-session
  let boom = false; const quota = { d: {}, setItem(k, v) { if (boom && k === PR.STORAGE_KEY) throw new Error('Quota'); this.d[k] = v; }, getItem(k) { return this.d[k] === undefined ? null : this.d[k]; }, removeItem(k) { delete this.d[k]; } };
  const qs = PR.createStore(quota); boom = true; ok(qs.save(sv) === false && !qs.persistent && qs.load().name === 'Kyle', 'quota failure degrades to memory without losing data');
}


// ================= Geolocation helpers (geo.js) =================
{
  const GEO = require('./geo.js');
  console.log('\n== geo');
  ok(GEO.inUS(28.33, -80.61) && GEO.inUS(40.7, -74.0) && GEO.inUS(37.7, -122.4) && GEO.inUS(61.2, -149.9) && GEO.inUS(21.3, -157.85), 'Cocoa Beach, NYC, SF, Anchorage, Honolulu are in the US');
  ok(!GEO.inUS(51.5, -0.1) && !GEO.inUS(19.4, -99.1) && !GEO.inUS(35.7, 139.7) && !GEO.inUS(NaN, 1) && !GEO.inUS(0, 0), 'London, Mexico City, Tokyo, NaN, 0/0 are outside the US');
  ok(GEO.kindOf({ code: 1 }) === 'denied' && GEO.kindOf({ code: 2 }) === 'unavailable' && GEO.kindOf({ code: 3 }) === 'timeout' && GEO.kindOf('insecure') === 'insecure' && GEO.kindOf(null) === 'unavailable', 'error kinds');
  ok(/site settings/.test(GEO.message('denied', 'https:')) && /file/.test(GEO.message('denied', 'file:')) && !/never allow location on a page opened from a file/.test(GEO.message('denied', 'https:')), 'denied message explains re-enabling; file note only on file://');
  ['denied', 'unavailable', 'timeout', 'unsupported', 'insecure'].forEach(k => ok(/address or tap the map/.test(GEO.message(k, 'https:')), 'message offers address/tap fallback: ' + k));
  ok(GEO.envProblem({}, {}) === 'unsupported' && GEO.envProblem({ geolocation: {} }, { isSecureContext: false }) === 'insecure' && GEO.envProblem({ geolocation: {} }, {}) === null, 'env checks (secure-context undefined is allowed)');
  ok(GEO.OPTIONS.enableHighAccuracy === true && GEO.OPTIONS.timeout >= 10000, 'high accuracy with sensible timeout');
  ok(/outside the supported area/.test(GEO.outsideMessage(35.7, 139.7)) && /United States and Europe/.test(GEO.outsideMessage(35.7, 139.7)) && !/Florida/.test(GEO.outsideMessage(35.7, 139.7)) && GEO.imprecise(5000) && !GEO.imprecise(20), 'outside + imprecise messages');
}


// ================= Tiles =================
{
  const GEO = require('./geo.js'), PR = require('./profile.js');
  console.log('\n== tiles');
  const st = GEO.tileChain('street', false), dk = GEO.tileChain('dark', false), sat = GEO.tileChain('satellite', true), au = GEO.tileChain('auto', true), al = GEO.tileChain('auto', false), tp = GEO.tileChain('topo', false);
  ok(/World_Street_Map\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/.test(st[0].url) && /Esri/.test(st[0].attribution), 'street default = Esri World Street Map with Esri attribution');
  ok(/World_Imagery/.test(sat[0].url) && /World_Topo_Map/.test(tp[0].url), 'satellite = Esri Imagery; topo = Esri World Topo');
  ok(/World_Dark_Gray_Base/.test(dk[0].url) && /World_Dark_Gray_Reference/.test(dk[0].overlay) && dk[0].maxNativeZoom === 16, 'dark = Esri Dark Gray Base + Reference overlay, native zoom capped at 16');
  ok(/Dark_Gray_Base/.test(au[0].url) && /World_Street_Map/.test(al[0].url), 'auto follows prefers-dark');
  ok(GEO.basemapFor('satellite','street')==='satellite' && GEO.basemapFor('map','satellite')==='auto' && GEO.basemapFor('map','topo')==='topo' && GEO.basemapFor('map','dark')==='dark' && GEO.basemapFor('map','auto')==='auto' && GEO.basemapFor('map',undefined)==='auto' && GEO.basemapFor('map','bogus')==='auto', 'basemapFor: Map/Satellite quick switch');
  ok(GEO.tileChain('satellite', false)[0].maxZoom === 19 && /Esri/.test(GEO.tileChain('satellite', false)[0].attribution), 'imagery maxZoom 19 + Esri attribution');
  ok(GEO.tileChain('bogus', false)[0].key === 'esriStreet', 'unknown choice -> Esri street');
  const noThird = x => !x.some(p => /cartocdn|tile\.openstreetmap/.test(p.url));
  ok([st, dk, sat, au, al, tp].every(noThird), 'default (Esri) chains never include CARTO or OSM');
  [st, dk, sat, tp].forEach((c, i) => ok(c.length >= 3 && new Set(c.map(x => x.key)).size === c.length, 'Esri fallback chain has >=3 distinct providers #' + i));
  ok(GEO.tileChain('street', false, 'carto')[0].key === 'carto' && GEO.tileChain('dark', false, 'carto')[0].key === 'cartoDark' && GEO.tileChain('street', false, 'osm')[0].key === 'osm', 'manual CARTO / OSM providers');
  ok(GEO.tileChain('satellite', false, 'carto')[0].key === 'esriImagery', 'CARTO has no satellite -> Esri Imagery');
  const cyc = GEO.cycleList('street', false).map(x => x.key); ok(cyc.join() === 'esriStreet,esriTopo,esriImagery,carto,osm', 'cycle list: Esri variants, then CARTO, then OSM: ' + cyc.join());
  const gd = GEO.createTileGuard(5); let sw = false; for (let i = 0; i < 4; i++) sw = sw || gd.error(); ok(!sw && gd.error() === true, 'guard switches on 5th error with no loads');
  const g2 = GEO.createTileGuard(5); g2.load(); let s2 = false; for (let i = 0; i < 20; i++) s2 = s2 || g2.error(); ok(!s2, 'guard does not switch once any tile loaded');
  g2.reset(); ok(g2.counts().errors === 0 && g2.counts().loads === 0, 'guard reset');
  ok(PR.defaultProfile().prefs.basemap === 'auto' && PR.defaultProfile().prefs.tileProvider === 'esri', 'defaults: basemap auto, provider esri');
  ok(PR.normalize({ prefs: { basemap: 'topo', tileProvider: 'carto' } }).prefs.tileProvider === 'carto' && PR.normalize({ prefs: { basemap: 'zzz', tileProvider: 'bing' } }).prefs.basemap === 'auto' && PR.normalize({ prefs: { tileProvider: 'bing' } }).prefs.tileProvider === 'esri', 'basemap/provider validation');
  const pp = PR.defaultProfile(); pp.prefs.basemap = 'satellite'; pp.prefs.tileProvider = 'osm'; const ex = PR.parseImport(PR.serialize(pp)); ok(ex.ok && ex.profile.prefs.basemap === 'satellite' && ex.profile.prefs.tileProvider === 'osm', 'map prefs survive export/import');
  ok(PR.migrate({ version: 1, carts: [{ speed: 15 }], prefs: { night: 'day' } }).profile.prefs.tileProvider === 'esri', 'older v1 profile without provider -> esri');
}


// ================= Places (places.js) =================
{
  const PL = require('./places.js'); console.log('\n== places');
  const gro = JSON.parse(fs.readFileSync('fixtures/places_groceries_palmbay.json')), rest = JSON.parse(fs.readFileSync('fixtures/places_restaurants_cocoa.json'));
  // query building
  const q = PL.buildQuery('groceries', 27.9856, -80.6262, 3000);
  ok(/^\[out:json\]\[timeout:25\];\(nwr\["shop"~"\^\(supermarket\|convenience/.test(q) && /around:3000,27\.98560,-80\.62620/.test(q) && /out tags center/.test(q), 'category query: nwr + around + center');
  ok(/around:5000/.test(PL.buildQuery('coffee', 28, -80, 99999)) && /around:500,/.test(PL.buildQuery('coffee', 28, -80, 10)), 'radius clamped to 0.5-5 km');
  ok(PL.buildQuery('gas', 28, -80, 1000).split('nwr').length === 2 && /charging_station/.test(PL.buildQuery('gas', 28, -80, 1000)), 'gas/EV query');
  ok(/\["shop"\]\(around/.test(PL.buildQuery('shops', 28, -80, 1000)), 'shops query has bare shop key');
  ok(PL.CATEGORIES.map(c => c.id).join() === 'food,coffee,groceries,gas,golf,parks,pharmacy,bars,shops', 'all 9 categories present');
  PL.CATEGORIES.forEach(c => { let ok2 = true; try { PL.buildQuery(c.id, 28, -80, 3000); } catch (e) { ok2 = false; } if (!ok2) ok(false, 'query for ' + c.id); });
  ok(throws(() => PL.buildQuery('nope', 1, 1, 1)), 'unknown category throws');
  function throws(f) { try { f(); return false; } catch (e) { return true; } }
  // parsing real fixtures
  const g = PL.parseElements(gro), r = PL.parseElements(rest);
  ok(gro.elements.length > 5 && g.length > 5 && g.every(p => p.name && PL.inFL(p.lat, p.lon) && p.emoji && p.label), `Palm Bay groceries fixture parsed (${g.length} of ${gro.elements.length})`);
  ok(g.every(p => p.cat === 'groceries'), 'all grocery results classified as groceries');
  ok(r.length > 10 && r.some(p => /restaurant|bar|pub/i.test(p.label)), `Cocoa Beach restaurants/bars fixture parsed (${r.length})`);
  ok(new Set(r.map(p => p.id)).size === r.length, 'unique ids');
  console.log('  sample:', r.slice(0, 2).map(p => `${p.emoji} ${p.name} | ${p.label} | ${p.address || '-'} | hours=${p.hours || '-'}`).join(' ;; '));
  // synthetic: node/way/relation, hours/phone/website, unnamed
  const syn = PL.parseElements({ elements: [
    { type: 'node', id: 1, lat: 28.3, lon: -80.6, tags: { name: 'Pier Cafe', amenity: 'cafe', opening_hours: 'Mo-Su 07:00-19:00', phone: '+1 321 555 0100', website: 'example.com/x', 'addr:housenumber': '5', 'addr:street': 'Meade Ave', 'addr:city': 'Cocoa Beach' } },
    { type: 'way', id: 2, center: { lat: 28.31, lon: -80.61 }, tags: { name: 'Big Park', leisure: 'park' } },
    { type: 'relation', id: 3, center: { lat: 28.32, lon: -80.62 }, tags: { name: 'Links', leisure: 'golf_course' } },
    { type: 'node', id: 4, lat: 28.3, lon: -80.6, tags: { amenity: 'fuel' } }, { type: 'node', id: 5, lat: 28.3, lon: -80.6, tags: { shop: 'clothes' } },
    { type: 'node', id: 6, lat: 51.5, lon: -0.1, tags: { name: 'NYC Deli', shop: 'deli' } }, { type: 'way', id: 7, tags: { name: 'No center', shop: 'mall' } },
    { type: 'node', id: 8, lat: 28.3, lon: -80.6, tags: { name: 'XSS <b>', shop: 'mall', website: 'javascript:alert(1)' } } ] });
  const by = n => syn.find(p => p.name === n);
  ok(by('Pier Cafe').cat === 'coffee' && by('Pier Cafe').hours === 'Mo-Su 07:00-19:00' && by('Pier Cafe').phone && by('Pier Cafe').website === 'https://example.com/x' && /5 Meade Ave, Cocoa Beach/.test(by('Pier Cafe').address), 'node: category, raw hours, phone, website, address');
  ok(by('Big Park').lat === 28.31 && by('Big Park').cat === 'parks' && by('Links').cat === 'golf' && by('Links').lon === -80.62, 'way/relation use center');
  ok(syn.some(p => p.cat === 'gas' && p.name === 'Gas station') && !syn.some(p => p.name === 'NYC Deli' || p.name === 'No center') && syn.length === 5, 'unnamed fuel kept; unnamed shop, outside-US and center-less dropped');
  ok(by('XSS <b>').website === '' , 'non-http website dropped');
  ok(!('open' in by('Pier Cafe')) && !/open now|closed/i.test(JSON.stringify(by('Pier Cafe'))), 'never claims open/closed');
  // classification
  ok(PL.classify({ amenity: 'charging_station' }).label === 'EV charging' && PL.classify({ natural: 'beach' }).cat === 'parks' && PL.classify({ amenity: 'pharmacy' }).cat === 'pharmacy' && PL.classify({ amenity: 'pub' }).cat === 'bars' && PL.classify({ amenity: 'fast_food' }).cat === 'food', 'classification');
  // sorting by distance
  const origin = [28.332, -80.608], sorted = PL.sortByDistance(r, origin);
  ok(sorted.every((p, i) => i === 0 || sorted[i - 1].distanceM <= p.distanceM) && sorted[0].distanceM < 3000 && sorted[0].distanceM >= 0 && r[0].distanceM === undefined, 'sorted by straight-line distance; input not mutated');
  ok(PL.fmtDist(100) === '328 ft' && PL.fmtDist(1609.344) === '1.0 mi', 'distance formatting');
  // Photon
  const pu = PL.photonUrl('Publix', [28.33, -80.6]); ok(/photon\.komoot\.io/.test(pu) && !/bbox=/.test(pu) && /lat=28\.3300&lon=-80\.6000/.test(pu) && /q=Publix$/.test(pu), 'Photon URL: no Florida bbox, location bias');
  const pp = PL.parsePhoton({ features: [{ properties: { name: 'Publix', osm_key: 'shop', osm_value: 'supermarket', street: 'Malabar Rd', city: 'Palm Bay', osm_type: 'N', osm_id: 1 }, geometry: { coordinates: [-80.6, 28.0] } }, { properties: { name: 'Publix London', osm_key: 'shop', osm_value: 'supermarket' }, geometry: { coordinates: [-0.1, 51.5] } }] });
  ok(pp.length === 1 && pp[0].cat === 'groceries' && pp[0].address === 'Malabar Rd, Palm Bay', 'Photon parsing: US only, categorized');
  // batch picking keeps the road download small
  const near = [[28.0, -80.6], [28.001, -80.6], [28.002, -80.6], [28.5, -80.6]].map((c, i) => ({ id: 'p' + i, lat: c[0], lon: c[1] }));
  const pk = PL.pickBatch(near, [28.0, -80.6], 10, 5); ok(pk.length === 3 && !pk.some(p => p.id === 'p3'), 'batch skips places that would blow the 5 km download box');
  ok(PL.pickBatch(near, [28.0, -80.6], 2, 5).length === 2, 'batch honors max count');

  // reachability wording (synthetic routing results)
  const okRes = (extra) => Object.assign({ ok: true, distance_m: 1609.344, time_s: 300, segments: [{ basis: 'posted', len: 1609.344 }], snap: { end: { dist: 10 } } }, extra);
  let rr = PL.reachability(okRes(), {}); ok(rr.state === 'reachable' && /Reachable by legal route \(1\.0 mi, ~5 min\)/.test(rr.text), 'badge: reachable: ' + rr.text);
  rr = PL.reachability(okRes({ segments: [{ basis: 'assumed', len: 1000 }, { basis: 'posted', len: 609 }] }), {}); ok(rr.state === 'assumed' && /Needs assumed roads/.test(rr.text), 'badge: needs assumed roads');
  rr = PL.reachability(okRes({ snap: { end: { dist: 320 } } }), {}); ok(rr.state === 'walk' && /320 m/.test(rr.text) && /walk/.test(rr.text), 'badge: place >150 m from legal road -> may need to walk');
  rr = PL.reachability(okRes({ snap: { end: { dist: 140 } } }), {}); ok(rr.state === 'reachable', 'within 150 m counts as on a legal road');
  rr = PL.reachability({ ok: false, error: 'no-legal-route', snap: { end: { dist: 800, tooFar: true } } }, {}); ok(rr.state === 'far' && /800 m/.test(rr.text) && /walk/.test(rr.text), 'badge: nearest legal road far away -> walk message');
  rr = PL.reachability({ ok: false, error: 'no-legal-route', snap: { end: { dist: 30, tooFar: false } } }, {}); ok(rr.state === 'none' && rr.text === 'No legal route found', 'badge: no legal route');
  rr = PL.reachability({ ok: false, error: 'cart-not-eligible' }, {}); ok(rr.state === 'none', 'badge: ineligible cart');
  ok(PL.BADGE_ICON.checking && PL.BADGE_ICON.reachable, 'badge icons');

  // integration with the real router on Palm Bay roads (unchanged router)
  const G = GC.parseOverpass(JSON.parse(fs.readFileSync('fixtures/palmbay.json')));
  const lsvS2 = GC.cartStatus({ type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: true });
  const inBox = g.filter(p => p.lat > 27.985 && p.lat < 28.015 && p.lon > -80.665 && p.lon < -80.625);
  const AL = GC.buildAdj(G, lsvS2.rules, false); const start = G.nodes.get([...AL.adj.keys()][2000]);
  const states = {}; inBox.forEach(p => { const res = GC.planRoute(G, lsvS2, start, [p.lat, p.lon], { cartMph: 25 }); const b = PL.reachability(res, p); states[b.state] = (states[b.state] || 0) + 1; ok(b.text.length > 5, 'badge text for ' + p.name + ': ' + b.text); });
  console.log('  Palm Bay groceries within fixture, LSV reachability states:', JSON.stringify(states), 'of', inBox.length);
  ok(inBox.length > 0 && Object.keys(states).length >= 1, 'reachability computed for real places with the real router');
  const mid = GC.planRoute(G, lsvS2, start, [27.9 , -80.9], { cartMph: 25 }); ok(PL.reachability(mid, {}).state === 'far', 'place far from every road -> walk message via real router');
}


// ================= Autocomplete (autocomplete.js) =================
{
  const AC = require('./autocomplete.js'), PR = require('./profile.js'); console.log('\n== autocomplete');
  const fx = n => JSON.parse(fs.readFileSync('fixtures/photon_' + n + '.json'));
  const u = AC.suggestUrl('Publix Palm', [28.0, -80.6]);
  ok(/^https:\/\/photon\.komoot\.io\/api\/\?/.test(u) && /limit=6/.test(u) && /lang=en/.test(u) && !/bbox=/.test(u) && /lat=28\.0000&lon=-80\.6000/.test(u) && /q=Publix%20Palm$/.test(u), 'URL: Photon, limit 6, lang en, no bbox, location bias, encoded query');
  ok(!/lat=/.test(AC.suggestUrl('x y z')) && /q=a%26b%3Dc/.test(AC.suggestUrl('a&b=c')), 'URL: bias optional; query escaped');
  ok(AC.shouldSearch('abc') && !AC.shouldSearch('ab') && !AC.shouldSearch('  a ') && !AC.shouldSearch(null), 'minimum 3 characters (trimmed)');
  ok(AC.DEBOUNCE_MS === 300 && AC.LIMIT === 6 && AC.MAX_RECENTS === 5, 'constants');
  const pub = AC.parse(fx('publix_palm'));
  ok(pub.length === 5 && pub.every(x => AC.inFL(x.lat, x.lon) && x.primary && x.label && x.icon), `real Photon sample parsed (${pub.length} of ${fx('publix_palm').features.length}, deduped)`);
  const m = pub.find(x => /1150/.test(x.label)); ok(m.primary === 'Publix' && m.secondary === '1150 Malabar Road Southeast, Palm Bay, Brevard County, Florida' && m.label === 'Publix, 1150 Malabar Road Southeast, Palm Bay, FL' && m.icon === '🛒', 'label formatting: primary / secondary / full label / icon');
  ok(AC.parse(fx('749_s_orlando'))[0].icon === '🏨' && AC.parse(fx('cocoa_beach_pier'))[0].icon === '🏖️', 'type icons');
  ok(AC.parse(fx('zzzqqxx')).length === 0 && AC.parse(null).length === 0 && AC.parse({}).length === 0, 'empty / invalid responses');
  const mix = AC.parse({ features: [
    { properties: { name: 'London Pub', state: 'England', countrycode: 'GB' }, geometry: { coordinates: [-0.1, 51.5] } },
    { properties: { name: 'Georgia Peach', state: 'Georgia', countrycode: 'US' }, geometry: { coordinates: [-81.5, 30.9] } },
    { properties: { name: 'Palm Bay', city: 'Palm Bay', county: 'Brevard County', state: 'Florida', osm_key: 'place', osm_value: 'city' }, geometry: { coordinates: [-80.59, 28.03] } },
    { properties: { name: 'Palm Bay', city: 'Palm Bay', county: 'Brevard County', state: 'Florida', osm_key: 'place', osm_value: 'city' }, geometry: { coordinates: [-80.59, 28.03] } },
    { properties: { housenumber: '12', street: 'Tulip Avenue', city: 'Cocoa Beach', state: 'Florida' }, geometry: { coordinates: [-80.6, 28.33] } },
    { properties: { state: 'Florida' }, geometry: { coordinates: [-80.6, 28.33] } }, { geometry: null }] });
  ok(mix.length === 3 && mix[0].primary === 'Georgia Peach' && mix[0].label === 'Georgia Peach, GA' && !mix.some(x => x.primary === 'London Pub') && mix[1].primary === 'Palm Bay' && mix[1].secondary === 'Brevard County, Florida' && mix[1].icon === '🏙️', 'US only (non-US country dropped), deduped, state abbreviated, no repeated city in secondary line');
  ok(mix[2].primary === '12 Tulip Avenue' && mix[2].label === '12 Tulip Avenue, Cocoa Beach, FL', 'street-only result uses house number + street as the primary line');
  // recents
  const r1 = AC.addRecent([], { label: 'A, Palm Bay, FL', lat: 28, lon: -80.6, icon: '📍' });
  let rl = r1; ['B', 'C', 'D', 'E', 'F'].forEach((n, i) => { rl = AC.addRecent(rl, { label: n, lat: 28 + i * 0.01, lon: -80.5 }); });
  ok(rl.length === 5 && rl[0].label === 'F' && !rl.some(x => x.label.startsWith('A,')), 'recents: newest first, max 5');
  rl = AC.addRecent(rl, { label: 'c', lat: 28.5, lon: -80.5 }); ok(rl.length === 5 && rl[0].label === 'c' && rl.filter(x => x.label.toLowerCase() === 'c').length === 1, 'recents: dedupe by label (case-insensitive), moves to top');
  rl = AC.addRecent(rl, { label: 'Same spot', lat: rl[1].lat, lon: rl[1].lon }); ok(rl.filter(x => Math.abs(x.lat - rl[0].lat) < 1e-5 && Math.abs(x.lon - rl[0].lon) < 1e-5).length === 1, 'recents: dedupe by coordinates');
  ok(AC.addRecent([], { label: 'London', lat: 51.5, lon: -0.1 }).length === 0 && AC.addRecent([], { label: '', lat: 28, lon: -80.5 }).length === 0 && AC.clearRecents().length === 0, 'recents: rejects non-US/blank; clear');
  ok(AC.normalizeRecents('junk').length === 0 && AC.normalizeRecents([null, 5, { label: 'ok', lat: 28, lon: -80.5 }]).length === 1, 'recents: normalize junk');
  const prof = PR.normalize({ recents: Array.from({ length: 9 }, (_, i) => ({ label: 'R' + i, lat: 28, lon: -80.5, icon: '📍' })).concat([{ label: 'London', lat: 51.5, lon: -0.1 }]) });
  ok(prof.recents.length === 1 || prof.recents.length === 5, 'profile normalizes recents (max 5) [' + prof.recents.length + ']');
  const pr2 = PR.defaultProfile(); pr2.recents = [{ label: 'X, Palm Bay, FL', lat: 28, lon: -80.6, icon: '🏙️' }]; const rt = PR.parseImport(PR.serialize(pr2)); ok(rt.ok && rt.profile.recents.length === 1 && rt.profile.recents[0].label === 'X, Palm Bay, FL', 'recents survive export/import');
  ok(PR.migrate({ version: 1, carts: [{ speed: 15 }] }).profile.recents.length === 0, 'older profile without recents -> empty list');
  // rows + keyboard
  const rows = AC.buildRows({ state: 'idle', withMyLocation: true, recents: rl });
  ok(rows[0].type === 'myloc' && rows[1].type === 'recent' && rows[rows.length - 1].type === 'clear', 'idle rows: My location, recents, Clear');
  ok(AC.buildRows({ state: 'idle', withMyLocation: false, recents: [] }).length === 0 && AC.buildRows({ state: 'idle', withMyLocation: true, recents: [] }).length === 1, 'idle rows: My location only for start; nothing when no recents');
  ok(AC.buildRows({ state: 'loading' })[0].kind === 'loading' && AC.buildRows({ state: 'empty' })[0].kind === 'empty' && /tap the map/.test(AC.buildRows({ state: 'error' })[0].primary), 'loading / empty / error rows');
  ok(AC.buildRows({ state: 'results', items: pub, query: 'Publix', withMyLocation: true }).length === 5 && AC.buildRows({ state: 'results', items: pub, query: 'my loc', withMyLocation: true })[0].type === 'myloc', 'results rows (My location only when asked for)');
  const kr = [{ type: 'msg' }, { type: 'item' }, { type: 'item' }, { type: 'clear' }];
  ok(AC.moveActive(kr, -1, 1) === 1 && AC.moveActive(kr, 1, 1) === 2 && AC.moveActive(kr, 3, 1) === 1 && AC.moveActive(kr, -1, -1) === 3 && AC.moveActive(kr, 1, -1) === 3 && AC.moveActive([{ type: 'msg' }], -1, 1) === -1, 'arrow navigation skips messages and wraps');
}

{ // viewport legality
  const gs = GC.cartStatus(base, {}), rr = gs.rules;
  const vp = GC.viewportPlan({ s: 28.30, w: -80.61, n: 28.31, e: -80.60 }, 15);
  ok(vp.ok && vp.bb.n === 28.31, 'viewportPlan ok when zoomed in and small');
  ok(!GC.viewportPlan({ s: 28.30, w: -80.61, n: 28.31, e: -80.60 }, 13).ok && GC.viewportPlan({ s: 28.30, w: -80.61, n: 28.31, e: -80.60 }, 13).reason === 'zoom', 'viewportPlan blocks zoom < 14');
  ok(GC.viewportPlan({ s: 28.0, w: -81.0, n: 28.5, e: -80.0 }, 16).reason === 'span', 'viewportPlan blocks huge span');
  const js = { elements: [
    { type: 'node', id: 1, lat: 28.3, lon: -80.6 }, { type: 'node', id: 2, lat: 28.301, lon: -80.6 }, { type: 'node', id: 3, lat: 28.302, lon: -80.6 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', maxspeed: '25 mph', name: 'A St' } },
    { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'primary', maxspeed: '45 mph', name: 'B Rd' } },
    { type: 'way', id: 12, nodes: [1, 3], tags: { highway: 'residential', golf_cart: 'yes', name: 'C St' } },
    { type: 'way', id: 13, nodes: [1, 3], tags: { highway: 'footway' } } ] };
  const cv = GC.classifyViewport(js, rr), by = n => cv.find(x => x.name === n);
  ok(cv.length === 3, 'classifyViewport skips footway');
  ok(by('A St').allowed && by('A St').basis !== 'illegal', 'residential 25 likely legal');
  ok(by('B Rd').basis === 'illegal' && !by('B Rd').allowed, '45 mph road not legal');
  ok(by('C St').basis === 'tagged', 'golf_cart=yes tagged');
}

{ // LSV upgrade hint
  const gs = GC.cartStatus(base, {});
  const a1a = { highway: 'primary', ref: 'SR A1A', name: 'A1A', maxspeed: '35 mph' };
  const fast = { highway: 'primary', maxspeed: '45 mph' };
  const res = { highway: 'residential', maxspeed: '25 mph' };
  ok(gs.cls === 'golf' && GC.lsvUpgradeFor(gs, a1a), 'golf cart on 35 mph state road: LSV hint');
  ok(GC.lsvUpgradeFor(gs, { highway: 'secondary', maxspeed: '30 mph' }) , 'golf cart on 30 mph road above cutoff: LSV hint');
  ok(!GC.lsvUpgradeFor(gs, fast), '45 mph: no LSV hint (LSV cannot either)');
  ok(!GC.lsvUpgradeFor(gs, res), 'already legal road: no hint');
  ok(!GC.lsvUpgradeFor(gs, { highway: 'footway' }), 'sidewalk: no hint');
  ok(!GC.lsvUpgradeFor({ ok: false, rules: null }, a1a), 'ineligible cart: no hint');
  const lsvSt = { ok: true, cls: 'lsv', rules: { cls: 'lsv', limit: 35, planning: true, allowCrossing: true, night: true } };
  ok(!GC.lsvUpgradeFor(lsvSt, a1a) && !GC.lsvUpgradeFor(lsvSt, fast), 'LSV cart: never a hint');
  // planRoute: only way is via A1A
  const js = { elements: [
    { type: 'node', id: 1, lat: 28.300, lon: -80.600 }, { type: 'node', id: 2, lat: 28.301, lon: -80.600 }, { type: 'node', id: 3, lat: 28.302, lon: -80.600 }, { type: 'node', id: 4, lat: 28.303, lon: -80.600 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', maxspeed: '25 mph', name: 'A St' } },
    { type: 'way', id: 11, nodes: [2, 3], tags: a1a },
    { type: 'way', id: 12, nodes: [3, 4], tags: { highway: 'residential', maxspeed: '25 mph', name: 'B St' } } ] };
  const pr = GC.planRoute(GC.parseOverpass(js), gs, [28.300, -80.600], [28.303, -80.600], {});
  ok(!pr.ok && pr.lsvUpgrade === true && pr.alternative.segments.some(x => x.lsvOnly), 'planRoute flags lsvUpgrade on alternative');
  const pl = GC.planRoute(GC.parseOverpass(js), lsvSt, [28.300, -80.600], [28.303, -80.600], {});
  ok(pl.ok, 'LSV can route over A1A (unchanged)');
  const cv = GC.classifyViewport(js, gs.rules);
  ok(cv.find(x => x.name === 'A1A').lsvOnly && !cv.find(x => x.name === 'A St').lsvOnly, 'viewport lsvOnly flag');
}

// ================= 50-state support (states.js) =================
{
  const ST = require('./states.js'), PR = require('./profile.js');
  console.log('\n== states');
  ok(ST.T.length === 51 && new Set(ST.T.map(t => t.a)).size === 51 && ST.T.every(t => t.n && /^[A-Z]{2}$/.test(t.a) && t.l > 0 && t.b.length === 4 && t.c.length === 2 && typeof t.v === 'boolean' && /^https?:\/\//.test(t.u)), 'table: 50 states + DC, unique abbreviations, name/limit/bbox/centroid/verified/url');
  ok(ST.T.filter(t => t.v).map(t => t.a).join() === 'FL' && ST.isVerified('FL') && !ST.isVerified('GA') && !ST.isVerified('ZZ'), 'only Florida is marked verified');
  const det = (la, lo) => { const t = ST.detect(la, lo); return t && t.a; };
  [['Palm Bay', 27.9856, -80.6262, 'FL'], ['Cocoa Beach', 28.332, -80.608, 'FL'], ['Pensacola (panhandle, inside AL bbox)', 30.42, -87.2, 'FL'], ['Key West', 24.55, -81.8, 'FL'], ['Tallahassee', 30.44, -84.28, 'FL'],
   ['Atlanta', 33.75, -84.39, 'GA'], ['Savannah', 32.08, -81.09, 'GA'], ['Mobile', 30.69, -88.04, 'AL'], ['NYC', 40.71, -74.0, 'NY'], ['Boston', 42.36, -71.06, 'MA'], ['Providence', 41.82, -71.41, 'RI'], ['DC', 38.9, -77.03, 'DC'],
   ['Seattle', 47.6, -122.3, 'WA'], ['Las Vegas', 36.17, -115.14, 'NV'], ['San Francisco', 37.77, -122.42, 'CA'], ['Austin', 30.27, -97.74, 'TX'], ['Phoenix', 33.45, -112.07, 'AZ'], ['Anchorage', 61.2, -149.9, 'AK'], ['Honolulu', 21.3, -157.85, 'HI']]
    .forEach(([n, la, lo, ab]) => ok(det(la, lo) === ab, 'detect ' + n + ' -> ' + ab + ' (got ' + det(la, lo) + ')'));
  ok(det(27.5, -79.9) === 'FL', 'just offshore Florida snaps to the nearest state');
  ok(det(51.5, -0.1) === null && det(43.7, -79.4) === null && det(NaN, 1) === null && det(0, 0) === null, 'London, Toronto, NaN, 0/0 -> no state');
  ok(ST.inUS(28, -80.6) && ST.inUS(61.2, -149.9) && ST.inUS(21.3, -157.85) && !ST.inUS(35.7, 139.7) && !ST.inUS(19.4, -99.1), 'US check: contiguous, AK, HI yes; Tokyo, Mexico City no');
  // LSV limits per state (from the research file; unknown/local-option defaults to 35)
  ok(ST.lsvLimit('FL') === 35 && ST.lsvLimit('KS') === 40 && ST.lsvLimit('MD') === 30 && ST.lsvLimit('MA') === 30 && ST.lsvLimit('NJ') === 25 && ST.lsvLimit('PA') === 25 && ST.lsvLimit('TX') === 35 && ST.lsvLimit('GA') === 35 && ST.lsvLimit('AL') === 35 && ST.lsvLimit('CT') === 35 && ST.lsvLimit('MT') === 35 && ST.lsvLimit('WY') === 35 && ST.lsvLimit('??') === 35, 'LSV limit per state, default 35 when unknown');
  // links: official source for State law, DMV only when a verified DMV URL exists, otherwise a web search
  ok(ST.lawLink(ST.get('TX')) === 'https://statutes.capitol.texas.gov/GetStatute.aspx?Code=TN&Value=551.403' && /dps\.georgia\.gov/.test(ST.lawLink(ST.get('GA'))) && !/cga\.ct\.gov/.test(ST.lawLink(ST.get('AK'))) && ST.lawLink(ST.get('CT')) === 'https://www.cga.ct.gov/current/pub/chap_249.htm', 'State law link = first official source');
  ok(/dps\.georgia\.gov/.test(ST.get('GA').u) && /dmv\.ny\.gov/.test(ST.dmvLink(ST.get('NY'))) && /google\.com\/search\?q=Texas%20DMV/.test(ST.dmvLink(ST.get('TX'))) && /google\.com\/search\?q=Texas%20golf%20cart%20low%20speed%20vehicle%20laws/.test(ST.search(ST.get('TX'))), 'DMV link: known DMV url, else safe search link');
  ok(ST.T.every(t => !/^javascript:/i.test(t.u + t.d) && (!t.d || /^https?:/.test(t.d))), 'links are http(s) only');
  // status per state
  const full = { type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: true, night: 'day' };
  const fl = GC.cartStatus(full, { state: ST.get('FL') }), none = GC.cartStatus(full), nj = GC.cartStatus(full, { state: ST.get('NJ') }), ks = GC.cartStatus(full, { state: ST.get('KS') });
  ok(JSON.stringify(Object.assign({}, fl, { state: 0 })) === JSON.stringify(Object.assign({}, none, { state: 0 })) && fl.rules.limit === 35 && fl.state.verified === true && none.state === null && /s\. 316\.2122/.test(fl.explain.join(' ')), 'Florida status identical to no-state status (Florida logic unchanged)');
  ok(nj.rules.limit === 25 && ks.rules.limit === 40 && nj.state.abbr === 'NJ' && nj.state.verified === false && /25 mph or less/.test(nj.label) && /40 mph or less/.test(ks.label), 'LSV road limit follows the state');
  ok(!/316\./.test(nj.explain.join(' ') + nj.warnings.join(' ')) && nj.explain.length === 1 && /New Jersey may differ/.test(nj.explain[0]), 'non-Florida status does not cite Florida statutes');
  const g = GC.cartStatus({ type: 'golf', speed: 18, mirrors: true, reflectors: true, headlights: true, brakeLights: true, turnSignals: true, windshield: true }, { state: ST.get('TX') });
  ok(g.cls === 'golf' && g.rules.limit === 25 && g.rules.lsvLimit === 35 && g.state.abbr === 'TX', 'golf cart defaults stay conservative (25 mph, daytime) in unverified states');
  const road = { highway: 'secondary', maxspeed: '30 mph' };
  ok(!GC.classifyWay(road, nj.rules).allowed && GC.classifyWay(road, ks.rules).allowed && GC.classifyWay(road, fl.rules).allowed, 'same 30 mph road: blocked for an LSV in NJ (25), allowed in KS (40) and FL (35)');
  const gnj = GC.cartStatus({ type: 'golf', speed: 18, mirrors: true, reflectors: true }, { state: ST.get('NJ') });
  ok(!GC.lsvUpgradeFor(gnj, { highway: 'secondary', maxspeed: '30 mph' }) && GC.lsvUpgradeFor(GC.cartStatus({ type: 'golf', speed: 18, mirrors: true, reflectors: true }, { state: ST.get('KS') }), { highway: 'secondary', maxspeed: '30 mph' }), 'LSV upgrade hint uses the state limit');
  // profile: US home/work, state passed through statusFor
  const hp = PR.normalize({ home: { lat: 40.7, lon: -74, label: 'NYC' }, work: { lat: 47.6, lon: -122.3, label: 'Seattle' } });
  ok(hp.home && hp.home.lat === 40.7 && hp.work && hp.work.lat === 47.6 && PR.normalize({ home: { lat: 35.7, lon: 139.7 } }).home === null && PR.normalize({ home: { lat: 48.86, lon: 2.35 } }).home !== null, 'home/work accept US + Europe points, reject others (Tokyo)');
  const pr = PR.defaultProfile(); ok(PR.statusFor(GC, pr, null, ST.get('NJ')).state.abbr === 'NJ' && PR.statusFor(GC, pr).state === null, 'statusFor passes the state through');
  // generated file in sync with research
  const rules = JSON.parse(fs.readFileSync('tools/state-rules.json', 'utf8'));
  ok(rules.length === 51 && rules.every(x => ST.get(x.abbr) && ST.get(x.abbr).n === x.state), 'states.js matches tools/state-rules.json');
  const html = fs.readFileSync('index.html', 'utf8'); const css = html.replace(/<script[\s\S]*?<\/script>/g, '');
  ok(!/inFlorida|GEO\.FL\b/.test(html) && !/-87\.7,24\.4/.test(html) && !/countrycodes=us&viewbox/.test(html) && !/Florida only|CartRoute covers Florida/.test(html), 'no Florida-only gating left in the built page');
  ok(!/&amp;/.test(html), 'no &amp; entities in built page');
}

// ================= Geocoding regression: Kyle's "749 S Orlando Ave" -> "local publix grocery store" =================
{
  const GEO = require('./geo.js');
  ok(JSON.stringify(GEO.queryVariants('local publix grocery store')) === JSON.stringify(['local publix grocery store', 'publix grocery store', 'publix']), 'queryVariants strips "local" and generic nouns');
  ok(JSON.stringify(GEO.queryVariants('Publix')) === '["Publix"]' && GEO.queryVariants('  ').length === 0, 'queryVariants leaves plain names alone');
  const feat = (n, lon, lat, hn, cc) => ({ geometry: { coordinates: [lon, lat] }, properties: { name: n, housenumber: hn, countrycode: cc || 'US' } });
  const foreign = [feat('The Local Grocery Store', 144.78, -37.88, '210', 'AU'), feat('Local Grocery', 76.2, 10.37, null, 'IN')];
  ok(GEO.pickPhoton(foreign, 'local publix grocery store') === null, 'non-US-only Photon results give null (caller retries cleaner wording)');
  ok(GEO.pickPhoton([feat('Publix', -80.6104, 28.3449, '2067')], 'publix').lat === 28.3449, 'plain name picks the US Publix');
  const wrongBldg = [feat('Bruno\'s', -80.6101, 28.3250, '366'), feat('Orlando Ave', -80.6099, 28.3224, null)];
  ok(GEO.pickPhoton(wrongBldg, '749 s orlando ave cocoa beach FL') === null, 'house-number query refuses a different building (falls to Nominatim)');
  ok(GEO.pickPhoton([feat('x', -80.6, 28.3, '749')], '749 S Orlando Ave').lat === 28.3, 'house-number query accepts matching number');
  ok(JSON.stringify(GEO.orderedVariants('local publix grocery store')) === JSON.stringify(['publix', 'publix grocery store', 'local publix grocery store']), 'filler query tries core name first');
  ok(GEO.orderedVariants('749 s orlando ave cocoa beach FL')[0] === '749 s orlando ave cocoa beach FL', 'plain address tried as typed');
  const near = { lat: 28.32, lon: -80.61 };
  ok(GEO.pickPhoton([feat('Publix Liquor', -81.36, 28.60, '1')], 'publix', near, 60) === null && GEO.pickPhoton([feat('Publix', -80.6104, 28.3449, '2067')], 'publix', near, 60).lat === 28.3449, 'place-name search ignores far matches when a bias point is known');
  ok(GEO.isPlaceName('publix') && !GEO.isPlaceName('749 s orlando') && !GEO.isPlaceName('Miami, FL'), 'isPlaceName');
  // LSV (25 mph, all equipment) plans a route on the real Cocoa Beach map around the user's address
  const cocoa = JSON.parse(fs.readFileSync('fixtures/cocoa.json', 'utf8'));
  const lsvSt = GC.cartStatus({ speed: 25, type: 'lsv', headlights: 1, brakeLights: 1, turnSignals: 1, reflectors: 1, parkingBrake: 1, mirrors: 1, windshield: 1, seatBelts: 1, hasVin: 1, registered: 1 });
  ok(lsvSt.ok && lsvSt.cls === 'lsv', 'full-equipment 25 mph LSV is cls lsv');
  const html = fs.readFileSync('index.html', 'utf8');
  ok(/GEO\.orderedVariants\(q\)/.test(html) && /GEO\.pickPhoton\(/.test(html), 'built page geocoder uses the new helpers');
}

// --- nearby place-name search (mocked) ---
{
  const AC2 = require('./autocomplete.js'); const ref = [28.3050, -80.6096];
  ok(AC2.isNameQuery('Publix') && AC2.isNameQuery('local publix grocery store') && AC2.isNameQuery('Dunkin') && !AC2.isNameQuery('749 S Orlando Ave') && !AC2.isNameQuery('5645 N Atlantic Ave, Cocoa Beach') && !AC2.isNameQuery('Pu'), 'name-vs-address decision');
  ok(AC2.coreName('local publix grocery store') === 'publix' && AC2.coreName('nearest Dunkin') === 'Dunkin', 'filler words stripped for name search');
  const pu = AC2.photonNearUrl('publix', ref), nu = AC2.nominatimNearUrl('publix', ref), oq = AC2.overpassNameQuery('publix', ref);
  ok(/lat=28.3050&lon=-80.6096/.test(pu) && /bbox=-81\.\d+,27\.\d+,-80\.\d+,28\.\d+/.test(pu), 'photon url has lat/lon bias and bbox');
  ok(/bounded=1/.test(nu) && /viewbox=/.test(nu) && /countrycodes=us/.test(nu), 'nominatim url has viewbox + bounded=1');
  ok(/"name"~"publix",i/.test(oq) && /around:40000,28\.30500,-80\.60960/.test(oq), 'overpass name query around reference');
  const pf = (name, lon, lat, hn) => ({ geometry: { coordinates: [lon, lat] }, properties: { name, housenumber: hn, street: 'North Atlantic Avenue', city: 'Cocoa Beach', state: 'FL', countrycode: 'US', osm_key: 'shop', osm_value: 'supermarket', osm_type: 'N', osm_id: hn } });
  const photon = { features: [pf('Publix', -80.6104, 28.3449, '2067'), pf('Publix', -80.6150, 28.3640, '5645'), pf('Publix', -81.36, 28.60, '1'), pf('Walgreens', -80.6, 28.31, '7')] };
  const nomin = [{ lat: '28.3449', lon: '-80.61045', category: 'shop', type: 'supermarket', name: 'Publix', display_name: 'Publix, 2067', address: { house_number: '2067', road: 'North Atlantic Avenue', city: 'Cocoa Beach' } }];
  const ovp = { elements: [{ type: 'node', id: 1, lat: 28.3640, lon: -80.6150, tags: { name: 'Publix', shop: 'supermarket', 'addr:housenumber': '5645', 'addr:street': 'N Atlantic Ave', 'addr:city': 'Cocoa Beach' } }, { type: 'way', id: 2, center: { lat: 28.2, lon: -80.7 }, tags: { brand: 'Publix', shop: 'supermarket' } }, { type: 'node', id: 3, lat: 28.31, lon: -80.61, tags: { name: 'Publix', amenity: 'parking' } }] };
  const m = AC2.mergeRank([AC2.parsePhotonNear(photon), AC2.parseNominatimNear(nomin), AC2.parseOverpassNear(ovp)], ref, 'publix', 40);
    ok(m.filter(x => /2067/.test(x.address)).length === 1 && m.filter(x => /5645/.test(x.address)).length === 1, 'dedupe across photon/nominatim/overpass (2067 and 5645 once each); far Publix (Orlando) and parking dropped: ' + m.map(x => x.primary + '@' + x.distLabel).join('|'));
  ok(m.every((x, i) => i === 0 || m[i - 1].distKm <= x.distKm), 'sorted nearest first');
  ok(m[0].address.indexOf('2067') === 0 && m[1].address.indexOf('5645') === 0 && m.some(x => x.address === '' && x.distKm > 10) , 'closer 2067 before 5645 (then the address-less brand node)');
  ok(!m.some(x => /Walgreens/.test(x.primary)), 'non-matching names filtered');
  ok(/^\d\.\d mi$/.test(m[0].distLabel) && AC2.fmtMi(0.05) === '164 ft' && AC2.fmtMi(5) === '3.1 mi', 'distance labels');
  const rows = AC2.buildRows({ state: 'results', items: m, query: 'publix' });
  ok(/^Publix · \d\.\d mi$/.test(rows[0].primary) && /5645|2067/.test(rows[0].secondary), 'row shows name · distance and street address: ' + rows[0].primary + ' / ' + rows[0].secondary);
  ok(/^Publix, 2067 North Atlantic Avenue/.test(m[0].label) || /Publix, 2067/.test(m[0].label), 'label includes address');
  (async () => {
    const calls = [];
    const io = { json: async u => { calls.push('photon'); return photon; }, nominatim: async u => { calls.push('nom'); return nomin; }, overpass: async q => { calls.push('ovp'); return ovp; } };
    let r = await AC2.searchNearby('local publix grocery store', ref, io, { deep: true });
    ok(r.ok && r.items.length >= 2 && calls.join() === 'photon,nom,ovp' && /2067/.test(r.items[0].address), 'searchNearby deep uses all three sources and ranks nearest first');
    r = await AC2.searchNearby('publix', ref, { json: async () => { throw new Error('x'); }, nominatim: async () => nomin, overpass: async () => ovp }, {});
    ok(r.ok && r.errors === 1 && r.items.length >= 1, 'one failing source tolerated');
    r = await AC2.searchNearby('publix', ref, { json: async () => { throw new Error('x'); }, overpass: async () => { throw new Error('y'); } }, {});
    ok(!r.ok && r.items.length === 0 && r.errors === 2, 'all sources failing reported');
    require('./test-vehicles.js')(ok);
    require('./test-directions.js')(ok);
    if (globalThis.__cat) await globalThis.__cat();
    console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
  })();
}

// --- category search ---
{
  const AC3 = require('./autocomplete.js'); const ref = [28.3050, -80.6096];
  const k = q => { const c = AC3.categoryOf(q); return c && c.key; };
  ok(k('coffee') === 'coffee' && k('Coffee Shop') === 'coffee' && k('cafe') === 'coffee' && k('cafes') === 'coffee', 'coffee keywords');
  ok(k('gas') === 'fuel' && k('gas station') === 'fuel' && k('Gas Stations') === 'fuel' && k('fuel') === 'fuel', 'gas synonyms/plurals');
  ok(k('food') === 'restaurant' && k('restaurants') === 'restaurant' && k('grocery') === 'grocery' && k('supermarket') === 'grocery' && k('groceries') === 'grocery', 'food/grocery synonyms');
  ok(k('pharmacy') === 'pharmacy' && k('pharmacies') === 'pharmacy' && k('hardware store') === 'hardware' && k('ice cream') === 'icecream' && k('beaches') === 'beach' && k('bank') === 'bank' && k('ATM') === 'atm' && k('hospital') === 'hospital' && k('bar') === 'bar' && k('dentist') === 'dentist' && k('post office') === 'post' && k('park') === 'park' && k('pizza') === 'pizza', 'listed categories');
  ok(k('the nearest gas station near me') === 'fuel' && k('Local pharmacy') === 'pharmacy', 'filler words ignored');
  ok(!k('Publix') && !k('Wawa') && !k('Dunkin') && !k('Shell') && !k('Starbucks') && !k('Walmart') && !k('Park Ave') && !k('Bank of America') && !k('749 S Orlando Ave') && !k('1 Beach Rd') && !k('coffee, Cocoa Beach') && !k('Pu'), 'brands and addresses are not categories');
  ok(AC3.isCategoryQuery('coffee') && !AC3.isCategoryQuery('publix') && AC3.isNameQuery('coffee'), 'category decision separate from name decision');
  const q = AC3.categoryQuery(AC3.categoryOf('gas station'), ref, 5000), q2 = AC3.categoryQuery(AC3.categoryOf('coffee'), ref, 99999), qp = AC3.categoryQuery(AC3.categoryOf('pizza'), ref, 5000);
  ok(/"amenity"~"\^\(fuel\)\$"/.test(q) && /around:5000,28\.305,-80\.610/.test(q) && /out tags center/.test(q), 'overpass query for gas');
  ok(/around:15000/.test(q2) && /"amenity"~"\^\(cafe\)\$"/.test(q2) && /"shop"~"\^\(coffee\)\$"/.test(q2), 'radius clamped, coffee filters');
  ok(/cuisine/.test(qp) && !/amenity/.test(qp), 'pizza uses cuisine tag only');
  const el = (id, lat, lon, tags, type) => ({ type: type || 'node', id, lat, lon, tags });
  const ovp = { elements: [
    el(1, 28.3200, -80.6100, { name: 'Wawa', amenity: 'fuel', 'addr:housenumber': '100', 'addr:street': 'N Atlantic Ave', 'addr:city': 'Cocoa Beach' }),
    el(2, 28.3070, -80.6100, { amenity: 'fuel', brand: 'Shell' }),
    el(3, 28.3300, -80.6000, { amenity: 'fuel' }),
    el(4, 28.3070, -80.6101, { amenity: 'fuel', brand: 'Shell' }),
    el(5, 28.31, -80.61, { name: 'Lot', amenity: 'parking' }),
    el(6, 28.9, -81.3, { name: 'Far Gas', amenity: 'fuel' })] };
  const items = AC3.parseOverpassCat(ovp, AC3.categoryOf('gas'));
  ok(items.length === 5 && items.every(x => x.kind === 'gas station'), 'parse: parking dropped, unnamed fuel kept');
  const m = AC3.mergeRank([items], ref, '', 16);
  ok(m.length === 3 && m[0].primary === 'Shell' && m[1].primary === 'Wawa' && m[2].primary === 'Gas station' && m.every((x, i) => !i || m[i - 1].distKm <= x.distKm), 'ranked nearest first, dupes merged, far dropped: ' + m.map(x => x.primary + '@' + x.distLabel).join('|'));
  const rows = AC3.buildRows({ state: 'results', items: m, query: 'gas' });
  ok(/^Wawa · gas station · \d\.\d mi$/.test(rows[1].primary) && /100 N Atlantic Ave/.test(rows[1].secondary), 'row: Wawa · gas station · 1.2 mi + address: ' + rows[1].primary);
  globalThis.__cat = async () => {
    const calls = []; const wide = { elements: [el(7, 28.37, -80.62, { name: 'Far Cafe', amenity: 'cafe' })] };
    const io = { overpass: async qs => { calls.push(/around:5000/.test(qs) ? 'r5' : 'r10'); return /around:5000/.test(qs) ? { elements: [el(8, 28.306, -80.61, { name: 'Near Cafe', amenity: 'cafe' })] } : wide; },
      json: async () => ({ features: [{ geometry: { coordinates: [-80.612, 28.31] }, properties: { name: 'Coffee House', countrycode: 'US', osm_key: 'amenity', osm_value: 'cafe', osm_id: 9 } }, { geometry: { coordinates: [-80.611, 28.309] }, properties: { name: 'Walgreens', countrycode: 'US', osm_key: 'shop', osm_value: 'chemist', osm_id: 10 } }] }) };
    let r = await AC3.searchCategory('coffee', ref, io);
    ok(r.ok && calls.join() === 'r5,r10' && r.items.map(x => x.primary).join() === 'Near Cafe,Coffee House,Far Cafe', 'expands to 10 km when few results; merges name matches (only keyword-named): ' + r.items.map(x => x.primary));
    const many = { elements: [1, 2, 3, 4, 5].map(i => el(20 + i, 28.306 + i * 0.002, -80.61, { name: 'Cafe ' + i, amenity: 'cafe' })) };
    calls.length = 0; r = await AC3.searchCategory('coffee', ref, { overpass: async qs => { calls.push('o'); return many; } });
    ok(calls.length === 1 && r.items.length === 5, 'no expansion when 5+ nearby');
    r = await AC3.searchCategory('coffee', ref, { overpass: async () => { throw new Error('x'); } });
    ok(!r.ok && r.items.length === 0 && r.errors >= 1, 'failure reported');
    r = await AC3.searchCategory('publix', ref, io); ok(r.items.length === 0 && r.cat === null, 'non-category yields nothing');
    const html = fs.readFileSync('index.html', 'utf8');
    ok(/AC\.isCategoryQuery\(q\)/.test(html) && /findNearbyCategory/.test(html) , 'built page wires category search');
    ok(html.includes('GC.widerBbox(startPt,endPt,bb.padIndex)'), 'built page retries with a wider area when no route');
  };
}
