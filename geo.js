/* ===== CartRoute geolocation helpers (pure JS, no DOM) ===== */
var GEO = (function () {
  'use strict';
  // US coverage check: contiguous US, Alaska, Hawaii (rough boxes; they include some water and slivers of Canada/Mexico). Same boxes as states.js.
  var US_BOXES = [[24.3, 49.5, -125.2, -66.8], [51.0, 71.6, -180, -129.5], [18.7, 22.5, -160.6, -154.6]];
  function inUS(lat, lon) { return isFinite(lat) && isFinite(lon) && US_BOXES.some(function (b) { return lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3]; }); }
  var EU = typeof EUR !== 'undefined' ? EUR : (typeof require !== 'undefined' ? require('./europe.js') : null);
  // Supported region = US + Europe (EU-27, UK, Norway, Switzerland).
  function inEurope(lat, lon) { return !!(EU && isFinite(lat) && isFinite(lon) && EU.inEurope(lat, lon)); }
  function supported(lat, lon) { return inUS(lat, lon) || inEurope(lat, lon); }
  var OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 };
  // Classify a PositionError-like object ({code}) or a string kind into a kind.
  function kindOf(err) {
    if (typeof err === 'string') return err;
    var c = err && err.code;
    return c === 1 ? 'denied' : c === 2 ? 'unavailable' : c === 3 ? 'timeout' : 'unavailable';
  }
  function message(kind, protocol) {
    var file = protocol === 'file:';
    switch (kind) {
      case 'denied': return 'Location permission is blocked. To turn it back on, open your browser\'s site settings for this page (in Safari: Settings > Privacy & Security > Location Services, then Safari Websites; in Chrome: tap the lock or tune icon in the address bar > Permissions > Location) and choose Allow, then reload and tap the button again.' + (file ? ' Some browsers never allow location on a page opened from a file; if it stays blocked, use an address or tap the map instead.' : '') + ' You can always type an address or tap the map instead.';
      case 'unavailable': return 'Your device could not work out its position (no GPS or network location right now). Try again outdoors or with Wi-Fi on, or type an address or tap the map instead.';
      case 'timeout': return 'Finding your location took too long. Try again (outdoors helps), or type an address or tap the map instead.';
      case 'unsupported': return 'This browser does not support location. Type an address or tap the map instead.';
      case 'insecure': return 'Browsers only allow location on secure pages (https:// or localhost), and this page is not one. Type an address or tap the map instead, or open the app from an https:// address.';
      default: return 'Could not get your location. Type an address or tap the map instead.';
    }
  }
  function outsideMessage(lat, lon) {
    return 'Your location (' + lat.toFixed(3) + ', ' + lon.toFixed(3) + ') is outside the supported area. CartRoute covers the United States and Europe (the EU, UK, Norway and Switzerland), so the map is showing your home area instead. Type an address there or tap the map to plan a route.';
  }
  function imprecise(acc) { return acc > 1500 ? 'Your location is only accurate to about ' + Math.round(acc) + ' m, so the start point may be off. Zoom in and adjust it by dragging the marker.' : ''; }
  // Check environment; returns null if OK or an error kind.
  function envProblem(nav, win) {
    if (!nav || !nav.geolocation) return 'unsupported';
    if (win && win.isSecureContext === false) return 'insecure';
    return null;
  }
  // ---- Basemap tiles ----
  // Esri is the default for every style: its tile servers return real tiles to Referer-less requests (file:// pages).
  // CARTO answers such requests with "API KEY REQUIRED" watermark tiles (HTTP 200), and OSM with a 403 "Access blocked" image,
  // so both are manual choices only. Watermark tiles are valid images, so the tileerror fallback cannot detect them.
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var PROVIDERS = {
    esriStreet: { name: 'Esri World Street Map', url: ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles © Esri — Source: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community' },
    esriImagery: { name: 'Esri World Imagery', url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    esriTopo: { name: 'Esri World Topo', url: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles © Esri — Esri, HERE, Garmin, USGS, NGA, NPS, © OpenStreetMap contributors, and the GIS User Community' },
    // Dark Gray Canvas has no tiles above zoom 16 (Esri returns a "Map data not yet available" tile), so Leaflet upscales from 16.
    esriDark: { name: 'Esri Dark Gray Canvas', url: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, maxNativeZoom: 16,
      overlay: ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community' },
    carto: { name: 'CARTO Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO' },
    cartoDark: { name: 'CARTO Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO' },
    osm: { name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc', maxZoom: 19, attribution: '© OpenStreetMap contributors' }
  };
  // Automatic fallback chains (real errors only). Esri chains never fall into CARTO/OSM.
  var ESRI_CHAINS = {
    street: ['esriStreet', 'esriTopo', 'esriImagery'],
    satellite: ['esriImagery', 'esriStreet', 'esriTopo'],
    topo: ['esriTopo', 'esriStreet', 'esriImagery'],
    dark: ['esriDark', 'esriStreet', 'esriTopo']
  };
  var PROVIDER_CHOICES = ['esri', 'carto', 'osm'];
  function styleOf(choice, prefersDark) { return choice === 'auto' || !ESRI_CHAINS[choice] ? (prefersDark ? 'dark' : 'street') : choice; }
  function wrap(keys) { return keys.map(function (k) { var p = PROVIDERS[k], o = { key: k }; for (var f in p) o[f] = p[f]; return o; }); }
  // choice: 'auto' | 'street' | 'satellite' | 'topo' | 'dark'; provider: 'esri' (default) | 'carto' | 'osm' (manual picks)
  function tileChain(choice, prefersDark, provider) {
    var s = styleOf(choice, prefersDark), esri = ESRI_CHAINS[s].slice();
    if (provider === 'carto') return wrap([s === 'dark' ? 'cartoDark' : s === 'satellite' ? 'esriImagery' : 'carto'].concat(esri.filter(function (k) { return k !== 'esriImagery' || s === 'satellite'; })).filter(function (k, i, a) { return a.indexOf(k) === i; }));
    if (provider === 'osm') return wrap(['osm'].concat(esri));
    return wrap(esri);
  }
  // Order used by the "Switch map" button: Esri variants first, then CARTO, then OSM, then back around.
  function cycleList(choice, prefersDark) {
    var s = styleOf(choice, prefersDark);
    return wrap(ESRI_CHAINS[s].concat([s === 'dark' ? 'cartoDark' : 'carto', 'osm']));
  }
  // Map/Satellite quick switch: 'satellite' selects imagery; 'map' leaves satellite (keeps street/topo/dark/auto otherwise).
  function basemapFor(want, current) {
    if (want === 'satellite') return 'satellite';
    return !current || current === 'satellite' || !ESRI_CHAINS[current] && current !== 'auto' ? 'auto' : current;
  }
  // Counts tile errors; reports when to switch provider (threshold errors with no successful loads).
  function createTileGuard(threshold) {
    var errors = 0, loads = 0;
    return { error: function () { errors++; return loads === 0 && errors >= threshold; }, load: function () { loads++; }, reset: function () { errors = 0; loads = 0; }, counts: function () { return { errors: errors, loads: loads }; } };
  }
  // ---- Address/place lookup helpers (pure; used by the app's geocoder) ----
  // "local publix grocery store" -> ["publix grocery store", "publix"]: drop filler words, then generic trailing nouns, so a name search can match.
  function queryVariants(q) {
    q = String(q || '').replace(/\s+/g, ' ').trim();
    var out = q ? [q] : [];
    var s = q.replace(/^(?:the|a|my|local|nearby|nearest|closest|near me|a local|the nearest|the closest)\s+/i, '');
    while (s !== q && /^(?:the|a|my|local|nearby|nearest|closest)\s+/i.test(s)) s = s.replace(/^(?:the|a|my|local|nearby|nearest|closest)\s+/i, '');
    s = s.replace(/\s+near(?:by| me)$/i, '');
    if (s && out.indexOf(s) < 0) out.push(s);
    var t = s.replace(/\s+(?:grocery\s+store|grocery|supermarket|super\s+market|store|market|shop|location)$/i, '').trim();
    if (t && out.indexOf(t) < 0) out.push(t);
    return out;
  }
  function distKm(b, lat, lon) { var dy = (lat - b.lat) * 111.2, dx = (lon - b.lon) * 111.2 * Math.cos(b.lat * Math.PI / 180); return Math.sqrt(dx * dx + dy * dy); }
  // A place-name search ("publix", no number, no comma) should be near the bias point, not the first match anywhere in the US.
  function isPlaceName(q) { q = String(q || ''); return !houseNumber(q) && q.indexOf(',') < 0; }
  // Order to try: a query with filler ("local publix grocery store") tries the cleanest core name first.
  function orderedVariants(q) {
    var v = queryVariants(q);
    return v.length > 1 && /^(?:the|a|my|local|nearby|nearest|closest)\s/i.test(v[0]) ? v.slice(1).reverse().concat(v[0]) : v;
  }
  function houseNumber(q) { var m = String(q || '').trim().match(/^(\d+[a-z]?)\b/i); return m ? m[1].toLowerCase() : ''; }
  // Pick the first usable Photon feature: inside the US, and, when the query starts with a house number, a result with that same number
  // (otherwise Photon returns some other building on the street, which silently starts the route in the wrong place). Returns {lat,lon} or null.
  function pickPhoton(features, q, bias, maxKm) {
    var hn = houseNumber(q), best = null;
    (features || []).some(function (x) {
      var c = x.geometry && x.geometry.coordinates, p = x.properties || {};
      if (!c || !supported(c[1], c[0]) || (p.countrycode && p.countrycode !== 'US' && !(EU && EU.get(p.countrycode)))) return false;
      if (bias && maxKm && distKm(bias, c[1], c[0]) > maxKm) return false;
      if (hn && String(p.housenumber || '').toLowerCase() !== hn) return false;
      best = { lat: c[1], lon: c[0] }; return true;
    });
    return best;
  }
  return { distKm: distKm, isPlaceName: isPlaceName, orderedVariants: orderedVariants, queryVariants: queryVariants, houseNumber: houseNumber, pickPhoton: pickPhoton, PROVIDERS: PROVIDERS, PROVIDER_CHOICES: PROVIDER_CHOICES, cycleList: cycleList, basemapFor: basemapFor, tileChain: tileChain, createTileGuard: createTileGuard, US_BOXES: US_BOXES, inUS: inUS, inEurope: inEurope, supported: supported, OPTIONS: OPTIONS, kindOf: kindOf, message: message, outsideMessage: outsideMessage, imprecise: imprecise, envProblem: envProblem };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GEO;
