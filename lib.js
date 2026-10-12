/* ===== Golf cart legality + routing core (pure JS, no DOM) ===== */
var GC = (function () {
  'use strict';
  var VT = typeof VEH !== 'undefined' ? VEH : require('./vehicles.js');

  // ---------- Cart status (Florida: ss. 316.212, 316.2122, 320.01(22),(41)) ----------
  var LSV_MAX_MPH = 35;           // s. 316.2122(1)(a)
  var DEFAULT_DESIGNATED_MPH = 25; // ASSUMPTION (not in statute): typical local designation threshold

  // opts.state: optional state row from ST (n name, a abbr, l LSV road mph, v verified). Florida (or no state) = verified Florida logic.
  // Any other state: same conservative defaults, but the LSV road limit is the state's and an 'unverified' marker is attached.
  function cartStatus(p, opts) {
    opts = opts || {};
    var o0 = cartStatusInner(p, opts);
    // golf cart / LSV rules are written in mph: show them in km/h when the units setting asks for it
    if (o0 && !(o0.rules && o0.rules.cls === 'veh')) {
      var u0 = opts.unit === 'kmh' ? 'kmh' : 'mph', cv = function (t) { return VT.convertSpeedText(t, u0); };
      if (o0.rules) o0.rules.unit = u0; o0.unit = u0;
      if (u0 === 'kmh') {
        o0.label = cv(o0.label); o0.explain = o0.explain.map(cv); o0.warnings = o0.warnings.map(cv);
        o0.checklist.forEach(function (c) { c.item = cv(c.item); if (c.note) c.note = cv(c.note); });
      }
    }
    return o0;
  }
  function cartStatusInner(p, opts) {
    // New vehicle types (moped, motorcycle, e-scooter, L6e) and anything in Europe use the shared vehicle table below. Florida golf cart/LSV logic is untouched.
    if (VT.isVehicle(p.type) || opts.region === 'EU') return vehicleStatus(p, opts);
    var st = opts.state || null;
    var fl = !st || st.v;
    var lsvLimit = fl ? LSV_MAX_MPH : (Number(st.l) > 0 ? Number(st.l) : LSV_MAX_MPH);
    var out = cartStatusCore(p, opts, lsvLimit);
    out.lsvLimit = lsvLimit;
    if (out.rules) out.rules.lsvLimit = lsvLimit;
    out.state = st ? { name: st.n, abbr: st.a, verified: !!st.v } : null;
    if (!fl) {
      // Don't present Florida statute text as another state's law: keep only a one-line generic note.
      out.explain = out.explain.length ? ['Default rules are used here (Florida-based, with ' + st.n + '\'s LSV road limit of ' + lsvLimit + ' mph). ' + st.n + ' may differ.'] : [];
      out.warnings = out.warnings.map(function (w) { return w.replace(/FLHSMV/g, 'your state DMV').replace(/the statute\'s wording/g, 'the usual definition').replace(/the 35 mph rule/g, 'the ' + lsvLimit + ' mph rule').replace(/\s*\(s\. 316\.212\(\d+\)\)/g, ''); });
      out.checklist.forEach(function (c) { if (c.note) c.note = c.note.replace(/Definition of a low-speed vehicle, s\. 320\.01\(41\)\./, 'Usual definition of a low-speed vehicle.'); });
    }
    return out;
  }

  // ---------- Vehicle profiles (shared US + Europe). opts: region 'US'|'EU', unit 'mph'|'kmh', state (US row), country (EUR row) ----------
  function vehicleStatus(p, opts) {
    var region = opts.region === 'EU' ? 'EU' : 'US', unit = opts.unit === 'kmh' ? 'kmh' : 'mph', st = opts.state || null, co = opts.country || null;
    var out = { cls: 'none', ok: false, label: '', explain: [], warnings: [], checklist: [], rules: null, region: region, unit: unit, lsvLimit: null,
      state: region === 'US' && st ? { name: st.n, abbr: st.a, verified: !!st.v } : null, country: region === 'EU' && co ? { name: co.n, code: co.c, eu: !!co.eu } : null };
    var v = VT.get(p.type), speed = Number(p.speed);
    if (!VT.isVehicle(p.type)) { // golf cart / LSV in Europe
      out.label = (v ? v.label : 'Golf cart') + 's are generally not road-legal in Europe';
      out.explain.push('Europe has no golf cart or low-speed-vehicle road class. A road-legal equivalent is a type-approved, registered and insured light quadricycle (L6e, 45 km/h, AM licence). Choose "Light quadricycle (L6e)" as the vehicle type to plan routes here.');
      return out;
    }
    if (!(speed > 0)) { out.label = 'Enter your ' + v.label.toLowerCase().replace(/ \(.*$/, '') + '\'s top speed'; return out; }
    if (speed > v.maxMph + 1e-9) {
      var lim = unit === 'kmh' ? Math.round(VT.mphToKmh(v.maxMph)) + ' km/h' : (Math.round(v.maxMph * 10) / 10) + ' mph';
      out.label = 'Faster than a ' + v.label.replace(/ \(.*$/, '').toLowerCase() + ' (over ' + lim + ')';
      out.explain.push('This vehicle type is limited to ' + lim + '. A faster vehicle is a different class: pick Motorcycle, or lower the speed.');
      return out;
    }
    out.cls = p.type; out.ok = true;
    out.rules = VT.rulesFor(p.type, region, speed, unit, p);
    var SUMMARY = { car: 'all public roads and motorways, no sidewalks or bike paths', ev: 'all public roads and motorways, no sidewalks or bike paths', foot: 'footways, sidewalks and quiet streets, no motorways', bicycle: 'bike lanes, paths and streets, no motorways',
      atv: 'quiet roads and tagged trails only, check local law' };
    if (v.mode === 'truck') {
      var tk = out.rules.truck;
      if (!(tk.heightM > 0 && tk.weightT > 0 && tk.lengthM > 0)) { out.ok = false; out.rules = null; out.label = 'Enter your vehicle\'s height, weight and length'; out.explain.push('Height, weight and length are used to avoid roads with posted limits below your vehicle.'); return out; }
      out.explain.push('Planning for ' + VT.lenLabel(tk.heightM, unit) + ' high, ' + VT.lenLabel(tk.lengthM, unit) + ' long, ' + VT.weightLabel(tk.weightT, unit) + '.');
      out.warnings.push('Only limits mapped in OpenStreetMap (maxheight, maxweight, maxlength, hgv) are checked. Bridge and tunnel clearances, hazmat and turn radius are not. Obey posted signs.');
    }
    if (v.ev) {
      var evr = out.rules.ev;
      if (!(evr.ratedKm > 0)) { out.ok = false; out.rules = null; out.label = 'Enter your EV\'s battery range'; return out; }
      out.explain.push('Usable range about ' + VT.kmLabel(evr.usableKm, unit) + ' (' + VT.kmLabel(evr.ratedKm, unit) + ' rated, ' + Math.round(Number(p.socPct) || 0) + '% charge, ' + Math.round((1 - VT.EV_SAFETY) * 100) + '% reserve for speed, weather and hills). After a charge to 80% about ' + VT.kmLabel(evr.fullKm, unit) + '.');
    }
    if (v.mode === 'atv') {
      var q = region === 'EU' ? 'quad+ATV+road+legal+' + encodeURIComponent(co ? co.n : 'Europe') : 'ATV+UTV+street+legal+laws+' + encodeURIComponent(st ? st.n : 'state');
      out.warnings.push('Check local law: whether an ATV/UTV may use public roads, and which ones, depends on ' + (region === 'EU' ? 'the country and local authority' : 'state, county and city law') + '. Roads shown are assumed, not verified.');
      out.link = { href: 'https://www.google.com/search?q=' + q, text: 'Check ATV/UTV road laws' + (region === 'EU' ? (co ? ' in ' + co.n : '') : (st ? ' in ' + st.n : '')) };
    }
    if (v.mode === 'foot' || v.mode === 'bike') out.warnings.push('Footway and bike-path data is community-mapped in OpenStreetMap and can be missing. Use caution at crossings and obey signals.');
    out.label = v.mode === 'truck' ? 'Truck / RV: motorways allowed, avoids roads below your height, weight and length' : SUMMARY[p.type] ? v.label.replace(/ \(.*$/, '') + ': ' + SUMMARY[p.type] : v.label.replace(/ \(.*$/, '') + ': ' + (v.roads.indexOf('motorway') >= 0 ? 'all roads, motorways/freeways allowed' : v.paths ? 'streets and bike paths, no motorways/freeways' : 'no motorways/freeways' + (out.rules.limit ? ', roads up to ' + out.rules.limit + ' ' + (unit === 'kmh' ? 'km/h' : 'mph') : ''));
    out.explain.push(v.note);
    if (region === 'US' && st && !st.v) out.explain.push('General rules for this vehicle type; ' + st.n + ' law may differ.');
    return out;
  }

  function cartStatusCore(p, opts, lsvLimit) {
    var designated = opts.designatedLimit || DEFAULT_DESIGNATED_MPH;
    var speed = Number(p.speed);
    var out = { cls: 'none', ok: false, label: '', explain: [], warnings: [], checklist: [], rules: null };
    if (!(speed > 0)) {
      out.label = 'Enter your cart\'s top speed';
      out.explain.push('Top speed decides which Florida rules apply.');
      return out;
    }
    // LSV checklist (s. 316.2122(1)(b)-(c), s. 320.01(41))
    var speedOk = speed > 20 && speed <= 25;
    out.checklist = [
      { item: 'Top speed above 20 and up to 25 mph', met: speedOk, note: 'Definition of a low-speed vehicle, s. 320.01(41). Cannot be fixed with equipment.' },
      { item: 'Headlamps', met: !!p.headlights },
      { item: 'Stop lamps and tail lamps (brake/tail lights)', met: !!p.brakeLights },
      { item: 'Turn signal lamps', met: !!p.turnSignals },
      { item: 'Reflex reflectors', met: !!p.reflectors },
      { item: 'Parking brake', met: !!p.parkingBrake },
      { item: 'Rearview mirror(s)', met: !!p.mirrors },
      { item: 'Windshield', met: !!p.windshield },
      { item: 'Seat belts', met: !!p.seatBelts },
      { item: 'Vehicle identification number (VIN)', met: !!p.hasVin },
      { item: 'Titled, registered and insured as a low-speed vehicle', met: !!p.registered }
    ];
    var lsvMissing = out.checklist.filter(function (c) { return !c.met; });
    var lsvReady = lsvMissing.length === 0;
    var wantsNight = p.night === 'night' || p.night === true;

    if (speed > 25) {
      out.cls = 'none';
      out.label = 'Not street legal: faster than 25 mph';
      out.explain.push('A golf cart cannot exceed 20 mph (s. 320.01(22)) and a low-speed vehicle cannot exceed 25 mph (s. 320.01(41)). A vehicle faster than that is neither, and this app will not route it. It would need to be a different registered vehicle type, or be limited to 25 mph or less.');
      return out;
    }
    if (speed > 20) {
      if (p.type === 'lsv' && lsvReady) return lsvResult(out, speed, lsvLimit);
      out.cls = 'none';
      out.label = 'Over 20 mph: needs LSV status first';
      out.explain.push('Above 20 mph a vehicle is not a "golf cart" under s. 320.01(22). To use public roads it has to qualify as a low-speed vehicle (s. 316.2122), which means all the equipment plus title, registration and insurance. Finish the checklist below, or limit the cart to 20 mph or less.');
      return out;
    }
    // speed <= 20
    if (p.type === 'lsv' && lsvReady) {
      out.warnings.push('Your cart is 20 mph or less, so by the statute\'s wording (LSV = faster than 20 mph) it may be treated as a golf cart, not an LSV, even with LSV equipment. Confirm with FLHSMV before relying on the 35 mph rule. Routing below uses the stricter golf cart rules.');
    } else if (p.type === 'lsv') {
      out.warnings.push('You chose LSV but some LSV requirements are missing, so golf cart rules are used. See the checklist.');
    }
    var missing = [];
    if (!p.mirrors) missing.push('rearview mirror');
    if (!p.reflectors) missing.push('red front and rear reflectors');
    if (missing.length) {
      out.cls = 'none';
      out.label = 'Golf cart missing required equipment';
      out.explain.push('Florida requires a golf cart on public roads to have efficient brakes, reliable steering, safe tires, a rearview mirror, and red reflectorized warning devices front and rear (s. 316.212(6)). Missing: ' + missing.join(', ') + '.');
      return out;
    }
    var nightEquip = p.headlights && p.brakeLights && p.turnSignals && p.windshield;
    out.cls = 'golf';
    out.ok = true;
    out.rules = { cls: 'golf', limit: designated, planning: opts.planning !== false, allowCrossing: opts.allowCrossing !== false, night: false };
    var dayNight;
    if (wantsNight && nightEquip) {
      dayNight = 'night only where your local government allows it';
      out.rules.night = true;
      out.warnings.push('After sunset a golf cart may only be driven if the local government has authorized night operation AND the cart has headlights, brake lights, turn signals and a windshield (s. 316.212(5)). This app cannot tell whether your city or county allows it. Check first.');
    } else {
      dayNight = 'daytime only (sunrise to sunset)';
      if (wantsNight && !nightEquip) out.warnings.push('You asked for night driving, but night use needs headlights, brake lights, turn signals and a windshield. Treated as daytime only.');
    }
    out.label = 'Golf cart: designated roads only (assumed up to ' + designated + ' mph), ' + dayNight;
    out.explain.push('A golf cart may only be driven on roads your county or city has formally designated for golf carts and signed (s. 316.212(1)). The state law sets no speed number for this. The ' + designated + ' mph cutoff used here is an assumption about what local governments typically designate.');
    out.explain.push('It may cross a state highway only at a crossing approved by FDOT (s. 316.212(2)). It may never use highways or limited-access roads, and sidewalks only where a local ordinance specifically allows (s. 316.212(8)(b)).');
    if (!out.rules.planning) out.explain.push('Strict mode is on: only roads tagged golf_cart=yes/designated in OpenStreetMap are used. Few roads are tagged, so expect "no route" often.');
    return out;
  }

  function lsvResult(out, speed, lsvLimit) {
    out.cls = 'lsv';
    out.ok = true;
    out.rules = { cls: 'lsv', limit: lsvLimit, planning: true, allowCrossing: true, night: true };
    out.label = 'Low-speed vehicle (LSV): roads posted ' + lsvLimit + ' mph or less';
    out.explain.push('An LSV may be operated on streets posted 35 mph or less, and may cross faster roads at intersections (s. 316.2122(1)(a)). It needs a driver license, plus title, registration and insurance.');
    out.explain.push('Statute sets no daytime-only rule for LSVs, but a county or city can ban LSVs on specific roads (s. 316.2122(3)), and FDOT can on state roads (s. 316.2122(4)). Watch for signs.');
    return out;
  }

  // ---------- Road classification ----------
  var FORBIDDEN = { motorway: 1, motorway_link: 1, trunk_link: 1, footway: 1, pedestrian: 1, steps: 1, corridor: 1,
    bridleway: 1, elevator: 1, platform: 1, proposed: 1, construction: 1, raceway: 1, busway: 1, bus_guideway: 1, via_ferrata: 1 };
  var PATHLIKE = { path: 1, cycleway: 1, track: 1 };
  var DEFAULT_MPH = { motorway: 65, trunk: 55, primary: 45, primary_link: 35, secondary: 45, secondary_link: 35,
    tertiary: 35, tertiary_link: 25, unclassified: 30, residential: 25, living_street: 15, service: 15, road: 25 };

  function parseMaxspeed(v) {
    if (!v) return null;
    v = String(v).trim().toLowerCase();
    var m = v.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?$/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (m[2] === 'km/h' || m[2] === 'kmh') return Math.round(n * 0.621371);
    return n; // mph, or bare number: assumed mph in Florida
  }

  // Vehicle table support: OSM maxspeed is km/h unless tagged mph; US data in this app is mph by convention for bare numbers (existing parseMaxspeed).
  var DEFAULT_KMH_EU = { motorway: 130, trunk: 100, primary: 80, primary_link: 50, secondary: 80, secondary_link: 50, tertiary: 70, tertiary_link: 50,
    unclassified: 70, residential: 50, living_street: 10, service: 20, road: 50, motorway_link: 70, trunk_link: 70 };
  function parseKmh(v, region) {
    if (!v) return null;
    var m = String(v).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (m[2] === 'mph' || (!m[2] && region !== 'EU')) return n * 1.609344;
    return n;
  }
  var NEVER = { footway: 1, pedestrian: 1, steps: 1, corridor: 1, bridleway: 1, elevator: 1, platform: 1, proposed: 1, construction: 1, raceway: 1, busway: 1, bus_guideway: 1, via_ferrata: 1 };
  // OSM dimension tags -> metres / tonnes (null when absent or unparseable)
  function parseLen(v) {
    if (v == null) return null; v = String(v).trim().toLowerCase();
    var m = v.match(/^(\d+)'\s*(?:(\d+(?:\.\d+)?)\s*(?:"|''))?$/); if (m) return (Number(m[1]) * 12 + Number(m[2] || 0)) * 0.0254;
    m = v.match(/^(\d+(?:[.,]\d+)?)\s*(m|ft|feet)?$/); if (!m) return null;
    var n = parseFloat(m[1].replace(',', '.')); return m[2] === 'ft' || m[2] === 'feet' ? n * 0.3048 : n;
  }
  function parseWeight(v) {
    if (v == null) return null; v = String(v).trim().toLowerCase();
    var m = v.match(/^(\d+(?:[.,]\d+)?)\s*(t|st|lbs?|kg)?$/); if (!m) return null;
    var n = parseFloat(m[1].replace(',', '.')), u = m[2] || 't';
    return u === 'st' ? n * 0.907185 : u === 'kg' ? n / 1000 : (u === 'lb' || u === 'lbs') ? n * 0.000453592 : n;
  }
  var NEVER_FOOT = { proposed: 1, construction: 1, raceway: 1, busway: 1, bus_guideway: 1, via_ferrata: 1, elevator: 1, platform: 1, bridleway: 1 };
  var MAJOR = { primary: 1, primary_link: 1, secondary: 1, secondary_link: 1, trunk: 1, trunk_link: 1 };
  function hasSidewalk(tags) { var s = tags.sidewalk; return (s && s !== 'no' && s !== 'none') || (tags['sidewalk:both'] && tags['sidewalk:both'] !== 'no') || (tags['sidewalk:left'] && tags['sidewalk:left'] !== 'no') || (tags['sidewalk:right'] && tags['sidewalk:right'] !== 'no') || tags.foot === 'yes' || tags.foot === 'designated'; }
  function classifyVehicle(tags, rules) {
    var hw = tags.highway, region = rules.region, unit = rules.unit, mode = rules.mode || '';
    var r = { allowed: false, basis: '', speed: null, kmh: null, reason: '', crossable: false, name: tags.name || tags.ref || '(unnamed ' + hw + ')', hw: hw, drivable: false, pen: 1 };
    if (!hw) { r.reason = 'not a road'; return r; }
    var foot = mode === 'foot', bicycle = mode === 'bike', atv = mode === 'atv', truck = mode === 'truck';
    if (foot ? NEVER_FOOT[hw] : NEVER[hw] && !(bicycle && (hw === 'footway' || hw === 'pedestrian') && (tags.bicycle === 'yes' || tags.bicycle === 'designated') && tags.footway !== 'sidewalk')) {
      r.reason = hw === 'footway' || hw === 'pedestrian' || hw === 'steps' ? 'sidewalk/pedestrian way: never allowed' : hw + ': never allowed'; return r;
    }
    var posted = parseKmh(tags.maxspeed, region), dflt = region === 'EU' ? DEFAULT_KMH_EU[hw] : (DEFAULT_MPH[hw] != null ? DEFAULT_MPH[hw] * 1.609344 : (hw === 'motorway_link' || hw === 'trunk_link' ? 45 * 1.609344 : null));
    r.kmh = posted != null ? posted : (dflt != null ? dflt : (region === 'EU' ? 50 : 40));
    function setSpeed() { r.speed = unit === 'kmh' ? Math.round(r.kmh) : Math.round(r.kmh / 1.609344); }
    setSpeed();
    var basis = posted != null ? 'posted' : 'assumed', bike = rules.veh === 'escooter' || bicycle;
    var svc = tags.service === 'driveway' || tags.service === 'parking_aisle' || tags.service === 'drive-through';
    var limited = hw === 'motorway' || hw === 'motorway_link' || tags.motorroad === 'yes' || (hw === 'trunk' && tags.expressway === 'yes');
    var accNo = tags.access === 'private' || tags.access === 'no';

    // ---------- pedestrians ----------
    if (foot) {
      var fpriv = (accNo && tags.foot !== 'yes' && tags.foot !== 'designated' && tags.foot !== 'permissive') || tags.foot === 'no' || tags.foot === 'private';
      r.drivable = !fpriv;
      if (fpriv) { r.reason = 'private/no pedestrian access'; return r; }
      if (hw === 'motorway' || hw === 'motorway_link' || tags.motorroad === 'yes' || (hw === 'trunk' && tags.expressway === 'yes')) { r.reason = 'motorway/expressway: no pedestrians'; r.drivable = false; return r; }
      r.speed = null;
      if (hw === 'footway' || hw === 'pedestrian' || hw === 'corridor') { r.allowed = true; r.basis = 'tagged'; r.pen = 0.9; return r; }
      if (hw === 'steps') { r.allowed = true; r.basis = 'tagged'; r.pen = 3; r.steps = true; return r; }
      if (hw === 'path' || hw === 'cycleway' || hw === 'track') { r.allowed = true; r.basis = tags.foot === 'yes' || tags.foot === 'designated' || hw === 'path' ? 'tagged' : 'assumed'; r.pen = 1; return r; }
      if (rules.roads.indexOf(hw) < 0) { r.reason = hw + ': not a walking route'; return r; }
      var sw = hasSidewalk(tags);
      if (!sw && MAJOR[hw]) { r.reason = 'major road with no mapped sidewalk'; return r; }
      setSpeed();
      r.allowed = true; r.basis = sw ? 'tagged' : 'assumed'; r.pen = sw ? 1 : 1.6; return r;
    }

    // ---------- access tags for the other modes ----------
    var priv;
    if (bike) priv = accNo || tags.bicycle === 'no';
    else if (atv) { var aYes = tags.atv === 'yes' || tags.atv === 'designated' || tags.atv === 'permissive'; priv = tags.atv === 'no' || accNo || (!aYes && (tags.motor_vehicle === 'no' || tags.motor_vehicle === 'private')); }
    else priv = accNo || tags.motor_vehicle === 'no' || tags.motor_vehicle === 'private';
    if (truck && (tags.hgv === 'no' || tags.hgv === 'destination' || tags.hgv === 'delivery')) {
      r.drivable = !(tags.motor_vehicle === 'no' || accNo); r.reason = tags.hgv === 'no' ? 'hgv=no: no trucks' : 'hgv=' + tags.hgv + ': trucks not allowed to pass through'; return r;
    }
    if (PATHLIKE[hw]) {
      var bk = tags.bicycle, okb = bk === 'yes' || bk === 'designated' || bk === 'permissive';
      if (atv) {
        var mv = tags.motor_vehicle, ay = tags.atv === 'yes' || tags.atv === 'designated' || tags.atv === 'permissive' || mv === 'yes' || mv === 'designated' || mv === 'permissive';
        if (rules.tracks && (hw === 'track' || hw === 'path') && !priv && ay) { r.allowed = true; r.basis = 'tagged'; r.drivable = true; r.pen = 1.5; r.kmh = Math.min(r.kmh, 40); r.speed = null; return r; }
        r.reason = hw + ': not tagged for ATVs or motor vehicles (atv=yes / motor_vehicle=yes)'; return r;
      }
      if (bicycle && !priv && (hw === 'cycleway' ? bk !== 'no' : (hw === 'track' ? true : okb))) {
        r.allowed = true; r.basis = hw === 'cycleway' || okb ? 'path' : 'assumed'; r.drivable = true; r.kmh = Math.min(r.kmh, 25); r.pen = hw === 'track' && !okb ? 1.3 : 0.8; r.speed = null; return r;
      }
      if (rules.paths && !bicycle && !priv && (hw === 'cycleway' ? bk !== 'no' : okb)) { r.allowed = true; r.basis = 'path'; r.drivable = true; r.kmh = Math.min(r.kmh, 25); setSpeed(); return r; }
      r.reason = hw + (rules.paths ? ' not open to bikes/scooters (no bicycle=yes/designated)' : ': not a road for this vehicle');
      return r;
    }
    if (bicycle && (hw === 'footway' || hw === 'pedestrian')) { r.allowed = true; r.basis = 'path'; r.drivable = true; r.kmh = Math.min(r.kmh, 12); r.pen = 1.2; r.speed = null; return r; }
    r.drivable = !(priv || svc);
    if (priv) { r.reason = 'private/no access for this vehicle'; return r; }
    if (svc) { r.reason = 'driveway/parking aisle'; return r; }
    if (limited && !(rules.motorway && (hw === 'motorway' || hw === 'motorway_link' || hw === 'trunk' || hw === 'trunk_link'))) { r.reason = (hw === 'motorway' || hw === 'motorway_link' ? 'motorway/freeway' : 'motorroad/expressway') + ': not allowed for this vehicle'; return r; }
    if (rules.roads.indexOf(hw) < 0) { r.reason = hw + ': not allowed for this vehicle'; return r; }
    // trucks and RVs: honor mapped height / weight / length limits
    if (truck && rules.truck) {
      var T = rules.truck, lim;
      lim = parseLen(tags.maxheight); if (lim != null && T.heightM > 0 && lim < T.heightM - 1e-9) { r.reason = 'height limit ' + VT.lenLabel(lim, unit) + ' (your vehicle ' + VT.lenLabel(T.heightM, unit) + ')'; return r; }
      lim = parseWeight(tags['maxweight:hgv'] != null ? tags['maxweight:hgv'] : tags.maxweight); if (lim != null && T.weightT > 0 && lim < T.weightT - 1e-9) { r.reason = 'weight limit ' + VT.weightLabel(lim, unit) + ' (your vehicle ' + VT.weightLabel(T.weightT, unit) + ')'; return r; }
      lim = parseLen(tags['maxlength:hgv'] != null ? tags['maxlength:hgv'] : tags.maxlength); if (lim != null && T.lengthM > 0 && lim < T.lengthM - 1e-9) { r.reason = 'length limit ' + VT.lenLabel(lim, unit) + ' (your vehicle ' + VT.lenLabel(T.lengthM, unit) + ')'; return r; }
      r.pen = (hw === 'residential' || hw === 'unclassified' || hw === 'service' || hw === 'road') ? 2.5 : (hw === 'tertiary' || hw === 'tertiary_link') ? 1.3 : 1;
    }
    // e-scooter/e-bike: a street with a bike lane/track (cycleway=lane|track|shared_lane, also :left/:right/:both) is open up to 72 km/h (45 mph)
    var lane = bike && ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both'].some(function (k) { return /^(lane|track|opposite_lane|opposite_track|shared_lane|share_busway)$/.test(tags[k] || ''); });
    if (bicycle) r.pen = lane ? 0.8 : (hw === 'primary' || hw === 'primary_link' || hw === 'secondary' || hw === 'secondary_link') ? 1.8 : (hw === 'tertiary' || hw === 'tertiary_link') ? 1.2 : 1;
    if (lane && r.kmh > rules.roadMaxKmh + 1e-9 && r.kmh <= 72.5) { r.allowed = true; r.basis = basis; r.bikeLane = true; return r; }
    if (rules.roadMaxKmh != null && r.kmh > rules.roadMaxKmh + 1e-9) {
      r.reason = r.speed + ' ' + (unit === 'kmh' ? 'km/h' : 'mph') + (basis === 'assumed' ? ' (assumed)' : '') + ' is above this vehicle\'s ' + (unit === 'kmh' ? Math.round(rules.roadMaxKmh) + ' km/h' : Math.round(rules.roadMaxKmh / 1.609344) + ' mph') + ' road limit';
      return r;
    }
    r.allowed = true;
    // ATVs: a road is only assumed legal (local law decides) unless explicitly tagged atv=yes/designated
    r.basis = atv ? (tags.atv === 'yes' || tags.atv === 'designated' ? 'tagged' : 'assumed') : basis; if (atv) r.pen = 1.2;
    return r;
  }

  // OSM ref on Florida state roads looks like "FL 507", "US 192", "SR A1A", "I 95", sometimes several joined by ';'
  function isStateRoad(tags) {
    var ref = String(tags.ref || '');
    return /(^|;)\s*(US|SR|FL|I)[ -]?\d+/i.test(ref) || /(^|;)\s*(SR|FL)?[ -]?A1A\b/i.test(ref) || /^state road\b/i.test(String(tags.name || ''));
  }

  function isTagYes(v) { return v === 'yes' || v === 'designated' || v === 'permissive'; }

  // returns {allowed, basis, speed, reason, crossable, name, hw}
  // Golf cart / LSV rules compare in mph; when rules.unit is 'kmh' the reported speed and reason are shown in km/h.
  function classifyWay(tags, rules) {
    var r = classifyWayCore(tags, rules);
    if (rules && rules.cls !== 'veh' && rules.unit === 'kmh') {
      if (r.speed != null) r.speed = Math.round(VT.mphToKmh(r.speed));
      if (r.reason) r.reason = VT.convertSpeedText(r.reason, 'kmh');
    }
    return r;
  }
  function classifyWayCore(tags, rules) {
    tags = tags || {};
    if (rules && rules.cls === 'veh') return classifyVehicle(tags, rules);
    var hw = tags.highway;
    var r = { allowed: false, basis: '', speed: null, reason: '', crossable: false, name: tags.name || tags.ref || '(unnamed ' + hw + ')', hw: hw, drivable: false };
    if (!hw) { r.reason = 'not a road'; return r; }
    if (FORBIDDEN[hw]) { r.reason = hw === 'footway' || hw === 'pedestrian' || hw === 'steps' ? 'sidewalk/pedestrian way: never allowed' : hw + ': never allowed'; return r; }
    var posted = parseMaxspeed(tags.maxspeed);
    var dflt = DEFAULT_MPH[hw];
    r.speed = posted != null ? posted : (dflt != null ? dflt : 25);
    var speedBasis = posted != null ? 'posted' : 'assumed';
    // can a cart cross this road at an intersection?
    r.crossable = !!rules.allowCrossing && !PATHLIKE[hw] && !(hw === 'trunk' && (tags.expressway === 'yes' || tags.access === 'no')) && hw !== 'service' && hw !== 'living_street';
    var priv = tags.access === 'private' || tags.access === 'no' || tags.motor_vehicle === 'no' || tags.motor_vehicle === 'private';
    var svc = tags.service === 'driveway' || tags.service === 'parking_aisle' || tags.service === 'drive-through';
    var tagged = isTagYes(tags.golf_cart);

    if (PATHLIKE[hw]) {
      if (rules.cls === 'golf' && tagged) { r.allowed = true; r.basis = 'tagged'; r.drivable = true; return r; }
      r.reason = hw + (rules.cls === 'golf' ? ' not tagged golf_cart=yes/designated' : ': not a road for LSVs');
      return r;
    }
    r.drivable = !(priv || svc);
    if (tags.golf_cart === 'no' && rules.cls === 'golf') { r.reason = 'tagged golf_cart=no'; r.drivable = false; return r; }
    if (priv) { r.reason = 'private/no motor vehicle access'; return r; }
    if (svc) { r.reason = 'driveway/parking aisle'; return r; }
    if (hw === 'trunk') { r.reason = 'trunk road (high-speed): not allowed'; return r; } // conservative project choice (README); statute would allow an LSV on a trunk road posted <= 35

    if (rules.cls === 'golf') {
      if (tagged) { r.allowed = true; r.basis = 'tagged'; return r; }
      // s. 316.212(1): golf carts may use only designated county roads / municipal streets; state roads can only be crossed (316.212(2)).
      if (isStateRoad(tags)) { r.reason = 'state road: a golf cart may only cross it at an approved crossing, not drive along it'; return r; }
      if (!rules.planning) { r.reason = 'not tagged golf_cart=yes in OSM (strict mode)'; return r; }
      if (r.speed <= rules.limit) { r.allowed = true; r.basis = speedBasis === 'posted' ? 'posted-designation-assumed' : 'assumed'; return r; }
      r.reason = r.speed + ' mph' + (speedBasis === 'assumed' ? ' (assumed)' : '') + ' is above the ' + rules.limit + ' mph cutoff';
      return r;
    }
    // LSV
    if (r.speed <= rules.limit) { r.allowed = true; r.basis = speedBasis; return r; }
    r.reason = r.speed + ' mph' + (speedBasis === 'assumed' ? ' (assumed)' : '') + ' is above the ' + rules.limit + ' mph LSV limit';
    return r;
  }

  // ---------- LSV upgrade hint (display only; never changes which roads are routable) ----------
  var LSV_RULES = { cls: 'lsv', limit: LSV_MAX_MPH, planning: true, allowCrossing: true, night: true };
  // true only when the current cart is a regular golf cart (status.ok && rules.cls==='golf'),
  // the road is NOT legal for it, but a registered street-legal LSV could use it.
  function lsvUpgradeFor(status, tags) {
    if (!status || !status.ok || !status.rules || status.rules.cls !== 'golf') return false;
    if (classifyWay(tags, status.rules).allowed) return false;
    return classifyWay(tags, { cls: 'lsv', limit: status.rules.lsvLimit || LSV_MAX_MPH, planning: true, allowCrossing: true, night: true }).allowed;
  }

  // ---------- Geometry ----------
  function hav(a, b) {
    var R = 6371000, d2r = Math.PI / 180;
    var dLat = (b[0] - a[0]) * d2r, dLon = (b[1] - a[1]) * d2r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // ---------- Graph from Overpass JSON ----------
  function parseOverpass(json) {
    var nodes = new Map(), ways = [];
    var els = json.elements || [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.type === 'node') nodes.set(e.id, [e.lat, e.lon]);
      else if (e.type === 'way' && e.nodes && e.tags && e.tags.highway) ways.push(e);
    }
    var nodeWays = new Map();
    ways.forEach(function (w, wi) {
      w.nodes.forEach(function (n) {
        var l = nodeWays.get(n); if (!l) nodeWays.set(n, l = []); l.push(wi);
      });
    });
    return { nodes: nodes, ways: ways, nodeWays: nodeWays };
  }

  function onewayDir(tags) {
    var o = tags.oneway;
    if (o === 'yes' || o === '1' || o === 'true') return 1;
    if (o === '-1' || o === 'reverse') return -1;
    if (tags.junction === 'roundabout' || tags.junction === 'circular') return 1;
    return 0;
  }

  // Build adjacency for a rule set. relaxed=true also includes drivable-but-illegal roads (flagged) for diagnostics.
  function buildAdj(g, rules, relaxed) {
    var cls = g.ways.map(function (w) { return classifyWay(w.tags, rules); });
    var blocked = new Set();
    var vehMw = rules.cls === 'veh' && rules.motorway;
    g.ways.forEach(function (w, wi) {
      var hw = w.tags.highway;
      if (vehMw) return; // vehicles that may use motorways/freeways can pass through their nodes
      var mainline = hw === 'motorway' || (hw === 'trunk' && w.tags.expressway === 'yes');
      var ramp = hw === 'motorway_link' || hw === 'trunk_link';
      // never pass through nodes of limited-access roads. A ramp's END node is where it meets an ordinary street: that node
      // must stay usable by the street, otherwise every ramp terminal cuts the surface road in two (moped Rockledge->Cocoa bug).
      if (mainline) w.nodes.forEach(function (n) { blocked.add(n); });
      else if (ramp) w.nodes.forEach(function (n) {
        var ws = g.nodeWays.get(n) || [];
        var surface = ws.some(function (k) { var h2 = g.ways[k].tags.highway; return k !== wi && h2 !== 'motorway_link' && h2 !== 'trunk_link' && h2 !== 'motorway' && !(h2 === 'trunk' && g.ways[k].tags.expressway === 'yes'); });
        if (!surface) blocked.add(n);
      });
    });
    var adj = new Map();
    function add(a, b, wi, len, dir, ok) {
      var l = adj.get(a); if (!l) adj.set(a, l = []);
      var e = { to: b, w: wi, len: len, ok: ok };
      if (rules.cls === 'veh' && cls[wi].kmh) { var kmh = Math.max(5, Math.min(cls[wi].kmh, rules.topKmh)); e.mps = kmh / 3.6; e.f = 50 / kmh * (cls[wi].pen || 1); }
      l.push(e);
    }
    g.ways.forEach(function (w, wi) {
      var c = cls[wi];
      var ok = c.allowed;
      if (!ok && !(relaxed && c.drivable)) return;
      var dir = onewayDir(w.tags);
      for (var i = 0; i < w.nodes.length - 1; i++) {
        var a = w.nodes[i], b = w.nodes[i + 1];
        var pa = g.nodes.get(a), pb = g.nodes.get(b);
        if (!pa || !pb) continue;
        if (blocked.has(a) || blocked.has(b)) continue;
        var len = hav(pa, pb);
        if (dir >= 0) add(a, b, wi, len, 1, ok);
        if (dir <= 0) add(b, a, wi, len, -1, ok);
      }
    });
    // Median/dual-carriageway crossing links: a side street that meets two parallel one-way carriageways
    // of the same crossable road (different OSM ways, same name) with no mapped connector between them.
    // Joined only when the two touch points are <= 60 m apart. Marked as a crossing (never driven along).
    var synth = cls.length;
    cls.push({ allowed: true, basis: 'crossing', speed: null, reason: '', crossable: false, name: 'Crossing', hw: 'crossing', drivable: true, synthetic: true });
    if (rules.allowCrossing) {
      var touch = [];
      adj.forEach(function (es, n) {
        var ws = g.nodeWays.get(n) || [];
        for (var k = 0; k < ws.length; k++) {
          var c = cls[ws[k]];
          if (!c.allowed && c.crossable && c.drivable && !blocked.has(n) && g.ways[ws[k]].tags.name) { touch.push({ n: n, w: ws[k] }); break; }
        }
      });
      for (var x = 0; x < touch.length; x++) for (var y = x + 1; y < touch.length; y++) {
        var tx = touch[x], ty = touch[y];
        if (tx.w === ty.w || g.ways[tx.w].tags.name !== g.ways[ty.w].tags.name) continue;
        var px = g.nodes.get(tx.n), py = g.nodes.get(ty.n);
        if (Math.abs(px[0] - py[0]) > 0.0007 || Math.abs(px[1] - py[1]) > 0.0007) continue;
        var dd = hav(px, py); if (dd > 60) continue;
        // the side-street edges at each node must be different ways from the road itself (they are: adj holds allowed edges only)
        var l1 = adj.get(tx.n), l2 = adj.get(ty.n);
        if (!l1 || !l2) continue;
        l1.push({ to: ty.n, w: synth, len: dd, ok: true, link: g.ways[tx.w].tags.name });
        l2.push({ to: tx.n, w: synth, len: dd, ok: true, link: g.ways[tx.w].tags.name });
      }
    }
    return { adj: adj, cls: cls, blocked: blocked, rules: rules };
  }

  // ---------- Binary heap ----------
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) {
    var a = this.a; a.push([k, v]); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a; if (!a.length) return null; var top = a[0], last = a.pop();
    if (a.length) { a[0] = last; var i = 0, n = a.length;
      for (;;) { var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && a[l][0] < a[m][0]) m = l; if (r < n && a[r][0] < a[m][0]) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  function dijkstra(g, A, src, dst, illegalPenalty) {
    var dist = new Map(), prev = new Map(), h = new Heap();
    dist.set(src, 0); h.push(0, src);
    while (h.size()) {
      var t = h.pop(), d = t[0], u = t[1];
      if (d > (dist.get(u) === undefined ? Infinity : dist.get(u))) continue;
      if (u === dst) break;
      var es = A.adj.get(u); if (!es) continue;
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        var cost = e.len * (e.f || 1) * (e.ok ? 1 : illegalPenalty);
        var nd = d + cost;
        var cur = dist.get(e.to);
        if (cur === undefined || nd < cur) { dist.set(e.to, nd); prev.set(e.to, { from: u, edge: e }); h.push(nd, e.to); }
      }
    }
    if (!dist.has(dst)) return null;
    var path = [dst], edges = [], c = dst;
    while (c !== src) { var p = prev.get(c); edges.push(p.edge); c = p.from; path.push(c); }
    path.reverse(); edges.reverse();
    return { path: path, edges: edges };
  }

  // Largest strongly connected component of the allowed graph (nodes you can both enter and leave). Snapping to it avoids
  // one-way stubs, exit-only service roads and tiny islands (Paris L6e Louvre -> Gare de Lyon bug). Iterative Tarjan.
  function mainComponent(A) {
    if (A._main) return A._main;
    var index = new Map(), low = new Map(), on = new Set(), stack = [], best = null, counter = 0;
    A.adj.forEach(function (_, root) {
      if (index.has(root)) return;
      var work = [[root, 0]];
      index.set(root, counter); low.set(root, counter); counter++; stack.push(root); on.add(root);
      while (work.length) {
        var fr = work[work.length - 1], v = fr[0], es = A.adj.get(v) || [];
        if (fr[1] < es.length) {
          var w = es[fr[1]++].to;
          if (!A.adj.has(w)) continue;
          if (!index.has(w)) { index.set(w, counter); low.set(w, counter); counter++; stack.push(w); on.add(w); work.push([w, 0]); }
          else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        } else {
          work.pop();
          if (work.length) { var u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
          if (low.get(v) === index.get(v)) {
            var comp = new Set(), x;
            do { x = stack.pop(); on.delete(x); comp.add(x); } while (x !== v);
            if (!best || comp.size > best.size) best = comp;
          }
        }
      }
    });
    A._main = best || new Set();
    return A._main;
  }

  // Nearest node of the allowed graph. Prefers the main (strongly connected) component unless a node of it is
  // much farther than the nearest island node; falls back to any allowed node.
  function snap(g, A, pt, maxM, useMain) {
    var main = useMain ? mainComponent(A) : null, best = null, bd = Infinity, bestAny = null, bdAny = Infinity;
    A.adj.forEach(function (es, id) {
      var p = g.nodes.get(id); if (!p) return;
      var dLat = (p[0] - pt[0]), dLon = (p[1] - pt[1]) * Math.cos(pt[0] * Math.PI / 180);
      var d2 = dLat * dLat + dLon * dLon;
      if (d2 < bdAny) { bdAny = d2; bestAny = id; }
      if (main && main.has(id) && d2 < bd) { bd = d2; best = id; }
    });
    // use the main component only when it is not much farther than the plain nearest node
    if (best === null || Math.sqrt(bd) - Math.sqrt(bdAny) > 150 / 111320) best = bestAny;
    if (best === null) return null;
    var d = hav(pt, g.nodes.get(best));
    return { id: best, dist: d, tooFar: maxM != null && d > maxM };
  }
  // Distance to the nearest road node of ANY class (used to say "your start is on a road your vehicle can't use").
  function nearestAnyRoad(g, pt) {
    var bd = Infinity, bn = null;
    g.nodeWays.forEach(function (ws, id) {
      var p = g.nodes.get(id); if (!p) return;
      var dLat = (p[0] - pt[0]), dLon = (p[1] - pt[1]) * Math.cos(pt[0] * Math.PI / 180), d2 = dLat * dLat + dLon * dLon;
      if (d2 < bd) { bd = d2; bn = id; }
    });
    if (bn === null) return null;
    var ws = g.nodeWays.get(bn);
    return { dist: hav(pt, g.nodes.get(bn)), way: g.ways[ws[0]] };
  }

  function nearestRoadName(g, id) {
    var l = g.nodeWays.get(id); if (!l) return '';
    return g.ways[l[0]].tags.name || '';
  }

  function describe(g, A, res, cartMph, lsvStatus) {
    var coords = [], segs = [], crossings = [], dist = 0;
    var p0 = g.nodes.get(res.path[0]); coords.push(p0);
    var cur = null;
    for (var i = 0; i < res.edges.length; i++) {
      var e = res.edges[i], c = A.cls[e.w];
      var a = g.nodes.get(res.path[i]), b = g.nodes.get(res.path[i + 1]);
      coords.push(b); dist += e.len;
      var legal = e.ok;
      var key = e.w + '|' + legal;
      if (!cur || cur.key !== key) {
        cur = { key: key, way: e.w, name: c.name, hw: c.hw, speed: c.speed, basis: legal ? c.basis : 'illegal', legal: legal, reason: legal ? '' : c.reason, coords: [a], len: 0, lsvOnly: !legal && !!lsvStatus && lsvUpgradeFor(lsvStatus, g.ways[e.w].tags) };
        segs.push(cur);
      }
      cur.coords.push(b); cur.len += e.len;
      // crossing detection at node res.path[i+1] (interior)
      if (c.synthetic) {
        crossings.push({ at: a, road: e.link, speed: null, hw: 'crossing', assumedSpeed: true, median: true });
      } else if (i < res.edges.length - 1 && legal) {
        var nid = res.path[i + 1], nxt = res.edges[i + 1];
        var ws = g.nodeWays.get(nid) || [];
        for (var k = 0; k < ws.length; k++) {
          var wi = ws[k];
          if (wi === e.w || wi === nxt.w || A.cls[wi].synthetic) continue;
          var wc = A.cls[wi];
          if (!wc.allowed && wc.crossable && wc.hw !== 'service') {
            crossings.push({ at: b, road: wc.name, speed: wc.speed, hw: wc.hw, assumedSpeed: !g.ways[wi].tags.maxspeed });
            break;
          }
        }
      }
    }
    var mps = cartMph * 0.44704, tv = 0, hasT = res.edges.length > 0 && res.edges.every(function (e) { return e.mps; });
    if (hasT) res.edges.forEach(function (e) { tv += e.len / e.mps; });
    var time = (hasT ? tv : dist / mps) + crossings.length * 20;
    return { nodeIds: res.path, edgeWays: res.edges.map(function (e) { return e.w; }), coords: coords, segments: segs, crossings: crossings, distance_m: dist, time_s: time };
  }

  // Main entry. start/end: [lat,lon]. status = cartStatus(...) result.
  function planRoute(g, status, start, end, o) {
    o = o || {};
    if (!status.ok) return { ok: false, error: 'cart-not-eligible', message: status.label };
    var rules = status.rules;
    var cartMph = Number(o.cartMph) || 15;
    var A = buildAdj(g, rules, false);
    var s = snap(g, A, start, 500), e = snap(g, A, end, 500);
    var result = { ok: false, rules: rules, snap: { start: s, end: e } };
    var warnings = [];
    if (s && e && !s.tooFar && !e.tooFar) {
      var res = dijkstra(g, A, s.id, e.id, 1);
      if (!res) {
        // nearest node may be a one-way stub / exit-only road / tiny island: retry from the main connected network
        var s2 = snap(g, A, start, 500, true), e2 = snap(g, A, end, 500, true);
        if (s2 && e2 && !s2.tooFar && !e2.tooFar && (s2.id !== s.id || e2.id !== e.id)) {
          var res2 = dijkstra(g, A, s2.id, e2.id, 1);
          if (res2) { res = res2; s = s2; e = e2; result.snap = { start: s, end: e }; }
        }
      }
      if (res) {
        var d = describe(g, A, res, cartMph, status);
        d.ok = true; d.rules = rules; d.snap = result.snap;
        d.snapPoints = { start: g.nodes.get(s.id), end: g.nodes.get(e.id) };
        d.assumedMeters = d.segments.filter(function (x) { return x.basis !== 'tagged' && x.basis !== 'posted'; }).reduce(function (a, x) { return a + x.len; }, 0);
        [['Start', 'start', s, start], ['Destination', 'destination', e, end]].forEach(function (z) {
          if (z[2].dist <= 60) return;
          var any = nearestAnyRoad(g, z[3]), blockedRoad = any && any.dist + 30 < z[2].dist && any.dist < 60;
          if (blockedRoad) {
            var nm = any.way.tags.name || any.way.tags.ref || ('a ' + any.way.tags.highway + ' road');
            warnings.push('Your ' + z[1] + ' is on ' + nm + ', a road your vehicle can\'t use; snapped to the nearest allowed road ' + Math.round(z[2].dist) + ' m away.');
          } else warnings.push(z[0] + ' is ' + Math.round(z[2].dist) + ' m from the nearest legal road; route ' + (z[1] === 'start' ? 'begins' : 'ends') + ' there.');
        });
        if (rules.ev && rules.ev.usableKm > 0) {
          var rkm = d.distance_m / 1000, uk = rules.ev.usableKm; d.ev = { routeKm: rkm, usableKm: uk, exceeds: rkm > uk };
          if (rkm > uk) warnings.push('This route (' + VT.kmLabel(rkm, rules.unit) + ') is longer than your usable range (about ' + VT.kmLabel(uk, rules.unit) + '). Plan a charging stop: see suggested chargers below.');
        }
        d.warnings = warnings;
        return d;
      }
    }
    // ---- No legal route: explain + nearest alternative ----
    var R = buildAdj(g, rules, true);
    var rs = snap(g, R, start, 500), re = snap(g, R, end, 500);
    result.error = 'no-legal-route';
    var why = [];
    if (!s || s.tooFar) why.push('The start point is ' + (s ? Math.round(s.dist) + ' m' : 'far') + ' from any road your cart may legally use.');
    if (!e || e.tooFar) why.push('The destination is ' + (e ? Math.round(e.dist) + ' m' : 'far') + ' from any road your cart may legally use.');
    if (rs && re) {
      var alt = dijkstra(g, R, rs.id, re.id, 8);
      if (alt) {
        var d2 = describe(g, R, alt, cartMph, status);
        d2.lsvUpgrade = d2.segments.some(function (x) { return x.lsvOnly; });
        result.lsvUpgrade = d2.lsvUpgrade;
        var bad = {};
        d2.segments.forEach(function (x) { if (!x.legal) { var k = x.name + ' (' + x.speed + (rules.unit === 'kmh' ? ' km/h' : ' mph') + '): ' + x.reason; bad[k] = (bad[k] || 0) + x.len; } });
        var list = Object.keys(bad).map(function (k) { return k + ', about ' + Math.round(bad[k]) + ' m'; });
        if (list.length) why.push('The only way to connect these points uses road(s) your cart may not use: ' + list.join('; ') + '.');
        else why.push('The points sit in disconnected legal areas (possibly a mapping gap).');
        result.alternative = d2;
      } else why.push('No drivable connection exists in the loaded map area.');
    }
    result.reasons = why;
    result.message = 'No legal route found. ' + why.join(' ');
    return result;
  }

  // Overpass query for a bbox around two points, padded; enforces the area cap.
  var MAX_SPAN_KM = 12;
  function bboxFor(a, b, padM) {
    padM = padM || 700;
    var span = hav(a, b) / 1000;
    var dLat = padM / 111320, dLon = padM / (111320 * Math.cos(a[0] * Math.PI / 180));
    return { span_km: span, tooBig: span > MAX_SPAN_KM,
      s: Math.min(a[0], b[0]) - dLat, w: Math.min(a[1], b[1]) - dLon, n: Math.max(a[0], b[0]) + dLat, e: Math.max(a[1], b[1]) + dLon };
  }
  // Adaptive routing area: try small padding first, widen when no route is found, never past MAX_AREA_KM2.
  var ROUTE_PADS = [700, 2000, 5000], MAX_AREA_KM2 = 450;
  function bboxAreaKm2(bb) {
    var h = (bb.n - bb.s) * 111.32, w = (bb.e - bb.w) * 111.32 * Math.cos(((bb.n + bb.s) / 2) * Math.PI / 180);
    return h * w;
  }
  // next bbox to try after `tried` (index into ROUTE_PADS), or null when out of widenings / over the cap
  function widerBbox(a, b, tried) {
    for (var i = tried + 1; i < ROUTE_PADS.length; i++) {
      var bb = bboxFor(a, b, ROUTE_PADS[i]);
      if (bboxAreaKm2(bb) > MAX_AREA_KM2) return null;
      bb.padIndex = i; bb.padM = ROUTE_PADS[i];
      return bb;
    }
    return null;
  }
  // rules (optional): pedestrians also need footways/steps/pedestrian streets; bikes also need footways tagged bicycle=yes/designated
  function overpassQuery(bb, rules) {
    var box = [bb.s, bb.w, bb.n, bb.e].map(function (x) { return x.toFixed(5); }).join(',');
    if (rules && rules.mode === 'foot') return '[out:json][timeout:40];way["highway"]["highway"!~"^(bridleway|proposed|construction|platform|raceway|elevator)$"](' + box + ');(._;>;);out body qt;';
    var extra = rules && rules.mode === 'bike' ? 'way["highway"~"^(footway|pedestrian)$"]["bicycle"~"^(yes|designated)$"](' + box + ');' : '';
    return '[out:json][timeout:40];(way["highway"]["highway"!~"^(footway|steps|pedestrian|corridor|elevator|bridleway|proposed|construction|platform|raceway)$"](' + box + ');' + extra + ');(._;>;);out body qt;';
  }
  // ---------- EV charging stops (OSM amenity=charging_station) ----------
  function chargingQuery(bb) {
    var box = [bb.s, bb.w, bb.n, bb.e].map(function (x) { return x.toFixed(5); }).join(',');
    return '[out:json][timeout:30];nwr["amenity"="charging_station"](' + box + ');out center tags;';
  }
  function parseChargers(json) {
    var out = [];
    (json && json.elements || []).forEach(function (e) {
      var lat = e.lat != null ? e.lat : (e.center && e.center.lat), lon = e.lon != null ? e.lon : (e.center && e.center.lon), t = e.tags || {};
      if (lat == null || lon == null || t.amenity !== 'charging_station') return;
      if (t.access === 'private' || t.access === 'no') return;
      var socks = Object.keys(t).filter(function (k) { return /^socket:/.test(k) && !/:(output|current|voltage)$/.test(k) && t[k] !== 'no'; }).map(function (k) { return k.slice(7); });
      out.push({ id: e.type + e.id, lat: lat, lon: lon, name: t.name || t.brand || t.operator || 'Charging station', operator: t.operator || t.brand || '', capacity: Number(t.capacity) || null, sockets: socks, fee: t.fee || '' });
    });
    return out;
  }
  // Suggest charging stops along a route. coords: [[lat,lon]...]; usableM: range now; fullM: range after a charge.
  // Greedy: from the current position take the farthest charger within range and within maxOffM of the route.
  function chargerPlan(coords, chargers, usableM, fullM, maxOffM) {
    maxOffM = maxOffM || 3000;
    var cum = [0], i;
    for (i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
    var total = cum[cum.length - 1];
    var res = { totalM: total, usableM: usableM, needed: total > usableM + 1e-6, ok: true, stops: [], message: '', nearby: [] };
    var cands = [];
    chargers.forEach(function (c) {
      var best = Infinity, bj = 0;
      for (var j = 0; j < coords.length; j++) { var d = hav([c.lat, c.lon], coords[j]); if (d < best) { best = d; bj = j; } }
      if (best <= maxOffM) cands.push({ c: c, along: cum[bj], off: best });
    });
    cands.sort(function (a, b) { return a.along - b.along; });
    res.nearby = cands.slice();
    if (!res.needed) { res.message = 'This route is within your usable range.'; return res; }
    var pos = 0, range = usableM, guard = 0;
    while (total - pos > range + 1e-6 && guard++ < 30) {
      var pick = null;
      for (i = 0; i < cands.length; i++) if (cands[i].along > pos + 1 && cands[i].along <= pos + range) pick = cands[i];
      if (!pick) { res.ok = false; res.message = 'No charging station found within ' + Math.round(range) + ' m of the next stretch of this route in OpenStreetMap. Plan a charge before you leave or choose a different route.'; return res; }
      res.stops.push({ station: pick.c, alongM: pick.along, offM: pick.off });
      pos = pick.along; range = fullM;
      if (!(fullM > 0)) { res.ok = false; res.message = 'Battery range is too small to plan stops.'; return res; }
    }
    if (guard >= 30) { res.ok = false; res.message = 'Too many charging stops needed for this range.'; return res; }
    res.message = res.stops.length + ' charging stop' + (res.stops.length === 1 ? '' : 's') + ' suggested.';
    return res;
  }


  // ---------- Viewport road legality (display layer) ----------
  var LEGALITY_MIN_ZOOM = 14;
  // bounds = {s,w,n,e}; returns {ok, bb} or {ok:false, reason:'zoom'|'span'}
  function viewportPlan(bounds, zoom) {
    if (!(zoom >= LEGALITY_MIN_ZOOM)) return { ok: false, reason: 'zoom' };
    var span = Math.max(hav([bounds.s, bounds.w], [bounds.n, bounds.e]), 0) / 1000;
    if (span > MAX_SPAN_KM) return { ok: false, reason: 'span', span_km: span };
    return { ok: true, span_km: span, bb: { s: bounds.s, w: bounds.w, n: bounds.n, e: bounds.e } };
  }
  // Classify every drivable way in an Overpass response; basis -> style group.
  function classifyViewport(json, rules) {
    var g = parseOverpass(json), out = [];
    g.ways.forEach(function (w) {
      var c = classifyWay(w.tags, rules);
      if (!c.drivable && !c.allowed && !(c.hw && !FORBIDDEN[c.hw] && !PATHLIKE[c.hw])) return;
      var coords = [];
      w.nodes.forEach(function (n) { var p = g.nodes.get(n); if (p) coords.push(p); });
      if (coords.length < 2) return;
      var basis = c.allowed ? c.basis : 'illegal';
      out.push({ coords: coords, name: c.name, speed: c.speed, basis: basis, reason: c.reason, allowed: c.allowed,
        lsvOnly: !c.allowed && lsvUpgradeFor({ ok: true, rules: rules }, w.tags) });
    });
    return out;
  }

  return { cartStatus: cartStatus, classifyWay: classifyWay, parseOverpass: parseOverpass, buildAdj: buildAdj, ROUTE_PADS: ROUTE_PADS, MAX_AREA_KM2: MAX_AREA_KM2, bboxAreaKm2: bboxAreaKm2, widerBbox: widerBbox, mainComponent: mainComponent, nearestAnyRoad: nearestAnyRoad, planRoute: planRoute,
    bboxFor: bboxFor, overpassQuery: overpassQuery, chargingQuery: chargingQuery, parseChargers: parseChargers, chargerPlan: chargerPlan, parseLen: parseLen, parseWeight: parseWeight, parseMaxspeed: parseMaxspeed, hav: hav, dijkstra: dijkstra, snap: snap,
    MAX_SPAN_KM: MAX_SPAN_KM, viewportPlan: viewportPlan, classifyViewport: classifyViewport, LEGALITY_MIN_ZOOM: LEGALITY_MIN_ZOOM, isStateRoad: isStateRoad, lsvUpgradeFor: lsvUpgradeFor };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GC;
