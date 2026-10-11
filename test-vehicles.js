/* Vehicle profiles, Europe detection, units, warnings (called from test.js) */
module.exports = function (ok) {
  const GC = require('./lib.js'), VEH = require('./vehicles.js'), EUR = require('./europe.js'), GEO = require('./geo.js'), PR = require('./profile.js'), ST = require('./states.js');
  console.log('\n== vehicles / Europe');
  const st = (type, speed, o) => GC.cartStatus({ type, speed }, o || {});
  const mot = st('motorcycle', 55), mop = st('moped', 28), esc = st('escooter', 15), l6 = st('l6e', 28, { region: 'EU', country: EUR.get('FR'), unit: 'kmh' });
  ok(mot.ok && mop.ok && esc.ok && l6.ok && mot.rules.cls === 'veh', 'new vehicle types give eligible statuses');
  const mw = { highway: 'motorway', maxspeed: '65 mph' }, res = { highway: 'residential' }, cyc = { highway: 'cycleway' }, pth = { highway: 'path', bicycle: 'designated' }, pri = { highway: 'primary', maxspeed: '55 mph' };
  ok(GC.classifyWay(mw, mot.rules).allowed, 'motorcycle may use a motorway');
  ok(GC.classifyWay({ highway: 'motorway_link' }, mot.rules).allowed && GC.classifyWay({ highway: 'trunk', maxspeed: '55 mph' }, mot.rules).allowed, 'motorcycle may use ramps and trunk roads');
  ok(!GC.classifyWay(mw, mop.rules).allowed && /motorway/.test(GC.classifyWay(mw, mop.rules).reason), 'moped may not use a motorway');
  ok(!GC.classifyWay(mw, esc.rules).allowed && !GC.classifyWay(mw, l6.rules).allowed, 'e-scooter and L6e may not use a motorway');
  ok(!GC.classifyWay({ highway: 'trunk', expressway: 'yes' }, mop.rules).allowed && !GC.classifyWay({ highway: 'primary', motorroad: 'yes' }, l6.rules).allowed, 'moped/L6e avoid expressways and motorroads');
  ok(GC.classifyWay(cyc, esc.rules).allowed && GC.classifyWay(pth, esc.rules).allowed && !GC.classifyWay({ highway: 'path' }, esc.rules).allowed, 'e-bike may use cycleway and designated paths, not undesignated paths');
  ok(!GC.classifyWay(cyc, mot.rules).allowed && !GC.classifyWay(cyc, mop.rules).allowed, 'motorcycle and moped may not use cycleways');
  ok(GC.classifyWay(res, mop.rules).allowed && GC.classifyWay(res, mot.rules).allowed && GC.classifyWay(res, esc.rules).allowed, 'residential street open to all vehicle types');
  ok(!GC.classifyWay(pri, mop.rules).allowed && GC.classifyWay(pri, mot.rules).allowed && !GC.classifyWay(pri, esc.rules).allowed, '55 mph primary: motorcycle yes, moped no, e-scooter no');
  ok(!GC.classifyWay({ highway: 'footway' }, esc.rules).allowed, 'sidewalks never allowed');
  // region + units: OSM maxspeed is km/h unless tagged mph
  const eu = GC.classifyWay({ highway: 'secondary', maxspeed: '90' }, l6.rules), eu2 = GC.classifyWay({ highway: 'secondary', maxspeed: '70' }, l6.rules);
  ok(!eu.allowed && eu2.allowed && eu2.speed === 70 && eu2.kmh === 70, 'Europe: bare maxspeed is km/h (90 blocked for L6e, 70 allowed)');
  const us = GC.classifyWay({ highway: 'secondary', maxspeed: '70' }, mop.rules);
  ok(!us.allowed && us.speed === 70, 'US: bare maxspeed is mph (70 blocked for moped)');
  ok(GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph' }, l6.rules).allowed === true && GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph' }, l6.rules).speed === 64, 'explicit mph tag in Europe (UK) is converted to km/h');
  ok(GC.classifyWay({ highway: 'residential' }, l6.rules).speed === 50, 'Europe default residential assumed 50 km/h');
  // golf / LSV in Europe
  const g = GC.cartStatus({ type: 'golf', speed: 15, mirrors: true, reflectors: true }, { region: 'EU', country: EUR.get('DE'), unit: 'kmh' });
  ok(!g.ok && /not road-legal in Europe/.test(g.label) && /L6e/.test(g.explain[0]), 'golf cart / LSV in Europe: not road-legal, suggests L6e');
  ok(!st('moped', 45).ok && st('l6e', 29).ok === false && st('l6e', 28).ok, 'speed caps: moped over ~31 mph, L6e over 45 km/h rejected');
  // routing on a synthetic graph: A -(motorway 9.8km direct)- B ; A - C - B residential detour ; A - D - B cycleway
  const nodes = [[1, 28.30, -80.60], [2, 28.30, -80.50], [3, 28.34, -80.55], [4, 28.302, -80.55], [5, 28.30, -80.598], [6, 28.30, -80.502]];
  const els = nodes.map(n => ({ type: 'node', id: n[0], lat: n[1], lon: n[2] }));
  els.push({ type: 'way', id: 10, nodes: [5, 6], tags: { highway: 'motorway', maxspeed: '65 mph', name: 'Hwy' } });
  els.push({ type: 'way', id: 13, nodes: [1, 5], tags: { highway: 'residential', name: 'Ramp A' } }, { type: 'way', id: 14, nodes: [6, 2], tags: { highway: 'residential', name: 'Ramp B' } });
  els.push({ type: 'way', id: 11, nodes: [1, 3, 2], tags: { highway: 'residential', name: 'Back St' } });
  els.push({ type: 'way', id: 12, nodes: [1, 4, 2], tags: { highway: 'cycleway', name: 'Bike Path' } });
  const gph = GC.parseOverpass({ elements: els }), A = [28.30, -80.60], B = [28.30, -80.50];
  const rt = (s, o) => GC.planRoute(gph, s, A, B, o || { cartMph: 30 });
  const rm = rt(mot, { cartMph: 55 }), rp = rt(mop), re = rt(esc, { cartMph: 15 });
  ok(rm.ok && rm.segments.some(x => x.name === 'Hwy'), 'planRoute: motorcycle takes the motorway');
  ok(rp.ok && rp.segments.every(x => x.name === 'Back St') && rp.distance_m > rm.distance_m, 'planRoute: moped avoids the motorway (detour)');
  ok(re.ok && re.segments.every(x => x.name === 'Bike Path'), 'planRoute: e-scooter takes the bike path');
  ok(rm.time_s < rp.time_s, 'motorcycle on the motorway is faster than the moped detour');
  ok(GC.classifyWay({ highway: 'motorway_link' }, mot.rules).speed === 45 && GC.classifyWay({ highway: 'motorway_link' }, l6.rules).allowed === false, 'ramps get an assumed speed (45 mph / 70 km/h)');
  // Florida golf cart / LSV unchanged
  const fl = GC.cartStatus({ type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, reflectors: true, parkingBrake: true, mirrors: true, windshield: true, seatBelts: true, hasVin: true, registered: true });
  ok(fl.cls === 'lsv' && fl.rules.cls === 'lsv' && fl.rules.limit === 35 && !GC.classifyWay(mw, fl.rules).allowed && !GC.classifyWay({ highway: 'secondary', maxspeed: '45 mph' }, fl.rules).allowed && GC.classifyWay({ highway: 'secondary', maxspeed: '35 mph' }, fl.rules).allowed, 'Florida LSV rules unchanged');
  const gf = GC.cartStatus({ type: 'golf', speed: 18, mirrors: true, reflectors: true });
  ok(gf.cls === 'golf' && gf.rules.limit === 25 && GC.classifyWay(res, gf.rules).allowed && !GC.classifyWay(mw, gf.rules).allowed, 'Florida golf cart rules unchanged');
  // US state warning stays for vehicles in non-verified states
  const njv = GC.cartStatus({ type: 'motorcycle', speed: 55 }, { state: ST.get('NJ') });
  ok(njv.state && njv.state.abbr === 'NJ' && njv.state.verified === false, 'US vehicle status carries the unverified-state marker');
  // country detection
  const cities = { Paris: [48.8566, 2.3522, 'FR'], Berlin: [52.52, 13.405, 'DE'], Madrid: [40.4168, -3.7038, 'ES'], Rome: [41.9028, 12.4964, 'IT'], Amsterdam: [52.3676, 4.9041, 'NL'], London: [51.5074, -0.1278, 'GB'], Oslo: [59.9139, 10.7522, 'NO'], Zurich: [47.3769, 8.5417, 'CH'], Lisbon: [38.72, -9.14, 'PT'], Vienna: [48.21, 16.37, 'AT'], Dublin: [53.35, -6.26, 'IE'], Warsaw: [52.23, 21.01, 'PL'], Stockholm: [59.33, 18.07, 'SE'] };
  Object.keys(cities).forEach(c => { const t = EUR.detect(cities[c][0], cities[c][1]); ok(t && t.c === cities[c][2], 'country detection: ' + c + ' -> ' + (t && t.c)); });
  ok(!EUR.detect(25.77, -80.19) && !EUR.detect(35.7, 139.7) && !EUR.detect(41, 29) && !EUR.detect(NaN, 1), 'Miami, Tokyo, Istanbul, NaN are not in Europe');
  ok(EUR.T.length === 30 && EUR.T.filter(t => t.eu).length === 27 && EUR.get('GB').m === 'mph' && EUR.get('FR').m === 'kmh', 'table: 27 EU + UK + NO + CH; UK uses mph');
  ok(GEO.supported(48.85, 2.35) && GEO.supported(28.3, -80.6) && !GEO.supported(35.7, 139.7) && GEO.inEurope(51.5, -0.12), 'GEO.supported = US + Europe');
  ok(EUR.get('IT').u && /^https?:/.test(EUR.authorityLink(EUR.get('IT'))), 'Italy has a research-sourced link');
  ok(/google\.com\/search\?q=Germany/.test(EUR.authorityLink(EUR.get('DE'))) && /eur-lex/.test(EUR.lawLink(EUR.get('DE'))), 'countries without a national source fall back to a web search; EU law links to EUR-Lex');
  // warning text
  ok(EUR.warning(EUR.get('FR')) === "Rules in France aren't verified. Golf carts are generally not road-legal in the EU; check local law." && /in Europe; check/.test(EUR.warning(EUR.get('NO'))), 'Europe warning wording (EU vs non-EU)');
  ok(EUR.flag(EUR.get('FR')) === '🇫🇷', 'flag emoji');
  // units
  ok(VEH.unitFor('auto', EUR.get('FR')) === 'kmh' && VEH.unitFor('auto', EUR.get('GB')) === 'mph' && VEH.unitFor('auto', null) === 'mph' && VEH.unitFor('mph', EUR.get('FR')) === 'mph' && VEH.unitFor('kmh', null) === 'kmh', 'unit derived from region with override');
  ok(VEH.speedToDisplay(27.96, 'kmh') === 45 && Math.abs(VEH.speedFromDisplay(45, 'kmh') - 28) < 0.06 && VEH.speedToDisplay(19, 'mph') === 19, 'speed unit conversion round trip (45 km/h ~ 28 mph)');
  ok(VEH.distLabel(1609.344, 'mph') === '1.00 mi' && VEH.distLabel(2500, 'kmh') === '2.50 km' && VEH.toUnit(80, 'mph') === 50, 'distance labels and conversions');
  // profile: types, units pref, Europe points
  const pn = PR.normalize({ carts: [{ type: 'motorcycle', speed: 60 }, { type: 'bogus', speed: 10 }], prefs: { units: 'kmh' }, home: { lat: 48.86, lon: 2.35, label: 'Paris' } });
  ok(pn.carts[0].type === 'motorcycle' && pn.carts[1].type === 'golf' && pn.prefs.units === 'kmh' && pn.home && PR.normalize({ prefs: { units: 'x' } }).prefs.units === 'auto', 'profile keeps vehicle types, units pref, Europe home');
  const sf = PR.statusFor(GC, PR.normalize({ carts: [{ type: 'l6e', speed: 28 }] }), null, null, { country: EUR.get('FR') });
  ok(sf.ok && sf.region === 'EU' && sf.unit === 'kmh' && sf.country.code === 'FR', 'statusFor with a Europe region gives km/h L6e status');
  ok(PR.validateCart({ type: 'moped', speed: 40 }).length === 1 && PR.validateCart({ type: 'motorcycle', speed: 70 }).length === 0 && PR.validateCart({ type: 'golf', speed: 61 }).length === 1, 'validateCart caps per type');

  // ---- regression: ramp terminal must not cut the surface road (moped Rockledge -> Cocoa) ----
  (function () {
    const n = [[1, 28.300, -80.600], [2, 28.300, -80.590], [3, 28.300, -80.580], [4, 28.301, -80.590], [5, 28.305, -80.590], [6, 28.310, -80.590]];
    const e = n.map(x => ({ type: 'node', id: x[0], lat: x[1], lon: x[2] }));
    e.push({ type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'secondary', name: 'Main W', maxspeed: '35 mph' } }, { type: 'way', id: 2, nodes: [2, 3], tags: { highway: 'secondary', name: 'Main E', maxspeed: '35 mph' } });
    e.push({ type: 'way', id: 3, nodes: [2, 4, 5], tags: { highway: 'motorway_link', name: 'Ramp' } }, { type: 'way', id: 4, nodes: [5, 6], tags: { highway: 'motorway', name: 'I-95' } });
    const g = GC.parseOverpass({ elements: e }), r = GC.planRoute(g, mop, [28.300, -80.600], [28.300, -80.580], { cartMph: 28 });
    ok(r.ok && r.segments.every(x => /^Main/.test(x.name)), 'regression: surface road through a ramp-terminal node stays connected for a moped');
    ok(GC.buildAdj(g, mop.rules, false).blocked.has(5) && !GC.buildAdj(g, mop.rules, false).blocked.has(2), 'ramp terminal node stays open, mainline node stays blocked');
  })();
  // ---- regression: snap past an exit-only one-way stub (Paris L6e Louvre -> Gare de Lyon) ----
  (function () {
    const n = [[1, 48.8600, 2.3300], [2, 48.8600, 2.3400], [3, 48.8600, 2.3500], [4, 48.8601, 2.3499], [5, 48.8601, 2.3300]];
    const e = n.map(x => ({ type: 'node', id: x[0], lat: x[1], lon: x[2] }));
    e.push({ type: 'way', id: 1, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Rue A' } });
    e.push({ type: 'way', id: 2, nodes: [4, 3], tags: { highway: 'service', oneway: 'yes', name: 'Exit only' } }); // you can leave node 4 but never reach it
    e.push({ type: 'way', id: 3, nodes: [5, 1], tags: { highway: 'service', oneway: 'yes', name: 'Entry only' } }); // you can reach node 5? no: 5 -> 1 only
    const g = GC.parseOverpass({ elements: e }), r = GC.planRoute(g, l6, [48.8601, 2.3300], [48.8601, 2.3499], { cartMph: 28 });
    ok(r.ok && r.snap.start.id !== 5 && r.snap.end.id !== 4, 'regression: start/end snap off one-way dead-end stubs to the main network');
    ok(GC.mainComponent(GC.buildAdj(g, l6.rules, false)).has(2) && !GC.mainComponent(GC.buildAdj(g, l6.rules, false)).has(4), 'main component excludes exit-only stubs');
  })();
  // ---- blocked-road message ----
  (function () {
    const n = [[1, 28.3000, -80.600], [2, 28.3000, -80.590], [3, 28.3000, -80.580], [4, 28.3010, -80.5900]];
    const e = n.map(x => ({ type: 'node', id: x[0], lat: x[1], lon: x[2] }));
    e.push({ type: 'way', id: 1, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Quiet St' } });
    e.push({ type: 'way', id: 2, nodes: [4, 2], tags: { highway: 'primary', name: 'Fast Rd', maxspeed: '65 mph' } });
    const g = GC.parseOverpass({ elements: e }), r = GC.planRoute(g, mop, [28.3010, -80.5900], [28.3000, -80.580], { cartMph: 28 });
    ok(r.ok && r.warnings.some(w => /on Fast Rd, a road your vehicle can't use; snapped to the nearest allowed road \d+ m away/.test(w)), 'start on a disallowed road gets a clear snapped-to-allowed-road message');
  })();
  // ---- adaptive routing area ----
  (function () {
    const a = [28.30, -80.70], b = [28.36, -80.79], b0 = GC.bboxFor(a, b, 700), w1 = GC.widerBbox(a, b, 0), w2 = GC.widerBbox(a, b, 1);
    ok(GC.ROUTE_PADS[0] === 700 && w1 && w1.padM === 2000 && w2 && w2.padM === 5000 && (w1.n - w1.s) > (b0.n - b0.s) && GC.widerBbox(a, b, 2) === null, 'widerBbox steps 700 m -> 2 km -> 5 km then stops');
    const far = [28.30, -80.55], far2 = [28.30, -80.67];
    ok(GC.bboxAreaKm2(GC.bboxFor(far, far2, 5000)) > 0 && GC.widerBbox([28.0, -80.0], [28.0, -80.12], 1) !== null && GC.widerBbox([28.0, -80.0], [28.1, -80.12], 1) === null, 'widening is refused past the area cap (' + GC.MAX_AREA_KM2 + ' km2)');
  })();
  // ---- e-scooter bike lanes on faster streets ----
  (function () {
    const lane = GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph', cycleway: 'lane' }, esc.rules), nolane = GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph' }, esc.rules);
    ok(lane.allowed && lane.bikeLane && !nolane.allowed, 'cycleway=lane lets an e-scooter use a 40 mph street');
    ok(GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph', 'cycleway:right': 'track' }, esc.rules).allowed && !GC.classifyWay({ highway: 'secondary', maxspeed: '55 mph', cycleway: 'lane' }, esc.rules).allowed && !GC.classifyWay({ highway: 'secondary', maxspeed: '40 mph', cycleway: 'lane' }, mop.rules).bikeLane, 'cycleway:right=track counts, 55 mph still blocked, mopeds unaffected');
  })();
};
