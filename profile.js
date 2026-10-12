/* ===== CartRoute profile logic (pure JS, no DOM): schema, validation, migration, multi-cart, import/export, storage ===== */
var PR = (function () {
  'use strict';
  var VERSION = 1;
  // contiguous US, AK, HI (same boxes as states.js / geo.js)
  var US_BOXES = [[24.3, 49.5, -125.2, -66.8], [51.0, 71.6, -180, -129.5], [18.7, 22.5, -160.6, -154.6]];
  function inUS(lat, lon) { return isFinite(lat) && isFinite(lon) && US_BOXES.some(function (b) { return lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3]; }); }
  var VT = typeof VEH !== 'undefined' ? VEH : require('./vehicles.js');
  var EU = typeof EUR !== 'undefined' ? EUR : require('./europe.js');
  // supported region = US + Europe (EU-27, UK, Norway, Switzerland)
  function inRegion(lat, lon) { return inUS(lat, lon) || EU.inEurope(lat, lon); }
  var STORAGE_KEY = 'cartroute.profile.v1';
  var EQUIP = ['headlights', 'brakeLights', 'turnSignals', 'seatBelts', 'mirrors', 'windshield', 'reflectors', 'parkingBrake', 'hasVin', 'registered'];
  var HOMES = {
    palm: { key: 'palm', label: 'Palm Bay, FL', lat: 27.9856, lon: -80.6262 },
    cocoa: { key: 'cocoa', label: 'Cocoa Beach, FL', lat: 28.3320, lon: -80.6080 }
  };
  var idCounter = 0;
  function genId() { return 'c' + Date.now().toString(36) + (idCounter++).toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function defaultCart(over) {
    var c = { id: genId(), nickname: '', make: '', type: 'golf', speed: 19,
      headlights: false, brakeLights: false, turnSignals: false, seatBelts: false, mirrors: false, windshield: false, reflectors: false,
      parkingBrake: false, hasVin: false, registered: false,
      heightM: VT.DIM_DEFAULTS.heightM, weightT: VT.DIM_DEFAULTS.weightT, lengthM: VT.DIM_DEFAULTS.lengthM, rangeKm: VT.EV_DEFAULTS.rangeKm, socPct: VT.EV_DEFAULTS.socPct };
    for (var k in over) c[k] = over[k];
    return c;
  }
  function defaultPrefs() { return { night: 'day', designatedLimit: 25, strict: false, allowCrossing: true, basemap: 'auto', tileProvider: 'esri', units: 'auto' }; }
  function defaultProfile() {
    var c = defaultCart();
    return { version: VERSION, name: '', carts: [c], activeCartId: c.id, prefs: defaultPrefs(), home: null, work: null, recents: [], setupDone: false, createdAt: new Date().toISOString() };
  }

  function str(v, max) { return (typeof v === 'string' ? v : '').trim().slice(0, max || 80); }
  function normCart(c) {
    c = c && typeof c === 'object' ? c : {};
    var d = defaultCart({ id: typeof c.id === 'string' && c.id ? c.id : genId() });
    var out = { id: d.id, nickname: str(c.nickname), make: str(c.make, 80), type: VT.isKnown(c.type) ? c.type : 'golf' };
    var sp = Number(c.speed);
    out.speed = isFinite(sp) && sp > 0 ? Math.min(Math.round(sp * 10) / 10, 99) : d.speed;
    function num(v, d, lo, hi) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : d; }
    EQUIP.forEach(function (k) { out[k] = c[k] === true || c[k] === 'true' || c[k] === 1; });
    out.heightM = num(c.heightM, d.heightM, 0.5, 6); out.weightT = num(c.weightT, d.weightT, 0.1, 100); out.lengthM = num(c.lengthM, d.lengthM, 0.5, 40);
    out.rangeKm = num(c.rangeKm, d.rangeKm, 5, 1500); out.socPct = num(c.socPct, d.socPct, 1, 100);
    return out;
  }
  function normHome(h) {
    if (!h || typeof h !== 'object') return null;
    var lat = Number(h.lat), lon = Number(h.lon);
    if (!inRegion(lat, lon)) return null;
    return { key: h.key === 'palm' || h.key === 'cocoa' ? h.key : 'custom', label: str(h.label, 120) || 'Home', lat: lat, lon: lon };
  }
  function normWork(h) {
    if (!h || typeof h !== 'object') return null;
    var lat = Number(h.lat), lon = Number(h.lon);
    if (!inRegion(lat, lon)) return null;
    return { key: 'custom', label: str(h.label, 120) || 'Work', lat: lat, lon: lon };
  }
  function normRecents(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var lat = Number(r.lat), lon = Number(r.lon), label = str(r.label, 140);
      if (!label || !inRegion(lat, lon)) return;
      if (out.some(function (o) { return o.label.toLowerCase() === label.toLowerCase(); })) return;
      out.push({ label: label, lat: lat, lon: lon, icon: typeof r.icon === 'string' ? r.icon.slice(0, 4) : '📍' });
    });
    return out.slice(0, 5);
  }
  // Fill defaults, drop junk, guarantee >=1 cart and a valid active cart.
  function normalize(p) {
    p = p && typeof p === 'object' ? p : {};
    var carts = Array.isArray(p.carts) ? p.carts.map(normCart) : [];
    var seen = {};
    carts = carts.filter(function (c) { if (seen[c.id]) return false; seen[c.id] = 1; return true; });
    if (!carts.length) carts = [normCart({})];
    var pr = p.prefs && typeof p.prefs === 'object' ? p.prefs : {};
    var lim = Number(pr.designatedLimit);
    return {
      version: VERSION, name: str(p.name, 60), carts: carts,
      activeCartId: carts.some(function (c) { return c.id === p.activeCartId; }) ? p.activeCartId : carts[0].id,
      prefs: { night: pr.night === 'night' ? 'night' : 'day', designatedLimit: [25, 30, 35].indexOf(lim) >= 0 ? lim : 25,
        strict: pr.strict === true, allowCrossing: pr.allowCrossing !== false,
        basemap: ['auto', 'street', 'satellite', 'topo', 'dark'].indexOf(pr.basemap) >= 0 ? pr.basemap : 'auto',
        tileProvider: ['esri', 'carto', 'osm'].indexOf(pr.tileProvider) >= 0 ? pr.tileProvider : 'esri',
        units: ['auto', 'kmh', 'mph'].indexOf(pr.units) >= 0 ? pr.units : 'auto' },
      home: normHome(p.home), work: normWork(p.work), recents: normRecents(p.recents), setupDone: p.setupDone === true,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString()
    };
  }
  // Strict validation of user-entered values (normalize is the lenient one).
  function validateCart(c) {
    var e = [];
    var sp = Number(c && c.speed);
    var mx = c && VT.isVehicle(c.type) ? VT.maxMph(c.type) : 60;
    if (!(sp > 0) || sp > mx) e.push(mx === 60 ? 'Top speed must be between 1 and 60 mph.' : 'Top speed must be between 1 and ' + Math.round(mx) + ' mph (' + Math.round(mx * 1.609344) + ' km/h).');
    if (!c || !VT.isKnown(c.type)) e.push('Vehicle type must be one of: ' + VT.ORDER.join(', ') + '.');
    if (c && VT.isKnown(c.type) && VT.get(c.type).dims) { var h = Number(c.heightM), w = Number(c.weightT), l = Number(c.lengthM); if (!(h >= 0.5 && h <= 6)) e.push('Height must be between 0.5 and 6 m (1.6 to 19.7 ft).'); if (!(w >= 0.1 && w <= 100)) e.push('Weight must be between 0.1 and 100 tonnes.'); if (!(l >= 0.5 && l <= 40)) e.push('Length must be between 0.5 and 40 m (1.6 to 131 ft).'); }
    if (c && VT.isKnown(c.type) && VT.get(c.type).ev) { var rk = Number(c.rangeKm), sc = Number(c.socPct); if (!(rk >= 5 && rk <= 1500)) e.push('Battery range must be between 5 and 1500 km (3 to 932 mi).'); if (!(sc >= 1 && sc <= 100)) e.push('Charge level must be between 1 and 100%.'); }
    return e;
  }
  function validate(p) {
    var e = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['Not a profile object.'] };
    if (!Array.isArray(p.carts) || !p.carts.length) e.push('Profile has no carts.');
    else p.carts.forEach(function (c, i) { validateCart(c).forEach(function (m) { e.push('Cart ' + (i + 1) + ': ' + m); }); });
    if (p.prefs && [25, 30, 35].indexOf(Number(p.prefs.designatedLimit)) < 0) e.push('Speed cutoff must be 25, 30 or 35.');
    if (p.home != null && !normHome(p.home)) e.push('Home location is outside the US or invalid.');
    if (p.work != null && !normWork(p.work)) e.push('Work location is outside the US or invalid.');
    return { ok: e.length === 0, errors: e };
  }
  // Migration: returns {ok, profile} or {ok:false, error}.
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a profile.' };
    var v = raw.version == null ? 0 : Number(raw.version);
    if (!isFinite(v) || v < 0) return { ok: false, error: 'Bad version.' };
    if (v > VERSION) return { ok: false, error: 'This profile is from a newer version of CartRoute (v' + v + ').' };
    var p = raw;
    if (v === 0) { // v0 (unversioned): single cart fields at top level, "cart" object, or prefs at top level
      var cart = raw.cart || raw.carts && raw.carts[0] || raw;
      p = { name: raw.name || raw.userName, carts: raw.carts || [cart], activeCartId: raw.activeCartId,
        prefs: raw.prefs || { night: raw.night, designatedLimit: raw.designatedLimit, strict: raw.strict, allowCrossing: raw.allowCrossing },
        home: raw.home, work: raw.work, setupDone: raw.setupDone !== false, createdAt: raw.createdAt };
      if (!Array.isArray(raw.carts) && p.carts[0] && p.carts[0].name && !p.carts[0].nickname) p.carts[0] = Object.assign({}, p.carts[0], { nickname: p.carts[0].name });
    }
    return { ok: true, profile: normalize(p), migrated: v < VERSION };
  }

  // ----- carts -----
  function activeCart(p) { return p.carts.filter(function (c) { return c.id === p.activeCartId; })[0] || p.carts[0]; }
  function addCart(p, over) { var c = normCart(Object.assign(defaultCart(), over || {}, { id: genId() })); p.carts.push(c); return c; }
  function updateCart(p, id, patch) {
    for (var i = 0; i < p.carts.length; i++) if (p.carts[i].id === id) {
      p.carts[i] = normCart(Object.assign({}, p.carts[i], patch, { id: id })); return p.carts[i];
    }
    return null;
  }
  function deleteCart(p, id) {
    if (p.carts.length <= 1) return false; // always keep one cart
    var n = p.carts.filter(function (c) { return c.id !== id; });
    if (n.length === p.carts.length) return false;
    p.carts = n; if (p.activeCartId === id) p.activeCartId = n[0].id; return true;
  }
  function setActive(p, id) { if (p.carts.some(function (c) { return c.id === id; })) { p.activeCartId = id; return true; } return false; }
  function cartLabel(c) { var v = VT.get(c.type); return c.nickname || c.make || (c.type === 'lsv' ? 'My LSV' : !v || c.type === 'golf' ? 'My golf cart' : 'My ' + v.label.replace(/ \(.*$/, '').toLowerCase()); }

  // ----- legal status from a profile (GC injected) -----
  function statusFor(GC, p, cartId, state, region) {
    var c = cartId ? p.carts.filter(function (x) { return x.id === cartId; })[0] : activeCart(p);
    var input = Object.assign({}, c, { night: p.prefs.night });
    return GC.cartStatus(input, { planning: !p.prefs.strict, designatedLimit: p.prefs.designatedLimit, allowCrossing: p.prefs.allowCrossing, state: state || null,
      region: region && region.country ? 'EU' : 'US', country: region && region.country || null, unit: VT.unitFor(p.prefs.units, region && region.country || null) });
  }

  // ----- import / export -----
  function serialize(p) { return JSON.stringify({ app: 'cartroute', version: VERSION, exportedAt: new Date().toISOString(), profile: p }, null, 2); }
  function parseImport(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'That is not valid JSON.' }; }
    if (o && o.app === 'cartroute' && o.profile) { o = Object.assign({}, o.profile, { version: o.profile.version != null ? o.profile.version : o.version }); }
    else if (!o || typeof o !== 'object' || (!o.carts && !o.cart && o.speed == null)) return { ok: false, error: 'This does not look like a CartRoute profile.' };
    var m = migrate(o); if (!m.ok) return m;
    var v = validate(m.profile); // normalized profile; also strict-check the raw carts for obviously bad speeds
    var raw = Array.isArray(o.carts) ? o.carts : [];
    for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].speed != null && validateCart(Object.assign({ type: 'golf' }, raw[i])).length)
      return { ok: false, error: 'Cart ' + (i + 1) + ' has an invalid top speed.' };
    if (o.prefs && o.prefs.designatedLimit != null && [25, 30, 35].indexOf(Number(o.prefs.designatedLimit)) < 0) return { ok: false, error: 'Speed cutoff must be 25, 30 or 35.' };
    if (!v.ok) return { ok: false, error: v.errors.join(' ') };
    m.profile.setupDone = true;
    return { ok: true, profile: m.profile };
  }

  // ----- storage with in-memory fallback -----
  function createStore(storage) {
    var mem = null, persistent = false;
    if (storage) { try { var k = STORAGE_KEY + '.probe'; storage.setItem(k, '1'); storage.removeItem(k); persistent = true; } catch (e) { persistent = false; } }
    var s = {
      get persistent() { return persistent; },
      load: function () {
        var txt = null;
        if (persistent) { try { txt = storage.getItem(STORAGE_KEY); } catch (e) { persistent = false; } }
        if (txt == null) return mem ? normalize(mem) : null;
        try { var m = migrate(JSON.parse(txt)); if (!m.ok) return null; if (m.migrated) s.save(m.profile); return m.profile; } catch (e) { return null; }
      },
      save: function (p) {
        mem = JSON.parse(JSON.stringify(p));
        if (persistent) { try { storage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { persistent = false; } }
        return persistent;
      },
      clear: function () { mem = null; if (persistent) { try { storage.removeItem(STORAGE_KEY); } catch (e) { persistent = false; } } }
    };
    return s;
  }

  return { VERSION: VERSION, STORAGE_KEY: STORAGE_KEY, EQUIP: EQUIP, HOMES: HOMES, defaultCart: defaultCart, defaultProfile: defaultProfile,
    normalize: normalize, validate: validate, validateCart: validateCart, migrate: migrate, activeCart: activeCart, addCart: addCart,
    updateCart: updateCart, deleteCart: deleteCart, setActive: setActive, cartLabel: cartLabel, statusFor: statusFor,
    serialize: serialize, parseImport: parseImport, createStore: createStore };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PR;
