/* ===== CartRoute vehicle profiles (pure JS, no DOM): one data table -> allowed road classes + speed rules, shared by the US and Europe ===== */
var VEH = (function () {
  'use strict';
  var KMH = 1.609344;
  function mphToKmh(m) { return m * KMH; }
  function kmhToMph(k) { return k / KMH; }
  // road classes
  var MOTORWAY = ['motorway', 'motorway_link'], TRUNK = ['trunk', 'trunk_link'];
  var STREETS = ['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'];
  // Vehicle table. Types golf and lsv keep their existing Florida logic in lib.js (rules.cls 'golf' / 'lsv'); they are listed only so the UI has one list.
  //  roads:    OSM highway classes the vehicle may drive (motorways/trunks only where listed)
  //  paths:    may use cycleway / designated paths (bike lane/path allowance)
  //  roadMax:  highest posted or assumed road speed in km/h it may use, per region (null = no limit)
  //  maxMph:   largest top speed (mph) that still counts as this vehicle; defMph: suggested top speed (mph)
  var TYPES = {
    golf: { key: 'golf', label: 'Golf cart', emoji: '🛺', legacy: true, maxMph: 60, defMph: 19 },
    lsv: { key: 'lsv', label: 'Street-legal LSV (US)', emoji: '🚙', legacy: true, maxMph: 60, defMph: 25 },
    moped: { key: 'moped', label: 'Moped / scooter (50cc, up to ~30 mph)', emoji: '🛵', roads: STREETS, paths: false, roadMax: { US: 73, EU: 80 }, maxMph: 31.1, defMph: 28,
      note: 'Mopeds (50cc or 45 km/h, EU AM licence class) stay off motorways, freeways and expressways. Roads faster than about 45 mph (about 72 km/h; 80 km/h in Europe) are avoided.' },
    motorcycle: { key: 'motorcycle', label: 'Motorcycle (full road legal)', emoji: '🏍️', roads: STREETS.concat(TRUNK, MOTORWAY), paths: false, roadMax: { US: null, EU: null }, maxMph: 99, defMph: 55,
      note: 'Motorcycles may use motorways and freeways, and every public road. Posted road speed is not limited here; obey the signs.' },
    escooter: { key: 'escooter', label: 'Electric scooter / e-bike', emoji: '🛴', roads: STREETS, paths: true, roadMax: { US: 57, EU: 50 }, maxMph: 28, defMph: 15,
      note: 'E-scooters and e-bikes may use cycleways and designated paths, and quiet streets up to about 35 mph (50 km/h in Europe). Never motorways, freeways or expressways. Local bans on scooters or sidewalks vary.' },
    l6e: { key: 'l6e', label: 'Light quadricycle (L6e, 45 km/h)', emoji: '🚗', roads: STREETS, paths: false, roadMax: { US: 80, EU: 80 }, maxMph: 28.1, defMph: 28,
      note: 'L6e light quadricycles (45 km/h, AM licence class) avoid motorways and roads faster than 80 km/h.' }
  };
  // ---- Added vehicle types. mode: car | truck | atv | bike | foot (drives classifyVehicle in lib.js) ----
  var ALLROADS = STREETS.concat(TRUNK, MOTORWAY);
  TYPES.car = { key: 'car', label: 'Car / sedan', emoji: '🚘', roads: ALLROADS, paths: false, roadMax: { US: null, EU: null }, maxMph: 99, defMph: 65, mode: 'car',
    note: 'Cars may use every public road including motorways and freeways. Footways, sidewalks, cycleways, tracks and pedestrian streets are avoided.' };
  TYPES.ev = { key: 'ev', label: 'Electric car (EV)', emoji: '🔌', roads: ALLROADS, paths: false, roadMax: { US: null, EU: null }, maxMph: 99, defMph: 65, mode: 'car', ev: true,
    note: 'Same road rules as a car. Enter your battery range and charge level: routes longer than your usable range get a warning and charging stops from OpenStreetMap charging stations.' };
  TYPES.truck = { key: 'truck', label: 'Truck / RV / trailer', emoji: '🚚', roads: STREETS.filter(function (h) { return h !== 'living_street'; }).concat(TRUNK, MOTORWAY), paths: false, roadMax: { US: null, EU: null }, maxMph: 75, defMph: 55, mode: 'truck', dims: true,
    note: 'Roads with a mapped height, weight or length limit below your vehicle, or hgv=no, are avoided, and main roads are preferred over residential streets. Bridge and tunnel clearances, hazmat and turn radius are not checked.' };
  TYPES.atv = { key: 'atv', label: 'ATV / UTV / side-by-side', emoji: '🛻', roads: ['tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'], paths: false, tracks: true, roadMax: { US: 73, EU: 60 }, maxMph: 60, defMph: 25, mode: 'atv',
    note: 'Conservative: only quiet roads (tertiary and below, up to about 45 mph) plus tracks and trails tagged for motor vehicles or ATVs. Never motorways, highways or main roads. Road use of ATVs/UTVs depends on state and local law: check local law.' };
  TYPES.bicycle = { key: 'bicycle', label: 'Bicycle', emoji: '🚲', roads: STREETS, paths: true, roadMax: { US: 80, EU: 80 }, maxMph: 30, defMph: 12, mode: 'bike',
    note: 'Bike lanes, cycleways and bike-friendly paths are preferred. Streets are used up to about 50 mph posted. Never motorways, freeways or expressways.' };
  TYPES.foot = { key: 'foot', label: 'Pedestrian (walking)', emoji: '🚶', roads: STREETS.concat(TRUNK), paths: true, roadMax: { US: null, EU: null }, maxMph: 8, defMph: 3, mode: 'foot',
    note: 'Footways, sidewalks, pedestrian streets, crossings and steps are used. Streets without a mapped sidewalk are assumed walkable, except major roads. Never motorways or expressways.' };
  var ORDER = ['golf', 'lsv', 'car', 'ev', 'truck', 'moped', 'motorcycle', 'atv', 'escooter', 'bicycle', 'foot', 'l6e'];
  // vehicle picker groups (label, keys)
  var GROUPS = [['Cars and trucks', ['car', 'ev', 'truck']], ['Golf carts and low-speed', ['golf', 'lsv', 'l6e']], ['Two wheels and scooters', ['moped', 'motorcycle', 'escooter', 'bicycle']], ['Off-road and on foot', ['atv', 'foot']]];
  // ---- dimension / range helpers. Stored metric: heightM, lengthM (metres), weightT (tonnes), rangeKm (km). Shown in feet/short tons/miles when the unit is mph. ----
  var DIM_DEFAULTS = { heightM: 3.7, weightT: 11.8, lengthM: 9 }, EV_DEFAULTS = { rangeKm: 400, socPct: 90 };
  var EV_SAFETY = 0.85, EV_CHARGE_TO = 0.8; // real-world reserve factor; chargers suggested to refill to 80%
  function lenToDisplay(m, unit) { m = Number(m); return unit === 'kmh' ? Math.round(m * 100) / 100 : Math.round(m / 0.3048 * 10) / 10; }
  function lenFromDisplay(v, unit) { v = Number(v); return unit === 'kmh' ? v : v * 0.3048; }
  function weightToDisplay(t, unit) { t = Number(t); return unit === 'kmh' ? Math.round(t * 100) / 100 : Math.round(t / 0.907185 * 10) / 10; }
  function weightFromDisplay(v, unit) { v = Number(v); return unit === 'kmh' ? v : v * 0.907185; }
  function rangeToDisplay(km, unit) { km = Number(km); return unit === 'kmh' ? Math.round(km) : Math.round(km / KMH); }
  function rangeFromDisplay(v, unit) { v = Number(v); return unit === 'kmh' ? v : v * KMH; }
  function lenLabel(m, unit) { return unit === 'kmh' ? (Math.round(m * 100) / 100) + ' m' : (function () { var ft = m / 0.3048, f = Math.floor(ft + 1e-9), i = Math.round((ft - f) * 12); if (i === 12) { f++; i = 0; } return f + "'" + (i ? i + '"' : ''); })(); }
  function weightLabel(t, unit) { return unit === 'kmh' ? (Math.round(t * 100) / 100) + ' t' : (Math.round(t / 0.907185 * 10) / 10) + ' short tons'; }
  function kmLabel(km, unit) { return unit === 'kmh' ? Math.round(km) + ' km' : Math.round(km / KMH) + ' mi'; }
  // usable range (km) now, and after charging to 80%
  function evRange(rangeKm, socPct) {
    rangeKm = Number(rangeKm) || 0; var soc = Math.max(0, Math.min(100, Number(socPct) || 0));
    return { ratedKm: rangeKm, usableKm: rangeKm * soc / 100 * EV_SAFETY, fullKm: rangeKm * EV_CHARGE_TO * EV_SAFETY };
  }
  function get(t) { return TYPES[t] || null; }
  function isVehicle(t) { var v = TYPES[t]; return !!v && !v.legacy; }
  function isKnown(t) { return !!TYPES[t]; }
  function maxMph(t) { return TYPES[t] ? TYPES[t].maxMph : 60; }
  // Build the rules object planRoute/classifyWay use for a vehicle type in a region ('US' or 'EU').
  function rulesFor(t, region, topMph, unit, cart) {
    var v = TYPES[t]; if (!v || v.legacy) return null;
    region = region === 'EU' ? 'EU' : 'US';
    var rm = v.roadMax[region];
    var out = { cls: 'veh', veh: t, region: region, unit: unit === 'kmh' ? 'kmh' : 'mph', roads: v.roads, paths: !!v.paths,
      motorway: v.roads.indexOf('motorway') >= 0, trunk: v.roads.indexOf('trunk') >= 0, roadMaxKmh: rm, topKmh: mphToKmh(topMph),
      limit: rm == null ? null : (unit === 'kmh' ? rm : Math.round(kmhToMph(rm))), planning: true, allowCrossing: false, night: true,
      mode: v.mode || '', foot: v.mode === 'foot', tracks: !!v.tracks };
    if (v.dims) { var c = cart || {}; out.truck = { heightM: Number(c.heightM) || 0, weightT: Number(c.weightT) || 0, lengthM: Number(c.lengthM) || 0 }; }
    if (v.ev) { var c2 = cart || {}; out.ev = evRange(c2.rangeKm, c2.socPct); }
    return out;
  }
  // 'auto' -> km/h in Europe (mph for the UK), mph in the US; an explicit 'kmh'/'mph' setting wins. country = EUR row or null.
  function unitFor(pref, country) {
    if (pref === 'kmh' || pref === 'mph') return pref;
    return country ? (country.m === 'mph' ? 'mph' : 'kmh') : 'mph';
  }
  function toUnit(kmh, unit) { return unit === 'kmh' ? Math.round(kmh) : Math.round(kmhToMph(kmh)); }
  function speedToDisplay(mph, unit) { return unit === 'kmh' ? Math.round(mphToKmh(mph)) : Math.round(mph * 10) / 10; }
  function speedFromDisplay(v, unit) { v = Number(v); return unit === 'kmh' ? Math.round(kmhToMph(v) * 10) / 10 : v; }
  function distLabel(m, unit) { return unit === 'kmh' ? (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km' : (m / 1609.344).toFixed(m < 16093 ? 2 : 1) + ' mi'; }
  // Convert every "N mph" in a text to km/h when unit is 'kmh' (25 mph -> 40 km/h, 35 -> 56, 20 -> 32; rounded to a whole number). mph text is returned unchanged.
  function convertSpeedText(t, unit) {
    t = String(t == null ? '' : t); if (unit !== 'kmh') return t;
    return t.replace(/(\d+(?:\.\d+)?)\s*mph\b/g, function (m, n) { return Math.round(mphToKmh(Number(n))) + ' km/h'; });
  }
  // number in one unit -> number in another ('mph'|'kmh'), whole numbers
  function convSpeed(v, from, to) { v = Number(v); if (!isFinite(v) || from === to) return v; return to === 'kmh' ? Math.round(mphToKmh(v)) : Math.round(kmhToMph(v)); }
  return { GROUPS: GROUPS, DIM_DEFAULTS: DIM_DEFAULTS, EV_DEFAULTS: EV_DEFAULTS, EV_SAFETY: EV_SAFETY, EV_CHARGE_TO: EV_CHARGE_TO, evRange: evRange, lenToDisplay: lenToDisplay, lenFromDisplay: lenFromDisplay, weightToDisplay: weightToDisplay, weightFromDisplay: weightFromDisplay, rangeToDisplay: rangeToDisplay, rangeFromDisplay: rangeFromDisplay, lenLabel: lenLabel, weightLabel: weightLabel, kmLabel: kmLabel,
    KMH: KMH, convertSpeedText: convertSpeedText, convSpeed: convSpeed, TYPES: TYPES, ORDER: ORDER, get: get, isVehicle: isVehicle, isKnown: isKnown, maxMph: maxMph, rulesFor: rulesFor, unitFor: unitFor,
    toUnit: toUnit, mphToKmh: mphToKmh, kmhToMph: kmhToMph, speedToDisplay: speedToDisplay, speedFromDisplay: speedFromDisplay, distLabel: distLabel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VEH;
