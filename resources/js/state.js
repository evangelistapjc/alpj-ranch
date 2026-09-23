// ===========================================================================
// state.js — everything stateful: persistence, loaded data (DB), UI flags,
// and the date/interval helpers. No DOM rendering here.
//
// Two persisted keys:
//   alpj_state   → per-plant tracking { waterLog, fedLog, location, log, … }
//   alpj_weather → the daily Open-Meteo snapshot log (owned by weather.js)
//
// The JSON under resources/data/ is READ-ONLY. Anything the user changes —
// including moving a plant to another room — is written to alpj_state and
// layered on top at read time (see `loc()`), so the shipped data stays pristine
// and the overlay can be exported back to JSON when you want it permanent.
// ===========================================================================

import { loadJournal, saveJournal, pj, uid, lww, lwwValue } from './sync.js';

const DATA_BASE = 'resources/data/';

// --- loaded dataset (populated by loadData) ---
export const DB = { home:null, plants:[], roomById:{}, almanac:null, shippedRooms:[] };

// --- transient UI state shared across modules ---
export const UI = { view:'care', group:'light', openId:null, openTab:'overview',
                    arrange:false, build:false, editWater:null, dragId:null,
                    // room builder
                    selRoom:null, selWall:'top', wallSel:null, blockTool:'window' };

// Storage lives in store.js; re-exported so existing imports keep working.
export { Store } from './store.js';
export { loadJournal, saveJournal, mergeJournals, mergeIntoStored, exportJournal,
         parseImport, deviceId } from './sync.js';

// --- data loading (from separate JSON files) ---
export async function loadData(){
  const idx     = await (await fetch(DATA_BASE + 'index.json')).json();
  const home    = await (await fetch(DATA_BASE + idx.home)).json();
  const plants  = await Promise.all(idx.plants.map(p => fetch(DATA_BASE + p).then(r => r.json())));
  const almanac = idx.almanac ? await (await fetch(DATA_BASE + idx.almanac)).json() : null;
  DB.home = home;
  DB.plants = plants;
  DB.almanac = almanac;
  // Keep the shipped plan pristine; rooms.js layers builder edits over it.
  DB.shippedRooms = (home.rooms || []).map(r => JSON.parse(JSON.stringify(r)));
  DB.roomById = {};
  (home.rooms || []).forEach(r => { DB.roomById[r.id] = r; });
  loadJournal();          // migrates v1/v2 storage on first read
  return DB;
}

/* ---------------- journal-backed per-plant state ----------------
   Reads and writes go through sync.js so every mutation stays mergeable:
   entries get stable ids, deletes leave tombstones, and single-value fields
   carry a timestamp for last-write-wins. Callers never see the envelope.  */
export function journal(){ return loadJournal(); }
export function ps(id){ return pj(loadJournal(), id); }

// Mutate one plant's journal slot and persist. `fn` receives the slot.
export function editPlant(id, fn){
  const j = loadJournal(); const slot = pj(j, id);
  fn(slot); saveJournal(j); return slot;
}

const byTime = (a,b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
const alive = (slot, key) => {
  const dead = new Set((slot.dead || []).map(t => t.id));
  return (slot[key] || []).filter(e => !dead.has(e.id)).sort(byTime);
};

export function waterLog(id){ return alive(ps(id), 'water'); }
export function fedLog(id){ return alive(ps(id), 'fed'); }
export function notesLog(id){ return alive(ps(id), 'notes'); }

export function addEntry(id, key, data){
  const entry = { id:uid(), ...data };
  editPlant(id, s => { s[key] = [...(s[key] || []), entry]; });
  return entry;
}
export function updateEntry(id, key, entryId, patch){
  editPlant(id, s => {
    s[key] = (s[key] || []).map(e => e.id === entryId ? { ...e, ...patch } : e);
  });
}
// Deleting writes a tombstone as well as dropping the entry — otherwise a
// merge from the other device would resurrect it.
export function removeEntry(id, key, entryId){
  editPlant(id, s => {
    s[key] = (s[key] || []).filter(e => e.id !== entryId);
    s.dead = [...(s.dead || []), { id:entryId, at:new Date().toISOString() }];
  });
}

export function lastWatered(id){ const l = waterLog(id); return l.length ? l[l.length-1].t : null; }
export function lastFed(id){ const l = fedLog(id); return l.length ? l[l.length-1].t : null; }
export function hasHistory(id){ return waterLog(id).length > 0; }

/* ---------------- placement overlay ----------------
   placement = { room, wall, slot, order }; the shipped JSON location is the
   fallback for any plant the user has never moved. */
export function placement(p){
  const cell = ps(p.id).place, v = lwwValue(cell);
  return { room:p.location, wall:null, slot:null, order:null, ...(v || {}) };
}
export function setPlacement(id, patch){
  const cur = placement(plant(id));
  editPlant(id, s => { s.place = lww({ ...cur, ...patch }); });
}
export function loc(p){ return placement(p).room; }
export function room(p){ return DB.roomById[loc(p)] || null; }
export function movedPlants(){ return DB.plants.filter(p => loc(p) !== p.location); }

/* Plants with no room at all — they show up in the map tray asking to be
   placed. `null` is meaningful here and must not fall back to p.location. */
export function unplacedPlants(){ return DB.plants.filter(p => !loc(p)); }
export function plantsIn(roomId){
  return DB.plants.filter(p => loc(p) === roomId).sort((a, b) => {
    const A = placement(a), B = placement(b);
    // explicit slots first (wall order, then slot), then manual order, then id
    const ka = A.wall != null ? 0 : 1, kb = B.wall != null ? 0 : 1;
    if (ka !== kb) return ka - kb;
    if (A.wall !== B.wall) return String(A.wall) < String(B.wall) ? -1 : 1;
    if (A.slot !== B.slot) return (A.slot ?? 99) - (B.slot ?? 99);
    if ((A.order ?? 99) !== (B.order ?? 99)) return (A.order ?? 99) - (B.order ?? 99);
    return a.id < b.id ? -1 : 1;
  });
}

/* Dragging one pot onto another trades their positions outright — that's what
   makes "put SNO where BRA is" a single gesture, and it works whether the two
   are in fixed slots or just auto-ordered within a room. */
export function swapPlacement(idA, idB){
  const a = plant(idA), b = plant(idB); if (!a || !b) return;
  let pa = placement(a), pb = placement(b);

  // Two auto-placed pots have no stored position, so trading them would be a
  // no-op — the swap fires and nothing visibly moves. Materialise their
  // current display order first, then trade THAT.
  if (pa.wall == null && pb.wall == null && pa.room === pb.room && pa.room){
    const seq = plantsIn(pa.room);
    const ia = seq.findIndex(x => x.id === idA), ib = seq.findIndex(x => x.id === idB);
    if (ia >= 0 && ib >= 0){ pa = { ...pa, order: ia }; pb = { ...pb, order: ib }; }
  }

  setPlacement(idA, { room:pb.room, wall:pb.wall, slot:pb.slot, order:pb.order });
  setPlacement(idB, { room:pa.room, wall:pa.wall, slot:pa.slot, order:pa.order });
}

/* ---------------- shared pots ----------------
   Two plants in one container are one physical object: they move together,
   occupy one slot, and share a root zone. `pot` on the plant record groups
   them; a plant with no `pot` is its own pot. */
export function potId(p){
  // The journal can override which pot a plant belongs to, so repotting is a
  // two-click change rather than a JSON edit. `''` means "moved to its own pot"
  // and must not fall back to the shipped value.
  const v = lwwValue(ps(p.id).pot);
  const eff = v === undefined || v === null ? p.pot : v;
  return eff || ('solo:' + p.id);
}
export function setPot(id, potValue){ editPlant(id, s => { s.pot = lww(potValue); }); }

/* Take a plant out of a shared container and give it its own. */
export function splitFromPot(id){ setPot(id, ''); }

/* Put a plant into the same container as another. */
export function joinPot(id, otherId){
  const other = plant(otherId); if (!other) return;
  let group = potId(other);
  if (group.startsWith('solo:')){
    // the target is on its own — mint a real shared id and move it in too
    group = 'pot-' + Math.random().toString(36).slice(2, 8);
    setPot(otherId, group);
  }
  setPot(id, group);
  const o = plant(otherId), me = plant(id);
  setPlacement(id, { room: loc(o), wall: placement(o).wall,
                     slot: placement(o).slot, order: placement(o).order });
}
export function potMates(p){ return DB.plants.filter(q => potId(q) === potId(p)); }
export function sharesPot(p){ return potMates(p).length > 1; }

/* The plants standing in a room, collapsed to one entry per pot. */
export function potsIn(roomId){
  const seen = new Set(), out = [];
  plantsIn(roomId).forEach(p => {
    const k = potId(p);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ key:k, lead:p, members:potMates(p).filter(q => loc(q) === roomId) });
  });
  return out;
}

export function status(p){ const v = lwwValue(ps(p.id).status); return v || p.currentStatus; }
export function setStatus(id, txt){ editPlant(id, s => { s.status = lww(txt); }); }

// --- dates ---
export const DAY = 86400000;
export function today0(){ const d = new Date(); d.setHours(0,0,0,0); return d; }

// Everything funnels through toDate, because `new Date('2026-08-08')` parses a
// bare YYYY-MM-DD as UTC midnight — which is the *previous* day anywhere west
// of Greenwich. Date-only strings (weather log keys, <input type="date">) must
// be read as local midnight; full ISO timestamps are already unambiguous.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export function toDate(x){
  if (x instanceof Date) return new Date(x.getTime());
  if (typeof x === 'string' && DATE_ONLY.test(x)){
    const [y,m,d] = x.split('-').map(Number); return new Date(y, m-1, d);
  }
  return new Date(x);
}
export function day0(x){ const d = toDate(x); d.setHours(0,0,0,0); return d; }

// AP-style short dates — "Aug. 8", "May 3", "Sept. 12".
const MON = ['Jan.','Feb.','March','April','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
export function fmtDate(d){ const x = toDate(d); return `${MON[x.getMonth()]} ${x.getDate()}`; }
export function isoDay(d){ const x = toDate(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
// Parse a <input type="date"> value as LOCAL midnight.
export function parseDayInput(v){
  return (typeof v === 'string' && DATE_ONLY.test(v)) ? toDate(v) : null;
}
export function isSameDay(iso){
  if (!iso) return false;
  const d = toDate(iso), t = today0();
  return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate();
}
export function daysAgo(iso){ return Math.round((today0() - day0(iso)) / DAY); }
export function relDay(iso){
  const n = daysAgo(iso);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : n > 0 ? `${n} days ago` : `in ${-n} days`;
}

/* ---------------- watering cadence ----------------
   `interval` is the plant's own baseline. `effInterval` is that baseline scaled
   by where the plant is standing (room dryFactor) and by the weather actually
   recorded over the last week — a hot dry stretch shortens the gap, a cold damp
   one stretches it. Scheduling reads effInterval; the .ics export deliberately
   uses the stable baseline so calendar recurrence doesn't drift.            */
export function plant(id){ return DB.plants.find(p => p.id === id); }
export function interval(p){ return p.medium === 'water' ? 6 : p.waterDays; }

// weather.js installs the live multiplier here once its log is warm; until then
// everything behaves exactly as it did before.
export const Cadence = { weatherFactor: 1 };

export function effInterval(p){
  const r = room(p), rf = (r && r.climate && r.climate.dryFactor) || 1;
  const f = rf * (Cadence.weatherFactor || 1);
  return Math.max(2, Math.round(interval(p) / f));
}
export function nextCheck(p){
  const lw = lastWatered(p.id);
  // Never recorded → due now, so it surfaces in the backlog instead of hiding
  // behind a phantom "due in N days" counted from today.
  if (!lw) return today0();
  return new Date(day0(lw).getTime() + effInterval(p)*DAY);
}
export function daysUntil(p){ return Math.round((nextCheck(p) - today0()) / DAY); }
export function actWord(p){ return p.medium === 'water' ? 'Refresh' : 'Water'; }
export function isWateredToday(id){ return isSameDay(lastWatered(id)); }
export function isFedToday(id){ return isSameDay(lastFed(id)); }

// Backlog = never recorded, or so far past due that you probably watered it
// and forgot to mark it.
export function isBacklog(p){
  if (!hasHistory(p.id)) return true;
  return daysUntil(p) < -Math.max(2, Math.round(effInterval(p) * 0.5));
}
