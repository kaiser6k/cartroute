/* ===== CartRoute turn-by-turn directions (pure JS, no DOM): built from a planRoute result + the parsed road graph ===== */
var DIR = (function () {
  'use strict';
  var R = 6371000, RAD = Math.PI / 180;
  function hav(a, b) {
    var dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  // compass bearing a -> b, degrees 0..360 (0 = north, clockwise)
  function bearing(a, b) {
    var y = Math.sin((b[1] - a[1]) * RAD) * Math.cos(b[0] * RAD);
    var x = Math.cos(a[0] * RAD) * Math.sin(b[0] * RAD) - Math.sin(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.cos((b[1] - a[1]) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  // signed turn angle in (-180,180]; positive = right
  function delta(inB, outB) { var d = ((outB - inB) % 360 + 540) % 360 - 180; return d === -180 ? 180 : d; }
  var KINDS = {
    'straight': { arrow: '↑', turn: 'Continue straight' }, 'slight-left': { arrow: '↖', turn: 'Keep left' }, 'left': { arrow: '←', turn: 'Turn left' },
    'sharp-left': { arrow: '↰', turn: 'Turn sharp left' }, 'slight-right': { arrow: '↗', turn: 'Keep right' }, 'right': { arrow: '→', turn: 'Turn right' },
    'sharp-right': { arrow: '↱', turn: 'Turn sharp right' }, 'uturn': { arrow: '↶', turn: 'Make a U-turn' },
    'roundabout': { arrow: '⟳', turn: 'Enter the roundabout' }, 'depart': { arrow: '↑', turn: 'Head' }, 'arrive': { arrow: '⚑', turn: 'Arrive' } };
  function classify(d) {
    var a = Math.abs(d), side = d < 0 ? 'left' : 'right';
    if (a <= 20) return 'straight';
    if (a <= 60) return 'slight-' + side;
    if (a <= 120) return side;
    if (a <= 165) return 'sharp-' + side;
    return 'uturn';
  }
  function arrowFor(kind) { return (KINDS[kind] || KINDS.straight).arrow; }
  var COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  function compass(b) { return COMPASS[Math.round(b / 45) % 8]; }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  // Distances: miles + feet for 'mph' regions (feet under 0.1 mi), km + metres for 'kmh' (metres under 1 km).
  function fmtDist(m, unit) {
    m = Math.max(0, Number(m) || 0);
    if (unit === 'kmh') {
      if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
      var k = m / 1000; return (k < 10 ? (Math.round(k * 10) / 10).toFixed(1) : Math.round(k)) + ' km';
    }
    if (m < 160.9344) return Math.max(10, Math.round(m * 3.28084 / 10) * 10) + ' ft';
    var mi = m / 1609.344; return (mi < 10 ? (Math.round(mi * 10) / 10).toFixed(1) : Math.round(mi)) + ' mi';
  }

  function roadLabel(tags, hw) {
    tags = tags || {};
    if (tags.name) return tags.name;
    if (tags.ref) return tags.ref;
    if (hw === 'service' || tags.highway === 'service') return 'the service road';
    return 'the road';
  }
  function isRound(tags) { return !!tags && (tags.junction === 'roundabout' || tags.junction === 'circular'); }

  // point at least `min` m away from coords[i] walking in direction dir (+1/-1), staying within [lo,hi]
  function pointAway(coords, i, dir, min, lo, hi) {
    var d = 0, j = i;
    while (true) {
      var n = j + dir; if (n < lo || n > hi) break;
      d += hav(coords[j], coords[n]); j = n;
      if (d >= min) break;
    }
    return j === i ? null : coords[j];
  }

  // route: planRoute result (coords, nodeIds, edgeWays). g: parseOverpass graph. Returns {steps, cum, total_m}.
  function build(route, g) {
    var coords = route.coords || [], ew = route.edgeWays || [], n = ew.length;
    var cum = [0];
    for (var i = 0; i < coords.length - 1; i++) cum.push(cum[i] + hav(coords[i], coords[i + 1]));
    var total = cum[cum.length - 1];
    if (n < 1 || coords.length < 2) return { steps: [], cum: cum, total_m: total };
    // 1) group edges into legs by road (name key). Synthetic crossing edges (no real way) stay in the leg they interrupt.
    var legs = [], cur = null;
    for (i = 0; i < n; i++) {
      var w = g.ways[ew[i]], tags = w ? w.tags : null;
      if (!w) { if (cur) { cur.e = i + 1; } else { cur = { s: i, e: i + 1, tags: {}, key: 'x', round: false, wi: -1 }; legs.push(cur); } continue; }
      var label = roadLabel(tags), named = !!(tags.name || tags.ref), round = isRound(tags);
      var key = (round ? 'r:' : '') + (named ? label : 'w' + ew[i]);
      if (cur && cur.key === key && !round) { cur.e = i + 1; if (cur.tags && !cur.tags.name && tags.name) cur.tags = tags; continue; }
      if (cur && cur.key === 'x' && !cur.fixed) { cur.key = key; cur.tags = tags; cur.round = round; cur.wi = ew[i]; cur.e = i + 1; cur.fixed = true; continue; }
      cur = { s: i, e: i + 1, tags: tags, key: key, round: round, wi: ew[i] };
      legs.push(cur);
    }
    // roundabout edges on different ways of the same circle: merge consecutive round legs
    var merged = [];
    legs.forEach(function (l) { var p = merged[merged.length - 1]; if (p && p.round && l.round) p.e = l.e; else merged.push(l); });
    legs = merged;
    // 2) build steps
    var steps = [];
    function legLabel(l) { return roadLabel(l.tags); }
    var b0 = bearing(coords[0], pointAway(coords, 0, 1, 15, 0, legs[0].e) || coords[1]);
    steps.push({ type: 'depart', kind: 'depart', arrow: '↑', road: legLabel(legs[0]), at: coords[0], idx: 0, cum: 0, bearing: b0,
      text: 'Head ' + compass(b0) + ' on ' + legLabel(legs[0]) });
    for (var li = 1; li < legs.length; li++) {
      var pl = legs[li - 1], l = legs[li], j = l.s;      // junction = coords[j]
      var inB = bearing(pointAway(coords, j, -1, 15, pl.s, j) || coords[Math.max(0, j - 1)], coords[j]);
      var outB = bearing(coords[j], pointAway(coords, j, 1, 15, j, l.e) || coords[j + 1]);
      var d = delta(inB, outB), kind = classify(d), road = legLabel(l), st;
      if (l.round) {
        // count exits: nodes after the entry node along the circle that connect to a way you could leave on
        var exitIdx = l.e, cnt = 0;
        for (var k = l.s + 1; k <= l.e; k++) {
          var nid = route.nodeIds && route.nodeIds[k], ws = (g.nodeWays && g.nodeWays.get(nid)) || [], exitable = false;
          for (var q = 0; q < ws.length; q++) {
            var ow = g.ways[ws[q]]; if (!ow || isRound(ow.tags)) continue;
            var od = ow.tags.oneway, last = ow.nodes[ow.nodes.length - 1], first = ow.nodes[0];
            if ((od === 'yes' || od === '1' || od === 'true') && last === nid && first !== nid) continue;   // entry-only
            if ((od === '-1' || od === 'reverse') && first === nid && last !== nid) continue;
            exitable = true; break;
          }
          if (k === l.e || exitable) cnt++;   // the node we leave at always counts
        }
        // the leg after the circle names the exit road
        var nx = legs[li + 1];
        road = nx ? legLabel(nx) : 'your destination';
        var nth = Math.max(1, cnt);
        st = { type: 'roundabout', kind: 'roundabout', arrow: arrowFor('roundabout'), road: road, exit: nth, at: coords[j], idx: j, bearing: outB, delta: d,
          text: 'Enter the roundabout and take the ' + ordinal(nth) + ' exit' + (nx ? ' onto ' + road : ''), endIdx: l.e };
        steps.push(st);
        if (nx) { nx.afterRound = true; }
        continue;
      }
      if (pl.round) {
        // leaving a roundabout is part of the roundabout instruction; no separate step
        continue;
      }
      var txt;
      if (kind === 'straight') txt = 'Continue straight onto ' + road;
      else if (kind === 'uturn') txt = 'Make a U-turn onto ' + road;
      else txt = KINDS[kind].turn + ' onto ' + road;
      steps.push({ type: 'turn', kind: kind, arrow: arrowFor(kind), road: road, at: coords[j], idx: j, bearing: outB, delta: d, text: txt });
    }
    steps.push({ type: 'arrive', kind: 'arrive', arrow: '⚑', road: '', at: coords[coords.length - 1], idx: coords.length - 1, text: 'Arrive at your destination' });
    // 3) distance of each step = distance to the next maneuver; "continue" detail
    for (i = 0; i < steps.length; i++) {
      steps[i].cum = cum[steps[i].idx];
      var nxt = steps[i + 1];
      steps[i].distance_m = nxt ? cum[nxt.idx] - cum[steps[i].idx] : 0;
    }
    return { steps: steps, cum: cum, total_m: total };
  }

  // Detail line for a step: "Continue straight on N Orlando Ave for 2.1 mi"
  function detail(step, unit) {
    if (!step || step.type === 'arrive') return '';
    var on = step.type === 'roundabout' ? '' : (step.road ? ' on ' + step.road : '');
    return (step.type === 'depart' ? 'Continue' : 'Continue straight') + on + ' for ' + fmtDist(step.distance_m, unit);
  }

  // project p onto polyline; returns {along, off, seg}
  function snapToRoute(coords, cum, p, minAlong) {
    var best = null, kx = Math.cos(p[0] * RAD) * 111320, ky = 110540;
    for (var i = 0; i < coords.length - 1; i++) {
      if (minAlong && cum[i + 1] < minAlong - 1e-6) continue;   // never snap behind progress already made
      var ax = (coords[i][1] - p[1]) * kx, ay = (coords[i][0] - p[0]) * ky, bx = (coords[i + 1][1] - p[1]) * kx, by = (coords[i + 1][0] - p[0]) * ky;
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      var px = ax + t * dx, py = ay + t * dy, dist = Math.sqrt(px * px + py * py);
      if (!best || dist < best.off) best = { off: dist, seg: i, along: cum[i] + t * (cum[i + 1] - cum[i]), at: [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t] };
    }
    if (best && minAlong && best.along < minAlong) best.along = minAlong;
    return best;
  }
  var OFF_ROUTE_M = 60;
  // Progress of a live position along the route. dirs = build() result, route = planRoute result.
  function progress(dirs, route, pos, speedMps, minAlong) {
    var st = dirs.steps; if (!st.length) return null;
    var sn = snapToRoute(route.coords, dirs.cum, pos, minAlong || 0);
    var cur = 0;
    for (var i = 0; i < st.length; i++) if (st[i].cum <= sn.along + 1e-6) cur = i;
    if (cur >= st.length - 1) cur = st.length - 1;
    var next = st[Math.min(cur + 1, st.length - 1)];
    var remaining = Math.max(0, dirs.total_m - sn.along);
    return { stepIndex: cur, next: next, nextIndex: Math.min(cur + 1, st.length - 1), distToNext: Math.max(0, next.cum - sn.along), along: sn.along, off: sn.off, offRoute: sn.off > OFF_ROUTE_M,
      remaining_m: remaining, remaining_s: route.time_s && dirs.total_m ? route.time_s * remaining / dirs.total_m : null, arrived: cur >= st.length - 1 || remaining < 20, snapped: sn.at };
  }
  // "Next: Turn left onto X in 0.4 mi"
  function nextText(next, dist, unit) {
    if (!next) return '';
    return 'Next: ' + next.text + ' in ' + fmtDist(dist, unit);
  }

  return { build: build, progress: progress, snapToRoute: snapToRoute, classify: classify, delta: delta, bearing: bearing, fmtDist: fmtDist, detail: detail, nextText: nextText,
    arrowFor: arrowFor, compass: compass, ordinal: ordinal, roadLabel: roadLabel, OFF_ROUTE_M: OFF_ROUTE_M };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DIR;
