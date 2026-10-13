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
  // MPH/KPH preference applies to US golf cart / LSV rules, text, segments, directions and places too
  ok(VEH.convertSpeedText('25 mph', 'kmh') === '40 km/h' && VEH.convertSpeedText('35 mph', 'kmh') === '56 km/h' && VEH.convertSpeedText('20 mph', 'kmh') === '32 km/h' && VEH.convertSpeedText('up to 25 mph.', 'mph') === 'up to 25 mph.', 'convertSpeedText: 25 mph = 40 km/h, 35 = 56, 20 = 32; mph left alone');
  ok(VEH.convSpeed(25, 'mph', 'kmh') === 40 && VEH.convSpeed(40, 'kmh', 'mph') === 25 && VEH.convSpeed(30, 'mph', 'mph') === 30, 'convSpeed');
  const GEQ = { type: 'golf', speed: 19, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true };
  const gM = GC.cartStatus(GEQ, { unit: 'mph' }), gK = GC.cartStatus(GEQ, { unit: 'kmh' });
  ok(/25 mph/.test(gM.label) && gM.rules.unit === 'mph' && /40 km\/h/.test(gK.label) && !/mph/.test(gK.label) && gK.rules.unit === 'kmh', 'golf cart status label follows units: ' + gK.label);
  ok(!/mph/.test(gK.explain.join(' ') + gK.warnings.join(' ')) , 'golf cart explain/warnings have no mph in km/h mode');
  const lK = GC.cartStatus({ type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: true }, { unit: 'kmh' });
  ok(/56 km\/h/.test(lK.label) && !/mph/.test(lK.checklist.map(c => c.item + (c.note || '')).join(' ')), 'LSV label and checklist in km/h: ' + lK.label);
  const cwK = GC.classifyWay({ highway: 'primary', maxspeed: '45 mph' }, lK.rules), cwM = GC.classifyWay({ highway: 'primary', maxspeed: '45 mph' }, GC.cartStatus({ type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: true }, { unit: 'mph' }).rules);
  ok(cwM.speed === 45 && /45 mph/.test(cwM.reason) && cwK.speed === 72 && /72 km\/h/.test(cwK.reason) && /56 km\/h/.test(cwK.reason) && cwK.allowed === cwM.allowed, 'segment speed and reason convert, legality unchanged: ' + cwK.reason);
  ok(PR.normalize({ prefs: { units: 'mph' } }).prefs.units === 'mph' && PR.normalize({ prefs: { units: 'kmh' } }).prefs.units === 'kmh' && PR.normalize({}).prefs.units === 'auto', 'units pref persisted: auto / mph / kmh');
  ok(PR.statusFor(GC, PR.normalize({ carts: [{ type: 'golf', speed: 19 }], prefs: { units: 'kmh' } }), null, null, null).unit === 'kmh' && PR.statusFor(GC, PR.normalize({ carts: [{ type: 'golf', speed: 19 }] }), null, null, null).unit === 'mph', 'statusFor: Auto in the US = mph, explicit kmh wins');
  const PLx = require('./places.js'), DIRx = require('./directions.js');
  ok(PLx.fmtDist(100, 'kmh') === '100 m' && PLx.fmtDist(2500, 'kmh') === '2.5 km' && PLx.fmtDist(1609.344) === '1.0 mi', 'places distance by unit');
  ok(DIRx.fmtDist(3218.688, 'mph') === '2.0 mi' && DIRx.fmtDist(3218.688, 'kmh') === '3.2 km' && DIRx.fmtDist(100, 'mph') === '330 ft' && DIRx.fmtDist(100, 'kmh') === '100 m', 'turn-by-turn distance mi/ft vs km/m');
  const NAVx = require('./nav.js');
  ok(NAVx.speedNum(11.176, 'mph') === 25 && NAVx.speedNum(11.176, 'kmh') === 40 && NAVx.speedLabel(11.176, 'kmh') === '40 km/h', 'nav speed bubble mph/kmh');
  // ===== new vehicle types: car, EV, truck/RV, ATV/UTV, bicycle, pedestrian =====
  const CART = (type, o) => GC.cartStatus(Object.assign({ type, speed: VEH.get(type).defMph }, o || {}), { unit: 'mph' });
  const car = CART('car'), ev = CART('ev', { rangeKm: 400, socPct: 90 }), trk = CART('truck', { heightM: 3.7, weightT: 11.8, lengthM: 9 }), atv = CART('atv'), bic = CART('bicycle'), ped = CART('foot');
  ok([car, ev, trk, atv, bic, ped].every(x => x.ok && x.rules.cls === 'veh'), 'all new vehicle types give eligible statuses');
  ok(VEH.ORDER.length === 12 && VEH.GROUPS.reduce((n, g) => n + g[1].length, 0) === 12 && VEH.GROUPS.every(g => g[1].every(k => VEH.get(k))), 'picker groups cover every vehicle type');
  const T = (hw, extra) => Object.assign({ highway: hw }, extra || {});
  // car / EV
  ok(GC.classifyWay(T('motorway', { maxspeed: '65 mph' }), car.rules).allowed && GC.classifyWay(T('trunk'), car.rules).allowed && GC.classifyWay(T('residential'), car.rules).allowed, 'car: motorway, trunk and residential allowed');
  ok(!GC.classifyWay(T('footway'), car.rules).allowed && !GC.classifyWay(T('cycleway'), car.rules).allowed && !GC.classifyWay(T('pedestrian'), car.rules).allowed && !GC.classifyWay(T('track'), car.rules).allowed && !GC.classifyWay(T('steps'), car.rules).allowed, 'car: no sidewalks, cycleways, pedestrian streets, tracks');
  ok(!GC.classifyWay(T('residential', { motor_vehicle: 'no' }), car.rules).allowed && GC.classifyWay(T('motorway'), ev.rules).allowed && !GC.classifyWay(T('footway'), ev.rules).allowed, 'car: motor_vehicle=no blocked; EV uses car rules');
  const carEu = GC.cartStatus({ type: 'car', speed: 80 }, { region: 'EU', country: EUR.get('DE'), unit: 'kmh' });
  ok(carEu.ok && GC.classifyWay(T('motorway', { maxspeed: '130' }), carEu.rules).speed === 130 && GC.classifyWay(T('residential'), carEu.rules).speed === 50 && carEu.rules.unit === 'kmh', 'car in Europe: km/h speeds, bare maxspeed is km/h');
  ok(GC.classifyWay(T('motorway', { maxspeed: '65 mph' }), car.rules).speed === 65 && GC.classifyWay(T('motorway', { maxspeed: '65 mph' }), GC.cartStatus({ type: 'car', speed: 65 }, { unit: 'kmh' }).rules).speed === 105, 'car speeds follow units setting (65 mph = 105 km/h)');
  // truck
  ok(GC.parseLen('4.2') === 4.2 && Math.abs(GC.parseLen("13'6\"") - 4.1148) < 1e-3 && Math.abs(GC.parseLen('12 ft') - 3.6576) < 1e-3 && GC.parseLen('none') === null && Math.abs(GC.parseWeight('20000 lbs') - 9.0718) < 1e-3 && GC.parseWeight('7.5 t') === 7.5 && Math.abs(GC.parseWeight('10 st') - 9.07185) < 1e-4, 'OSM maxheight/maxweight parsing (m, ft/in, t, lbs, short tons)');
  const cw = (tags, r) => GC.classifyWay(tags, (r || trk).rules);
  ok(cw(T('secondary', { maxheight: '5' })).allowed && !cw(T('secondary', { maxheight: '3.2' })).allowed && /height limit 10'6" \(your vehicle 12'2"\)/.test(cw(T('secondary', { maxheight: '3.2' })).reason), 'truck: maxheight below vehicle blocks: ' + cw(T('secondary', { maxheight: '3.2' })).reason);
  ok(!cw(T('primary', { maxweight: '7.5' })).allowed && cw(T('primary', { maxweight: '40' })).allowed && !cw(T('primary', { 'maxweight:hgv': '10' })).allowed, 'truck: maxweight / maxweight:hgv honored');
  ok(!cw(T('primary', { maxlength: '8' })).allowed && cw(T('primary', { maxlength: '12' })).allowed, 'truck: maxlength honored');
  ok(!cw(T('residential', { hgv: 'no' })).allowed && !cw(T('residential', { hgv: 'destination' })).allowed && cw(T('residential', { hgv: 'yes' })).allowed, 'truck: hgv=no / destination blocked');
  ok(cw(T('motorway')).allowed && !cw(T('living_street')).allowed && !cw(T('footway')).allowed && !cw(T('track')).allowed, 'truck: motorways ok; living streets, footways, tracks avoided');
  ok(cw(T('residential')).drivable && !cw(T('secondary', { maxheight: '3' })).allowed && cw(T('secondary', { maxheight: '3' })).drivable, 'truck: blocked-by-height road still flagged drivable (red alternative)');
  ok(cw(T('residential')).pen > cw(T('secondary')).pen, 'truck: residential streets penalised vs main roads');
  const tk2 = GC.cartStatus({ type: 'truck', speed: 55, heightM: 3, weightT: 5, lengthM: 6 }, { unit: 'kmh' });
  ok(/height limit 2\.8 m \(your vehicle 3 m\)/.test(GC.classifyWay(T('secondary', { maxheight: '2.8' }), tk2.rules).reason) && !GC.cartStatus({ type: 'truck', speed: 55, heightM: 0, weightT: 5, lengthM: 6 }, {}).ok, 'truck reasons follow units; dimensions required');
  // ATV / UTV
  const aw = (tags) => GC.classifyWay(tags, atv.rules);
  ok(aw(T('residential')).allowed && aw(T('residential')).basis === 'assumed' && aw(T('residential', { atv: 'yes' })).basis === 'tagged' && !aw(T('residential', { atv: 'no' })).allowed, 'ATV: quiet roads assumed, atv=yes tagged, atv=no blocked');
  ok(!aw(T('motorway')).allowed && !aw(T('trunk')).allowed && !aw(T('primary')).allowed && !aw(T('secondary')).allowed && !aw(T('footway')).allowed && !aw(T('cycleway')).allowed, 'ATV: never motorways, trunks, main roads, footways, cycleways');
  ok(!aw(T('track')).allowed && aw(T('track', { atv: 'yes' })).allowed && aw(T('track', { motor_vehicle: 'yes' })).allowed && aw(T('path', { motor_vehicle: 'designated' })).allowed && !aw(T('path', { motor_vehicle: 'no' })).allowed && !aw(T('track', { atv: 'yes', access: 'private' })).allowed, 'ATV: tracks/trails only when tagged for ATVs or motor vehicles');
  ok(!aw(T('tertiary', { maxspeed: '55 mph' })).allowed && aw(T('tertiary', { maxspeed: '35 mph' })).allowed, 'ATV: roads above ~45 mph excluded');
  ok(atv.warnings.some(w => /check local law/i.test(w)) && atv.link && /^https:\/\//.test(atv.link.href) && /ATV/.test(atv.link.text), 'ATV: check-local-law warning with link');
  const atvEu = GC.cartStatus({ type: 'atv', speed: 25 }, { region: 'EU', country: EUR.get('FR'), unit: 'kmh' });
  ok(atvEu.ok && /France/.test(atvEu.link.text) && atvEu.rules.roadMaxKmh === 60, 'ATV in Europe: country link, 60 km/h road limit');
  // bicycle
  const bw = (tags) => GC.classifyWay(tags, bic.rules);
  ok(bw(T('cycleway')).allowed && bw(T('path', { bicycle: 'designated' })).allowed && !bw(T('path')).allowed && bw(T('residential')).allowed && bw(T('track')).allowed && !bw(T('track', { bicycle: 'no' })).allowed, 'bicycle: cycleways, designated paths, streets, tracks');
  ok(!bw(T('motorway')).allowed && !bw(T('trunk')).allowed && !bw(T('primary', { expressway: 'yes', motorroad: 'yes' })).allowed && !bw(T('footway')).allowed && bw(T('footway', { bicycle: 'designated' })).allowed && !bw(T('steps')).allowed, 'bicycle: no motorways/expressways/sidewalks, footways only if bicycle=designated');
  ok(bw(T('cycleway')).pen < bw(T('primary')).pen && bw(T('secondary', { cycleway: 'lane' })).pen < bw(T('secondary')).pen, 'bicycle: bike paths/lanes preferred over main roads');
  ok(!bw(T('primary', { maxspeed: '65 mph' })).allowed && bw(T('primary', { maxspeed: '45 mph' })).allowed, 'bicycle: fast roads above ~50 mph excluded');
  // pedestrian
  const pw = (tags) => GC.classifyWay(tags, ped.rules);
  ok(pw(T('footway')).allowed && pw(T('pedestrian')).allowed && pw(T('steps')).allowed && pw(T('footway', { footway: 'crossing' })).allowed && pw(T('path')).allowed && pw(T('cycleway')).allowed, 'pedestrian: footways, pedestrian streets, steps, crossings, paths, cycleways');
  ok(!pw(T('motorway')).allowed && !pw(T('trunk', { expressway: 'yes' })).allowed && !pw(T('footway', { foot: 'no' })).allowed && !pw(T('footway', { access: 'private' })).allowed, 'pedestrian: no motorways/expressways, foot=no or private blocked');
  ok(pw(T('residential')).allowed && pw(T('residential')).basis === 'assumed' && pw(T('residential', { sidewalk: 'both' })).basis === 'tagged' && !pw(T('primary')).allowed && pw(T('primary', { sidewalk: 'right' })).allowed && pw(T('secondary', { 'sidewalk:both': 'yes' })).allowed, 'pedestrian: sidewalks tagged; streets assumed; major roads need a sidewalk');
  ok(pw(T('footway')).pen < pw(T('residential')).pen && pw(T('steps')).pen > 1, 'pedestrian: footways preferred, steps penalised');
  ok(ped.rules.topKmh < 6 && /footways|sidewalks/.test(ped.label), 'pedestrian: walking speed 3 mph: ' + ped.label);
  ok(/foot/.test(GC.overpassQuery({ s: 1, w: 2, n: 3, e: 4 }, ped.rules)) === false && !/footway\|steps/.test(GC.overpassQuery({ s: 1, w: 2, n: 3, e: 4 }, ped.rules)) && /footway\|steps/.test(GC.overpassQuery({ s: 1, w: 2, n: 3, e: 4 })) && /bicycle/.test(GC.overpassQuery({ s: 1, w: 2, n: 3, e: 4 }, bic.rules)), 'overpass query: pedestrians include footways/steps; cars do not; bikes add bicycle=yes footways');
  // routing end to end on a tiny synthetic graph: park footpath shortcut, one-way, height restriction
  (function () {
    const els = []; const N = (id, lat, lon) => els.push({ type: 'node', id, lat, lon });
    const W = (id, nodes, tags) => els.push({ type: 'way', id, nodes, tags });
    // grid: A(1)-B(2)-C(3) along a residential street; D(4) above B; E(5) above C. Footway B-D? shortcut footpath A-D-E-C, plus a low-bridge road B-C
    N(1, 28.0000, -80.6000); N(2, 28.0000, -80.5950); N(3, 28.0000, -80.5900); N(4, 28.0030, -80.5950); N(5, 28.0030, -80.5900); N(6, 28.0060, -80.5900); N(7, 28.0060, -80.6000);
    W(10, [1, 2], { highway: 'residential' }); W(11, [2, 3], { highway: 'secondary', maxheight: '3.0' }); W(12, [2, 4], { highway: 'residential' }); W(13, [4, 5], { highway: 'residential' }); W(14, [5, 3], { highway: 'residential' });
    W(15, [1, 7], { highway: 'footway' }); W(16, [7, 6], { highway: 'footway' }); W(17, [6, 3], { highway: 'footway' });
    const g = GC.parseOverpass({ elements: els }), a = [28.0000, -80.6000], b = [28.0000, -80.5900];
    const sT = GC.cartStatus({ type: 'truck', speed: 45, heightM: 3.7, weightT: 10, lengthM: 8 }, { unit: 'mph' }), sC = GC.cartStatus({ type: 'car', speed: 45 }, { unit: 'mph' }), sP = GC.cartStatus({ type: 'foot', speed: 3 }, { unit: 'mph' });
    const rT = GC.planRoute(g, sT, a, b, { cartMph: 45 }), rC = GC.planRoute(g, sC, a, b, { cartMph: 45 }), rP = GC.planRoute(g, sP, a, b, { cartMph: 3 });
    ok(rC.ok && rC.segments.some(s => s.name === '(unnamed secondary)') , 'car takes the direct secondary road');
    ok(rT.ok && !rT.segments.some(s => s.hw === 'secondary') && rT.distance_m > rC.distance_m, 'truck detours around the 3.0 m height limit (' + Math.round(rT.distance_m) + ' m vs ' + Math.round(rC.distance_m) + ' m)');
    ok(rP.ok && rP.time_s > rC.time_s * 5 && rP.segments.some(s => s.hw === 'footway'), 'pedestrian uses footway and walking ETA is much longer (' + Math.round(rP.time_s / 60) + ' min)');
    const sT2 = GC.cartStatus({ type: 'truck', speed: 45, heightM: 2.5, weightT: 10, lengthM: 8 }, { unit: 'mph' });
    ok(GC.planRoute(g, sT2, a, b, { cartMph: 45 }).segments.some(s => s.hw === 'secondary'), 'truck under the limit may use the direct road');
    const sE = GC.cartStatus({ type: 'ev', speed: 45, rangeKm: 0.5, socPct: 100 }, { unit: 'mph' }), rE = GC.planRoute(g, sE, a, b, { cartMph: 45 });
    ok(rE.ok && rE.ev && rE.ev.exceeds && rE.warnings.some(w => /longer than your usable range/.test(w)), 'EV: warning when route exceeds usable range');
    const sE2 = GC.cartStatus({ type: 'ev', speed: 45, rangeKm: 300, socPct: 100 }, { unit: 'mph' });
    ok(!GC.planRoute(g, sE2, a, b, { cartMph: 45 }).warnings.some(w => /usable range/.test(w)), 'EV: no warning within range');
  })();
  // EV range + charger planning
  const er = VEH.evRange(400, 90);
  ok(Math.abs(er.usableKm - 306) < 1e-6 && Math.abs(er.fullKm - 272) < 1e-6 && ev.explain.some(t => /Usable range about 190 mi/.test(t)), 'EV usable range = rated x charge x 0.85 reserve (306 km = 190 mi): ' + ev.explain.join(' '));
  ok(GC.cartStatus({ type: 'ev', speed: 65, rangeKm: 400, socPct: 90 }, { unit: 'kmh' }).explain.some(t => /Usable range about 306 km/.test(t)), 'EV range text follows units');
  const line = []; for (let i = 0; i <= 100; i++) line.push([28 + i * 0.01, -80.6]); // ~111 km north
  const chg = (id, k, off) => ({ id, lat: 28 + k * 0.01, lon: -80.6 + (off || 0), name: 'C' + id, operator: '', sockets: [] });
  let plan = GC.chargerPlan(line, [chg(1, 20), chg(2, 45), chg(3, 70), chg(4, 90)], 60000, 50000, 3000);
  ok(plan.needed && plan.ok && plan.stops.length === 2 && plan.stops[0].alongM <= 60000 && plan.stops[1].alongM - plan.stops[0].alongM <= 50000 && plan.totalM - plan.stops[1].alongM <= 50000 && plan.stops[0].station.id === 2 && plan.totalM > 110000, 'chargerPlan: greedy farthest-reachable stops, every leg within range (' + plan.stops.map(s => s.station.name) + ')');
  plan = GC.chargerPlan(line, [chg(1, 20)], 150000, 150000, 3000); ok(!plan.needed && plan.stops.length === 0 && plan.nearby.length === 1, 'chargerPlan: no stops when within range');
  plan = GC.chargerPlan(line, [chg(1, 20), chg(2, 90)], 60000, 50000, 3000); ok(plan.needed && !plan.ok && /No charging station/.test(plan.message), 'chargerPlan: fails clearly when a gap exceeds range');
  plan = GC.chargerPlan(line, [chg(1, 45, 0.1)], 60000, 50000, 3000); ok(!plan.ok && plan.nearby.length === 0, 'chargerPlan: stations more than 3 km off the route are ignored');
  const pc = GC.parseChargers({ elements: [{ type: 'node', id: 1, lat: 28.1, lon: -80.6, tags: { amenity: 'charging_station', name: 'Mall Chargers', operator: 'Tesla', 'socket:type2': '2', 'socket:type2:output': '11 kW', capacity: '4' } }, { type: 'way', id: 2, center: { lat: 28.2, lon: -80.6 }, tags: { amenity: 'charging_station' } }, { type: 'node', id: 3, lat: 28.3, lon: -80.6, tags: { amenity: 'charging_station', access: 'private' } }, { type: 'node', id: 4, lat: 28.4, lon: -80.6, tags: { amenity: 'cafe' } }] });
  ok(pc.length === 2 && pc[0].name === 'Mall Chargers' && pc[0].capacity === 4 && pc[0].sockets.join() === 'type2' && pc[1].lat === 28.2 && /charging_station/.test(GC.chargingQuery({ s: 1, w: 2, n: 3, e: 4 })), 'parseChargers: nodes + way centers, private and non-chargers dropped');
  // profile: new fields, validation, round trip
  const pe = PR.normalize({ carts: [{ type: 'truck', speed: 55, heightM: 4.1, weightT: 20, lengthM: 12 }, { type: 'ev', speed: 65, rangeKm: 350, socPct: 80 }, { type: 'foot', speed: 3, heightM: 'x', rangeKm: -4 }] });
  ok(pe.carts[0].heightM === 4.1 && pe.carts[0].weightT === 20 && pe.carts[1].rangeKm === 350 && pe.carts[1].socPct === 80 && pe.carts[2].type === 'foot' && pe.carts[2].heightM === VEH.DIM_DEFAULTS.heightM && pe.carts[2].rangeKm === VEH.EV_DEFAULTS.rangeKm, 'profile keeps height/weight/length and EV range; bad values fall back');
  ok(PR.validateCart({ type: 'truck', speed: 55, heightM: 9, weightT: 20, lengthM: 12 }).length === 1 && PR.validateCart({ type: 'ev', speed: 65, rangeKm: 2, socPct: 50 }).length === 1 && PR.validateCart({ type: 'foot', speed: 3 }).length === 0 && PR.validateCart({ type: 'foot', speed: 9 }).length === 1 && PR.validateCart({ type: 'car', speed: 120 }).length === 1, 'validation: dimensions, range, walking speed cap, car speed cap');
  ok(JSON.stringify(PR.parseImport(PR.serialize(pe)).profile.carts) === JSON.stringify(pe.carts), 'new vehicle fields survive export/import');
  ok(VEH.lenToDisplay(3.7, 'mph') === 12.1 && Math.abs(VEH.lenFromDisplay(12.1, 'mph') - 3.688) < 1e-3 && VEH.weightToDisplay(11.8, 'mph') === 13 && VEH.rangeToDisplay(400, 'mph') === 249 && Math.abs(VEH.rangeFromDisplay(249, 'mph') - 400.7) < 0.1 && VEH.rangeToDisplay(400, 'kmh') === 400 && VEH.lenLabel(4.1148, 'mph') === "13'6\"", 'units: height/weight/range conversions for mph vs km/h');
  ok(JSON.stringify(PR.normalize({}).prefs.voice) === JSON.stringify({ on: true, voiceURI: '', rate: 1, volume: 1 }) && PR.normalize({ prefs: { voice: { on: false, rate: 1.4, volume: 0.5, voiceURI: 'com.apple.samantha' } } }).prefs.voice.rate === 1.4 && PR.normalize({ prefs: { voice: { on: false } } }).prefs.voice.on === false && PR.parseImport(PR.serialize(PR.normalize({ prefs: { voice: { on: false, volume: 0.3 } } }))).profile.prefs.voice.volume === 0.3, 'voice prefs persist in the profile (on by default, export/import)');
  ok(JSON.stringify(PR.normalize({ prefs: { voice: { rate: 9, volume: 2 } } }).prefs.voice) === JSON.stringify(require('./nav.js').normVoice({ rate: 9, volume: 2 })), 'profile and NAV voice normalisation agree');
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
