/* ===== CartRoute type-ahead: pure logic (URL building, parsing, labels, dedupe, recents) ===== */
var AC = (function () {
  'use strict';
  var US_BOXES = [[24.3, 49.5, -125.2, -66.8], [51.0, 71.6, -180, -129.5], [18.7, 22.5, -160.6, -154.6]]; // contiguous US, AK, HI (same as states.js)
  var GX = typeof GEO !== 'undefined' ? GEO : (typeof require === 'function' ? require('./geo.js') : null);
  var STX = typeof ST !== 'undefined' ? ST : (typeof require === 'function' ? require('./states.js') : null);
  var MIN_CHARS = 3, DEBOUNCE_MS = 300, LIMIT = 6, MAX_RECENTS = 5;
  function inFL(lat, lon) { return isFinite(lat) && isFinite(lon) && US_BOXES.some(function (b) { return lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3]; }); }
  function shouldSearch(q) { return typeof q === 'string' && q.trim().length >= MIN_CHARS; }

  // Photon autocomplete URL: no bbox (results are filtered to the US after); optional location bias [lat, lon]
  function suggestUrl(q, bias) {
    var u = 'https://photon.komoot.io/api/?lang=en&limit=' + LIMIT; // no bbox: US-only filtering happens in parse()
    if (bias && isFinite(bias[0]) && isFinite(bias[1])) u += '&lat=' + Number(bias[0]).toFixed(4) + '&lon=' + Number(bias[1]).toFixed(4);
    return u + '&q=' + encodeURIComponent(String(q).trim());
  }

  function icon(key, value) {
    if (key === 'place' || key === 'boundary') return '🏙️';
    if (key === 'shop') return value === 'supermarket' || value === 'convenience' ? '🛒' : '🛍️';
    if (key === 'amenity') return { cafe: '☕', restaurant: '🍽️', fast_food: '🍔', bar: '🍺', pub: '🍺', fuel: '⛽', charging_station: '🔌', pharmacy: '💊', parking: '🅿️' }[value] || '📍';
    if (key === 'tourism') return value === 'hotel' || value === 'motel' ? '🏨' : '🏖️';
    if (key === 'leisure' || key === 'natural') return '🌴';
    if (key === 'highway') return '🛣️';
    if (key === 'building' || key === 'place_house') return '🏠';
    return '📍';
  }

  function stateAbbr(n) { var t = STX && n ? STX.T.filter(function (x) { return x.n === n; })[0] : null; return t ? t.a : n || ''; }
  // Photon JSON -> suggestions (US only, deduped, max LIMIT)
  function parseAll(json) {
    var out = [], seen = {};
    ((json && json.features) || []).forEach(function (f) {
      var p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
      if (!c || !inFL(Number(c[1]), Number(c[0]))) return;
      if (p.countrycode && p.countrycode !== 'US') return;
      var streetLine = [p.housenumber, p.street].filter(Boolean).join(' ');
      var primary = p.name || streetLine || p.city || p.county;
      if (!primary) return;
      var city = p.city || p.locality || p.district || '';
      var parts = [p.name && streetLine ? streetLine : '', city, p.county || '', p.state || ''].filter(function (x) { return x && x !== primary; });
      parts = parts.filter(function (x, i) { return parts.indexOf(x) === i; });
      var labelParts = [primary].concat([p.name && streetLine ? streetLine : '', city, stateAbbr(p.state)]
        .filter(function (x) { return x && x !== primary; }));
      var label = labelParts.filter(function (x, i) { return labelParts.indexOf(x) === i; }).join(', ');
      var key = label.toLowerCase() + '|' + Number(c[1]).toFixed(3) + ',' + Number(c[0]).toFixed(3);
      if (seen[key]) return; seen[key] = 1;
      out.push({ id: (p.osm_type || '') + (p.osm_id || '') + ':' + out.length, lat: Number(c[1]), lon: Number(c[0]), primary: primary, secondary: parts.join(', '), label: label,
        icon: icon(p.osm_key, p.osm_value), tags: p.osm_key ? (function () { var t = {}; t[p.osm_key] = p.osm_value; return t; })() : {}, address: [streetLine, city].filter(Boolean).join(', ') });
    });
    return out;
  }
  function parse(json) { return parseAll(json).slice(0, LIMIT); }


  // ===== Nearby place-NAME search (Publix, Dunkin, Walmart ...): Photon + Nominatim + Overpass, merged, deduped, nearest first =====
  var NEAR_KM = 40, MAX_NEAR = 8;
  function isNameQuery(q) { return !!GX && GX.isPlaceName(q) && String(q || '').trim().length >= MIN_CHARS; }
  // Cleanest core name: "local publix grocery store" -> "publix"
  function coreName(q) { var v = GX ? GX.orderedVariants(q) : [String(q || '').trim()]; return (v[0] || '').trim(); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function hav(a, b, c, d) {
    var R = 6371, k = Math.PI / 180, dLat = (c - a) * k, dLon = (d - b) * k;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * k) * Math.cos(c * k) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmtMi(km) { var mi = km / 1.609344; return mi < 0.1 ? Math.round(km * 3280.84) + ' ft' : mi.toFixed(1) + ' mi'; }
  function bboxAround(ref, km) {
    var dLat = km / 111.2, dLon = km / (111.2 * Math.max(0.2, Math.cos(ref[0] * Math.PI / 180)));
    return [ref[1] - dLon, ref[0] - dLat, ref[1] + dLon, ref[0] + dLat]; // minLon, minLat, maxLon, maxLat
  }
  function f4(n) { return Number(n).toFixed(4); }
  function photonNearUrl(q, ref, km) {
    var b = bboxAround(ref, km || NEAR_KM);
    return 'https://photon.komoot.io/api/?lang=en&limit=20&lat=' + f4(ref[0]) + '&lon=' + f4(ref[1]) + '&bbox=' + b.map(f4).join(',') + '&q=' + encodeURIComponent(String(q).trim());
  }
  function nominatimNearUrl(q, ref, km) {
    var b = bboxAround(ref, km || NEAR_KM); // viewbox = left,top,right,bottom
    return 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=15&countrycodes=us&bounded=1&viewbox=' + [b[0], b[3], b[2], b[1]].map(f4).join(',') + '&q=' + encodeURIComponent(String(q).trim());
  }
  function overpassNameQuery(name, ref, radiusM) {
    var rx = String(name).trim().replace(/[^A-Za-z0-9 ]/g, '.').replace(/\s+/g, ' ').replace(/"/g, '');
    var r = Math.max(1000, Math.min(40000, Math.round(radiusM || NEAR_KM * 1000))), ar = '(around:' + r + ',' + Number(ref[0]).toFixed(5) + ',' + Number(ref[1]).toFixed(5) + ');';
    return '[out:json][timeout:25];(nwr["name"~"' + rx + '",i]["shop"]' + ar + 'nwr["name"~"' + rx + '",i]["amenity"]' + ar + 'nwr["brand"~"' + rx + '",i]' + ar + ');out tags center 60;';
  }
  function streetOf(hn, road) { return [hn, road].filter(Boolean).join(' '); }
  function mk(src, primary, lat, lon, address, tags, ic, city) {
    return { id: src + ':' + norm(primary) + ':' + f4(lat) + ',' + f4(lon), source: src, lat: lat, lon: lon, primary: primary, address: address, city: city || '', icon: ic, tags: tags || {} };
  }
  function parseNominatimNear(arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (r) {
      var lat = Number(r.lat), lon = Number(r.lon); if (!inFL(lat, lon)) return;
      var a = r.address || {}, name = r.name || a[r.type] || String(r.display_name || '').split(',')[0].trim(); if (!name) return;
      var city = a.city || a.town || a.village || a.hamlet || a.suburb || '';
      var tags = {}; if (r.category) tags[r.category] = r.type;
      out.push(mk('nominatim', name, lat, lon, [streetOf(a.house_number, a.road), city].filter(Boolean).join(', '), tags, icon(r.category, r.type), city));
    });
    return out;
  }
  var NOT_PLACE = { parking: 1, bicycle_parking: 1, parking_space: 1, parking_entrance: 1, bench: 1, waste_basket: 1 };
  function parseOverpassNear(json) {
    var out = [];
    ((json && json.elements) || []).forEach(function (e) {
      var t = e.tags; if (!t) return;
      var lat = e.type === 'node' ? e.lat : e.center && e.center.lat, lon = e.type === 'node' ? e.lon : e.center && e.center.lon;
      if (!inFL(lat, lon)) return;
      if (NOT_PLACE[t.amenity]) return;
      var name = t.name || t.brand; if (!name) return;
      var key = t.shop ? 'shop' : t.amenity ? 'amenity' : t.tourism ? 'tourism' : t.leisure ? 'leisure' : '', tags = {}; if (key) tags[key] = t[key];
      out.push(mk('osm', name, lat, lon, [streetOf(t['addr:housenumber'], t['addr:street']), t['addr:city']].filter(Boolean).join(', '), tags, icon(key, t[key]), t['addr:city']));
    });
    return out;
  }
  function parsePhotonNear(json) {
    return parseAll(json).map(function (x) { return mk('photon', x.primary, x.lat, x.lon, x.address, x.tags, x.icon, ''); });
  }
  // Merge several candidate lists: keep name matches inside maxKm of ref, dedupe (same name within ~120 m, or same name + same street address), nearest first.
  function mergeRank(lists, ref, core, maxKm) {
    var first = norm(core).split(' ')[0] || '', all = [];
    lists.forEach(function (l) { (l || []).forEach(function (x) { all.push(x); }); });
    var items = [];
    all.forEach(function (x) {
      var d = hav(ref[0], ref[1], x.lat, x.lon);
      if (maxKm && d > maxKm) return;
      if (first && norm(x.primary).indexOf(first) < 0) return;
      var y = {}; for (var k in x) y[k] = x[k]; y.distKm = d; y.distLabel = fmtMi(d);
      var dup = items.filter(function (o) {
        if (norm(o.primary) !== norm(y.primary)) return false;
        return hav(o.lat, o.lon, y.lat, y.lon) < 0.12 || (o.address && norm(o.address) === norm(y.address));
      })[0];
      if (dup) { if (!dup.address && y.address) { dup.address = y.address; } return; }
      items.push(y);
    });
    items.sort(function (a, b) { return a.distKm - b.distKm; });
    return items.slice(0, MAX_NEAR).map(function (it, i) {
      var addr = it.address || '';
      it.secondary = addr; it.label = [it.primary, addr].filter(Boolean).join(', '); it.id = it.id + ':' + i;
      return it;
    });
  }
  // io = { json(url) -> Promise<json> (Photon), nominatim(url) -> Promise<json> or null to skip (host throttles 1 req/s), overpass(queryString) -> Promise<json> }
  // opts.deep: also ask Overpass even when the other sources found enough. Resolves {items, errors, ok} (rejects never).
  function searchNearby(q, ref, io, opts) {
    opts = opts || {};
    var core = coreName(q), errors = 0, okSrc = 0;
    function guard(p, parser) { return Promise.resolve().then(function () { return p; }).then(function (j) { if (j == null) return []; okSrc++; return parser(j); }).catch(function () { errors++; return []; }); }
    var jobs = [guard(io.json && io.json(photonNearUrl(core, ref)), parsePhotonNear)];
    if (io.nominatim) jobs.push(guard(io.nominatim(nominatimNearUrl(core, ref)), parseNominatimNear));
    return Promise.all(jobs).then(function (ls) {
      var m = mergeRank(ls, ref, core, NEAR_KM);
      if (io.overpass && (opts.deep || m.length < 3)) {
        return guard(io.overpass(overpassNameQuery(core, ref)), parseOverpassNear).then(function (ol) { return mergeRank(ls.concat([ol]), ref, core, NEAR_KM); });
      }
      return m;
    }).then(function (items) { return { items: items, errors: errors, ok: okSrc > 0 }; });
  }


  // ===== Category search ("coffee", "gas station", "pharmacy" ...): reuses PL (places.js) categories + Overpass query shape =====
  var PLX = typeof PL !== 'undefined' ? PL : (typeof require === 'function' ? require('./places.js') : null);
  // Extra categories PL doesn't have. filters: [[key, regex|null]]; label: row wording; unnamed: keep places with no name (labelled by type)
  var EXTRA = {
    bank: { label: 'bank', emoji: '🏦', filters: [['amenity', 'bank']] },
    atm: { label: 'ATM', emoji: '🏧', filters: [['amenity', 'atm']], unnamed: true },
    hospital: { label: 'hospital', emoji: '🏥', filters: [['amenity', 'hospital']] },
    clinic: { label: 'clinic', emoji: '🏥', filters: [['amenity', 'clinic|doctors|urgent_care'], ['healthcare', 'urgent_care']] },
    dentist: { label: 'dentist', emoji: '🦷', filters: [['amenity', 'dentist']] },
    post: { label: 'post office', emoji: '📮', filters: [['amenity', 'post_office']], unnamed: true },
    hardware: { label: 'hardware store', emoji: '🔧', filters: [['shop', 'hardware|doityourself|trade']] },
    icecream: { label: 'ice cream', emoji: '🍦', filters: [['amenity', 'ice_cream'], ['shop', 'ice_cream']] },
    pizza: { label: 'pizza', emoji: '🍕', filters: [['cuisine', '(^|.*;)pizza(;.*|$)']] },
    beach: { label: 'beach', emoji: '🏖️', filters: [['natural', 'beach'], ['leisure', 'beach_resort']] },
    park: { label: 'park', emoji: '🌴', filters: [['leisure', 'park|nature_reserve|playground']] },
    restaurant: { label: 'restaurant', emoji: '🍽️', filters: [['amenity', 'restaurant|fast_food|food_court']] },
    bar: { label: 'bar', emoji: '🍺', filters: [['amenity', 'bar|pub|biergarten']] },
    fuel: { label: 'gas station', emoji: '⛽', filters: [['amenity', 'fuel']], unnamed: true },
    ev: { label: 'EV charging', emoji: '🔌', filters: [['amenity', 'charging_station']], unnamed: true },
    grocery: { label: 'grocery', emoji: '🛒', filters: [['shop', 'supermarket|greengrocer|grocery|convenience']] },
    coffee: { label: 'coffee', emoji: '☕', filters: [['amenity', 'cafe'], ['shop', 'coffee']] },
    pharmacy: { label: 'pharmacy', emoji: '💊', filters: [['amenity', 'pharmacy'], ['shop', 'chemist']] },
    golf: { label: 'golf course', emoji: '⛳', filters: [['leisure', 'golf_course|miniature_golf']] },
    library: { label: 'library', emoji: '📚', filters: [['amenity', 'library']] },
    hotel: { label: 'hotel', emoji: '🏨', filters: [['tourism', 'hotel|motel|resort']] }
  };
  // Keyword (normalized, singular) -> category key in EXTRA. Only exact phrases count, so brands ("Wawa", "Shell") and addresses ("Park Ave") never match.
  var KEYWORDS = {
    'coffee': 'coffee', 'coffee shop': 'coffee', 'cafe': 'coffee', 'coffeehouse': 'coffee', 'espresso': 'coffee',
    'gas': 'fuel', 'gas station': 'fuel', 'fuel': 'fuel', 'petrol': 'fuel', 'gasoline': 'fuel', 'filling station': 'fuel',
    'ev charging': 'ev', 'ev charger': 'ev', 'charging station': 'ev', 'ev charging station': 'ev',
    'pharmacy': 'pharmacy', 'drugstore': 'pharmacy', 'drug store': 'pharmacy', 'chemist': 'pharmacy',
    'grocery': 'grocery', 'grocery store': 'grocery', 'supermarket': 'grocery', 'super market': 'grocery', 'groceries': 'grocery', 'convenience store': 'grocery',
    'food': 'restaurant', 'restaurant': 'restaurant', 'dinner': 'restaurant', 'lunch': 'restaurant', 'breakfast': 'restaurant', 'fast food': 'restaurant', 'burger': 'restaurant',
    'pizza': 'pizza', 'pizzeria': 'pizza', 'pizza place': 'pizza',
    'hardware store': 'hardware', 'hardware': 'hardware',
    'ice cream': 'icecream', 'ice cream shop': 'icecream', 'icecream': 'icecream', 'gelato': 'icecream',
    'beach': 'beach', 'beach access': 'beach',
    'bank': 'bank', 'atm': 'atm', 'cash machine': 'atm',
    'hospital': 'hospital', 'emergency room': 'hospital',
    'urgent care': 'clinic', 'clinic': 'clinic', 'doctor': 'clinic',
    'bar': 'bar', 'pub': 'bar', 'brewery': 'bar',
    'dentist': 'dentist', 'dental': 'dentist',
    'post office': 'post', 'postal': 'post',
    'park': 'park', 'playground': 'park',
    'golf course': 'golf', 'golf': 'golf', 'library': 'library', 'hotel': 'hotel', 'motel': 'hotel'
  };
  var CAT_R1 = 5000, CAT_R2 = 10000, CAT_MIN = 5;
  // "the nearest Gas Stations near me" -> "gas station"
  function catNorm(q) {
    var s = String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    for (var i = 0; i < 4; i++) s = s.replace(/^(?:the|a|an|my|local|nearby|nearest|closest|find|any|some|good|best)\s+/, '');
    s = s.replace(/\s+(?:near me|nearby|near here|around here|close by|closest|nearest)$/, '').trim();
    return s;
  }
  // Returns {key, label, emoji, filters, unnamed} or null when the text isn't a pure category keyword.
  function categoryOf(q) {
    q = String(q || ''); if (/\d/.test(q) || q.indexOf(',') >= 0) return null;
    var s = catNorm(q); if (!s) return null;
    var cands = [s]; if (/ies$/.test(s)) cands.push(s.slice(0, -3) + 'y'); if (/(?:ch|sh|x|s)es$/.test(s)) cands.push(s.slice(0, -2)); if (/s$/.test(s)) cands.push(s.slice(0, -1));
    for (var i = 0; i < cands.length; i++) { if (Object.prototype.hasOwnProperty.call(KEYWORDS, cands[i])) { var k = KEYWORDS[cands[i]], e = EXTRA[k]; return { key: k, label: e.label, emoji: e.emoji, filters: e.filters, unnamed: !!e.unnamed, word: cands[i] }; } }
    return null;
  }
  function isCategoryQuery(q) { return String(q || '').trim().length >= MIN_CHARS - 1 && !!categoryOf(q); }
  function categoryQuery(cat, ref, radiusM) {
    var c = typeof cat === 'string' ? { filters: EXTRA[cat].filters } : cat;
    var r = Math.max(500, Math.min(15000, Math.round(radiusM || CAT_R1)));
    var parts = c.filters.map(function (f) { return 'nwr["' + f[0] + '"' + (f[1] ? '~"' + (/^\(?\^/.test(f[1]) || f[1].charAt(0) === '(' ? f[1] : '^(' + f[1] + ')$') + '"' : '') + ']' + '(around:' + r + ',' + Number(ref[0]).toFixed(3) + ',' + Number(ref[1]).toFixed(3) + ');'; });
    return '[out:json][timeout:25];(' + parts.join('') + ');out tags center qt 150;';
  }
  function typeLabel(t, cat) {
    var a = t.amenity, s = t.shop;
    if (a === 'fuel') return 'gas station'; if (a === 'charging_station') return 'EV charging'; if (a === 'atm') return 'ATM'; if (a === 'bank') return 'bank';
    if (a === 'cafe' || s === 'coffee') return 'coffee'; if (a === 'pharmacy' || s === 'chemist') return 'pharmacy';
    if (a === 'ice_cream' || s === 'ice_cream') return 'ice cream'; if (a === 'post_office') return 'post office'; if (a === 'dentist') return 'dentist';
    if (a === 'hospital') return 'hospital'; if (a === 'clinic' || a === 'doctors' || a === 'urgent_care') return 'clinic';
    if (s === 'hardware' || s === 'doityourself' || s === 'trade') return 'hardware store';
    if (t.natural === 'beach' || t.leisure === 'beach_resort') return 'beach'; if (t.leisure === 'park' || t.leisure === 'nature_reserve' || t.leisure === 'playground') return 'park';
    if (cat.key === 'pizza' && /pizza/.test(t.cuisine || '')) return 'pizza';
    if (a === 'restaurant' || a === 'fast_food' || a === 'food_court') return String(a).replace(/_/g, ' ');
    if (a === 'bar' || a === 'pub' || a === 'biergarten') return a;
    if (['supermarket', 'convenience', 'greengrocer', 'grocery'].indexOf(s) >= 0) return s === 'supermarket' ? 'grocery' : s === 'grocery' ? 'grocery' : s;
    if (t.leisure === 'golf_course' || t.leisure === 'miniature_golf') return 'golf course';
    if (PLX) { var c = PLX.classify(t); if (c && c.label) return String(c.label).toLowerCase(); }
    return cat.label;
  }
  function parseOverpassCat(json, cat) {
    var out = [];
    ((json && json.elements) || []).forEach(function (e) {
      var t = e.tags; if (!t) return;
      var lat = e.type === 'node' ? e.lat : e.center && e.center.lat, lon = e.type === 'node' ? e.lon : e.center && e.center.lon;
      if (!inFL(lat, lon)) return;
      if (NOT_PLACE[t.amenity]) return;
      var kind = typeLabel(t, cat), name = t.name || t.brand || t.operator || '';
      if (!name) { if (!cat.unnamed) return; name = kind === 'ATM' ? 'ATM' : kind.charAt(0).toUpperCase() + kind.slice(1); }
      var street = streetOf(t['addr:housenumber'], t['addr:street']);
      var o = mk('osm', name, lat, lon, [street, t['addr:city']].filter(Boolean).join(', '), t, cat.emoji, t['addr:city']);
      o.tags = t; o.kind = kind; o.cat = cat.key; out.push(o);
    });
    return out;
  }
  // Merge/dedupe/rank for categories. extra name-matches (Photon) must contain the keyword in their name.
  function rankCat(lists, ref, maxKm) { var r = mergeRank(lists, ref, '', maxKm); return r; }
  // io = { overpass(query) -> Promise<json>, json(url) -> Promise<json> (Photon name matches, optional) }. Never rejects.
  function searchCategory(q, ref, io) {
    var cat = categoryOf(q); if (!cat) return Promise.resolve({ items: [], errors: 0, ok: false, cat: null });
    var errors = 0, okSrc = 0;
    function guard(p, parser) { return Promise.resolve().then(function () { return p; }).then(function (j) { if (j == null) return []; okSrc++; return parser(j); }).catch(function () { errors++; return []; }); }
    var nameJob = io.json ? guard(io.json(photonNearUrl(cat.word, ref, 10)), function (j) { return parsePhotonNear(j).filter(function (x) { return norm(x.primary).indexOf(norm(cat.word).split(' ')[0]) >= 0; }).map(function (x) { x.kind = typeLabel(x.tags || {}, cat); return x; }); }) : Promise.resolve([]);
    var first = guard(io.overpass(categoryQuery(cat, ref, CAT_R1)), function (j) { return parseOverpassCat(j, cat); });
    return Promise.all([first, nameJob]).then(function (r) {
      var m = rankCat(r, ref, CAT_R2 / 1000 + 1);
      if (m.filter(function (x) { return x.distKm <= CAT_R1 / 1000; }).length >= CAT_MIN) return m;
      return guard(io.overpass(categoryQuery(cat, ref, CAT_R2)), function (j) { return parseOverpassCat(j, cat); }).then(function (wide) { return rankCat([r[0], wide, r[1]], ref, CAT_R2 / 1000 + 1); });
    }).then(function (items) { return { items: items, errors: errors, ok: okSrc > 0, cat: cat }; });
  }

  // ----- recents (array of {label, lat, lon, icon}; newest first; max 5) -----
  function cleanRecent(r) {
    if (!r || typeof r !== 'object') return null;
    var lat = Number(r.lat), lon = Number(r.lon), label = String(r.label || '').trim().slice(0, 140);
    if (!label || !inFL(lat, lon)) return null;
    return { label: label, lat: lat, lon: lon, icon: typeof r.icon === 'string' ? r.icon.slice(0, 4) : '📍' };
  }
  function normalizeRecents(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) { var c = cleanRecent(r); if (c && !out.some(function (o) { return o.label.toLowerCase() === c.label.toLowerCase(); })) out.push(c); });
    return out.slice(0, MAX_RECENTS);
  }
  function addRecent(list, item) {
    var c = cleanRecent(item); if (!c) return normalizeRecents(list);
    var rest = normalizeRecents(list).filter(function (o) { return o.label.toLowerCase() !== c.label.toLowerCase() && !(Math.abs(o.lat - c.lat) < 1e-5 && Math.abs(o.lon - c.lon) < 1e-5); });
    return [c].concat(rest).slice(0, MAX_RECENTS);
  }
  function clearRecents() { return []; }

  // Rows shown in the dropdown. state: 'idle' | 'loading' | 'results' | 'empty' | 'error'
  function buildRows(opts) {
    var rows = [];
    if (opts.state === 'idle') {
      if (opts.withMyLocation) rows.push({ type: 'myloc', primary: 'My location', secondary: 'Use your current position', icon: '📡' });
      (opts.recents || []).forEach(function (r) { rows.push({ type: 'recent', primary: r.label, secondary: 'Recent', icon: r.icon || '🕘', item: r }); });
      if ((opts.recents || []).length) rows.push({ type: 'clear', primary: 'Clear recent searches', secondary: '', icon: '🗑️' });
    } else if (opts.state === 'loading') rows.push({ type: 'msg', primary: 'Searching…', kind: 'loading' });
    else if (opts.state === 'empty') rows.push({ type: 'msg', primary: 'No places found. Try fewer words, or tap the map.', kind: 'empty' });
    else if (opts.state === 'error') rows.push({ type: 'msg', primary: 'Suggestions are unavailable right now. Press Find, or tap the map to choose the point.', kind: 'error' });
    else if (opts.state === 'results') {
      if (opts.withMyLocation && /^(my|cur|loc|here|near)/i.test(String(opts.query || '').trim())) rows.push({ type: 'myloc', primary: 'My location', secondary: 'Use your current position', icon: '📡' });
      (opts.items || []).forEach(function (it) { rows.push({ type: 'item', primary: it.primary + (it.kind ? ' · ' + it.kind : '') + (it.distLabel ? ' · ' + it.distLabel : ''), secondary: it.secondary, icon: it.icon, item: it }); });
    }
    return rows;
  }
  function selectable(row) { return row.type !== 'msg'; }
  // keyboard: next active index among selectable rows (wraps; -1 = none)
  function moveActive(rows, cur, dir) {
    var idx = []; rows.forEach(function (r, i) { if (selectable(r)) idx.push(i); });
    if (!idx.length) return -1;
    var pos = idx.indexOf(cur);
    if (pos < 0) return dir > 0 ? idx[0] : idx[idx.length - 1];
    return idx[(pos + dir + idx.length) % idx.length];
  }
  return { MIN_CHARS: MIN_CHARS, DEBOUNCE_MS: DEBOUNCE_MS, LIMIT: LIMIT, MAX_RECENTS: MAX_RECENTS, shouldSearch: shouldSearch, suggestUrl: suggestUrl, parse: parse,
    isNameQuery: isNameQuery, coreName: coreName, fmtMi: fmtMi, bboxAround: bboxAround, photonNearUrl: photonNearUrl, nominatimNearUrl: nominatimNearUrl, overpassNameQuery: overpassNameQuery,
    parseNominatimNear: parseNominatimNear, parseOverpassNear: parseOverpassNear, parsePhotonNear: parsePhotonNear, mergeRank: mergeRank, searchNearby: searchNearby, NEAR_KM: NEAR_KM,
    categoryOf: categoryOf, isCategoryQuery: isCategoryQuery, categoryQuery: categoryQuery, parseOverpassCat: parseOverpassCat, searchCategory: searchCategory, KEYWORDS: KEYWORDS,
    icon: icon, addRecent: addRecent, normalizeRecents: normalizeRecents, clearRecents: clearRecents, buildRows: buildRows, moveActive: moveActive, selectable: selectable, inFL: inFL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AC;
