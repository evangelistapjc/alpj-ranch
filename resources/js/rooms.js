// ===========================================================================
// rooms.js — the apartment as editable geometry.
//
// The shipped floor plan in home.json stays pristine. Every edit is stored as
// an LWW cell in journal.rooms and layered on top at read time, exactly like
// plant placement, so room edits sync between devices on the same merge rules.
// A cell holds a partial override, a whole new room, or {deleted:true} as a
// tombstone — without the tombstone, deleting a room here would be undone by
// the next merge from the other device.
//
// WALLS ARE ADDRESSED IN CHUNKS
// A wall is `w` (top/bottom) or `h` (left/right) grid chunks long. A window or
// door occupies a half-open range [from, to) in wall-local chunk coordinates:
//
//     top / bottom   chunk i  <->  absolute x = room.x + i   (runs left to right)
//     left / right   chunk i  <->  absolute y = room.y + i   (runs top to bottom)
//
// SEGMENTS
// One wall can border several rooms. The bedroom's east wall runs past both the
// living room and the patio; its north wall meets the closet for part of its
// length and open hallway for the rest. `wallSegments()` partitions a wall by
// which room (if any) is on the far side, so each stretch can be configured
// independently — that's what makes two doors on one wall possible.
//
// PAIRING
// A door between two rooms is one hole in one wall. Adding it from either side
// writes a mirrored feature to the neighbour, linked by `pairId`, and removing
// either end removes both. Otherwise you get a door that exists in the bedroom
// and not in the closet.
// ===========================================================================
import { DB } from './state.js';
import { loadJournal, saveJournal, lww, lwwValue } from './sync.js';
import { edgeFacing } from './sun.js';

export const MIN_W = 2, MIN_H = 2;
export const WALLS = ['top', 'right', 'bottom', 'left'];
export const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/* ---------------- overlay resolution ---------------- */
export function roomOverrides(){ return loadJournal().rooms || {}; }

export function resolveRooms(){
  const over = roomOverrides();
  const shipped = DB.shippedRooms || [];
  const out = [];

  shipped.forEach(r => {
    const v = lwwValue(over[r.id]);
    if (v && v.deleted) return;
    out.push(v ? { ...r, ...v } : { ...r });
  });

  Object.keys(over).forEach(id => {
    const v = lwwValue(over[id]);
    if (!v || v.deleted) return;
    if (shipped.some(r => r.id === id)) return;
    out.push({ ...v, id });
  });

  return out;
}

export function applyRooms(){
  DB.home.rooms = resolveRooms();
  DB.roomById = {};
  DB.home.rooms.forEach(r => { DB.roomById[r.id] = r; });
  return DB.home.rooms;
}

export function patchRoom(id, patch){
  const j = loadJournal();
  j.rooms = j.rooms || {};
  const cur = lwwValue(j.rooms[id]) || {};
  j.rooms[id] = lww({ ...cur, ...patch });
  saveJournal(j);
  return applyRooms();
}

/* Several rooms in one transaction — a paired door touches two rooms, and
   writing them separately would leave a half-applied state if anything threw. */
export function patchRooms(patches){
  const j = loadJournal();
  j.rooms = j.rooms || {};
  Object.entries(patches).forEach(([id, patch]) => {
    const cur = lwwValue(j.rooms[id]) || {};
    j.rooms[id] = lww({ ...cur, ...patch });
  });
  saveJournal(j);
  return applyRooms();
}

export function deleteRoom(id){ return patchRoom(id, { deleted: true }); }
export function roomsEdited(){ return Object.keys(roomOverrides()).length; }

export function addRoom(partial){
  const id = partial.id || uniqueId(partial.name || 'room');
  const shipped = (DB.shippedRooms || []).find(r => r.id === id);
  const base = {
    id, name: partial.name || 'New Room',
    x: 0, y: 0, w: 6, h: 6, floor: 'wood', light: 2,
    windows: [], doors: [], note: '', deleted: false,
    climate: { tempF: [65, 70], humidityPct: [45, 55], airflow: 'calm', dryFactor: 1,
               note: 'New room — adjust its microclimate as you learn it.' },
    sun: { hoursAug: 0, quality: 'unknown', note: 'Not characterised yet.' }
  };
  patchRoom(id, shipped ? { ...partial, deleted: false } : { ...base, ...partial });
  return id;
}

export function uniqueId(name){
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
  const taken = new Set((DB.home.rooms || []).map(r => r.id)
    .concat(Object.keys(roomOverrides()))
    .concat((DB.shippedRooms || []).map(r => r.id)));
  if (!taken.has(slug)) return slug;
  let n = 2; while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/* ---------------- geometry ---------------- */
export function rectOf(r){ return { x:r.x, y:r.y, w:r.w, h:r.h }; }

export function rectsOverlap(a, b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* Would this rect land on top of another room? Rooms may touch edge-to-edge —
   that is how they share walls — but must never intersect. */
export function collides(rect, exceptId){
  return (DB.home.rooms || []).some(r => r.id !== exceptId && rectsOverlap(rect, r));
}

export function clampRect(r){
  const g = DB.home.grid;
  const w = Math.max(MIN_W, Math.min(g.cols, Math.round(r.w)));
  const h = Math.max(MIN_H, Math.min(g.rows, Math.round(r.h)));
  return {
    x: Math.max(0, Math.min(g.cols - w, Math.round(r.x))),
    y: Math.max(0, Math.min(g.rows - h, Math.round(r.y))),
    w, h
  };
}

/* A move is only committed if it fits AND is clear of every other room.
   Returns the accepted rect, or null when the move would overlap — which is
   what stops the Bath from being dropped inside the Living Room. */
export function tryMove(id, rect){
  const next = clampRect(rect);
  if (collides(next, id)) return null;
  return next;
}

/* How far a wall can travel before it hits the house edge or another room.
   Returns {min, max} as a signed delta in chunks (positive = right/down), so a
   drag can be clamped to a legal range instead of simply refusing the move —
   which is what made resizing feel like it only ever moved one step. */
export function resizeLimits(room, wall){
  const g = DB.home.grid;
  const others = (DB.home.rooms || []).filter(r => r.id !== room.id);
  const overlapsPerp = (o) => (wall === 'top' || wall === 'bottom')
    ? (o.x < room.x + room.w && o.x + o.w > room.x)
    : (o.y < room.y + room.h && o.y + o.h > room.y);
  const near = others.filter(overlapsPerp);

  if (wall === 'right'){
    const blockers = near.filter(o => o.x >= room.x + room.w).map(o => o.x);
    const limit = blockers.length ? Math.min(...blockers) : g.cols;
    return { min: MIN_W - room.w, max: limit - (room.x + room.w) };
  }
  if (wall === 'left'){
    const blockers = near.filter(o => o.x + o.w <= room.x).map(o => o.x + o.w);
    const limit = blockers.length ? Math.max(...blockers) : 0;
    return { min: limit - room.x, max: room.w - MIN_W };
  }
  if (wall === 'bottom'){
    const blockers = near.filter(o => o.y >= room.y + room.h).map(o => o.y);
    const limit = blockers.length ? Math.min(...blockers) : g.rows;
    return { min: MIN_H - room.h, max: limit - (room.y + room.h) };
  }
  const blockers = near.filter(o => o.y + o.h <= room.y).map(o => o.y + o.h);
  const limit = blockers.length ? Math.max(...blockers) : 0;
  return { min: limit - room.y, max: room.h - MIN_H };
}

/* Apply a wall delta already clamped to resizeLimits(). */
export function rectAfterResize(room, wall, delta){
  const d = Math.round(delta);
  let { x, y, w, h } = room;
  if (wall === 'left')        { x += d; w -= d; }
  else if (wall === 'right')  { w += d; }
  else if (wall === 'top')    { y += d; h -= d; }
  else                        { h += d; }
  return { x, y, w, h };
}

/* Closest position where `rect` fits, searched outward from where it was
   dropped. Used when a new room lands on top of everything, so it settles
   somewhere usable instead of being stuck and undraggable. */
export function nearestFreeRect(rect, exceptId){
  const g = DB.home.grid;
  const fit = (x, y) => x >= 0 && y >= 0 && x + rect.w <= g.cols && y + rect.h <= g.rows
    && !collides({ x, y, w: rect.w, h: rect.h }, exceptId);
  if (fit(rect.x, rect.y)) return { ...rect };
  const span = Math.max(g.cols, g.rows);
  for (let r = 1; r <= span; r++){
    for (let dy = -r; dy <= r; dy++){
      for (let dx = -r; dx <= r; dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // ring only
        const x = rect.x + dx, y = rect.y + dy;
        if (fit(x, y)) return { x, y, w: rect.w, h: rect.h };
      }
    }
  }
  return null;
}

/* Resize by dragging ONE wall. The opposite wall stays put, so dragging the
   top edge changes y and h together rather than only h. */
export function resizeByWall(room, wall, deltaChunks){
  const d = Math.round(deltaChunks);
  let { x, y, w, h } = room;
  if (wall === 'left')   { const nx = x + d; const nw = w - d; if (nw < MIN_W) return null; x = nx; w = nw; }
  else if (wall === 'right')  { const nw = w + d; if (nw < MIN_W) return null; w = nw; }
  else if (wall === 'top')    { const ny = y + d; const nh = h - d; if (nh < MIN_H) return null; y = ny; h = nh; }
  else                        { const nh = h + d; if (nh < MIN_H) return null; h = nh; }

  const g = DB.home.grid;
  if (x < 0 || y < 0 || x + w > g.cols || y + h > g.rows) return null;
  const next = { x, y, w, h };
  if (collides(next, room.id)) return null;
  return next;
}

/* ---------------- walls ---------------- */
export function wallLength(room, wall){
  return (wall === 'top' || wall === 'bottom') ? room.w : room.h;
}

/* Absolute grid coordinate of wall-local chunk i. */
export function chunkOrigin(room, wall){
  return (wall === 'top' || wall === 'bottom') ? room.x : room.y;
}

/* Rooms sharing this wall line, with the span they cover. */
function neighboursOn(room, wall){
  const others = (DB.home.rooms || []).filter(r => r.id !== room.id);
  const out = [];
  others.forEach(o => {
    let touches = false;
    if (wall === 'top')         touches = (o.y + o.h === room.y);
    else if (wall === 'bottom') touches = (o.y === room.y + room.h);
    else if (wall === 'left')   touches = (o.x + o.w === room.x);
    else                        touches = (o.x === room.x + room.w);
    if (!touches) return;
    // overlap along the wall's own axis
    const [a1, a2] = (wall === 'top' || wall === 'bottom')
      ? [room.x, room.x + room.w] : [room.y, room.y + room.h];
    const [b1, b2] = (wall === 'top' || wall === 'bottom')
      ? [o.x, o.x + o.w] : [o.y, o.y + o.h];
    const from = Math.max(a1, b1), to = Math.min(a2, b2);
    if (to > from) out.push({ id: o.id, from, to });
  });
  return out;
}

/* Partition a wall into runs by which room lies beyond it.
   Returns [{ from, to, neighbor:id|null, exterior:bool }] in LOCAL chunks. */
export function wallSegments(room, wall){
  const len = wallLength(room, wall);
  const origin = chunkOrigin(room, wall);
  const nbrs = neighboursOn(room, wall);

  const per = new Array(len).fill(null);
  nbrs.forEach(n => {
    for (let a = n.from; a < n.to; a++){
      const i = a - origin;
      if (i >= 0 && i < len) per[i] = n.id;
    }
  });

  const g = DB.home.grid;
  const onBoundary =
    (wall === 'top'    && room.y === 0) ||
    (wall === 'bottom' && room.y + room.h === g.rows) ||
    (wall === 'left'   && room.x === 0) ||
    (wall === 'right'  && room.x + room.w === g.cols);

  const segs = [];
  let i = 0;
  while (i < len){
    const who = per[i];
    let j = i;
    while (j < len && per[j] === who) j++;
    segs.push({ from: i, to: j, neighbor: who, exterior: who === null && onBoundary });
    i = j;
  }
  return segs;
}

/* True only if NOTHING borders this wall anywhere along it. Kept for the
   coarse "is this an outside wall" question; per-stretch answers come from
   wallSegments(). */
export function wallIsExterior(room, wall){
  return wallSegments(room, wall).every(s => s.neighbor === null);
}

export function segmentAt(room, wall, chunk){
  return wallSegments(room, wall).find(s => chunk >= s.from && chunk < s.to) || null;
}

/* ---------------- features (windows + doors) ---------------- */
export function featuresOn(room, wall){
  const win = (room.windows || []).filter(w => w.edge === wall)
    .map(w => ({ ...w, kind: 'window' }));
  const dor = (room.doors || []).filter(d => d.edge === wall)
    .map(d => ({ ...d, kind: 'door' }));
  return [...win, ...dor].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
}

export function hasWindow(room, wall){ return (room.windows || []).some(w => w.edge === wall); }
export function hasDoor(room, wall){ return (room.doors || []).some(d => d.edge === wall); }

/* Chunk occupied by any feature already? Used to stop overlapping placements. */
export function chunkBusy(room, wall, chunk){
  return featuresOn(room, wall).some(f => chunk >= (f.from ?? 0) && chunk < (f.to ?? 0));
}

function newId(){
  try { if (crypto?.randomUUID) return crypto.randomUUID().slice(0, 8); } catch (e) {}
  return 'f' + Math.random().toString(36).slice(2, 8);
}

/* Translate a local chunk range on room/wall into the neighbour's local range
   on its opposing wall. Both walls sit on the same line, so this is just a
   change of origin. */
function mirrorRange(room, wall, from, to, neighbor){
  const o = DB.roomById[neighbor]; if (!o) return null;
  const absFrom = chunkOrigin(room, wall) + from;
  const absTo   = chunkOrigin(room, wall) + to;
  const oWall = OPPOSITE[wall];
  const oOrigin = chunkOrigin(o, oWall);
  const f = absFrom - oOrigin, t = absTo - oOrigin;
  const len = wallLength(o, oWall);
  const cf = Math.max(0, f), ct = Math.min(len, t);
  if (ct <= cf) return null;
  return { room: o, wall: oWall, from: cf, to: ct };
}

/* Add a window or door across [from, to) on a wall.
   A feature on a shared stretch is written to BOTH rooms and linked by pairId. */
export function addFeature(roomId, wall, from, to, kind, opts = {}){
  const room = DB.roomById[roomId]; if (!room) return null;
  const len = wallLength(room, wall);
  const f = Math.max(0, Math.min(len - 1, Math.min(from, to)));
  const t = Math.min(len, Math.max(from, to) + (from === to ? 1 : 0));
  if (t <= f) return null;

  const pairId = newId();
  const patches = {};

  const mk = (r, wl, ff, tt) => {
    const base = { edge: wl, from: ff, to: tt, pairId };
    if (kind === 'window'){
      return { ...base, direct: !!opts.direct,
               facing: opts.facing != null ? opts.facing : edgeFacing(DB.home.orientation, wl),
               spread: opts.spread ?? 75, obstruction: opts.obstruction ?? 10 };
    }
    return base;
  };

  const key = kind === 'window' ? 'windows' : 'doors';
  patches[roomId] = { [key]: [...(room[key] || []), mk(room, wall, f, t)] };

  // pair across every neighbour this range actually touches
  wallSegments(room, wall).forEach(seg => {
    if (!seg.neighbor) return;
    const ovFrom = Math.max(seg.from, f), ovTo = Math.min(seg.to, t);
    if (ovTo <= ovFrom) return;
    const m = mirrorRange(room, wall, ovFrom, ovTo, seg.neighbor);
    if (!m) return;
    const existing = patches[seg.neighbor]?.[key] || m.room[key] || [];
    patches[seg.neighbor] = { [key]: [...existing, mk(m.room, m.wall, m.from, m.to)] };
  });

  patchRooms(patches);
  return pairId;
}

/* Remove a feature by pairId — both ends of a shared door go together. */
export function removeFeature(pairId){
  const patches = {};
  (DB.home.rooms || []).forEach(r => {
    const win = (r.windows || []).filter(w => w.pairId !== pairId);
    const dor = (r.doors || []).filter(d => d.pairId !== pairId);
    if (win.length !== (r.windows || []).length || dor.length !== (r.doors || []).length){
      patches[r.id] = { windows: win, doors: dor };
    }
  });
  if (Object.keys(patches).length) patchRooms(patches);
}

/* Strip every feature from one wall (and the far side of any shared stretch).
   The wall itself always remains — you can empty it, never delete it. */
export function clearWall(roomId, wall){
  const room = DB.roomById[roomId]; if (!room) return;
  const doomed = new Set(featuresOn(room, wall).map(f => f.pairId).filter(Boolean));
  const patches = {};
  patches[roomId] = {
    windows: (room.windows || []).filter(w => w.edge !== wall),
    doors:   (room.doors   || []).filter(d => d.edge !== wall)
  };
  (DB.home.rooms || []).forEach(r => {
    if (r.id === roomId) return;
    const win = (r.windows || []).filter(w => !doomed.has(w.pairId));
    const dor = (r.doors   || []).filter(d => !doomed.has(d.pairId));
    if (win.length !== (r.windows || []).length || dor.length !== (r.doors || []).length){
      patches[r.id] = { windows: win, doors: dor };
    }
  });
  patchRooms(patches);
}

export function toggleWindowDirect(pairId){
  const patches = {};
  (DB.home.rooms || []).forEach(r => {
    if (!(r.windows || []).some(w => w.pairId === pairId)) return;
    patches[r.id] = { windows: r.windows.map(w =>
      w.pairId === pairId ? { ...w, direct: !w.direct } : w) };
  });
  if (Object.keys(patches).length) patchRooms(patches);
}

/* --- legacy shims, kept so older call sites keep working --- */
export function toggleWindow(roomId, wall){
  const room = DB.roomById[roomId]; if (!room) return;
  if (hasWindow(room, wall)) return clearWall(roomId, wall);
  const len = wallLength(room, wall);
  const f = Math.floor(len * 0.25), t = Math.max(f + 1, Math.ceil(len * 0.75));
  addFeature(roomId, wall, f, t, 'window');
}
export function toggleDoor(roomId, wall){
  const room = DB.roomById[roomId]; if (!room) return;
  const existing = (room.doors || []).find(d => d.edge === wall);
  if (existing) return removeFeature(existing.pairId);
  const len = wallLength(room, wall);
  const mid = Math.floor(len / 2);
  addFeature(roomId, wall, Math.max(0, mid - 1), Math.min(len, mid + 2), 'door');
}
export function cycleWindowSun(roomId, wall){
  const room = DB.roomById[roomId]; if (!room) return;
  const w = (room.windows || []).find(x => x.edge === wall);
  if (w) toggleWindowDirect(w.pairId);
}
