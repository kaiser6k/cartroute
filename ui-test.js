// jsdom smoke test: click through the wizard, confirm profile saved, reload skips wizard. Needs: npm i jsdom
const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8').replace(/<script src="https:\/\/unpkg[^>]*><\/script>/, ''); // Leaflet stubbed out (map shows fallback text)
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const storage = (() => { const d = {}; return { d, setItem: (k, v) => { d[k] = String(v) }, getItem: k => (k in d ? d[k] : null), removeItem: k => { delete d[k] } }; })();
function boot(stor, extra, url) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: url || 'file:///x/index.html', pretendToBeVisual: true, beforeParse(w) {
    Object.defineProperty(w, 'localStorage', { get() { if (stor === 'throw') throw new Error('SecurityError'); return stor; } });
    w.fetch = async () => ({ ok: true, json: async () => [{ lat: '28.33', lon: '-80.61' }] });
    w.HTMLElement.prototype.scrollIntoView = () => {}; w.confirm = () => true; w.alert = () => {}; if (extra) extra(w);
  } });
  return dom.window;
}
const $ = (w, s) => w.document.querySelector(s);
const wizOn = w => $(w, '#wizard').classList.contains('on');
function set(w, sel, v) { const e = $(w, sel); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); e.dispatchEvent(new w.Event('change', { bubbles: true })); }
function tick(w, sel, on) { const e = $(w, sel); e.checked = on; e.dispatchEvent(new w.Event('change', { bubbles: true })); }
const next = w => $(w, '#wNext').click();
(async () => {
  let w = boot(storage);
  ok(wizOn(w), 'first run: wizard shown');
  ok(!storage.d['cartroute.profile.v1'], 'nothing saved before finishing');
  set(w, '#wName', 'Kyle'); next(w);
  set(w, '[data-k=type]', 'golf'); set(w, '[data-k=make]', 'Club Car Onward'); set(w, '[data-k=nickname]', 'Beach Buggy'); next(w);
  set(w, '[data-k=speed]', '0'); next(w); ok($(w, '#wErr').textContent.length > 0, 'bad speed blocks Next'); set(w, '[data-k=speed]', '18'); next(w);
  ['headlights', 'brakeLights', 'turnSignals', 'seatBelts', 'mirrors', 'windshield', 'reflectors'].forEach(k => tick(w, `[data-k=${k}]`, true)); next(w);
  set(w, '[data-k=night]', 'night'); set(w, '[data-k=designatedLimit]', '30'); tick(w, '[data-k=strict]', false); next(w);
  next(w); ok($(w, '#wErr').textContent.length > 0, 'home required');
  $(w, '[data-home=cocoa]').click(); next(w);
  ok(/Golf cart/.test($(w, '#wizIn').textContent) && /Review/.test($(w, '#wizIn').textContent), 'review shows legal status');
  $(w, '#wBack').click(); ok(/Home area/.test($(w, '#wizIn').textContent), 'Back works'); next(w);
  next(w); // Finish
  ok(!wizOn(w), 'wizard closed after finish');
  const saved = JSON.parse(storage.d['cartroute.profile.v1'] || 'null');
  ok(saved && saved.name === 'Kyle' && saved.carts[0].nickname === 'Beach Buggy' && saved.carts[0].speed === 18 && saved.prefs.night === 'night' && saved.prefs.designatedLimit === 30 && saved.home.key === 'cocoa' && saved.setupDone, 'profile saved with all wizard answers');
  ok(/Beach Buggy/.test($(w, '#cartChip').textContent) && /Golf cart/.test($(w, '#cartChip').textContent), 'header chip shows active cart');
  ok(/Golf cart/.test($(w, '#status').textContent), 'main screen status computed from profile');
  // reload
  w = boot(storage); ok(!wizOn(w), 'reload: wizard skipped'); ok(/Beach Buggy/.test($(w, '#cartChip').textContent), 'reload: chip shows saved cart');
  // settings: add cart, switch, export, import, reset
  $(w, '#gear').click(); ok($(w, '#settings').classList.contains('on'), 'settings opens');
  $(w, '#addCart').click(); set(w, '#editor [data-k=nickname]', 'My LSV'); set(w, '#editor [data-k=type]', 'lsv'); set(w, '#editor [data-k=speed]', '25');
  $(w, '#eSave').click();
  let s2 = JSON.parse(storage.d['cartroute.profile.v1']); ok(s2.carts.length === 2 && s2.carts[1].nickname === 'My LSV' && s2.activeCartId === s2.carts[1].id, 'add cart saved + active');
  $(w, '[data-act=use]').click(); s2 = JSON.parse(storage.d['cartroute.profile.v1']); ok(s2.activeCartId === s2.carts[0].id, 'switch back to first cart');
  set(w, '[data-k=designatedLimit]', '35'); ok(JSON.parse(storage.d['cartroute.profile.v1']).prefs.designatedLimit === 35, 'pref change saved immediately');
  $(w, '#export').click(); const exported = $(w, '#ioText').value; ok(JSON.parse(exported).app === 'cartroute', 'export fills JSON');
  $(w, '#sClose').click(); ok(!$(w, '#settings').classList.contains('on'), 'settings closes');
  $(w, '#gear').click(); $(w, '#reset').click(); ok(wizOn(w) && !storage.d['cartroute.profile.v1'], 'reset clears data and starts wizard');
  const w2 = boot(storage); ok(wizOn(w2), 'after reset reload shows wizard');
  $(w2, '#wName').value = 'x';
  // import into fresh state via settings (first complete a profile by import)
  const w3 = boot(storage); $(w3, '#wizard').classList.remove('on'); $(w3, '#gear').click(); $(w3, '#ioText').value = exported; $(w3, '#impBtn').click();
  ok(JSON.parse(storage.d['cartroute.profile.v1']).name === 'Kyle', 'import restores exported profile');
  $(w3, '#ioText').value = 'garbage'; $(w3, '#impBtn').click(); ok($(w3, '#ioErr').textContent.length > 0, 'bad import shows error');
  // localStorage unavailable
  const w4 = boot('throw'); ok(wizOn(w4), 'no storage: wizard shown'); ok($(w4, '#storeNotice').style.display === 'block', 'no storage: notice visible');

  // ================= Geolocation (stubbed navigator.geolocation + fake Leaflet) =================
  const PR = require('./profile.js');
  function fakeL(rec) {
    const chain = new Proxy(function () {}, { get(_, k) { if (k === 'getZoom') return () => 13; if (k === 'then') return undefined; return (...a) => { rec.push([k, a]); return chain; }; }, apply() { return chain; } });
    return new Proxy({}, { get(_, k) { return (...a) => { rec.push(['L.' + String(k), a]); return k === 'latLngBounds' ? chain : chain; }; } });
  }
  function geoStub(mode, coords) {
    const calls = { get: 0, watch: 0, clear: 0, opts: null, watchCb: null };
    const pos = (c) => ({ coords: { latitude: c[0], longitude: c[1], accuracy: c[2] || 25 } });
    return { calls, api: {
      getCurrentPosition(ok, err, o) { calls.get++; calls.opts = o; if (mode === 'ok') ok(pos(coords)); else err({ code: { denied: 1, unavailable: 2, timeout: 3 }[mode] }); },
      watchPosition(ok, err, o) { calls.watch++; calls.opts = o; calls.watchCb = ok; calls.watchErr = err; if (mode === 'ok') ok(pos(coords)); else err({ code: { denied: 1, unavailable: 2, timeout: 3 }[mode] }); return 42; },
      clearWatch(id) { calls.clear++; calls.clearedId = id; } } , pos };
  }
  function seeded() { const st = (() => { const d = {}; return { d, setItem: (k, v) => { d[k] = String(v) }, getItem: k => (k in d ? d[k] : null), removeItem: k => { delete d[k] } }; })();
    const p = PR.defaultProfile(); p.setupDone = true; p.name = 'K'; p.home = { key: 'palm', label: 'Palm Bay, FL', lat: 27.9856, lon: -80.6262 }; st.setItem(PR.STORAGE_KEY, JSON.stringify(p)); return st; }
  function bootGeo(g, o) { o = o || {}; const rec = []; const st = o.storage || seeded();
    const w = boot(st, win => { win.L = fakeL(rec); if (g === 'none') { Object.defineProperty(win.navigator, 'geolocation', { value: undefined, configurable: true }); } else if (g) Object.defineProperty(win.navigator, 'geolocation', { value: g.api, configurable: true }); if (o.insecure) Object.defineProperty(win, 'isSecureContext', { value: false, configurable: true }); });
    return { w, rec, st }; }
  const msg = w => $(w, '#geoMsg').textContent, flush = () => new Promise(r => setTimeout(r, 30));

  // never prompts on load
  let g = geoStub('ok', [28.332, -80.608, 12]); let B = bootGeo(g);
  ok(g.calls.get === 0 && g.calls.watch === 0, 'no geolocation call on page load');
  // success: My location
  $(B.w, '#bLocStart').click(); await flush();
  ok(g.calls.get === 1 && g.calls.opts.enableHighAccuracy === true && g.calls.opts.timeout >= 10000, 'My location: getCurrentPosition with high accuracy + timeout');
  ok(B.rec.some(r => r[0] === 'L.circle') && B.rec.some(r => r[0] === 'L.circleMarker') && B.rec.some(r => r[0] === 'setView'), 'My location: accuracy circle + marker + map centered');
  ok(/Start set to your location/.test(msg(B.w)), 'crosshair: success message');
  ok(!B.w.document.getElementById('bLoc') && !B.w.document.body.textContent.includes('📡 My location'), 'big My location button removed');
  { const sv = B.rec.filter(r => r[0] === 'setView').pop(); ok(sv && Math.abs(sv[1][0][0] - 28.332) < 1e-6 && Math.abs(sv[1][0][1] + 80.608) < 1e-6, 'crosshair centers the map on the position'); ok(B.rec.some(r => r[0] === 'L.circle' && r[1][1].radius === 12), 'crosshair shows accuracy circle with the fix accuracy'); }
  ok(B.w.document.getElementById('bFollow').className === 'chip' && !B.w.document.getElementById('bFollow').parentElement.classList.contains('row'), 'Follow me is a compact chip button');
  ok(B.w.__cartroute.getProfile().home.key === 'palm' && !JSON.stringify(Object.assign({},B.st.d,{'cartroute.trip':undefined})).includes('28.332'), 'location NOT saved to profile/storage');
  // Start from my location
  $(B.w, '#bLocStart').click(); await flush();
  const pts = B.w.__cartroute.getPts(); ok(pts.start && Math.abs(pts.start[0] - 28.332) < 1e-6 && /^My location \(28\.332, -80\.608\)$/.test($(B.w, '#aStart').value), 'icon button beside start address sets route start and fills a readable label');
  { const row = $(B.w, '#aStart').parentElement; const ids = [...row.children].filter(e => e.tagName !== 'UL').map(e => e.id); ok(row.className === 'addr' && ids.join() === 'aStart,bLocStart,gStart', 'start row order: input, location icon, Find'); const lb = $(B.w, '#bLocStart'); ok(lb.getAttribute('aria-label') === 'Use my location as start' && lb.title === 'Use my location as start' && lb.querySelector('svg'), 'icon button has aria-label, title and icon');
    ok([...$(B.w, '#aEnd').parentElement.children].filter(e => e.tagName !== 'UL').map(e => e.id).join() === 'aEnd,gEnd', 'destination row has no location button'); ok(!B.w.document.body.textContent.includes('Start from my location'), 'old Start from my location button removed'); ok($(B.w, '#bFollow') && $(B.w, '#followReroute') && /stays in this browser/.test(B.w.document.body.textContent), 'My location, Follow me, reroute checkbox and privacy note remain'); }
  ok(!JSON.stringify(Object.assign({},B.st.d,{'cartroute.trip':undefined})).includes('28.332'), 'start-from-location still not persisted');
  // Follow me
  $(B.w, '#bFollow').click(); await flush();
  ok(g.calls.watch === 1 && B.w.__cartroute.isFollowing() && /Stop following/.test($(B.w, '#bFollow').textContent), 'Follow me: watchPosition started, button shows Stop');
  g.calls.watchCb({ coords: { latitude: 28.333, longitude: -80.609, accuracy: 10 } }); ok(B.rec.filter(r => r[0] === 'setLatLng').length >= 2, 'Follow me: marker updates on new fix');
  $(B.w, '#bFollow').click(); ok(g.calls.clear === 1 && g.calls.clearedId === 42 && !B.w.__cartroute.isFollowing() && /Follow me/.test($(B.w, '#bFollow').textContent), 'Follow off: clearWatch called with the watch id');
  // follow leaving Florida stops follow
  $(B.w, '#bFollow').click(); g.calls.watchCb({ coords: { latitude: 40.7, longitude: -74.0, accuracy: 10 } }); ok(!B.w.__cartroute.isFollowing() && g.calls.clear === 2 && /outside Florida/.test(msg(B.w)), 'follow: leaving Florida stops tracking with message');
  // follow reroute triggers go
  { const g2 = geoStub('ok', [28.332, -80.608, 12]); const B2 = bootGeo(g2); let clicks = 0; $(B2.w, '#go').addEventListener('click', () => clicks++);
    B2.w.__cartroute.getPts().end = [28.34, -80.6]; $(B2.w, '#followReroute').checked = true; $(B2.w, '#bFollow').click(); await flush();
    ok(clicks === 1, 'follow + reroute: new position triggers a route request'); }
  // denied / unavailable / timeout
  for (const [mode, re] of [['denied', /site settings/], ['unavailable', /could not work out/], ['timeout', /took too long/]]) {
    const gg = geoStub(mode); const BB = bootGeo(gg); $(BB.w, '#bLocStart').click(); await flush();
    ok(re.test(msg(BB.w)) && /address or tap the map/.test(msg(BB.w)), `error "${mode}" shows plain message with fallback`);
    $(BB.w, '#bLocStart').click(); await flush(); ok(!BB.w.__cartroute.getPts().start, `error "${mode}": start not set`);
    $(BB.w, '#bFollow').click(); await flush(); ok(!BB.w.__cartroute.isFollowing(), `error "${mode}": follow not left running`);
  }
  // unsupported
  { const BB = bootGeo('none'); $(BB.w, '#bLocStart').click(); await flush(); ok(/does not support location/.test(msg(BB.w)), 'unsupported browser message'); }
  // insecure context
  { const gg = geoStub('ok', [28.3, -80.6]); const BB = bootGeo(gg, { insecure: true }); $(BB.w, '#bLocStart').click(); await flush(); ok(gg.calls.get === 0 && /secure pages/.test(msg(BB.w)) && /address or tap/.test(msg(BB.w)), 'insecure context: message, no geolocation call'); }
  // outside Florida -> message + fall back to home
  { const gg = geoStub('ok', [40.7, -74.0, 20]); const BB = bootGeo(gg); BB.rec.length = 0; $(BB.w, '#bLocStart').click(); await flush();
    ok(/outside Florida/.test(msg(BB.w)) && /Florida only/.test(msg(BB.w)), 'outside Florida: explains Florida-only');
    const sv = BB.rec.filter(r => r[0] === 'setView').pop(); ok(sv && Math.abs(sv[1][0][0] - 27.9856) < 1e-6, 'outside Florida: map falls back to home area');
    ok(!BB.rec.some(r => r[0] === 'L.circle'), 'outside Florida: no position marker');
    $(BB.w, '#bLocStart').click(); await flush(); ok(!BB.w.__cartroute.getPts().start, 'outside Florida: start not set'); }
  // reverse geocode label (Photon) replaces the coordinate label
  { const gg = geoStub('ok', [28.332, -80.608, 12]); const rec = []; const w = boot(seeded(), win => { win.L = fakeL(rec); Object.defineProperty(win.navigator, 'geolocation', { value: gg.api, configurable: true }); win.fetch = async u => ({ ok: true, json: async () => ({ features: [{ properties: { street: 'Tulip Avenue', housenumber: '12', city: 'Cocoa Beach' } }] }) }); });
    $(w, '#bLocStart').click(); await flush(); await flush(); ok($(w, '#aStart').value === 'My location: 12 Tulip Avenue, Cocoa Beach', 'start box gets Photon reverse-geocoded label'); }
  // home area from location: wizard + settings
  { const gg = geoStub('ok', [28.332, -80.608, 15]); const st = { d: {}, setItem(k, v) { this.d[k] = String(v) }, getItem(k) { return k in this.d ? this.d[k] : null }, removeItem(k) { delete this.d[k] } };
    const BB = bootGeo(gg, { storage: st }); ok(wizOn(BB.w), 'fresh profile: wizard on (geo test)');
    ok(gg.calls.get === 0, 'wizard does not prompt for location by itself');
    for (let i = 0; i < 5; i++) next(BB.w); // to step 6 (home)
    ok(/Home area/.test($(BB.w, '#wizIn').textContent) && /stays in this browser/.test($(BB.w, '#wizIn').textContent), 'wizard home step shows privacy note');
    $(BB.w, '#homeGeo').click(); await flush(); ok(/My location \(28\.332, -80\.608\)/.test($(BB.w, '#homeSel').textContent), 'wizard: current location chosen as home');
    next(BB.w); next(BB.w); const sv = JSON.parse(st.d[PR.STORAGE_KEY]); ok(sv.home && sv.home.key === 'custom' && Math.abs(sv.home.lat - 28.332) < 1e-6, 'home area saved ONLY because the user chose it');
    $(BB.w, '#gear').click(); gg.calls.get = 0; $(BB.w, '#homeGeo').click(); await flush(); ok(gg.calls.get === 1 && /My location/.test($(BB.w, '#homeSel').textContent), 'settings: use my current location as home area');
    // outside Florida in settings
    const g3 = geoStub('ok', [40.7, -74.0]); const B3 = bootGeo(g3, { storage: st }); $(B3.w, '#gear').click(); $(B3.w, '#homeGeo').click(); await flush();
    ok(/outside Florida/.test($(B3.w, '#homeErr').textContent) && JSON.parse(st.d[PR.STORAGE_KEY]).home.lat === sv.home.lat, 'settings: outside Florida refused, home unchanged');
    const g4 = geoStub('denied'); const B4 = bootGeo(g4, { storage: st }); $(B4.w, '#gear').click(); $(B4.w, '#homeGeo').click(); await flush(); ok(/site settings/.test($(B4.w, '#homeErr').textContent), 'settings: denied shows how to re-enable'); }

  // ================= Tiles + geocoding =================
  function bootT(o) { o = o || {}; const rec = []; const st = o.storage || seeded(); const calls = [];
    const w = boot(st, win => { win.L = fakeL(rec); win.fetch = async (u) => { calls.push(String(u)); if (o.fetch) return o.fetch(String(u)); return { ok: true, json: async () => ({ features: [] }) }; }; }, o.url);
    return { w, rec, st, calls }; }
  const handlers = (rec, ev) => rec.filter(r => r[0] === 'on' && r[1][0] === ev).map(r => r[1][1]);
  const tileUrls = rec => rec.filter(r => r[0] === 'L.tileLayer').map(r => r[1][0]);
  { const T = bootT(); const urls = tileUrls(T.rec);
    ok(urls.length === 1 && /World_Street_Map/.test(urls[0]) && !/cartocdn|tile\.openstreetmap/.test(urls[0]), 'default tiles: Esri World Street Map (not CARTO/OSM)');
    ok(T.w.__cartroute.getTile() === 'esriStreet', 'active provider is esriStreet');
    ok(/Switch map/.test($(T.w, '#switchMap').textContent) && /Map not loading or showing a warning/.test($(T.w, '#switchMap').textContent), 'visible Switch map button on the map');
    const err = () => handlers(T.rec, 'tileerror').pop()();
    for (let i = 0; i < 4; i++) err(); ok(tileUrls(T.rec).length === 1, '4 tile errors: no switch yet');
    err(); ok(tileUrls(T.rec).length === 2 && /World_Topo_Map/.test(tileUrls(T.rec)[1]) && T.w.__cartroute.getTile() === 'esriTopo', '5 errors with no loads: switches to next Esri layer');
    ok(/switched to Esri World Topo/.test($(T.w, '#tileMsg').textContent) && $(T.w, '#tileMsg').style.display === 'block', 'switch notice shown');
    for (let i = 0; i < 5; i++) err(); ok(T.w.__cartroute.getTile() === 'esriImagery', 'second failure: next Esri layer');
    for (let i = 0; i < 5; i++) err(); ok(/No map tiles could be loaded/.test($(T.w, '#tileMsg').textContent) && !tileUrls(T.rec).some(x => /cartocdn|tile\.openstreetmap/.test(x)), 'chain exhausted: clear message; never auto-falls into CARTO/OSM');
  }
  { const T = bootT(); handlers(T.rec, 'tileload').pop()(); for (let i = 0; i < 30; i++) handlers(T.rec, 'tileerror').pop()(); ok(tileUrls(T.rec).length === 1, 'errors after a successful tile load do not switch provider'); }
  // manual Switch map cycles (warning tiles are HTTP 200 images, so no error event can detect them)
  { const T = bootT(); const keys = [T.w.__cartroute.getTile()]; for (let i = 0; i < 5; i++) { $(T.w, '#switchMap').click(); keys.push(T.w.__cartroute.getTile()); }
    ok(keys.join() === 'esriStreet,esriTopo,esriImagery,carto,osm,esriStreet', 'Switch map cycles Esri -> CARTO -> OSM -> back: ' + keys.join());
    $(T.w, '#switchMap').click(); $(T.w, '#switchMap').click(); $(T.w, '#switchMap').click(); ok(/CARTO Voyager/.test($(T.w, '#tileMsg').textContent) && /file/.test($(T.w, '#tileMsg').textContent), 'CARTO choice shows file:// warning note'); }
  // dark: overlay labels layer
  { const T = bootT(); $(T.w, '#gear').click(); set(T.w, '[data-k=basemap]', 'dark'); const u2 = tileUrls(T.rec).slice(-2);
    ok(/World_Dark_Gray_Base/.test(u2[0]) && /World_Dark_Gray_Reference/.test(u2[1]), 'dark: Esri Dark Gray Base + Reference overlay'); }
  // Settings: style + provider, saved in profile and reloaded
  { const T = bootT(); $(T.w, '#gear').click(); set(T.w, '[data-k=basemap]', 'satellite');
    ok(/World_Imagery/.test(tileUrls(T.rec).pop()) && JSON.parse(T.st.d[PR.STORAGE_KEY]).prefs.basemap === 'satellite', 'Settings: satellite applied and saved in profile');
    set(T.w, '[data-k=basemap]', 'topo'); ok(/World_Topo_Map/.test(tileUrls(T.rec).pop()), 'Settings: topo option');
    set(T.w, '[data-k=basemap]', 'street'); set(T.w, '[data-k=tileProvider]', 'carto');
    ok(/cartocdn/.test(tileUrls(T.rec).pop()) && JSON.parse(T.st.d[PR.STORAGE_KEY]).prefs.tileProvider === 'carto', 'Settings: Map provider = CARTO applied and saved');
    ok(/file:\/\//.test($(T.w, '#setIn').textContent), 'Settings: file:// note shown next to CARTO/OSM');
    const T2 = bootT({ storage: T.st }); ok(/cartocdn/.test(tileUrls(T2.rec)[0]) && T2.w.__cartroute.getTile() === 'carto', 'saved provider reloads');
    set(T.w, '[data-k=tileProvider]', 'osm'); ok(/tile\.openstreetmap/.test(tileUrls(T.rec).pop()), 'Settings: OSM option');
    set(T.w, '[data-k=tileProvider]', 'esri'); ok(/World_Street_Map/.test(tileUrls(T.rec).pop()), 'Settings: back to Esri');
    const T3 = bootT({ storage: T.st }); ok(/World_Street_Map/.test(tileUrls(T3.rec)[0]), 'Esri choice reloads'); }
  { const T = bootT(); set(T.w, '#aStart', ''); }
  // geocoding: Photon first, no Nominatim on file://
  const photonOK = u => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [-80.608, 28.332] } }] }) });
  { const T = bootT({ fetch: photonOK }); $(T.w, '#aStart').value = '749 S Orlando Ave Cocoa Beach'; $(T.w, '#gStart').click(); await new Promise(r => setTimeout(r, 1300));
    const pt = T.w.__cartroute.getPts().start; ok(pt && Math.abs(pt[0] - 28.332) < 1e-6 && Math.abs(pt[1] + 80.608) < 1e-6, 'geocode via Photon sets start (lon/lat order handled)');
    ok(T.calls.length === 1 && /photon\.komoot\.io/.test(T.calls[0]) && /bbox=-87\.7,24\.4,-79\.8,31\.05/.test(T.calls[0]), 'geocode uses Photon with Florida bbox only'); }
  { let alerted = ''; const T = bootT({ fetch: u => { throw new Error('network'); } }); T.w.alert = m => { alerted = m; }; $(T.w, '#aStart').value = 'x'; $(T.w, '#gStart').click(); await new Promise(r => setTimeout(r, 1300));
    ok(T.calls.length === 1 && !T.calls.some(c => /nominatim/.test(c)) && /Tap the map/.test(alerted), 'file://: Photon failure does NOT call Nominatim; clear message with tap fallback'); }
  { let alerted = ''; const T = bootT({ url: 'https://example.org/app/', fetch: u => /photon/.test(u) ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, json: async () => [{ lat: '28.1', lon: '-80.6' }] } }); T.w.alert = m => { alerted = m; };
    $(T.w, '#aStart').value = 'x'; $(T.w, '#gStart').click(); await new Promise(r => setTimeout(r, 1400));
    ok(T.calls.some(c => /nominatim/.test(c)) && T.w.__cartroute.getPts().start && T.w.__cartroute.getPts().start[0] === 28.1, 'https page: falls back to Nominatim when Photon fails'); }
  { let alerted = ''; const T = bootT({ fetch: u => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [-74.0, 40.7] } }] }) }) }); T.w.alert = m => { alerted = m; }; $(T.w, '#aStart').value = 'NYC'; $(T.w, '#gStart').click(); await new Promise(r => setTimeout(r, 1300));
    ok(/not found in Florida/.test(alerted) && !T.w.__cartroute.getPts().start, 'non-Florida geocode result rejected with message'); }

  // ================= Places panel =================
  const PL = require('./places.js');
  const roadsJson = JSON.parse(fs.readFileSync(__dirname + '/fixtures/palmbay.json'));
  const groJson = JSON.parse(fs.readFileSync(__dirname + '/fixtures/places_groceries_palmbay.json'));
  function seededLsv(patch) { const st = (() => { const d = {}; return { d, setItem: (k, v) => { d[k] = String(v) }, getItem: k => (k in d ? d[k] : null), removeItem: k => { delete d[k] } }; })();
    const p = PR.defaultProfile(); p.setupDone = true; p.name = 'K'; p.home = { key: 'palm', label: 'Palm Bay, FL', lat: 27.9856, lon: -80.6262 };
    Object.assign(p.carts[0], { type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: true }, patch || {});
    st.setItem(PR.STORAGE_KEY, JSON.stringify(p)); return st; }
  function pFetch(o) { const log = []; const f = async (u, init) => { u = String(u); const body = init && init.body ? decodeURIComponent(String(init.body).slice(5)) : ''; log.push({ u, body });
      if (/interpreter/.test(u)) { if (o.overpassFail) throw new Error('network down'); return { ok: true, json: async () => (/way\["highway"\]/.test(body) ? roadsJson : o.places || groJson) }; }
      if (/photon\.komoot\.io\/api/.test(u)) return { ok: true, json: async () => o.photon || { features: [] } };
      return { ok: true, json: async () => ({ features: [] }) }; }; f.log = log; return f; }
  function bootP(o) { o = o || {}; const rec = []; const f = pFetch(o);
    const w = boot(o.storage || seededLsv(), win => { win.L = fakeL(rec); win.fetch = f; const st0 = win.setTimeout; win.setTimeout = (fn, d, ...a) => st0(fn, d > 200 ? 5 : d, ...a);
      if (o.geo) Object.defineProperty(win.navigator, 'geolocation', { value: o.geo.api, configurable: true }); }, o.url);
    return { w, rec, f }; }
  const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 40)); } return false; };
  const listTxt = w => $(w, '#plList').textContent;
  { const P = bootP(); const box = $(P.w, '#placesBox');
    ok(box.tagName === 'DETAILS' && !box.open && /Find places/.test(box.textContent), 'Find places panel is collapsible and collapsed by default');
    ok([...P.w.document.querySelectorAll('#plChips [data-cat]')].map(b => b.dataset.cat).join() === 'food,coffee,groceries,gas,golf,parks,pharmacy,bars,shops', 'nine category chips');
    ok(/Photon and Overpass/.test(box.textContent) && /Nothing is saved/.test(box.textContent), 'privacy note in the panel');
    ok(P.f.log.length === 0, 'no network calls until a search is started');
    // category search
    $(P.w, '[data-cat=groceries]').click();
    ok(await waitFor(() => P.w.__cartroute.getPlaces().length > 3), 'groceries search returns results');
    const q = P.f.log.find(x => /nwr\[/.test(x.body)); ok(q && q.body === PL.buildQuery('groceries', 27.9856, -80.6262, 3000), 'category query sent to Overpass around the map center with 3 km default');
    const ps = P.w.__cartroute.getPlaces(); ok(ps.every((p, i) => i === 0 || ps[i - 1].distanceM <= p.distanceM), 'results sorted by distance');
    ok(await waitFor(() => !/Checking/.test(listTxt(P.w)) && /(Reachable|Needs assumed|No legal route|walk)/.test(listTxt(P.w))), 'reachability badges resolve for visible results');
    const roadCalls = P.f.log.filter(x => /way\["highway"\]/.test(x.body)).length; ok(roadCalls === 1, 'one road graph download covers the whole batch (' + roadCalls + ')');
    ok(/Reachable by legal route \(\d\.\d mi, ~\d+ min\)|Needs assumed roads \(\d\.\d mi, ~\d+ min\)|No legal route found|you may need to walk/.test(listTxt(P.w)), 'badge texts match spec wording');
    ok(P.rec.filter(r => r[0] === 'L.marker').length >= ps.length && P.rec.some(r => r[0] === 'L.divIcon' && /🛒/.test(JSON.stringify(r[1]))), 'markers with category emoji drawn');
    // detail + Route here / Start from here
    const first = $(P.w, '#plList button.pl'); first.click();
    const det = $(P.w, '#placeDetail'); ok(det.style.display === 'block' && det.textContent.includes(ps[0].name) && $(P.w, '#plRoute') && $(P.w, '#plStart'), 'tapping a result shows details with Route here / Start from here');
    $(P.w, '#plRoute').click(); const pe = P.w.__cartroute.getPts().end; ok(pe && Math.abs(pe[0] - ps[0].lat) < 1e-9 && $(P.w, '#aEnd').value === ps[0].name, 'Route here sets the destination');
    $(P.w, '#plStart').click(); const pst = P.w.__cartroute.getPts().start; ok(pst && Math.abs(pst[1] - ps[0].lon) < 1e-9 && $(P.w, '#aStart').value === ps[0].name, 'Start from here sets the start');
    // marker click selects
    const clicks = P.rec.filter(r => r[0] === 'on' && r[1][0] === 'click'); clicks[clicks.length - 1][1][1](); ok($(P.w, '#placeDetail').style.display === 'block', 'marker click shows details');
    // cached: same search does not re-download places
    const n1 = P.f.log.filter(x => /nwr\[/.test(x.body)).length; $(P.w, '[data-cat=groceries]').click(); await waitFor(() => P.w.__cartroute.getPlaces().length > 3); ok(P.f.log.filter(x => /nwr\[/.test(x.body)).length === n1, 'repeat category search served from session cache'); }
  // radius selector + hours display, on-demand check, text search debounce
  { const places = { elements: [
      { type: 'node', id: 11, lat: 27.9870, lon: -80.6250, tags: { name: 'Corner Market', shop: 'convenience', opening_hours: 'Mo-Su 06:00-22:00', phone: '321-555-0101', website: 'https://example.com' } },
      ...Array.from({ length: 12 }, (_, i) => ({ type: 'node', id: 100 + i, lat: 27.9856 + 0.0015 * (i + 2), lon: -80.6262, tags: { name: 'Shop ' + i, shop: 'convenience' } })) ] };
    { const P1 = bootP({ places }); $(P1.w, '#plRadius').value = '1000'; $(P1.w, '[data-cat=groceries]').click(); await waitFor(() => P1.w.__cartroute.getPlaces().length > 3);
    ok(/around:1000,/.test(P1.f.log.find(x => /nwr\[/.test(x.body)).body) && P1.w.__cartroute.getPlaces().every(p => p.distanceM <= 1050), 'radius 1 km used in query and results trimmed to it'); }
    const P = bootP({ places }); $(P.w, '#plRadius').value = '5000'; $(P.w, '[data-cat=groceries]').click(); await waitFor(() => P.w.__cartroute.getPlaces().length > 10);
    ok(/around:5000,/.test(P.f.log.find(x => /nwr\[/.test(x.body)).body), 'radius 5 km used in query');
    await waitFor(() => !/Checking/.test(listTxt(P.w)));
    const checked = [...P.w.document.querySelectorAll('#plList .bdg')].filter(b => !/Tap to check/.test(b.textContent)).length; ok(checked === 10, 'only the top 10 are checked automatically (' + checked + ')');
    const last = [...P.w.document.querySelectorAll('#plList button.pl')].pop(); ok(/Tap to check/.test(last.textContent), 'remaining results wait for a tap');
    last.click(); ok(await waitFor(() => !/Tap to check|Checking/.test($(P.w, '#placeDetail').textContent)), 'tapping an unchecked result computes it on demand');
    [...P.w.document.querySelectorAll('#plList button.pl')].find(b => /Corner Market/.test(b.textContent)).click();
    const dt = $(P.w, '#placeDetail').textContent; ok(/as listed in OpenStreetMap/.test(dt) && /Mo-Su 06:00-22:00/.test(dt) && /321-555-0101/.test(dt) && /Website/.test(dt) && !/Open now|Closed now/i.test(dt), 'detail shows raw hours/phone/website, no open/closed claim'); }
  { const P = bootP({ photon: { features: [{ properties: { name: 'Publix Super Market', osm_key: 'shop', osm_value: 'supermarket', street: 'Malabar Rd', city: 'Palm Bay' }, geometry: { coordinates: [-80.63, 27.99] } }] } });
    const qi = $(P.w, '#plQuery'); qi.value = 'Publix'; $(P.w, '#plGo').click();
    await waitFor(() => P.w.__cartroute.getPlaces().length === 1); const pc = P.f.log.filter(x => /photon/.test(x.u)); ok(pc.length === 1 && /q=Publix$/.test(pc[0].u) && /bbox=-87\.7/.test(pc[0].u) && /lat=27\.9856/.test(pc[0].u), 'Search button: one Photon call with Florida bbox + bias (' + pc.length + ' calls)');
    ok(/Publix Super Market/.test(listTxt(P.w)) && /Supermarket/.test(listTxt(P.w)), 'Photon result listed with category');
    $(P.w, '#plGo').click(); await new Promise(r => setTimeout(r, 100)); ok(P.f.log.filter(x => /photon/.test(x.u) && /limit=10/.test(x.u)).length === 1, 'same query not re-sent'); }
  // walk message for a place far from any legal road
  { const places = { elements: [{ type: 'node', id: 21, lat: 27.965, lon: -80.64, tags: { name: 'Island Pier', amenity: 'cafe' } }] };
    const P = bootP({ places }); $(P.w, '#plRadius').value = '5000'; $(P.w, '[data-cat=coffee]').click(); await waitFor(() => P.w.__cartroute.getPlaces().length === 1); await waitFor(() => !/Checking/.test(listTxt(P.w)));
    ok(/nearest legal road is \d+ m away; you may need to walk/.test(listTxt(P.w)), 'far place: "nearest legal road is x m away; you may need to walk"'); }
  // ineligible cart
  { const P = bootP({ storage: seededLsv({ mirrors: false }) }); $(P.w, '[data-cat=groceries]').click(); await waitFor(() => P.w.__cartroute.getPlaces().length > 3); ok(await waitFor(() => /not eligible/.test(listTxt(P.w))) && P.f.log.every(x => !/way\["highway"\]/.test(x.body)), 'ineligible cart: badge says so, no road download'); }
  // Overpass failure -> clear message (file://)
  { const P = bootP({ overpassFail: true }); $(P.w, '[data-cat=food]').click(); ok(await waitFor(() => /map-data servers failed/.test($(P.w, '#plMsg').textContent)) && /overpass\.private\.coffee/.test($(P.w, '#plMsg').textContent) && $(P.w, '#plMsg').className.includes('bad'), 'Overpass failure shows clear file:// message'); }
  // "My location" origin asks the browser only on search
  { const gg = geoStub('ok', [28.332, -80.608, 15]); const P = bootP({ geo: gg }); ok(gg.calls.get === 0, 'places panel does not prompt for location'); set(P.w, '#plAround', 'me'); ok(gg.calls.get === 0, 'selecting My location alone does not prompt');
    $(P.w, '[data-cat=food]').click(); await waitFor(() => gg.calls.get === 1); await waitFor(() => P.f.log.some(x => /nwr\[/.test(x.body))); ok(P.f.log.find(x => /nwr\[/.test(x.body)).body.includes('28.33200,-80.60800'), 'search around the user position when chosen'); }

  // ================= Autocomplete =================
  const fxj = n => JSON.parse(fs.readFileSync(__dirname + '/fixtures/' + n + '.json'));
  const KE = (w, key) => new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  function bootAC(o) { o = o || {}; const rec = []; const log = [];
    const f = async (u, init) => { u = String(u); log.push({ u, signal: init && init.signal });
      if (/photon\.komoot\.io\/api/.test(u) && /limit=6/.test(u)) { const h = o.handler ? o.handler(u, init, log.length) : null; if (h) return h; }
      return { ok: true, json: async () => ({ features: [] }) }; };
    const w = boot(o.storage || seededLsv(), win => { win.L = fakeL(rec); win.fetch = f; if (o.geo) Object.defineProperty(win.navigator, 'geolocation', { value: o.geo.api, configurable: true }); }, o.url);
    return { w, rec, log }; }
  const respond = (name, delay) => ({ ok: true, json: async () => { if (delay) await new Promise(r => setTimeout(r, delay)); return fxj(name); } });
  const acCalls = P => P.log.filter(x => /limit=6/.test(x.u));
  const opts = (w, id) => [...w.document.querySelectorAll('#' + id).length ? $(w, '#' + id).parentElement.querySelectorAll('[role=option]') : []];
  const typeIn = (w, sel, v) => { const e = $(w, sel); e.focus(); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  { const P = bootAC({ handler: () => respond('photon_publix_palm') });
    const ip = $(P.w, '#aEnd'); ok(ip.getAttribute('role') === 'combobox' && ip.getAttribute('aria-autocomplete') === 'list' && ip.getAttribute('aria-expanded') === 'false' && $(P.w, '#aEnd').parentElement.querySelector('[role=listbox]'), 'ARIA combobox + listbox roles');
    typeIn(P.w, '#aEnd', 'Pu'); typeIn(P.w, '#aEnd', 'Pub'); await sleep(400); ok(acCalls(P).length === 1, 'minimum 3 characters ("Pu" ignored, "Pub" searched) (' + acCalls(P).length + ')');
    P.log.length = 0; for (const v of ['Pub', 'Publ', 'Publi', 'Publix']) { typeIn(P.w, '#aEnd', v); await sleep(60); } ok(acCalls(P).length === 0, 'debounce: no request while typing fast'); await sleep(450);
    ok(acCalls(P).length === 1 && /q=Publix$/.test(acCalls(P)[0].u) && /limit=6/.test(acCalls(P)[0].u) && /lang=en/.test(acCalls(P)[0].u) && /bbox=-87\.7,24\.4,-79\.8,31\.05/.test(acCalls(P)[0].u) && /lat=27\.9856&lon=-80\.6262/.test(acCalls(P)[0].u), 'one Photon request after the 300 ms pause: limit 6, Florida bbox, bias to map center');
    const o = opts(P.w, 'aEnd'); ok(o.length === 5 && ip.getAttribute('aria-expanded') === 'true', 'dropdown shows suggestions (' + o.length + ')');
    ok(/Publix/.test(o[1].querySelector('.p').textContent) && /1150 Malabar Road Southeast, Palm Bay, Brevard County, Florida/.test(o[1].querySelector('.s').textContent) && o[1].querySelector('.ic').textContent === '🛒', 'primary line, secondary line (city, county, state) and type icon');
    ok(o.every(x => x.id && x.getAttribute('aria-selected') === 'false'), 'options have ids and aria-selected');
    // select by click
    o[1].click(); ok($(P.w, '#aEnd').value === 'Publix, 1150 Malabar Road Southeast, Palm Bay, FL', 'selection fills the full label'); const pe = P.w.__cartroute.getPts().end;
    ok(pe && Math.abs(pe[0] - fxj('photon_publix_palm').features[1].geometry.coordinates[1]) < 1e-9, 'selection sets the destination'); ok(P.rec.some(r => r[0] === 'setView' && r[1][1] === 15), 'selection recenters the map');
    ok($(P.w, '#aEnd').parentElement.querySelector('[role=listbox]').hidden === true, 'dropdown closes after selection');
    const sv = JSON.parse(JSON.stringify(P.w.__cartroute.getProfile().recents)); ok(sv.length === 1 && sv[0].label.startsWith('Publix, 1150'), 'pick saved to recents in the profile'); }
  // start field: My location + recents on focus; selection sets start
  { const gg = geoStub('ok', [28.332, -80.608, 12]); const st = seededLsv(); const pr = JSON.parse(st.d[PR.STORAGE_KEY]); pr.recents = [{ label: 'Cocoa Beach Pier, Meade Avenue, Cocoa Beach, FL', lat: 28.3676, lon: -80.6013, icon: '🏖️' }]; st.d[PR.STORAGE_KEY] = JSON.stringify(pr);
    const P = bootAC({ storage: st, geo: gg, handler: () => respond('photon_cocoa_beach_pier') }); $(P.w, '#aStart').focus(); $(P.w, '#aStart').dispatchEvent(new P.w.Event('focus'));
    let o = opts(P.w, 'aStart'); ok(o.length === 3 && /My location/.test(o[0].textContent) && /Cocoa Beach Pier/.test(o[1].textContent) && /Clear recent/.test(o[2].textContent), 'empty start field: My location first, then recents, then Clear');
    ok(gg.calls.get === 0, 'opening the list does not ask for location'); o[0].click(); await sleep(60); ok(gg.calls.get === 1 && P.w.__cartroute.getPts().start && Math.abs(P.w.__cartroute.getPts().start[0] - 28.332) < 1e-6, 'choosing My location uses the location action (only on tap)');
    $(P.w, '#aStart').value = ''; $(P.w, '#aStart').dispatchEvent(new P.w.Event('input')); o = opts(P.w, 'aStart'); o[1].click(); const ps = P.w.__cartroute.getPts().start; ok(ps && Math.abs(ps[0] - 28.3676) < 1e-6 && /Cocoa Beach Pier/.test($(P.w, '#aStart').value), 'picking a recent sets the start');
    $(P.w, '#aStart').value = ''; $(P.w, '#aStart').dispatchEvent(new P.w.Event('input')); o = opts(P.w, 'aStart'); o[o.length - 1].click(); ok(P.w.__cartroute.getProfile().recents.length === 0 && JSON.parse(st.d[PR.STORAGE_KEY]).recents.length === 0, 'Clear recent searches empties the stored list'); }
  // recents cap + order
  { const P = bootAC({ handler: u => ({ ok: true, json: async () => ({ features: [{ properties: { name: decodeURIComponent(u.split('q=')[1]), city: 'Palm Bay', state: 'Florida', osm_key: 'place', osm_value: 'city' }, geometry: { coordinates: [-80.6 + (u.charCodeAt(u.length - 1) % 20) * 0.01, 28.0 + u.length * 0.001] } }] }) }) });
    for (const n of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']) { typeIn(P.w, '#aEnd', n); await sleep(360); await waitFor(() => opts(P.w, 'aEnd').length === 1, 3000); opts(P.w, 'aEnd')[0].click(); }
    const rc = P.w.__cartroute.getProfile().recents; ok(rc.length === 5 && rc[0].label.startsWith('Foxtrot') && !rc.some(r => r.label.startsWith('Alpha')), 'recents: max 5, newest first, oldest dropped'); }
  // states: loading, empty, error
  { let release; const P = bootAC({ handler: u => /Slow/.test(u) ? { ok: true, json: () => new Promise(r => { release = () => r(fxj('photon_publix_palm')); }) } : /zzz/.test(u) ? respond('photon_zzzqqxx') : null });
    typeIn(P.w, '#aEnd', 'Slowpoke'); await sleep(400); ok(/Searching/.test($(P.w, '#aEnd').parentElement.querySelector('[role=listbox]').textContent), 'loading state: Searching…'); release(); await sleep(50); ok(opts(P.w, 'aEnd').length === 5, 'results replace the loading row');
    typeIn(P.w, '#aEnd', 'zzzqqxx'); await sleep(400); ok(/No places found in Florida/.test($(P.w, '#aEnd').parentElement.querySelector('[role=listbox]').textContent) && opts(P.w, 'aEnd').length === 0, 'no-results state'); }
  { const P = bootAC({ handler: () => { throw new Error('offline'); } }); typeIn(P.w, '#aEnd', 'Publix'); await sleep(450);
    ok(/unavailable right now/.test($(P.w, '#aEnd').parentElement.textContent) && /tap the map/.test($(P.w, '#aEnd').parentElement.textContent), 'error state mentions the tap-the-map fallback'); 
    const find = []; $(P.w, '#gEnd').addEventListener('click', () => find.push(1)); $(P.w, '#aEnd').dispatchEvent(KE(P.w, 'Enter')); ok(find.length === 1, 'Enter with nothing highlighted runs the Find action'); }
  // stale response cancellation
  { const P = bootAC({ handler: u => /Publix/.test(u) ? respond('photon_publix_palm', 700) : respond('photon_cocoa_beach_pier') });
    typeIn(P.w, '#aEnd', 'Publix'); await sleep(380); typeIn(P.w, '#aEnd', 'Cocoa Beach Pier'); await sleep(420);
    const [c1, c2] = acCalls(P); ok(acCalls(P).length === 2 && c1.signal.aborted === true && c2.signal.aborted === false, 'older request aborted via AbortController');
    ok(opts(P.w, 'aEnd').length === 1 && /Cocoa Beach Pier/.test(opts(P.w, 'aEnd')[0].textContent), 'newest results shown'); await sleep(500); ok(opts(P.w, 'aEnd').length === 1 && /Cocoa Beach Pier/.test(opts(P.w, 'aEnd')[0].textContent), 'late stale response does not overwrite newer results'); }
  // keyboard
  { const P = bootAC({ handler: () => respond('photon_publix_palm') }); const ip = $(P.w, '#aEnd'); typeIn(P.w, '#aEnd', 'Publix'); await sleep(450); const o = opts(P.w, 'aEnd');
    ip.dispatchEvent(KE(P.w, 'ArrowDown')); ok(o[0].getAttribute('aria-selected') === 'true' && ip.getAttribute('aria-activedescendant') === o[0].id, 'ArrowDown highlights first (aria-activedescendant)');
    ip.dispatchEvent(KE(P.w, 'ArrowDown')); ok(o[1].getAttribute('aria-selected') === 'true' && o[0].getAttribute('aria-selected') === 'false', 'ArrowDown moves on');
    ip.dispatchEvent(KE(P.w, 'ArrowUp')); ip.dispatchEvent(KE(P.w, 'ArrowUp')); ok(o[o.length - 1].getAttribute('aria-selected') === 'true', 'ArrowUp wraps to last');
    ip.dispatchEvent(KE(P.w, 'ArrowDown')); ip.dispatchEvent(KE(P.w, 'ArrowDown')); ip.dispatchEvent(KE(P.w, 'Enter'));
    ok(/^Publix, 1150 Malabar/.test(ip.value) && P.w.__cartroute.getPts().end, 'Enter picks the highlighted suggestion');
    typeIn(P.w, '#aEnd', 'Publix2'); await sleep(450); ok(!$(P.w, '#aEnd').parentElement.querySelector('[role=listbox]').hidden, 'list reopened'); ip.dispatchEvent(KE(P.w, 'Escape')); ok($(P.w, '#aEnd').parentElement.querySelector('[role=listbox]').hidden && ip.getAttribute('aria-expanded') === 'false', 'Escape closes'); }
  // outside tap + blur
  { const P = bootAC({ handler: () => respond('photon_publix_palm') }); typeIn(P.w, '#aEnd', 'Publix'); await sleep(450); const lb = $(P.w, '#aEnd').parentElement.querySelector('[role=listbox]');
    opts(P.w, 'aEnd')[0].dispatchEvent(new P.w.Event('pointerdown', { bubbles: true, cancelable: true })); ok(!lb.hidden, 'tapping inside the dropdown keeps it open');
    P.w.document.body.dispatchEvent(new P.w.Event('pointerdown', { bubbles: true })); ok(lb.hidden, 'tap outside closes');
    typeIn(P.w, '#aEnd', 'Publix'); await sleep(450); ok(!lb.hidden, 'reopens'); $(P.w, '#aEnd').dispatchEvent(new P.w.Event('blur')); await sleep(260); ok(lb.hidden, 'blur closes (after a short delay so taps still land)');
    typeIn(P.w, '#aEnd', 'Publix'); await sleep(450); $(P.w, '#aEnd').dispatchEvent(new P.w.Event('blur')); opts(P.w, 'aEnd')[0].dispatchEvent(new P.w.Event('pointerdown', { bubbles: true, cancelable: true })); await sleep(260); ok(!lb.hidden, 'blur followed by a tap on a suggestion does not close it first (touch ordering)'); }
  // Find places box + wizard home field
  { const P = bootAC({ handler: () => respond('photon_publix_palm') }); typeIn(P.w, '#plQuery', 'Publix'); await sleep(450); opts(P.w, 'plQuery')[1].click();
    ok(P.w.__cartroute.getPlaces().length === 1 && /Publix/.test(listTxt(P.w)) && $(P.w, '#placeDetail').style.display === 'block', 'Find places: picking a suggestion shows it in the results with details'); }
  { const st = { d: {}, setItem(k, v) { this.d[k] = String(v) }, getItem(k) { return k in this.d ? this.d[k] : null }, removeItem(k) { delete this.d[k] } };
    const P = bootAC({ storage: st, handler: () => respond('photon_cocoa_beach_pier') }); ok(wizOn(P.w), 'wizard shown');
    for (let i = 0; i < 5; i++) next(P.w); typeIn(P.w, '#homeAddr', 'Cocoa Beach Pier'); await sleep(450); opts(P.w, 'homeAddr')[0].click();
    ok(/Selected: .*Cocoa Beach Pier/.test($(P.w, '#homeSel').textContent), 'wizard home field: suggestion sets the home area'); ok(!st.d[PR.STORAGE_KEY], 'wizard pick saved nothing before Finish'); next(P.w); next(P.w);
    const hv = JSON.parse(st.d[PR.STORAGE_KEY]); ok(hv.home && hv.home.key === 'custom' && /Cocoa Beach Pier/.test(hv.home.label) && hv.recents.length === 0, 'home saved on Finish; no recents from the wizard'); }
  ok(/send what you type and the map center to Photon/.test(bootAC().w.document.body.textContent), 'privacy line near the address fields');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
