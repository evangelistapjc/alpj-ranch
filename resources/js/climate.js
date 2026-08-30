// ===========================================================================
// climate.js — derived knowledge, no DOM and no storage. Answers one question:
// "given where this plant is standing right now, how well does that spot suit
// it?" Everything here is a pure function of (plant, room, live weather), so
// moving a plant on the map instantly changes every verdict that depends on it.
//
// Room microclimate comes from home.json → rooms[].climate; plant requirements
// from plants/*.json → needs. Outdoor rooms marked `tracksWeather` substitute
// live Open-Meteo readings for their static range.
// ===========================================================================
import { DB, room, loc, effInterval, interval, potMates } from './state.js';
import { LIGHT_FIT } from './config.js';
import { sunOnRoom, seasonalSun } from './sun.js';

export const Live = { tF:null, rh:null, code:null, hiF:null };  // filled by weather.js

const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const overlap = (a,b) => Math.max(0, Math.min(a[1],b[1]) - Math.max(a[0],b[0]));

/* The effective range for a room: outdoor rooms follow today's weather. */
export function roomRanges(r){
  const c = (r && r.climate) || {};
  const t = (c.tempF || [65,70]).slice(), h = (c.humidityPct || [45,55]).slice();
  if (c.tracksWeather && Live.tF != null){
    const hi = Live.hiF != null ? Live.hiF : Live.tF;
    t[0] = Math.min(Live.tF, hi) - 6; t[1] = Math.max(Live.tF, hi);
    if (Live.rh != null){ h[0] = clamp(Live.rh - 12, 0, 100); h[1] = clamp(Live.rh + 12, 0, 100); }
  }
  return { tempF:t, humidityPct:h, airflow:c.airflow || 'calm',
           dryFactor:c.dryFactor || 1, note:c.note || '', live: !!c.tracksWeather };
}

/* Verdicts are 'good' | 'ok' | 'poor' — scored on how much of the room's range
   sits inside what the plant wants. */
function rangeFit(need, have){
  if (!need || !have) return { v:'ok', pct:0 };
  const span = Math.max(1, have[1] - have[0]);
  const pct  = overlap(need, have) / span;
  return { v: pct >= 0.75 ? 'good' : pct >= 0.3 ? 'ok' : 'poor', pct };
}

/* Measured direct-sun hours for a room today, straight from the solar model.
   Falls back to the room's recorded observation if geometry is missing. */
export function sunToday(r){
  if (!r) return { hours:0, intervals:[], label:'—' };
  // Only fall back to the recorded observation when there's no geometry to
  // compute from. A computed ZERO is a real answer (the north-facing living
  // room genuinely gets none) and must not be overwritten by a stale number.
  if (Array.isArray(r.windows)){
    try {
      const s = sunOnRoom(r, DB.home, new Date());
      return { ...s, label: s.intervals.length ? s.intervals.map(i => i.label).join(', ')
                                               : 'no direct sun today' };
    } catch (e) {}
  }
  const obs = r.sun || {};
  return { hours: obs.hoursAug || 0, intervals:[],
           label: obs.observed ? `${obs.observed.from}–${obs.observed.to}` : 'none' };
}

// How many direct-sun hours each light zone actually wants.
const SUN_WANT = { bright:[4,9], medium:[1.5,6], low:[0,2.5] };

export function lightFit(p, r){
  if (!r) return { v:'poor', note:'Not placed in a room yet.', hours:0 };
  const rule = LIGHT_FIT[p.zone] || LIGHT_FIT.medium;
  const lvl  = r.light || 0;
  const sun  = sunToday(r), hrs = sun.hours;
  const [lo, hi] = SUN_WANT[p.zone] || SUN_WANT.medium;

  let v = rule.good.includes(lvl) ? 'good' : rule.ok.includes(lvl) ? 'ok' : 'poor';
  // Measured sun overrides the coarse 0–5 rating when they disagree.
  if (hrs > hi + 1.5) v = 'poor';
  else if (hrs < lo) v = (v === 'good') ? 'ok' : 'poor';

  let note;
  if (lvl === 0) note = p.growLight ? 'No daylight at all — it is living entirely off the grow light.'
                                    : 'No daylight at all. This spot needs a grow light to be viable.';
  else note = `${hrs.toFixed(1)}h of direct sun here (${sun.label}); a ${p.zone}-light plant wants ${lo}–${hi}h.`;

  if (hrs > hi + 1.5) note += ' That is more direct sun than it can take — expect bleaching or scorch.';
  else if (hrs < lo)  note += ' Short of what it needs; growth will stretch and colour will fade.';

  if (v !== 'good' && p.growLight){ v = v === 'poor' ? 'ok' : v; note += ' The grow light covers some of the gap.'; }
  return { v, note, level: lvl, hours: hrs, want: [lo, hi], sun };
}

export function tempFit(p, r){
  const need = p.needs && p.needs.tempF, R = roomRanges(r);
  const f = rangeFit(need, R.tempF);
  let note = `This spot runs ${R.tempF[0]}–${R.tempF[1]}°F; it wants ${need ? need[0]+'–'+need[1] : '—'}°F.`;
  if (f.v === 'poor') note += R.tempF[1] < (need ? need[0] : 0) ? ' Too cold here — growth will stall.'
                                                                : ' Runs hotter than it likes.';
  if (p.needs && p.needs.draftSensitive && R.airflow === 'drafty')
    note += ' ⚠️ This plant is draft-sensitive and this spot is drafty — expect leaf drop.';
  const v = (p.needs && p.needs.draftSensitive && R.airflow === 'drafty' && f.v === 'good') ? 'ok' : f.v;
  return { v, note, range:R.tempF, live:R.live };
}

export function humidityFit(p, r){
  const need = p.needs && p.needs.humidityPct, R = roomRanges(r);
  const f = rangeFit(need, R.humidityPct);
  const mid = (r) => (r[0] + r[1]) / 2;
  let note = `Sits around ${R.humidityPct[0]}–${R.humidityPct[1]}% RH; it wants ${need ? need[0]+'–'+need[1] : '—'}%.`;
  if (f.v === 'poor') note += (need && mid(R.humidityPct) < mid(need))
    ? ' Drier than it likes — expect crispy tips.' : ' Damper than it likes — watch for rot and fungus gnats.';
  return { v:f.v, note, range:R.humidityPct, live:R.live };
}

/* How the room shifts the watering rhythm, in plain language. */
export function waterFit(p, r){
  const R = roomRanges(r), base = interval(p), eff = effInterval(p);
  const delta = eff - base;
  const note = delta === 0 ? `Checking about every ${base} days — this spot dries at the house average.`
    : delta < 0 ? `Dries faster here: check every ~${eff} days instead of ${base}.`
                : `Holds water longer here: stretch to ~${eff} days instead of ${base}.`;
  return { v: Math.abs(delta) > base * 0.4 ? 'ok' : 'good', note, base, eff, dryFactor:R.dryFactor };
}

const RANK = { good:2, ok:1, poor:0 };
/* One assessment object for a plant in its current room. */
export function assess(p, r){
  const rr = r !== undefined ? r : room(p);
  const parts = { light:lightFit(p,rr), temp:tempFit(p,rr), humidity:humidityFit(p,rr), water:waterFit(p,rr) };
  const worst = Math.min(...['light','temp','humidity'].map(k => RANK[parts[k].v]));
  parts.overall = worst === 2 ? 'good' : worst === 1 ? 'ok' : 'poor';
  return parts;
}

/* ---------------- placement diagnostics ----------------
   Three questions, answered separately:
     1. what is actually wrong where it stands
     2. what you can do about it WITHOUT moving the plant
     3. where it should go instead
   Each issue carries its own in-place remedy, because "move it" is not always
   the answer you want — sometimes a sheer curtain or a grow light is.      */
export function diagnose(p, r){
  const rr = r !== undefined ? r : room(p);
  const a = assess(p, rr);
  const issues = [];
  const need = p.needs || {};

  // --- light ---
  if (a.light.v !== 'good'){
    const { hours, want } = a.light;
    if (!rr || (rr.light || 0) === 0){
      issues.push({ key:'light-none', sev:'high', title:'No daylight at all',
        why:`${rr ? rr.name : 'This spot'} has no window, so nothing but a lamp will keep this alive.`,
        fix:'Add a grow light on a 12h timer ~12–18" above the plant.' });
    } else if (hours > want[1] + 1.5){
      issues.push({ key:'light-burn', sev:'high', title:'Too much direct sun',
        why:`${hours.toFixed(1)}h of direct sun against the ${want[0]}–${want[1]}h a ${p.zone}-light plant wants.`,
        fix:'Pull it 3–4 ft back from the glass, or hang a sheer curtain to turn direct sun into bright indirect.' });
    } else if (hours < want[0]){
      issues.push({ key:'light-short', sev: hours < want[0]/2 ? 'high' : 'med',
        title:'Not enough light',
        why:`Only ${hours.toFixed(1)}h of direct sun; it wants ${want[0]}–${want[1]}h.`,
        fix: p.growLight ? 'Grow light already on it — raise the run to ~12h/day or lower the fixture.'
                         : 'Move it to the window itself, or add a grow light. Rotate a quarter-turn weekly so it grows evenly.' });
    }
  }

  // --- temperature & drafts ---
  if (a.temp.v !== 'good'){
    const R = roomRanges(rr), want = need.tempF;
    if (want && R.tempF[1] < want[0]){
      issues.push({ key:'temp-cold', sev:'high', title:'Runs colder than it likes',
        why:`This spot tops out at ${R.tempF[1]}°F; it wants ${want[0]}–${want[1]}°F.`,
        fix:'Lift the pot off a cold floor, keep it off the glass overnight, and water less — cold wet roots rot.' });
    } else if (want && R.tempF[0] > want[1]){
      issues.push({ key:'temp-hot', sev:'med', title:'Runs hotter than it likes',
        why:`This spot sits at ${R.tempF[0]}–${R.tempF[1]}°F; it wants up to ${want[1]}°F.`,
        fix:'Move it away from the heat source and check soil more often — it will dry out faster here.' });
    }
  }
  if (need.draftSensitive && roomRanges(rr).airflow === 'drafty'){
    issues.push({ key:'draft', sev:'high', title:'Draft-sensitive plant in a drafty spot',
      why:`${p.name} drops leaves in response to cold drafts, and this spot is drafty.`,
      fix:'Shift it a few feet from the door or slider — out of the draft line is usually enough, no room change needed.' });
  }

  // --- humidity ---
  if (a.humidity.v === 'poor'){
    const R = roomRanges(rr), want = need.humidityPct;
    const midR = (R.humidityPct[0] + R.humidityPct[1]) / 2;
    const dry = want && midR < (want[0] + want[1]) / 2;
    issues.push({ key: dry ? 'rh-low' : 'rh-high', sev:'med',
      title: dry ? 'Air is drier than it wants' : 'Air is damper than it wants',
      why:`${R.humidityPct[0]}–${R.humidityPct[1]}% RH here against the ${want ? want[0]+'–'+want[1] : '—'}% it prefers.`,
      fix: dry ? 'Group it with other plants or stand the pot on a pebble tray. Misting does almost nothing.'
               : 'Improve airflow and let the soil dry further between waterings; watch for fungus gnats.' });
  }

  // --- shared pot: the most common way a two-plant container kills one of them
  const mates = potMates(p).filter(q => q.id !== p.id);
  if (mates.length){
    const worst = mates.reduce((acc, q) =>
      Math.abs(interval(q) - interval(p)) > Math.abs(interval(acc) - interval(p)) ? q : acc, mates[0]);
    const gap = Math.abs(interval(worst) - interval(p));
    if (gap >= 5){
      const thirsty = interval(p) < interval(worst) ? p : worst;
      const dry = thirsty === p ? worst : p;
      issues.push({ key:'pot-conflict', sev:'high', title:'Potmates want different watering',
        why:`${p.name} wants water every ~${interval(p)}d but ${worst.name} wants ~${interval(worst)}d, `
          + `and they share one root zone.`,
        fix:`Water on ${dry.name}'s slower schedule so the shared soil dries out, and spot-water `
          + `${thirsty.name} at the surface between times. Long term, separate them at the next repot.` });
    }
  }

  const ranked = bestRooms(p);
  const current = loc(p);
  const better = ranked.filter(x => x.room.id !== current && x.score > (ranked.find(y => y.room.id === current)?.score ?? -1));

  return {
    assessment: a,
    issues: issues.sort((x, y) => (y.sev === 'high') - (x.sev === 'high')),
    stayPlan: issues.map(i => i.fix),
    best: ranked[0],
    better: better.slice(0, 3),
    alreadyBest: ranked[0] && ranked[0].room.id === current
  };
}

/* Direct-sun hours across the year for a room — "great in June, dead in December". */
export function roomSeasons(r){
  try { return seasonalSun(r, DB.home); } catch (e) { return []; }
}

/* Rank every room for this plant — powers the "better spot" hint while dragging.
   Outdoor rooms are heavily penalised for tender houseplants: the patio may
   score well on light in August, but every plant here is a tropical that San
   Jose's winter nights (down to ~40°F) would kill. Recommending it would be
   confidently wrong six months from now. */
export function bestRooms(p){
  const tender = !(p.needs && p.needs.tempF && p.needs.tempF[0] <= 45);
  return (DB.home.rooms || []).map(r => {
    const a = assess(p, r);
    let score = RANK[a.light.v]*3 + RANK[a.temp.v]*2 + RANK[a.humidity.v];
    if (r.outdoor && tender) score -= 6;
    return { room:r, score, a, outdoorRisk: !!(r.outdoor && tender) };
  }).sort((x,y) => y.score - x.score);
}

export function isCurrentRoom(p, r){ return loc(p) === r.id; }

export const VERDICT = { good:['✅','Good fit'], ok:['🟡','Workable'], poor:['⚠️','Poor fit'] };
