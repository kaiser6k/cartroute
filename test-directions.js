const GC = require('./lib.js'), DIR = require('./directions.js');
function run(ok) {
// ---- angles / classification
const C = DIR.classify, D = DIR.delta;
ok(D(350, 10) === 20 && D(10, 350) === -20 && D(0, 180) === 180 && D(90, 0) === -90, 'delta wraps across north');
[[0, 'straight'], [15, 'straight'], [-20, 'straight'], [35, 'slight-right'], [-35, 'slight-left'], [90, 'right'], [-90, 'left'], [-60, 'slight-left'], [61, 'right'], [140, 'sharp-right'], [-140, 'sharp-left'], [175, 'uturn'], [-175, 'uturn'], [180, 'uturn']]
  .forEach(([a, k]) => ok(C(a) === k, 'classify ' + a + ' -> ' + k));
ok(Math.abs(DIR.bearing([0, 0], [1, 0]) - 0) < 1e-6 && Math.abs(DIR.bearing([0, 0], [0, 1]) - 90) < 1e-6 && Math.abs(DIR.bearing([0, 0], [-1, 0]) - 180) < 1e-6, 'bearing N/E/S');
// ---- unit formatting
ok(DIR.fmtDist(30, 'mph') === '100 ft', 'fmt 30 m -> 100 ft');
ok(DIR.fmtDist(100, 'mph') === '330 ft', 'fmt 100 m -> 330 ft');
ok(DIR.fmtDist(160.9344, 'mph') === '0.1 mi', 'fmt 0.1 mi');
ok(DIR.fmtDist(643.7376, 'mph') === '0.4 mi', 'fmt 0.4 mi');
ok(DIR.fmtDist(3379.5, 'mph') === '2.1 mi', 'fmt 2.1 mi');
ok(DIR.fmtDist(32000, 'mph') === '20 mi', 'fmt 20 mi');
ok(DIR.fmtDist(0, 'mph') === '10 ft', 'fmt zero -> 10 ft');
ok(DIR.fmtDist(180, 'kmh') === '180 m' && DIR.fmtDist(184, 'kmh') === '180 m' && DIR.fmtDist(999, 'kmh') === '1000 m', 'fmt metres under 1 km');
ok(DIR.fmtDist(1000, 'kmh') === '1.0 km' && DIR.fmtDist(2450, 'kmh') === '2.5 km' && DIR.fmtDist(15000, 'kmh') === '15 km', 'fmt km');
ok(DIR.ordinal(1) === '1st' && DIR.ordinal(2) === '2nd' && DIR.ordinal(3) === '3rd' && DIR.ordinal(4) === '4th' && DIR.ordinal(11) === '11th' && DIR.ordinal(22) === '22nd', 'ordinals');
ok(DIR.roadLabel({ name: 'A', ref: 'B' }) === 'A' && DIR.roadLabel({ ref: 'SR A1A' }) === 'SR A1A' && DIR.roadLabel({ highway: 'service' }) === 'the service road' && DIR.roadLabel({ highway: 'residential' }) === 'the road', 'road labels');

// ---- synthetic graph: ~111 m per 0.001 deg lat
const LAT0 = 28.3, LON0 = -80.6, DL = 0.001, DO = 0.001 / Math.cos(LAT0 * Math.PI / 180);
let nid = 1; const els = [], nodeAt = {};
function node(r, c) { const k = r + ',' + c; if (!nodeAt[k]) { nodeAt[k] = nid++; els.push({ type: 'node', id: nodeAt[k], lat: LAT0 + r * DL, lon: LON0 + c * DO }); } return nodeAt[k]; }
let wid = 100;
function way(pts, tags) { els.push({ type: 'way', id: wid++, nodes: pts.map(p => node(p[0], p[1])), tags: Object.assign({ highway: 'residential', maxspeed: '25 mph' }, tags) }); }
// Main St runs north (col 0) from row 0..10; Oak Ave turns east at row 10 (cols 0..10); then Pine Rd south (col 10 rows 10..5); then "ref only" road east.
way([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0]], { name: 'Main St' });
way([[10, 0], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 10]], { name: 'Oak Ave' });
way([[10, 10], [9, 10], [8, 10], [7, 10], [6, 10], [5, 10]], { name: 'Pine Rd' });
way([[5, 10], [5, 11], [5, 12], [5, 13]], { ref: 'SR 99' });
way([[5, 13], [5, 14], [5, 15]], { highway: 'service' });
const mkSt = GC.cartStatus({ type: 'lsv', speed: 25, headlights: true, brakeLights: true, turnSignals: true, seatBelts: true, mirrors: true, windshield: true, reflectors: true, parkingBrake: true, hasVin: true, registered: true, night: 'day' });
const g = GC.parseOverpass({ elements: els });
const rt = GC.planRoute(g, mkSt, [LAT0, LON0], [LAT0 + 5 * DL, LON0 + 15 * DO], { cartMph: 25 });
ok(rt.ok && rt.edgeWays.length === rt.nodeIds.length - 1, 'planRoute returns edgeWays per edge');
const dirs = DIR.build(rt, g), S = dirs.steps;
ok(S.length === 6, 'steps: depart + 4 turns + arrive (' + S.length + ')');
ok(S[0].type === 'depart' && S[0].text === 'Head north on Main St', 'depart text: ' + S[0].text);
ok(S[1].kind === 'right' && S[1].text === 'Turn right onto Oak Ave', 'turn right onto Oak: ' + S[1].text);
ok(S[2].kind === 'right' && S[2].text === 'Turn right onto Pine Rd', 'turn right onto Pine: ' + S[2].text);
ok(S[3].kind === 'left' && S[3].text === 'Turn left onto SR 99', 'ref used when unnamed: ' + S[3].text);
ok(S[4].kind === 'straight' && S[4].text === 'Continue straight onto the service road', 'unnamed service road: ' + S[4].text);
ok(S[5].type === 'arrive', 'arrive last');
ok(S.every(s => s.arrow && typeof s.arrow === 'string'), 'every step has an arrow icon');
ok(Math.abs(S[0].distance_m - 1112) < 25 && Math.abs(S[1].distance_m - S[1].distance_m) < 1, 'first leg ~1.1 km: ' + Math.round(S[0].distance_m));
ok(Math.abs(S.reduce((a, s) => a + s.distance_m, 0) - dirs.total_m) < 1 && Math.abs(dirs.total_m - rt.distance_m) < rt.distance_m * 0.02, 'step distances sum to route length');
ok(DIR.detail(S[0], 'mph').startsWith('Continue on Main St for 0.') && DIR.detail(S[1], 'kmh').indexOf('Oak Ave for') > 0 && DIR.detail(S[5], 'mph') === '', 'detail line');
// grouping: consecutive ways with the same name are one step (split Oak Ave into two ways)
{
  const e2 = els.map(e => e.type === 'way' && e.tags.name === 'Oak Ave' ? Object.assign({}, e, { nodes: e.nodes.slice(0, 5) }) : e);
  e2.push({ type: 'way', id: 999, nodes: [nodeAt['10,4'], nodeAt['10,5'], nodeAt['10,6'], nodeAt['10,7'], nodeAt['10,8'], nodeAt['10,9'], nodeAt['10,10']], tags: { highway: 'residential', maxspeed: '25 mph', name: 'Oak Ave' } });
  const g2 = GC.parseOverpass({ elements: e2 }), r2 = GC.planRoute(g2, mkSt, [LAT0, LON0], [LAT0 + 5 * DL, LON0 + 15 * DO], { cartMph: 25 });
  ok(r2.ok && DIR.build(r2, g2).steps.length === 6, 'same-named consecutive ways group into one step');
  // unnamed ways with distinct ids: a bend between two unnamed roads is still a maneuver
}
// slight turn / keep right
{
  const el = []; let n2 = 1; const P = {};
  const nn = (la, lo) => { const k = la + ',' + lo; if (!P[k]) { P[k] = n2++; el.push({ type: 'node', id: P[k], lat: 28.3 + la * 0.001, lon: -80.6 + lo * 0.001 }); } return P[k]; };
  const wy = (pts, t) => el.push({ type: 'way', id: wid++, nodes: pts.map(p => nn(p[0], p[1])), tags: Object.assign({ highway: 'residential', maxspeed: '25 mph' }, t) });
  wy([[0, 0], [1, 0], [2, 0], [3, 0]], { name: 'A Rd' });
  wy([[3, 0], [4, 0.6], [5, 1.2], [6, 1.8], [7, 2.4]], { name: 'B Rd' });   // ~28 deg to the right: slight
  const g3 = GC.parseOverpass({ elements: el }), r3 = GC.planRoute(g3, mkSt, [28.3, -80.6], [28.307, -80.6 + 0.0024], { cartMph: 25 });
  const s3 = DIR.build(r3, g3).steps;
  ok(r3.ok && s3[1] && s3[1].kind === 'slight-right' && s3[1].text === 'Keep right onto B Rd', 'slight right -> Keep right: ' + (s3[1] && s3[1].text));
}
// roundabout: ring of 4 nodes entered from the south, exit east (2nd exit counting N? -> count ring nodes with exits)
{
  const el = []; let n2 = 1; const P = {};
  const nn = (k, la, lo) => { if (!P[k]) { P[k] = n2++; el.push({ type: 'node', id: P[k], lat: 28.3 + la * 0.0002, lon: -80.6 + lo * 0.0002 }); } return P[k]; };
  const wy = (ids, t) => el.push({ type: 'way', id: wid++, nodes: ids, tags: Object.assign({ highway: 'residential', maxspeed: '25 mph' }, t) });
  // ring counter-clockwise (right-hand traffic): S -> E -> N -> W -> S
  const S_ = nn('S', 0, 0), E_ = nn('E', 5, 5), N_ = nn('N', 10, 0), W_ = nn('W', 5, -5);
  wy([S_, E_, N_, W_, S_], { junction: 'roundabout', highway: 'residential', name: '' });
  // approach from south
  const s1 = nn('s1', -10, 0), s2 = nn('s2', -20, 0); wy([s2, s1, S_], { name: 'South Ave' });
  // exits: east (1st), north (2nd), west (3rd)
  const e1 = nn('e1', 5, 15), e2 = nn('e2', 5, 25); wy([E_, e1, e2], { name: 'East Ave' });
  const n1 = nn('n1', 20, 0), n2b = nn('n2', 30, 0); wy([N_, n1, n2b], { name: 'North Ave' });
  const w1 = nn('w1', 5, -15), w2 = nn('w2', 5, -25); wy([W_, w1, w2], { name: 'West Ave' });
  const g4 = GC.parseOverpass({ elements: el });
  [['e2', 'East Ave', '1st'], ['n2', 'North Ave', '2nd'], ['w2', 'West Ave', '3rd']].forEach(([end, nm, ord]) => {
    const t = g4.nodes.get(P[end]), r4 = GC.planRoute(g4, mkSt, g4.nodes.get(P.s2), t, { cartMph: 25 });
    const st4 = r4.ok ? DIR.build(r4, g4).steps : [];
    const rb = st4.find(s => s.type === 'roundabout');
    ok(r4.ok && rb && rb.exit === (ord === '1st' ? 1 : ord === '2nd' ? 2 : 3) && rb.text === 'Enter the roundabout and take the ' + ord + ' exit onto ' + nm, 'roundabout ' + ord + ' exit to ' + nm + ': ' + (rb && rb.text));
    ok(r4.ok && st4.filter(s => s.type === 'turn').length === 0 && st4[st4.length - 1].type === 'arrive', 'no extra turn step after leaving roundabout (' + nm + ')');
  });
}
// ---- progress along route with mocked positions
{
  const P0 = DIR.progress(dirs, rt, [LAT0, LON0]);
  ok(P0 && P0.stepIndex === 0 && P0.next === S[1] && Math.abs(P0.distToNext - S[0].distance_m) < 2 && !P0.offRoute, 'progress at start: next = first turn, dist = leg 1');
  const P1 = DIR.progress(dirs, rt, [LAT0 + 6 * DL, LON0]);
  ok(P1.stepIndex === 0 && Math.abs(P1.distToNext - (S[0].distance_m - 6 * 111.2)) < 15, 'progress mid-leg: distance to turn shrinks (' + Math.round(P1.distToNext) + ' m)');
  ok(DIR.nextText(P1.next, P1.distToNext, 'mph').startsWith('Next: Turn right onto Oak Ave in '), 'next header text: ' + DIR.nextText(P1.next, P1.distToNext, 'mph'));
  const P2 = DIR.progress(dirs, rt, [LAT0 + 10 * DL, LON0 + 4 * DO]);
  ok(P2.stepIndex === 1 && P2.next === S[2], 'progress advances after the turn onto Oak');
  const P3 = DIR.progress(dirs, rt, [LAT0 + 7 * DL, LON0 + 10 * DO]);
  ok(P3.stepIndex === 2 && P3.next === S[3], 'progress on Pine Rd');
  const P4 = DIR.progress(dirs, rt, [LAT0 + 5 * DL, LON0 + 15 * DO]);
  ok(P4.arrived && P4.next.type === 'arrive' && P4.remaining_m < 5, 'progress at destination: arrived');
  const P5 = DIR.progress(dirs, rt, [LAT0 + 3 * DL, LON0 + 0.004]);
  ok(P5.offRoute && P5.off > 100, 'off route detected (' + Math.round(P5.off) + ' m)');
  ok(P0.remaining_m > P1.remaining_m && P1.remaining_m > P3.remaining_m, 'remaining distance decreases');
  const Pn = DIR.progress({ steps: [], cum: [0], total_m: 0 }, { coords: [] }, [0, 0]);
  ok(Pn === null, 'progress with no steps is null');
}
// ---- fixture-based: real Overpass data (Cocoa Beach) if available
try {
  const fx = JSON.parse(require('fs').readFileSync(__dirname + '/fixtures/cocoa.json', 'utf8'));
  const gf = GC.parseOverpass(fx), ids = [...gf.nodes.keys()];
  const stM = GC.cartStatus({ type: 'motorcycle', speed: 60 }, { region: 'US' });
  let tried = 0, good = 0, bad = 0;
  for (let t = 0; t < 12 && good < 4; t++) {
    const a = gf.nodes.get(ids[(t * 977) % ids.length]), b = gf.nodes.get(ids[(t * 2311 + 500) % ids.length]);
    const r = GC.planRoute(gf, stM, a, b, { cartMph: 35 }); tried++;
    if (!r.ok || r.distance_m < 800) continue;
    const dd = DIR.build(r, gf), sum = dd.steps.reduce((x, s) => x + s.distance_m, 0);
    if (Math.abs(sum - dd.total_m) < 1 && dd.steps[0].type === 'depart' && dd.steps[dd.steps.length - 1].type === 'arrive' && dd.steps.every(s => s.text && s.cum >= 0)) good++; else bad++;
  }
  ok(good >= 1 && bad === 0, 'real fixture routes produce consistent steps (' + good + ' ok of ' + tried + ' tried)');
} catch (e) { ok(false, 'fixture test: ' + e.message); }
}
module.exports = run;
if (require.main === module) {
  let pass = 0, fail = 0;
  run((c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } });
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
}
