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
  var ORDER = ['golf', 'lsv', 'moped', 'motorcycle', 'escooter', 'l6e'];
  function get(t) { return TYPES[t] || null; }
  function isVehicle(t) { var v = TYPES[t]; return !!v && !v.legacy; }
  function isKnown(t) { return !!TYPES[t]; }
  function maxMph(t) { return TYPES[t] ? TYPES[t].maxMph : 60; }
  // Build the rules object planRoute/classifyWay use for a vehicle type in a region ('US' or 'EU').
  function rulesFor(t, region, topMph, unit) {
    var v = TYPES[t]; if (!v || v.legacy) return null;
    region = region === 'EU' ? 'EU' : 'US';
    var rm = v.roadMax[region];
    return { cls: 'veh', veh: t, region: region, unit: unit === 'kmh' ? 'kmh' : 'mph', roads: v.roads, paths: !!v.paths,
      motorway: v.roads.indexOf('motorway') >= 0, trunk: v.roads.indexOf('trunk') >= 0, roadMaxKmh: rm, topKmh: mphToKmh(topMph),
      limit: rm == null ? null : (unit === 'kmh' ? rm : Math.round(kmhToMph(rm))), planning: true, allowCrossing: false, night: true };
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
  return { KMH: KMH, TYPES: TYPES, ORDER: ORDER, get: get, isVehicle: isVehicle, isKnown: isKnown, maxMph: maxMph, rulesFor: rulesFor, unitFor: unitFor,
    toUnit: toUnit, mphToKmh: mphToKmh, kmhToMph: kmhToMph, speedToDisplay: speedToDisplay, speedFromDisplay: speedFromDisplay, distLabel: distLabel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VEH;
