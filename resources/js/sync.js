// ===========================================================================
// sync.js — the journal: everything YOU produce, in a shape that can be merged
// instead of overwritten.
//
// WHY THIS EXISTS
// The app runs from two origins — https://…github.io (phone) and
// http://localhost (XAMPP). Browsers scope localStorage per origin, so those
// are two independent journals that can never see each other. If moving data
// between them were a file swap, whichever copy you imported last would erase
// the other — exactly the "local is a month behind, don't blow up my watering
// data" problem.
//
// So the journal is a small CRDT instead:
//   • every entry carries a stable `id`; merging is a UNION by id, so a
//     watering recorded on your phone survives an import from your laptop
//   • deleting writes a TOMBSTONE, so a delete on one device doesn't get
//     resurrected by a merge from the other
//   • same-day duplicates of the same event collapse to one (you didn't water
//     it twice, two devices just both recorded it)
//   • single-value fields (placement, status) are last-write-wins on a
//     timestamp, tie-broken by device id
//
// Merge is deterministic, commutative and idempotent: merge(a,b) == merge(b,a),
// and merging twice changes nothing. Both devices converge on the same journal
// no matter which order things arrive in.
//
// AUTHORED CONTENT (rooms, care facts, sprites) is NOT journal data — it lives
// in resources/data/*.json, is version-controlled, and is written by the room
// and plant builders through persist.js.
// ===========================================================================
import { Store } from './store.js';

export const JOURNAL_KEY = 'alpj_journal';
export const JOURNAL_V = 3;
const LEGACY_KEY = 'alpj_state';

/* ---------------- ids ---------------- */
// randomUUID needs a secure context; plain http:// on a LAN address won't have
// it, so fall back to something collision-safe enough for one person's plants.
export function uid(){
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function deviceId(){
  let d = Store.get('alpj_device');
  if (!d){ d = 'dev_' + uid().slice(0, 8); Store.set('alpj_device', d); }
  return d;
}

/* ---------------- envelope ---------------- */
export function emptyJournal(){
  return { v:JOURNAL_V, device:deviceId(), plants:{}, rooms:{}, updatedAt:new Date().toISOString() };
}

export function loadJournal(){
  let j = Store.get(JOURNAL_KEY);
  if (!j || j.v !== JOURNAL_V){
    j = migrate(j);
    if (j) Store.set(JOURNAL_KEY, j);
  }
  return j || emptyJournal();
}

export function saveJournal(j){
  j.updatedAt = new Date().toISOString();
  j.device = j.device || deviceId();
  Store.set(JOURNAL_KEY, j);
  return j;
}

/* Per-plant slot, created on demand. */
export function pj(j, id){
  if (!j.plants[id]) j.plants[id] = { water:[], fed:[], notes:[], dead:[] };
  const e = j.plants[id];
  e.water = e.water || []; e.fed = e.fed || []; e.notes = e.notes || []; e.dead = e.dead || [];
  return e;
}

/* ---------------- LWW scalars ---------------- */
export function lww(value){ return { v:value, at:new Date().toISOString(), by:deviceId() }; }
export function lwwValue(cell){ return cell && typeof cell === 'object' && 'v' in cell ? cell.v : undefined; }

// Deterministic pick: newer timestamp wins; identical timestamps tie-break on
// device id so two devices never disagree about the outcome.
function pickLww(a, b){
  if (!a) return b; if (!b) return a;
  const ta = a.at || '', tb = b.at || '';
  if (ta !== tb) return ta > tb ? a : b;
  return (a.by || '') <= (b.by || '') ? a : b;
}

/* ---------------- log merge ---------------- */
const dayOf = (t) => String(t || '').slice(0, 10);

function mergeLog(a = [], b = [], dead = new Set(), collapseByDay = true){
  const byId = new Map();
  [...a, ...b].forEach(e => {
    if (!e || !e.id || dead.has(e.id)) return;
    const prev = byId.get(e.id);
    // same id from both sides: keep the richer record (a backfilled weather
    // stamp or an edited date shouldn't be lost)
    byId.set(e.id, prev ? { ...prev, ...e } : e);
  });
  let out = [...byId.values()];
  if (collapseByDay){
    // Two devices recording the same day is one event, not two. Keep the
    // smallest id for a deterministic result on both sides.
    const perDay = new Map();
    out.forEach(e => {
      const k = dayOf(e.t), cur = perDay.get(k);
      if (!cur || String(e.id) < String(cur.id)) perDay.set(k, e);
    });
    out = [...perDay.values()];
  }
  return out.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
}

function mergeTombs(a = [], b = []){
  const m = new Map();
  [...a, ...b].forEach(t => { if (t && t.id) m.set(t.id, t); });
  return [...m.values()];
}

/* ---------------- the merge ---------------- */
export function mergeJournals(a, b){
  if (!a) return b ? JSON.parse(JSON.stringify(b)) : emptyJournal();
  if (!b) return JSON.parse(JSON.stringify(a));

  const out = { v:JOURNAL_V, device:deviceId(), plants:{}, rooms:{},
                updatedAt:new Date().toISOString() };

  const ids = new Set([...Object.keys(a.plants || {}), ...Object.keys(b.plants || {})]);
  ids.forEach(id => {
    const pa = (a.plants || {})[id] || {}, pb = (b.plants || {})[id] || {};
    const dead = mergeTombs(pa.dead, pb.dead);
    const deadIds = new Set(dead.map(t => t.id));
    const e = {
      water: mergeLog(pa.water, pb.water, deadIds, true),
      fed:   mergeLog(pa.fed,   pb.fed,   deadIds, true),
      notes: mergeLog(pa.notes, pb.notes, deadIds, false),
      dead
    };
    const place = pickLww(pa.place, pb.place); if (place) e.place = place;
    const status = pickLww(pa.status, pb.status); if (status) e.status = status;
    out.plants[id] = e;
  });

  const rids = new Set([...Object.keys(a.rooms || {}), ...Object.keys(b.rooms || {})]);
  rids.forEach(id => {
    const cell = pickLww((a.rooms || {})[id], (b.rooms || {})[id]);
    if (cell) out.rooms[id] = cell;
  });

  return out;
}

/* Merge an incoming journal into the stored one and persist the result. */
export function mergeIntoStored(incoming){
  const before = loadJournal();
  const merged = mergeJournals(before, incoming);
  saveJournal(merged);
  return { merged, stats: diffStats(before, merged) };
}

/* What did a merge actually bring in? Used for the import toast. */
export function diffStats(before, after){
  const count = (j) => Object.values(j.plants || {})
    .reduce((n, p) => n + (p.water?.length || 0) + (p.fed?.length || 0) + (p.notes?.length || 0), 0);
  const b = count(before), a = count(after);
  return { added: Math.max(0, a - b), before: b, after: a,
           plants: Object.keys(after.plants || {}).length };
}

/* ---------------- migration ----------------
   v1  : { MON: { lastWatered, prevWatered, lastFed, log } }
   v2  : { MON: { waterLog:[{t,kind,wx}], fedLog:[{t}], location, log, _v:2 } }
   v3  : this module's envelope — entries carry ids, placement is LWW.
   Nothing is discarded; the v2 blob is kept under a backup key just in case. */
export function migrate(old){
  const legacy = old || Store.get(LEGACY_KEY);
  if (!legacy) return null;
  if (legacy.v === JOURNAL_V) return legacy;

  Store.set('alpj_state_backup', legacy);
  const j = emptyJournal();
  const stamp = new Date(0).toISOString();   // ancient, so any later edit wins

  Object.entries(legacy).forEach(([id, e]) => {
    if (!e || typeof e !== 'object' || id === 'v') return;
    const slot = pj(j, id);

    const water = Array.isArray(e.waterLog) ? e.waterLog
      : [e.prevWatered, e.lastWatered].filter(Boolean).map(t => ({ t }));
    slot.water = water.filter(Boolean).map(w => ({ id:uid(), t:w.t, kind:w.kind || 'water',
                                                   wx:w.wx, backdated:w.backdated }));

    const fed = Array.isArray(e.fedLog) ? e.fedLog : [e.lastFed].filter(Boolean).map(t => ({ t }));
    slot.fed = fed.filter(Boolean).map(f => ({ id:uid(), t:f.t }));

    slot.notes = (e.log || []).map(n => ({ id:uid(), t:n.t, txt:n.txt }));

    if (e.location) slot.place = { v:{ room:e.location }, at:stamp, by:'migrated' };
    if (e.status)   slot.status = { v:e.status, at:stamp, by:'migrated' };
  });

  return j;
}

/* ---------------- portable file ---------------- */
export function exportJournal(){
  const j = loadJournal();
  return { kind:'alpj-journal', v:JOURNAL_V, exported:new Date().toISOString(),
           device:j.device, journal:j };
}

export function parseImport(text){
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
  const j = data.journal || data;
  if (!j || typeof j !== 'object' || !j.plants) throw new Error('That file has no journal in it.');
  if (j.v && j.v !== JOURNAL_V) {
    const m = migrate(j);
    if (m) return m;
  }
  return j;
}
