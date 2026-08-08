// ===========================================================================
// sun.js — where the sun actually is, and which windows it reaches.
//
// Pure math, no DOM, no storage, no network. Given the apartment's latitude
// and a window's compass facing, it answers "is the sun shining through this
// window right now?" and "how many hours of direct sun does this room get on
// a given date?"
//
// ORIENTATION
// The floor plan is drawn SOUTH-UP: the Den and Kitchen windows sit on the
// `top` edge and are documented as south-facing. That flips the horizontal
// axis relative to a normal map — left is EAST, right is WEST. The mapping
// lives in home.json (`orientation`) so the room builder can change it rather
// than having it hard-coded here.
//
// OBSTRUCTION
// A first-floor unit doesn't see the sun at true sunrise; neighbouring
// buildings and fences cut off the low angles. Rather than guess, `calibrate()`
// solves for the obstruction elevation that reproduces the sun times you
// actually observed — which is what makes "describe it and it auto-calculates"
// work.
// ===========================================================================

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD);

/* Compass bearing each map edge faces, given an orientation map like
   { top:'S', bottom:'N', left:'E', right:'W' }. */
export const BEARING = { N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315 };
export function edgeFacing(orientation, edge){
  const c = (orientation && orientation[edge]) || { top:'S', bottom:'N', left:'E', right:'W' }[edge];
  return BEARING[c] != null ? BEARING[c] : 180;
}

/* ---------------- solar position (NOAA low-precision) ----------------
   Accurate to well under a degree — far finer than window geometry or a
   neighbouring roofline, which are the real sources of error here. */
export function solarPosition(date, lat, lon){
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;   // days since J2000
  const g = (357.529 + 0.98560028 * d) % 360;                     // mean anomaly
  const q = (280.459 + 0.98564736 * d) % 360;                     // mean longitude
  const L = (q + 1.915 * sin(g) + 0.020 * sin(2 * g) + 360) % 360; // ecliptic longitude
  const e = 23.439 - 0.00000036 * d;                              // obliquity

  const dec = Math.asin(sin(e) * sin(L)) * DEG;                   // declination
  let ra = Math.atan2(cos(e) * sin(L), cos(L)) * DEG;             // right ascension
  ra = (ra + 360) % 360;

  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lmst = ((gmst + lon / 15) % 24 + 24) % 24;
  let ha = lmst * 15 - ra;                                        // hour angle
  ha = ((ha + 540) % 360) - 180;

  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)) * DEG;
  let az = Math.atan2(-sin(ha), Math.tan(dec * RAD) * cos(lat) - sin(lat) * cos(ha)) * DEG;
  az = (az + 360) % 360;                                          // 0 = north, clockwise
  return { altitude: alt, azimuth: az, declination: dec, hourAngle: ha };
}

/* Smallest angle between two bearings, 0–180.
   The (+540 % 360 − 180) wrap already yields the signed shortest difference,
   so its magnitude IS the answer — don't subtract it from 180 again. */
export function angleDiff(a, b){
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/* Does sun reach a window facing `facing`, at this sun position?
   Three gates, and a ground-floor apartment needs all three:
     spread      — a window admits light from ±spread° either side of its normal
     obstruction — elevation BELOW which the view is blocked (neighbouring
                   buildings and fences; why sun "arrives" well after sunrise)
     overhang    — elevation ABOVE which light is blocked (a balcony or eave
                   directly overhead; this is what makes the patio shady at
                   midday despite being outdoors) */
export function hitsWindow(sunPos, facing, { spread = 85, obstruction = 0, overhang = 90 } = {}){
  if (sunPos.altitude <= obstruction) return false;
  if (sunPos.altitude >= overhang) return false;
  return angleDiff(sunPos.azimuth, facing) <= spread;
}

/* ---------------- deciduous foliage ----------------
   Every window here looks onto trees (the photos show young staked trees at the
   Den and Kitchen, and a full canopy off the patio). Leaves are a SEASONAL
   filter that pure geometry misses entirely: in leaf they cut most of the
   direct beam, and bare winter branches pass most of it.

   This partly cancels the geometric result — a south window gains hours in
   winter AND loses its leaf screen at the same time, so winter is far brighter
   than the raw hour count suggests, and midsummer far dimmer.

   Northern-hemisphere leaf cycle, roughly: bare Dec–Mar, leafing Apr,
   full May–Sep, dropping Oct–Nov. */
export function foliageTransmission(date, f){
  if (!f) return 1;
  const inLeaf = f.summer != null ? f.summer : 0.35;   // fraction of beam passing in full leaf
  const bare   = f.bare   != null ? f.bare   : 0.85;   // fraction passing through bare branches
  const m = date.getMonth();                            // 0 = Jan
  const CYCLE = [0, 0, 0.15, 0.5, 0.85, 1, 1, 1, 1, 0.8, 0.4, 0.1];
  const leafiness = CYCLE[m];
  return bare + (inLeaf - bare) * leafiness;
}

/* Walk a day in `stepMin` increments and collect the direct-sun intervals for
   one window. Returns { hours, intervals:[{from,to}], peakAltitude }. */
export function sunOnWindow(date, lat, lon, facing, opts = {}){
  const step = opts.stepMin || 5;
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const intervals = []; let cur = null, hours = 0, peak = 0;

  for (let m = 0; m <= 1440; m += step){
    const t = new Date(day.getTime() + m * 60000);
    const pos = solarPosition(t, lat, lon);
    const lit = hitsWindow(pos, facing, opts);
    if (lit){
      hours += step / 60;
      if (pos.altitude > peak) peak = pos.altitude;
      if (!cur) cur = { from: m, to: m };
      else cur.to = m;
    } else if (cur){ intervals.push(cur); cur = null; }
  }
  if (cur) intervals.push(cur);

  return {
    hours: Math.round(hours * 100) / 100,
    peakAltitude: Math.round(peak * 10) / 10,
    intervals: intervals.map(i => ({ from: hhmm(i.from), to: hhmm(i.to),
                                     fromMin: i.from, toMin: i.to }))
  };
}

export function hhmm(min){
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
export function parseHHMM(s){
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
export function pretty(min){
  const h24 = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  const ap = h24 < 12 ? 'AM' : 'PM', h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2,'0')} ${ap}`;
}

/* ---------------- calibration ----------------
   You observed the Den lit from 9:45 to 16:00. An unobstructed south window at
   this latitude is lit for longer than that, so something is cutting the low
   angles off. Solve for the obstruction elevation whose predicted interval
   best matches what you actually saw, and reuse it for other dates/seasons. */
export function calibrate(date, lat, lon, facing, observedFrom, observedTo, opts = {}){
  const want = { from: parseHHMM(observedFrom), to: parseHHMM(observedTo) };
  if (want.from == null || want.to == null) return null;

  let best = null;
  for (let obs = 0; obs <= 45; obs += 0.5){
    for (let spread = 60; spread <= 90; spread += 5){
      const r = sunOnWindow(date, lat, lon, facing, { ...opts, obstruction:obs, spread, stepMin:5 });
      if (!r.intervals.length) continue;
      // widest lit interval of the day is the one you'd have noticed
      const iv = r.intervals.reduce((a,b) => (b.toMin-b.fromMin > a.toMin-a.fromMin ? b : a));
      const err = Math.abs(iv.fromMin - want.from) + Math.abs(iv.toMin - want.to);
      if (!best || err < best.err) best = { err, obstruction:obs, spread, predicted:iv, hours:r.hours };
    }
  }
  return best;
}

/* ---------------- room-level ----------------
   A room's direct sun is the union of its windows' lit intervals (two windows
   lit at the same time is still one sunny room, not double the hours). */
export function sunOnRoom(room, home, date = new Date()){
  const { lat, lon } = home.location;
  const orientation = home.orientation;
  const wins = room.windows || [];
  if (!wins.length) return { hours:0, effectiveHours:0, transmission:1,
                             intervals:[], windows:[], peakAltitude:0 };

  const perWindow = wins.map(w => {
    const facing = w.facing != null ? w.facing : edgeFacing(orientation, w.edge);
    const opts = { obstruction: w.obstruction != null ? w.obstruction : (room.sun?.obstruction ?? 0),
                   overhang:    w.overhang    != null ? w.overhang    : (room.sun?.overhang ?? 90),
                   spread:      w.spread      != null ? w.spread      : 85 };
    const fol = w.foliage || room.sun?.foliage || null;
    const trans = foliageTransmission(date, fol);
    return { window:w, facing, foliage:fol, transmission:trans,
             ...sunOnWindow(date, lat, lon, facing, opts) };
  });

  // union of minute-intervals across windows
  const marks = new Array(1441).fill(false);
  perWindow.forEach(pw => pw.intervals.forEach(iv => {
    for (let m = iv.fromMin; m <= iv.toMin; m++) marks[m] = true;
  }));
  const intervals = []; let cur = null;
  marks.forEach((lit, m) => {
    if (lit){ if (!cur) cur = { fromMin:m, toMin:m }; else cur.toMin = m; }
    else if (cur){ intervals.push(cur); cur = null; }
  });
  if (cur) intervals.push(cur);

  const hours = intervals.reduce((s,i) => s + (i.toMin - i.fromMin) / 60, 0);
  // Effective hours discount the beam a leaf canopy is intercepting. `hours`
  // stays the raw geometric figure so the two can be shown side by side.
  const trans = perWindow.length
    ? Math.max(...perWindow.map(p => p.transmission != null ? p.transmission : 1)) : 1;
  return {
    transmission: Math.round(trans * 100) / 100,
    effectiveHours: Math.round(hours * trans * 100) / 100,
    hours: Math.round(hours * 100) / 100,
    peakAltitude: Math.max(0, ...perWindow.map(p => p.peakAltitude)),
    intervals: intervals.map(i => ({ ...i, from:hhmm(i.fromMin), to:hhmm(i.toMin),
                                     label:`${pretty(i.fromMin)} – ${pretty(i.toMin)}` })),
    windows: perWindow
  };
}

/* Direct-sun hours across the year, for "this spot is great in June and dead
   in December" style advice. */
export function seasonalSun(room, home, year = new Date().getFullYear()){
  const marks = [
    { key:'winter', label:'Winter solstice', date:new Date(year, 11, 21) },
    { key:'spring', label:'Spring equinox',  date:new Date(year, 2, 20) },
    { key:'summer', label:'Summer solstice', date:new Date(year, 5, 21) },
    { key:'autumn', label:'Autumn equinox',  date:new Date(year, 8, 22) }
  ];
  return marks.map(m => ({ ...m, ...sunOnRoom(room, home, m.date) }));
}

/* Rating 0–5 from measured direct-sun hours, so `light` stops being a vibe. */
export function sunScore(hours){
  if (hours <= 0) return 0;
  if (hours < 1) return 1;
  if (hours < 2.5) return 2;
  if (hours < 4) return 3;
  if (hours < 6) return 4;
  return 5;
}
