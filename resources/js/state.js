// ===========================================================================
// state.js — everything stateful: persistence, loaded data (DB), UI flags,
// and the date/interval helpers. No DOM rendering here.
// ===========================================================================

const DATA_BASE = 'resources/data/';

// --- loaded dataset (populated by loadData) ---
export const DB = { home:null, plants:[], roomById:{}, almanac:null };

// --- transient UI state shared across modules ---
export const UI = { view:'care', group:'light', openId:null, openTab:'overview' };

// --- localStorage shim with in-memory fallback (never throws) ---
export const Store = (() => {
  let mem = {}, ok = false;
  try { const k='__alpj__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); ok = true; } catch (e) {}
  return {
    get(k){ try { return ok ? JSON.parse(localStorage.getItem(k) || 'null') : (mem[k] ?? null); } catch (e) { return mem[k] ?? null; } },
    set(k,v){ try { ok ? localStorage.setItem(k, JSON.stringify(v)) : (mem[k]=v); } catch (e) { mem[k]=v; } },
    persists: ok
  };
})();

// --- data loading (from separate JSON files) ---
export async function loadData(){
  const idx     = await (await fetch(DATA_BASE + 'index.json')).json();
  const home    = await (await fetch(DATA_BASE + idx.home)).json();
  const plants  = await Promise.all(idx.plants.map(p => fetch(DATA_BASE + p).then(r => r.json())));
  const almanac = idx.almanac ? await (await fetch(DATA_BASE + idx.almanac)).json() : null;
  DB.home = home;
  DB.plants = plants;
  DB.almanac = almanac;
  DB.roomById = {};
  (home.rooms || []).forEach(r => { DB.roomById[r.id] = r; });
  return DB;
}

// --- per-plant tracking state (last watered/fed, notes) ---
export function state(){ return Store.get('alpj_state') || {}; }
export function saveState(s){ Store.set('alpj_state', s); }
export function ps(id){ return state()[id] || {}; }
export function setPs(id, patch){ const s = state(); s[id] = { ...(s[id] || {}), ...patch }; saveState(s); }

// --- dates / watering cadence ---
export const DAY = 86400000;
export function today0(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
export function fmtDate(d){ return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }); }
export function isSameDay(iso){
  if (!iso) return false;
  const d = new Date(iso), t = today0();
  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
}
export function plant(id){ return DB.plants.find(p => p.id === id); }
export function interval(p){ return p.medium === 'water' ? 6 : p.waterDays; }
export function nextCheck(p){ const b = ps(p.id).lastWatered ? new Date(ps(p.id).lastWatered) : today0(); return new Date(b.getTime() + interval(p)*DAY); }
export function daysUntil(p){ return Math.round((nextCheck(p) - today0()) / DAY); }
export function actWord(p){ return p.medium === 'water' ? 'Refresh' : 'Water'; }
export function isWateredToday(id){ return isSameDay(ps(id).lastWatered); }
export function isFedToday(id){ return isSameDay(ps(id).lastFed); }
