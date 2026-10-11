/* ===== CartRoute hands-free navigation engine (pure JS, no DOM). Depends on DIR. ===== */
var NAV = (function () {
  'use strict';
  var DIRM = (typeof DIR !== 'undefined') ? DIR : require('./directions.js');
  var RAD = Math.PI / 180;
  var MAX_ACC_M = 50, OFF_M = 60, OFF_FIXES = 3, REROUTE_MIN_MS = 12000;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hv(a, b) {
    var dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(x));
  }

  // ---- announcement distances (metres) from speed: ~45 s / 15 s / 3 s lead, clamped; slow carts get short distances
  function leadDistances(speedMps, plannedMps) {
    var v = Math.max(Number(speedMps) || 0, 0.5 * (Number(plannedMps) || 0), 2);
    var near = clamp(v * 15, 50, 150), far = clamp(v * 45, 150, 800), now = clamp(v * 3, 12, 30);
    if (far < near * 2) far = near * 2;
    return { far: Math.round(far), near: Math.round(near), now: Math.round(now) };
  }

  // ---- text for the speech engine
  var ABBR = [[/\bN\b/g, 'North'], [/\bS\b/g, 'South'], [/\bE\b/g, 'East'], [/\bW\b/g, 'West'], [/\bNE\b/g, 'Northeast'], [/\bNW\b/g, 'Northwest'], [/\bSE\b/g, 'Southeast'], [/\bSW\b/g, 'Southwest'],
    [/\bAve\b\.?/g, 'Avenue'], [/\bSt\b\.?(?=\s|$|,)/g, 'Street'], [/\bRd\b\.?/g, 'Road'], [/\bBlvd\b\.?/g, 'Boulevard'], [/\bDr\b\.?(?=\s|$|,)/g, 'Drive'], [/\bHwy\b\.?/g, 'Highway'],
    [/\bPkwy\b\.?/g, 'Parkway'], [/\bLn\b\.?/g, 'Lane'], [/\bCt\b\.?/g, 'Court'], [/\bCir\b\.?/g, 'Circle'], [/\bSR\b/g, 'State Road'], [/\bCR\b/g, 'County Road'], [/\bUS\b/g, 'U S']];
  function ttsClean(t) { t = String(t || ''); ABBR.forEach(function (a) { t = t.replace(a[0], a[1]); }); return t; }
  function lowerFirst(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  function r5(x, n) { return Math.round(x / n) * n; }
  // spoken distance: "500 feet", "half a mile", "0.3 miles", "150 metres", "1.5 kilometres"
  function spokenDist(m, unit) {
    m = Math.max(0, Number(m) || 0);
    if (unit === 'kmh') {
      if (m < 1000) return Math.max(10, m < 200 ? r5(m, 10) : r5(m, 50)) + ' metres';
      var k = Math.round(m / 100) / 10; if (k >= 10) k = Math.round(k);
      return (k === 1 ? '1 kilometre' : k + ' kilometres');
    }
    var ft = m * 3.28084;
    if (m < 0.2 * 1609.344) { var f = Math.max(50, ft < 500 ? r5(ft, 50) : r5(ft, 100)); return f + ' feet'; }
    var mi = Math.round(m / 1609.344 * 10) / 10; if (mi >= 10) mi = Math.round(mi);
    if (mi === 0.5) return 'half a mile';
    return mi === 1 ? '1 mile' : mi + ' miles';
  }
  function speedLabel(mps, unit) {
    var v = Math.max(0, Number(mps) || 0);
    return unit === 'kmh' ? Math.round(v * 3.6) + ' km/h' : Math.round(v * 2.23694) + ' mph';
  }

  // ---- announcements. ann = {idx, fired:{far,near,now}}. Returns list of {tier,text,urgent}
  function newAnnouncer() { return { idx: -1, fired: {} }; }
  // a straight-ahead step onto an unnamed road is not worth interrupting for
  function silent(step) { return step.kind === 'straight' && (step.road === 'the road' || step.road === 'the service road' || !step.road); }
  function instr(step) { return lowerFirst(ttsClean(step.text)); }
  function announce(ann, P, steps, unit, speedMps, plannedMps) {
    var out = [];
    if (!P || P.offRoute) return out;
    var idx = P.nextIndex, step = steps[idx], d = P.distToNext;
    if (!step) return out;
    if (ann.idx !== idx) { ann.idx = idx; ann.fired = {}; }
    if (P.arrived || silent(step)) return out;
    var th = leadDistances(speedMps, plannedMps), isArr = step.type === 'arrive';
    // arrival: far+near; straight-ahead name changes: one gentle 'near' notice; real turns: far, near, now
    var tiers = isArr ? ['far', 'near'] : step.kind === 'straight' ? ['near'] : ['far', 'near', 'now'], hit = null;
    tiers.forEach(function (t) { if (!ann.fired[t] && d <= th[t]) hit = t; });   // lowest crossed tier wins
    if (!hit) return out;
    var order = ['far', 'near', 'now'];
    order.forEach(function (t) { if (order.indexOf(t) <= order.indexOf(hit)) ann.fired[t] = true; });
    var follow = steps[idx + 1], text;
    if (hit === 'now') text = ttsClean(step.text);
    else text = 'In ' + spokenDist(d, unit) + ', ' + (isArr ? 'you will arrive at your destination' : instr(step));
    if (follow && !silent(follow) && !isArr && hit !== 'far' && step.distance_m != null && step.distance_m <= 250) text += ', then ' + (follow.type === 'arrive' ? 'arrive at your destination' : instr(follow));
    out.push({ tier: hit, text: text, urgent: hit === 'now', step: idx });
    return out;
  }

  // ---- off-route counting. st = {count, inFlight, lastT}. returns 'ok' | 'off' | 'reroute'
  function newOffState() { return { count: 0, inFlight: false, lastT: -1e12 }; }
  function offRouteStep(st, offM, t) {
    if (offM <= OFF_M) { st.count = 0; return 'ok'; }
    st.count++;
    if (st.count >= OFF_FIXES && !st.inFlight && t - st.lastT >= REROUTE_MIN_MS) { st.inFlight = true; st.lastT = t; return 'reroute'; }
    return 'off';
  }

  // ---- ETA / remaining
  function eta(P, route, total_m, t) {
    var rem = P ? P.remaining_m : total_m, rs = route && route.time_s && total_m ? route.time_s * rem / total_m : null;
    return { remaining_m: rem, remaining_s: rs, etaMs: rs != null ? t + rs * 1000 : null };
  }
  function fmtDur(s) { var m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }

  // ---- screen wake lock with graceful fallback. nav = navigator-like.
  function createWakeLock(nv) {
    var sentinel = null, wanted = false;
    var w = { supported: !!(nv && nv.wakeLock && typeof nv.wakeLock.request === 'function'), active: false, error: null };
    w.acquire = function () {
      wanted = true;
      if (!w.supported) return Promise.resolve({ ok: false, reason: 'unsupported' });
      if (w.active) return Promise.resolve({ ok: true });
      return nv.wakeLock.request('screen').then(function (s) {
        sentinel = s; w.active = true; w.error = null;
        if (s && s.addEventListener) s.addEventListener('release', function () { w.active = false; });
        return { ok: true };
      }, function (e) { w.active = false; w.error = (e && e.name) || 'error'; return { ok: false, reason: w.error }; });
    };
    w.release = function () {
      wanted = false; var s = sentinel; sentinel = null; w.active = false;
      try { return s && s.release ? Promise.resolve(s.release()).catch(function () {}) : Promise.resolve(); } catch (e) { return Promise.resolve(); }
    };
    w.reacquire = function () { return wanted && !w.active ? w.acquire() : Promise.resolve({ ok: w.active }); };
    return w;
  }

  // ---- the session: feed GPS fixes, get everything the UI needs
  function createSession(o) {
    var s = { dirs: o.dirs, route: o.route, unit: o.unit || 'mph', planned: 0, maxAlong: 0, prev: null, speed: 0, heading: null, hdRef: null,
      ann: newAnnouncer(), off: newOffState(), lowAcc: 0, done: false, lastT: null, rerouted: 0 };
    function setPlanned() { s.planned = s.route && s.route.time_s ? s.dirs.total_m / s.route.time_s : 0; }
    setPlanned();
    s.setRoute = function (dirs, route, opts) {
      s.dirs = dirs; s.route = route; s.maxAlong = 0; s.ann = newAnnouncer(); s.off.count = 0; s.off.inFlight = false; s.done = false; setPlanned();
      if (opts && opts.rerouted) s.rerouted++;
      return opts && opts.rerouted ? [{ tier: 'info', text: 'Route updated', urgent: true }] : [];
    };
    s.rerouteFailed = function (t) { s.off.inFlight = false; s.off.lastT = t; };
    s.view = function (P, pos, t) {
      var st = s.dirs.steps, next = P ? P.next : (st[1] || st[0]), dist = P ? P.distToNext : (st[0].distance_m || 0), after = st[(P ? P.nextIndex : 1) + 1];
      var arr = next.type === 'arrive';
      return { arrow: next.arrow, distM: dist, dist: DIRM.fmtDist(dist, s.unit), text: P && P.arrived ? 'You have arrived' : next.text, road: next.road || '',
        then: after && !(P && P.arrived) ? (after.type === 'arrive' ? 'Then arrive at your destination' : 'Then ' + lowerFirst(after.text)) : '', arriving: arr,
        speedLabel: speedLabel(s.speed, s.unit), eta: eta(P, s.route, s.dirs.total_m, t == null ? s.lastT : t) };
    };
    // fix: {lat, lon, acc, speed, heading, t}
    s.onFix = function (f) {
      var t = f.t != null ? f.t : Date.now(), out = { ignored: false, say: [], reroute: false, arrived: false, offRoute: false };
      if (s.done) { out.ignored = true; out.reason = 'done'; return out; }
      if (f.acc != null && f.acc > MAX_ACC_M) {
        s.lowAcc++; out.ignored = true; out.reason = 'low-accuracy'; out.lowAcc = s.lowAcc; return out;
      }
      s.lowAcc = 0;
      var raw = [f.lat, f.lon], dt = s.prev && s.lastT != null ? (t - s.lastT) / 1000 : 0, pos;
      // speed: device value if present, else from movement
      var sp = (f.speed != null && isFinite(f.speed) && f.speed >= 0) ? f.speed : (s.prev && dt > 0.3 ? hv(s.prev.raw, raw) / dt : s.speed);
      s.speed = s.prev ? 0.5 * s.speed + 0.5 * sp : sp;
      // jitter smoothing: hold still when barely moving inside the error circle, else weighted average
      if (!s.prev) pos = raw;
      else {
        var moved = hv(s.prev.pos, raw), acc = f.acc != null ? f.acc : 10;
        if (s.speed < 1 && moved < Math.min(acc * 0.6, 12)) pos = s.prev.pos;
        else { var a = s.speed > 6 ? 0.9 : 0.65; pos = [s.prev.pos[0] + (raw[0] - s.prev.pos[0]) * a, s.prev.pos[1] + (raw[1] - s.prev.pos[1]) * a]; }
      }
      // heading: device heading when moving, else from movement, else keep last
      if (f.heading != null && isFinite(f.heading) && s.speed > 1) s.heading = f.heading;
      else if (s.hdRef && hv(s.hdRef, pos) > 4) { s.heading = DIRM.bearing(s.hdRef, pos); s.hdRef = pos; }
      if (!s.hdRef) s.hdRef = pos;
      s.prev = { raw: raw, pos: pos }; s.lastT = t;
      var P = DIRM.progress(s.dirs, s.route, pos, s.speed, s.maxAlong);
      if (!P) { out.ignored = true; out.reason = 'no-route'; return out; }
      if (!P.offRoute && P.along > s.maxAlong) s.maxAlong = P.along;
      out.pos = pos; out.speed = s.speed; out.heading = s.heading; out.P = P; out.offRoute = P.offRoute;
      var arrivedNow = !P.offRoute && (P.remaining_m < 25 || P.stepIndex >= s.dirs.steps.length - 1);
      if (arrivedNow) {
        s.done = true; out.arrived = true; P.arrived = true;
        out.say.push({ tier: 'arrive', text: 'You have arrived', urgent: true });
      } else {
        var od = offRouteStep(s.off, P.off, t);
        if (od === 'reroute') { out.reroute = true; out.say.push({ tier: 'reroute', text: 'You are off route. Rerouting', urgent: true }); }
        out.say = out.say.concat(announce(s.ann, P, s.dirs.steps, s.unit, s.speed, s.planned));
      }
      out.view = s.view(P, pos, t);
      return out;
    };
    return s;
  }

  // ---- demo drive: fixes along the route at speedMps every dtSec of simulated time
  function simulateFixes(coords, cum, speedMps, dtSec, o) {
    o = o || {}; var total = cum[cum.length - 1], fixes = [], t0 = o.t0 || 0, d = 0, t = t0, seg = 0;
    function at(dm) {
      while (seg < coords.length - 2 && cum[seg + 1] < dm) seg++;
      var L = cum[seg + 1] - cum[seg], u = L > 0 ? clamp((dm - cum[seg]) / L, 0, 1) : 0, a = coords[seg], b = coords[seg + 1];
      return { lat: a[0] + (b[0] - a[0]) * u, lon: a[1] + (b[1] - a[1]) * u, heading: DIRM.bearing(a, b) };
    }
    while (true) {
      var p = at(Math.min(d, total));
      fixes.push({ lat: p.lat, lon: p.lon, acc: o.acc || 5, speed: speedMps, heading: p.heading, t: t, along: Math.min(d, total) });
      if (d >= total) break;
      d += speedMps * dtSec; t += dtSec * 1000;
    }
    return fixes;
  }

  return { MAX_ACC_M: MAX_ACC_M, OFF_M: OFF_M, OFF_FIXES: OFF_FIXES, REROUTE_MIN_MS: REROUTE_MIN_MS, leadDistances: leadDistances, ttsClean: ttsClean, spokenDist: spokenDist, speedLabel: speedLabel,
    newAnnouncer: newAnnouncer, announce: announce, silent: silent, newOffState: newOffState, offRouteStep: offRouteStep, eta: eta, fmtDur: fmtDur, createWakeLock: createWakeLock,
    createSession: createSession, simulateFixes: simulateFixes };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NAV;
