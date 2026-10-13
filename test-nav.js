const GC = require('./lib.js'), DIR = require('./directions.js'), NAV = require('./nav.js');
function run(ok) {
const near = (a, b, e) => Math.abs(a - b) <= e;
// ---- thresholds by speed
const slow = NAV.leadDistances(4, 0), cart = NAV.leadDistances(8.9, 8.9), fast = NAV.leadDistances(26.8, 0), idle = NAV.leadDistances(0, 0);
ok(fast.far === 800 && fast.near === 150 && fast.now >= 25, 'highway speed: 800 m / 150 m / ~30 m: ' + JSON.stringify(fast));
ok(cart.far < 450 && cart.far > cart.near * 2 - 1 && cart.near >= 100 && cart.near <= 140, 'golf cart (20 mph): shorter distances: ' + JSON.stringify(cart));
ok(slow.far < cart.far && slow.near <= cart.near, 'slower => lower thresholds');
ok(idle.near >= 50 && idle.far >= 150 && idle.now >= 12, 'stopped speed still gets sane minimum distances');
ok([fast, cart, slow, idle].every(t => t.far >= t.near * 2 && t.near > t.now), 'thresholds strictly ordered far > near > now');
// ---- spoken text
ok(NAV.spokenDist(800, 'mph') === 'half a mile' && NAV.spokenDist(150, 'mph') === '500 feet' && NAV.spokenDist(1609.344, 'mph') === '1 mile' && NAV.spokenDist(480, 'mph') === '0.3 miles', 'spoken mph/ft: ' + NAV.spokenDist(480, 'mph'));
ok(NAV.spokenDist(800, 'kmh') === '800 metres' && NAV.spokenDist(150, 'kmh') === '150 metres' && NAV.spokenDist(1500, 'kmh') === '1.5 kilometres' && NAV.spokenDist(1000, 'kmh') === '1 kilometre' && NAV.spokenDist(35, 'kmh') === '40 metres', 'spoken km/m');
ok(NAV.ttsClean('Turn left onto N Atlantic Ave') === 'Turn left onto North Atlantic Avenue' && NAV.ttsClean('Turn right onto SR A1A') === 'Turn right onto State Road A1A' && NAV.ttsClean('Turn right onto Rue de Rivoli') === 'Turn right onto Rue de Rivoli', 'road abbreviations expanded for speech');
ok(NAV.speedLabel(8.94, 'mph') === '20 mph' && NAV.speedLabel(12.5, 'kmh') === '45 km/h', 'speed labels follow unit');
// ---- off-route counting + debounce
{
  const st = NAV.newOffState(); const seq = [];
  [10, 70, 80, 90, 95, 100].forEach((o, i) => seq.push(NAV.offRouteStep(st, o, 1000 * i)));
  ok(seq.join() === 'ok,off,off,reroute,off,off', 'off route: 3rd consecutive far fix triggers reroute once (in-flight blocks repeats): ' + seq.join());
  const s2 = NAV.newOffState(); const q = [70, 70, 30, 70, 70, 70].map((o, i) => NAV.offRouteStep(s2, o, i * 1000));
  ok(q.join() === 'off,off,ok,off,off,reroute', 'a fix back on route resets the counter: ' + q.join());
  const s3 = NAV.newOffState(); [80, 80, 80].forEach((o, i) => NAV.offRouteStep(s3, o, i * 1000)); s3.inFlight = false; s3.lastT = 2000;
  ok(NAV.offRouteStep(s3, 80, 5000) === 'off' && NAV.offRouteStep(s3, 80, 15000) === 'reroute', 'reroute debounced to 12 s after the last attempt');
}
// ---- wake lock
{
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  ok(/id="dirPanel"/.test(html) && /id="dpHandle"/.test(html) && /id="dpList"/.test(html) && /dpRender\(P\)/.test(html) && /dpRender\(o\.P\)/.test(html), 'built page has the floating right-side turn panel updated in route view and in navigation');
  ok(/id="navNext"/.test(html) && /id="dirDet"/.test(html) && /id="navStart"/.test(html) && /id="navStartPeek"/.test(html) && /navigator\.geolocation\.watchPosition\(nvGeoFix/.test(html) && /enableHighAccuracy:true/.test(html), 'existing ids kept; Start navigation buttons and high-accuracy watchPosition wired');
  ok(!/&amp;/.test(html), 'no &amp; entities in the built page');
  ok(/@media \(min-width:900px\)\{#dirPanel\{right:12px/.test(html), 'desktop panel anchored right of the map');
}
// ---- GPS-style maneuver icons + speed limit bubble
{
  const k = (kind, type) => NAV.iconKey({ type: type || 'turn', kind });
  ok(k('straight') === 'straight' && k('depart', 'depart') === 'straight' && k('left') === 'left' && k('right') === 'right', 'icon key: straight/depart/left/right');
  ok(k('slight-left') === 'slight-left' && k('slight-right') === 'slight-right' && k('sharp-left') === 'sharp-left' && k('sharp-right') === 'sharp-right', 'icon key: slight and sharp turns');
  ok(k('uturn') === 'uturn' && NAV.iconKey({ type: 'roundabout', kind: 'roundabout' }) === 'roundabout' && NAV.iconKey({ type: 'arrive', kind: 'arrive' }) === 'arrive' && NAV.iconKey(null) === 'straight', 'icon key: u-turn, roundabout, arrive, null');
  const keys = ['straight', 'slight-left', 'left', 'sharp-left', 'slight-right', 'right', 'sharp-right', 'uturn', 'roundabout', 'arrive'];
  ok(keys.every(x => { const v = NAV.arrowSvg(x, 40); return /^<svg/.test(v) && v.includes('data-icon="' + x + '"') && v.includes('width="40"'); }), 'every maneuver has an SVG icon');
  ok(NAV.arrowSvg('left').includes('scale(-1 1)') && !NAV.arrowSvg('right').includes('scale(-1 1)') && NAV.arrowSvg('arrive').includes('#ea4335'), 'left icons mirror the right ones; arrive is a red pin');
  const segs = [{ len: 500, speed: 25, basis: 'tagged' }, { len: 300, speed: 35, basis: 'assumed' }, { len: 200, speed: null, basis: 'assumed' }];
  const l0 = NAV.limitAt(segs, 100), l1 = NAV.limitAt(segs, 600), l2 = NAV.limitAt(segs, 900);
  ok(l0.limit === 25 && !l0.assumed && l1.limit === 35 && l1.assumed && l2 === null && NAV.limitAt([], 5) === null && NAV.limitAt(segs, 99999) === null, 'limit at distance: tagged, assumed, unknown, past the end');
  ok(NAV.speedNum(8.94, 'mph') === 20 && NAV.speedNum(12.5, 'kmh') === 45 && NAV.speedNum(-1, 'mph') === 0, 'speed number follows unit');
  ok(NAV.speedState(11.2, { limit: 25, assumed: false }, 'mph') === 'ok' && NAV.speedState(12, { limit: 25, assumed: false }, 'mph') === 'over' && NAV.speedState(12, { limit: 25, assumed: true }, 'mph') === 'ok' && NAV.speedState(14, { limit: 25, assumed: true }, 'mph') === 'over' && NAV.speedState(30, null, 'mph') === 'none', 'speed bubble turns red only over a known limit (assumed has +5 margin)');
  const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
  ok(/id="nvOverview"/.test(html) && /id="nvMenu"/.test(html) && /id="nvLimit"/.test(html) && /id="nvSpdU"/.test(html) && /id="moreBox"/.test(html) && /id="resMore"/.test(html), 'built page has overview, menu, limit bubble, More box and details');
  ok(/#1a73e8/.test(html) && /nvDrawRoute/.test(html) && /nvDriven/.test(html), 'blue route line with driven portion');
  ok(/#map\{left:300px;width:auto\}/.test(html) && /width:300px/.test(html), 'desktop sidebar is 300px wide');
}
return (async () => {
  const log = [];
  const nv = { wakeLock: { request: async t => { log.push('req ' + t); let rel = null; return { release: async () => log.push('rel'), addEventListener: (e, f) => { rel = f; }, _fire: () => rel && rel() }; } } };
  const w = NAV.createWakeLock(nv);
  ok(w.supported, 'wake lock supported detected');
  let r = await w.acquire(); ok(r.ok && w.active && log.join() === 'req screen', 'acquire requests screen lock');
  await w.reacquire(); ok(log.length === 1, 'reacquire while active does nothing');
  w.active = false; await w.reacquire(); ok(log.length === 2 && w.active, 'reacquire after the OS released it (tab hidden) asks again');
  await w.release(); ok(!w.active && log[log.length - 1] === 'rel', 'release'); await w.reacquire(); ok(log.length === 3 && !w.active || log.length === 3, 'no reacquire after release (not wanted)');
  const wu = NAV.createWakeLock({}); r = await wu.acquire(); ok(!wu.supported && !r.ok && r.reason === 'unsupported', 'unsupported navigator degrades gracefully');
  const wd = NAV.createWakeLock({ wakeLock: { request: async () => { throw { name: 'NotAllowedError' }; } } }); r = await wd.acquire(); ok(!r.ok && r.reason === 'NotAllowedError' && !wd.active, 'denied request handled');
  await wu.release();
  await sims();
})();

function plan(stCfg, region) {
  const fx = JSON.parse(require('fs').readFileSync(__dirname + '/fixtures/cocoa.json', 'utf8')), g = GC.parseOverpass(fx), ids = [...g.nodes.keys()];
  const st = GC.cartStatus(stCfg, region);
  for (let t = 0; t < 400; t++) {
    const a = g.nodes.get(ids[(t * 977) % ids.length]), b = g.nodes.get(ids[(t * 2311 + 500) % ids.length]);
    const r = GC.planRoute(g, st, a, b, { cartMph: 25 });
    if (r.ok && r.distance_m > 2500 && r.distance_m < 6000) { const d = DIR.build(r, g); if (d.steps.length >= 6) return { r, g, d }; }
  }
  return null;
}
async function sims() {
  const F = plan({ type: 'motorcycle', speed: 60 }, { region: 'US' });
  ok(!!F, 'found a fixture route (Cocoa Beach data) with >=6 steps: ' + (F && F.d.steps.length + ' steps ' + Math.round(F.r.distance_m) + ' m'));
  const r = F.r, d = F.d, S = d.steps;
  // drive it at 8.9 m/s (20 mph cart), 1 fix/s
  const fixes = NAV.simulateFixes(r.coords, d.cum, 8.9, 1);
  const sess = NAV.createSession({ dirs: d, route: r, unit: 'mph' });
  const said = []; let arrivedAt = null, lastAlong = -1, backwards = 0, reroutes = 0;
  fixes.forEach(f => {
    const o = sess.onFix(f); if (o.ignored) return;
    o.say.forEach(x => said.push({ tier: x.tier, text: x.text, step: x.step, along: f.along, dist: o.P.distToNext }));
    if (o.reroute) reroutes++;
    if (o.P.along < lastAlong - 1e-6) backwards++; lastAlong = o.P.along;
    if (o.arrived) arrivedAt = f.along;
  });
  ok(reroutes === 0 && backwards === 0, 'clean simulated drive: no reroute, progress never goes backwards');
  ok(arrivedAt != null && said[said.length - 1].text === 'You have arrived' && said.filter(x => x.tier === 'arrive').length === 1, 'drive ends with exactly one "You have arrived"');
  const turns = S.map((s, i) => i).filter(i => i > 0 && S[i].type !== 'arrive' && !NAV.silent(S[i]));
  // every maneuver gets announced, tiers in far -> near -> now order, never repeated, and fired within their threshold distance
  let seqOk = true, thrOk = true, dupOk = true;
  const th = NAV.leadDistances(8.9, 8.9);
  [...turns, S.length - 1].forEach(i => {
    const a = said.filter(x => x.step === i), tiers = a.map(x => x.tier);
    const rank = { far: 0, near: 1, now: 2 };
    if (!tiers.length) seqOk = false;
    for (let k = 1; k < tiers.length; k++) if (rank[tiers[k]] <= rank[tiers[k - 1]]) dupOk = false;
    a.forEach(x => { if (x.dist > th[x.tier] + 9) thrOk = false; });
    if (i !== S.length - 1 && S[i].kind !== 'straight' && tiers[tiers.length - 1] !== 'now') seqOk = false;
    if (S[i].kind === 'straight' && tiers.join() !== 'near') seqOk = false;
  });
  ok(seqOk && dupOk && thrOk, 'each maneuver announced in far/near/now order at the speed-based distances, none repeated: ' + said.filter(x => x.step === turns[0]).map(x => x.tier + ' @' + Math.round(x.dist) + 'm: ' + x.text).join(' | '));
  const realTurn = turns.find(i => S[i].kind !== 'straight'), firstTurn = said.filter(x => x.step === (realTurn != null ? realTurn : turns[0])), nowTxt = firstTurn.find(x => x.tier === 'now');
  ok(nowTxt && !/\b(Ave|Rd|St|N|S)\b/.test(nowTxt.text.replace(/Street|Avenue/g, '')) && /^In /.test(firstTurn[0].text), 'spoken texts expanded and start with "In <distance>": ' + firstTurn[0].text);
  // kmh wording
  const sk = NAV.createSession({ dirs: d, route: r, unit: 'kmh' }); const kms = []; fixes.forEach(f => { const o = sk.onFix(f); if (!o.ignored) o.say.forEach(x => kms.push(x.text)); });
  ok(kms.some(t => /\d+ metres|kilometre/.test(t)) && !kms.some(t => /\bfeet\b|\bmiles?\b/.test(t)), 'km mode speaks metres/kilometres, never feet/miles');
  // ---- voice guidance: start summary, continue prompts, legality notices, mode wording, units
  const sum = NAV.startSummary(d, r, 'mph', 'drive'), sumW = NAV.startSummary(d, r, 'kmh', 'walk');
  ok(/^Starting route\. [\d.]+ miles?, about \d+ minutes?\./.test(sum) && !/\bkilometre/.test(sum) && /kilometres?|metres/.test(sumW) && !/\bmiles?\b/.test(sumW), 'start summary with distance + time in the units setting: ' + sum);
  ok(NAV.modeText('Head north on Main Street', 'walk') === 'Walk north on Main Street' && NAV.modeText('Head south', 'bike') === 'Cycle south' && NAV.modeText('Head east', 'ride') === 'Ride east' && NAV.modeText('Head west', 'drive') === 'Drive west' && NAV.modeText('Turn left', 'walk') === 'Turn left', 'mode-aware start wording (drive/ride/walk/cycle)');
  ok(NAV.modeOf('foot') === 'walk' && NAV.modeOf('bicycle') === 'bike' && NAV.modeOf('motorcycle') === 'ride' && NAV.modeOf('escooter') === 'ride' && NAV.modeOf('golf') === 'drive' && NAV.modeOf('truck') === 'drive', 'vehicle type -> voice mode');
  ok(NAV.continueText(1609.344 * 2, 'mph', 'drive', 'N Atlantic Ave') === 'Continue driving on North Atlantic Avenue for 2 miles' && NAV.continueText(2000, 'kmh', 'walk', '') === 'Continue walking for 2 kilometres' && NAV.continueText(800, 'mph', 'bike', 'the road') === 'Continue cycling for half a mile', 'continue prompts: mode, road name, units');
  ok(NAV.spokenDur(540) === '9 minutes' && NAV.spokenDur(60) === '1 minute' && NAV.spokenDur(3900) === '1 hour 5 minutes' && NAV.spokenDur(7200) === '2 hours', 'spoken durations');
  ok(/assumed legal/.test(NAV.legalNotice({ name: 'Oak St', basis: 'assumed' }, 'drive')) && NAV.legalNotice({ name: 'Oak St', basis: 'posted-designation-assumed' }) === '' && /Oak Street/.test(NAV.legalNotice({ name: 'Oak St', basis: 'assumed' }, 'drive')) && /street-legal LSV/.test(NAV.legalNotice({ name: 'X', basis: 'posted', lsvOnly: true })) && /not legal/.test(NAV.legalNotice({ name: 'X', basis: 'illegal' })) && /no sidewalk/.test(NAV.legalNotice({ name: 'X', basis: 'assumed' }, 'walk')) && NAV.legalNotice({ name: 'X', basis: 'posted' }) === '' && /this road/.test(NAV.legalNotice({ name: '(unnamed residential)', basis: 'assumed' })), 'legality notices: assumed, LSV-only, illegal, walking; none for posted roads');
  const sv = NAV.createSession({ dirs: d, route: r, unit: 'mph', mode: 'drive' }), vs = []; fixes.forEach(f => { const o = sv.onFix(f); if (!o.ignored) o.say.forEach(x => vs.push(x)); });
  const legalSegs = r.segments.filter(sg => NAV.legalNotice(sg, 'drive') && sg.len >= 100).map(sg => sg.name + '|' + sg.basis + '|' + !!sg.lsvOnly), uniq = [...new Set(legalSegs)];
  ok(vs.filter(x => x.tier === 'legal').length === uniq.length && vs.filter(x => x.tier === 'legal').every(x => !x.urgent && x.step === undefined), 'drive warns once per assumed/LSV-only road entered (' + uniq.length + ' roads)');
  ok(vs.filter(x => x.tier === 'continue').every(x => /^Continue driving/.test(x.text) && x.step === undefined) && vs[vs.length - 1].text === 'You have arrived', 'continue prompts are mode-worded and the drive still ends with arrival: ' + (vs.find(x => x.tier === 'continue') || {}).text);
  const segFake = { ...r, segments: [{ name: 'Elm St', basis: 'posted', len: 50 }, { name: 'Beach Rd', basis: 'assumed', len: 1e7 }] };
  const sl = NAV.createSession({ dirs: d, route: segFake, unit: 'mph', mode: 'drive' }), ls = []; fixes.forEach(f => { const o = sl.onFix(f); if (!o.ignored) o.say.forEach(x => ls.push(x)); });
  ok(ls.filter(x => x.tier === 'legal').length === 1 && /Beach Road is only assumed legal/.test(ls.find(x => x.tier === 'legal').text), 'entering an assumed road is announced once: ' + (ls.find(x => x.tier === 'legal') || {}).text);
  // voice prefs + voice picking
  const nv = NAV.normVoice({ on: false, rate: 3, volume: -1, voiceURI: 'x' }), nd = NAV.normVoice(null);
  ok(nd.on === true && nd.rate === 1 && nd.volume === 1 && nd.voiceURI === '' && nv.on === false && nv.rate === 1 && nv.volume === 1 && nv.voiceURI === 'x' && NAV.normVoice({ rate: 1.5, volume: 0.4 }).rate === 1.5, 'voice prefs: on by default, rate/volume clamped');
  ok(NAV.voiceLang('mph', null) === 'en-US' && NAV.voiceLang('kmh', null) === 'en-GB' && NAV.voiceLang('mph', { c: 'GB' }) === 'en-GB', 'voice accent follows units/region');
  const V = [{ voiceURI: 'a', name: 'Fr', lang: 'fr-FR' }, { voiceURI: 'b', name: 'US1', lang: 'en-US' }, { voiceURI: 'c', name: 'US2', lang: 'en_US', default: true }, { voiceURI: 'd', name: 'UK', lang: 'en-GB' }, { voiceURI: 'e', name: 'AU', lang: 'en-AU' }];
  ok(NAV.pickVoice(V, 'd', 'en-US').name === 'UK' && NAV.pickVoice(V, '', 'en-US').name === 'US2' && NAV.pickVoice(V, '', 'en-GB').name === 'UK' && NAV.pickVoice(V, 'gone', 'en-NZ').lang.startsWith('en') && NAV.pickVoice([V[0]], '', 'en-US') === null && NAV.pickVoice([], '', 'en-US') === null, 'pickVoice: chosen voice wins, then exact language, then same language, never a foreign voice');
  // view model + ETA
  const s2 = NAV.createSession({ dirs: d, route: r, unit: 'mph' });
  const mid = fixes[Math.floor(fixes.length / 2)]; let o = null; fixes.slice(0, Math.floor(fixes.length / 2) + 1).forEach(f => { o = s2.onFix(f); });
  const v = o.view, remExpected = d.total_m - mid.along;
  ok(near(v.eta.remaining_m, remExpected, 20) && near(v.eta.remaining_s, r.time_s * remExpected / d.total_m, r.time_s * 0.02) && near(v.eta.etaMs - mid.t, v.eta.remaining_s * 1000, 5), 'remaining distance/time and ETA from progress');
  ok(v.speedLabel === '20 mph' && v.arrow && v.dist && v.text && (v.then === '' || /^Then /.test(v.then)), 'view model: arrow, distance, text, then-preview, speed: ' + v.speedLabel + ' / ' + v.text + ' / ' + v.then);
  // step advance
  const idxs = []; const s3 = NAV.createSession({ dirs: d, route: r, unit: 'mph' }); fixes.forEach(f => { const q = s3.onFix(f); if (!q.ignored && !q.arrived && idxs[idxs.length - 1] !== q.P.stepIndex) idxs.push(q.P.stepIndex); });
  ok(idxs.join() === S.slice(0, -1).map((_, i) => i).join(), 'steps advance 0..n-1 in order: ' + idxs.join());
  // low accuracy fixes ignored
  const s4 = NAV.createSession({ dirs: d, route: r, unit: 'mph' }); const bad = s4.onFix(Object.assign({}, fixes[3], { acc: 120 })), good = s4.onFix(Object.assign({}, fixes[3], { acc: 20 }));
  ok(bad.ignored && bad.reason === 'low-accuracy' && !good.ignored, 'fixes worse than 50 m are ignored');
  // jitter: stationary noise does not move position or advance
  const s5 = NAV.createSession({ dirs: d, route: r, unit: 'mph' }); const f0 = fixes[10], p0 = s5.onFix(Object.assign({}, f0, { speed: 0, t: 0 })).pos; let moved = 0;
  for (let k = 1; k <= 8; k++) { const q = s5.onFix({ lat: f0.lat + (k % 2 ? 3e-5 : -3e-5), lon: f0.lon + (k % 3 ? 2e-5 : -2e-5), acc: 15, speed: 0, t: k * 1000 }); moved = Math.max(moved, require('./geo.js') ? hv(p0, q.pos) : 0); }
  ok(moved < 1, 'GPS jitter while stopped is smoothed away (max drift ' + moved.toFixed(2) + ' m)');
  // never advance backwards: after reaching 60% a fix back near the start (e.g. loop/jitter) does not rewind progress
  const s6 = NAV.createSession({ dirs: d, route: r, unit: 'mph' }); fixes.slice(0, Math.floor(fixes.length * 0.6)).forEach(f => s6.onFix(f)); const before = s6.maxAlong;
  const back = s6.onFix(Object.assign({}, fixes[Math.floor(fixes.length * 0.6) - 4], { t: 1e9 })); ok(back.P.along >= before - 1e-6, 'progress is monotonic when the fix jumps back along the route');
  // off route -> reroute -> route updated
  const s7 = NAV.createSession({ dirs: d, route: r, unit: 'mph' }); let rr = 0, say7 = [];
  fixes.slice(0, 40).forEach(f => s7.onFix(f));
  const away = fixes[40]; let t = away.t;
  for (let k = 0; k < 6; k++) { t += 1000; const q = s7.onFix({ lat: away.lat + 0.0015, lon: away.lon + 0.0015, acc: 8, speed: 8, t }); if (q.reroute) { rr++; say7 = say7.concat(q.say.map(x => x.text)); } }
  ok(rr === 1 && say7.some(x => /Rerouting/.test(x)), 'driving 200 m off route for several fixes triggers exactly one reroute with a spoken "Rerouting"');
  const upd = s7.setRoute(d, r, { rerouted: true }); ok(upd.length === 1 && upd[0].text === 'Route updated' && s7.off.inFlight === false && s7.maxAlong === 0, 'setRoute after reroute announces "Route updated" and resets progress');
  const s8 = NAV.createSession({ dirs: d, route: r, unit: 'mph' }); fixes.slice(0, 20).forEach(f => s8.onFix(f)); t = fixes[20].t; let trig = [];
  for (let k = 0; k < 20; k++) { t += 1000; const q = s8.onFix({ lat: fixes[20].lat + 0.0015, lon: fixes[20].lon + 0.0015, acc: 8, speed: 8, t }); if (q.reroute) { trig.push(k); s8.rerouteFailed(t); } }
  ok(trig.length >= 2 && trig.length <= 3 && trig[1] - trig[0] >= 12, 'a failing reroute is retried no more often than every 12 s: ' + trig.join());
  // DIR minAlong
  const sn = DIR.snapToRoute(r.coords, d.cum, r.coords[5], 0), sn2 = DIR.snapToRoute(r.coords, d.cum, r.coords[5], d.cum[20]);
  ok(sn.along <= d.cum[6] && sn2.along >= d.cum[20] - 1e-6, 'snapToRoute minAlong never snaps behind progress');
}
function hv(a, b) { return DIR.fmtDist ? require('./lib.js').hav(a, b) : 0; }
}
module.exports = run;
if (require.main === module) {
  let pass = 0, fail = 0;
  run((c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } }).then(() => { console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); });
}
