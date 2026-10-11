/* ===== CartRoute places search: pure logic (query building, parsing, categories, sorting, reachability text) ===== */
var PL = (function () {
  'use strict';
  var US_BOXES = [[24.3, 49.5, -125.2, -66.8], [51.0, 71.6, -180, -129.5], [18.7, 22.5, -160.6, -154.6]]; // contiguous US, AK, HI (same as states.js)
  var CATEGORIES = [
    { id: 'food', label: 'Food', emoji: '🍔', filters: [['amenity', 'restaurant|fast_food|food_court|ice_cream'], ['shop', 'bakery|deli']] },
    { id: 'coffee', label: 'Coffee', emoji: '☕', filters: [['amenity', 'cafe'], ['shop', 'coffee']] },
    { id: 'groceries', label: 'Groceries', emoji: '🛒', filters: [['shop', 'supermarket|convenience|greengrocer|grocery|butcher|seafood']] },
    { id: 'gas', label: 'Gas / EV charging', emoji: '⛽', filters: [['amenity', 'fuel|charging_station']] },
    { id: 'golf', label: 'Golf courses', emoji: '⛳', filters: [['leisure', 'golf_course|miniature_golf']] },
    { id: 'parks', label: 'Parks / Beach access', emoji: '🌴', filters: [['leisure', 'park|beach_resort|nature_reserve'], ['natural', 'beach']] },
    { id: 'pharmacy', label: 'Pharmacy', emoji: '💊', filters: [['amenity', 'pharmacy'], ['shop', 'chemist']] },
    { id: 'bars', label: 'Restaurants / Bars', emoji: '🍺', filters: [['amenity', 'restaurant|bar|pub|biergarten']] },
    { id: 'shops', label: 'Shops', emoji: '🛍️', filters: [['shop', null]] }
  ];
  var EMOJI = { food: '🍔', coffee: '☕', groceries: '🛒', gas: '⛽', golf: '⛳', parks: '🌴', pharmacy: '💊', bars: '🍺', shops: '🛍️', other: '📍' };
  var RADII = [1000, 3000, 5000];
  var MAX_RESULTS = 40;

  function category(id) { return CATEGORIES.filter(function (c) { return c.id === id; })[0] || null; }

  // Overpass query for a category around a point. Radius is clamped to 1-5 km (gentle on the public servers).
  function buildQuery(catId, lat, lon, radiusM) {
    var c = category(catId); if (!c) throw new Error('Unknown category ' + catId);
    var r = Math.max(500, Math.min(5000, Math.round(radiusM || 3000)));
    var parts = c.filters.map(function (f) {
      var sel = f[1] ? '["' + f[0] + '"~"^(' + f[1] + ')$"]' : '["' + f[0] + '"]';
      return 'nwr' + sel + '(around:' + r + ',' + lat.toFixed(5) + ',' + lon.toFixed(5) + ');';
    });
    return '[out:json][timeout:25];(' + parts.join('') + ');out tags center qt 150;';
  }

  function pretty(v) { v = String(v || '').replace(/_/g, ' '); return v.charAt(0).toUpperCase() + v.slice(1); }
  // tags -> {cat, label}
  function classify(t) {
    t = t || {};
    var a = t.amenity, s = t.shop, l = t.leisure;
    if (a === 'cafe' || s === 'coffee') return { cat: 'coffee', label: a === 'cafe' ? 'Cafe' : 'Coffee shop' };
    if (a === 'pharmacy' || s === 'chemist') return { cat: 'pharmacy', label: pretty(a || s) };
    if (['supermarket', 'convenience', 'greengrocer', 'grocery', 'butcher', 'seafood'].indexOf(s) >= 0) return { cat: 'groceries', label: pretty(s) };
    if (a === 'fuel') return { cat: 'gas', label: 'Gas station' };
    if (a === 'charging_station') return { cat: 'gas', label: 'EV charging' };
    if (l === 'golf_course' || l === 'miniature_golf') return { cat: 'golf', label: pretty(l) };
    if (['park', 'beach_resort', 'nature_reserve'].indexOf(l) >= 0 || t.natural === 'beach') return { cat: 'parks', label: t.natural === 'beach' ? 'Beach' : pretty(l) };
    if (['bar', 'pub', 'biergarten'].indexOf(a) >= 0) return { cat: 'bars', label: pretty(a) };
    if (['restaurant', 'fast_food', 'food_court', 'ice_cream'].indexOf(a) >= 0 || s === 'bakery' || s === 'deli') return { cat: 'food', label: pretty(a || s) };
    if (s) return { cat: 'shops', label: pretty(s) };
    if (t.tourism) return { cat: 'other', label: pretty(t.tourism) };
    return { cat: 'other', label: pretty(a || l || t.building || 'Place') };
  }
  function address(t) {
    t = t || {};
    var street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    return [street, t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ');
  }
  function cleanUrl(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = /^[\w.-]+\.[a-z]{2,}/i.test(u) ? 'https://' + u : ''; return /^https?:\/\//i.test(u) ? u : ''; }
  function inFL(lat, lon) { return isFinite(lat) && isFinite(lon) && US_BOXES.some(function (b) { return lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3]; }); }

  // Overpass JSON -> places (nodes: lat/lon; ways/relations: center). Unnamed places are kept only for fuel / EV charging.
  function parseElements(json) {
    var out = [], seen = {};
    ((json && json.elements) || []).forEach(function (e) {
      var t = e.tags; if (!t) return;
      var lat = e.type === 'node' ? e.lat : e.center && e.center.lat, lon = e.type === 'node' ? e.lon : e.center && e.center.lon;
      if (!inFL(lat, lon)) return;
      var c = classify(t);
      var name = t.name || t.brand || t.operator || '';
      if (!name) { if (c.cat !== 'gas') return; name = c.label; }
      var id = e.type + '/' + e.id; if (seen[id]) return; seen[id] = 1;
      out.push({ id: id, source: 'osm', lat: lat, lon: lon, name: name, cat: c.cat, emoji: EMOJI[c.cat], label: c.label,
        address: address(t), hours: t.opening_hours || '', phone: t.phone || t['contact:phone'] || '', website: cleanUrl(t.website || t['contact:website']) });
    });
    return out;
  }

  function hav(a, b) {
    var R = 6371000, d = Math.PI / 180, dLat = (b[0] - a[0]) * d, dLon = (b[1] - a[1]) * d;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function sortByDistance(places, origin) {
    return places.map(function (p) { var q = {}; for (var k in p) q[k] = p[k]; q.distanceM = hav(origin, [p.lat, p.lon]); return q; })
      .sort(function (a, b) { return a.distanceM - b.distanceM; });
  }
  function fmtDist(m) { var mi = m / 1609.344; return mi < 0.1 ? Math.round(m * 3.28084) + ' ft' : mi.toFixed(1) + ' mi'; }

  // ----- Photon text search -----
  function photonUrl(q, bias) {
    var u = 'https://photon.komoot.io/api/?lang=en&limit=10'; // no bbox: results are filtered to the US after
    if (bias) u += '&lat=' + bias[0].toFixed(4) + '&lon=' + bias[1].toFixed(4);
    return u + '&q=' + encodeURIComponent(q);
  }
  function parsePhoton(json) {
    var out = [], seen = {};
    ((json && json.features) || []).forEach(function (f) {
      var p = f.properties || {}, c = f.geometry && f.geometry.coordinates; if (!c || !inFL(c[1], c[0]) || (p.countrycode && p.countrycode !== 'US')) return;
      var tags = {}; if (p.osm_key) tags[p.osm_key] = p.osm_value;
      var cl = classify(tags), name = p.name || [p.housenumber, p.street].filter(Boolean).join(' '); if (!name) return;
      var id = 'photon/' + (p.osm_type || '') + (p.osm_id || '') + '/' + name; if (seen[id]) return; seen[id] = 1;
      out.push({ id: id, source: 'photon', lat: c[1], lon: c[0], name: name, cat: cl.cat, emoji: EMOJI[cl.cat], label: cl.label,
        address: [[p.housenumber, p.street].filter(Boolean).join(' '), p.city, p.postcode].filter(Boolean).join(', '), hours: '', phone: '', website: '' });
    });
    return out;
  }

  // ----- reachability wording (routing result -> badge) -----
  var WALK_M = 150;
  function reachability(res, place) {
    var snapEnd = res && res.snap && res.snap.end;
    if (res && res.error === 'cart-not-eligible') return { state: 'none', text: 'Your cart is not eligible yet (see cart status)' };
    if (res && res.ok) {
      var mi = res.distance_m / 1609.344, min = Math.max(1, Math.round(res.time_s / 60));
      var trip = mi.toFixed(1) + ' mi, ~' + min + ' min';
      var d = snapEnd ? snapEnd.dist : 0;
      if (d > WALK_M) return { state: 'walk', text: 'Legal route ends about ' + Math.round(d) + ' m from here; you may need to walk (' + trip + ')', walkM: d };
      var miss = (res.segments || []).filter(function (s) { return s.basis === 'assumed'; }).reduce(function (a, s) { return a + s.len; }, 0);
      if (res.distance_m > 0 && miss / res.distance_m >= 0.1) return { state: 'assumed', text: 'Needs assumed roads (' + trip + ')' };
      return { state: 'reachable', text: 'Reachable by legal route (' + trip + ')' };
    }
    var far = !snapEnd || snapEnd.tooFar;
    if (far) {
      var dd = snapEnd ? Math.round(snapEnd.dist) : null;
      return { state: 'far', text: 'No legal route found: nearest legal road is ' + (dd != null ? dd + ' m' : 'too far') + ' away; you may need to walk', walkM: dd };
    }
    return { state: 'none', text: 'No legal route found' };
  }
  var BADGE_ICON = { reachable: '✅', assumed: '⚠️', walk: '🚶', far: '🚶', none: '⛔', checking: '⏳', unchecked: '👆' };

  // Choose which places can share one road download with the origin: nearest first while the bounding box diagonal stays <= maxSpanKm.
  function pickBatch(places, origin, max, maxSpanKm) {
    var picked = [], s = origin[0], n = origin[0], w = origin[1], e = origin[1];
    for (var i = 0; i < places.length && picked.length < max; i++) {
      var p = places[i], s2 = Math.min(s, p.lat), n2 = Math.max(n, p.lat), w2 = Math.min(w, p.lon), e2 = Math.max(e, p.lon);
      if (hav([s2, w2], [n2, e2]) / 1000 > maxSpanKm) continue;
      s = s2; n = n2; w = w2; e = e2; picked.push(p);
    }
    return picked;
  }
  return { EMOJI: EMOJI, CATEGORIES: CATEGORIES, RADII: RADII, MAX_RESULTS: MAX_RESULTS, category: category, buildQuery: buildQuery, classify: classify, parseElements: parseElements,
    sortByDistance: sortByDistance, fmtDist: fmtDist, photonUrl: photonUrl, parsePhoton: parsePhoton, reachability: reachability, BADGE_ICON: BADGE_ICON,
    pickBatch: pickBatch, hav: hav, WALK_M: WALK_M, inFL: inFL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PL;
