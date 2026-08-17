// ===========================================================================
// rooms.js — the apartment as editable data.
//
// The shipped floor plan in home.json stays pristine. Every edit you make in
// the builder is stored as an LWW cell in journal.rooms and layered on top at
// read time, exactly like plant placement. That keeps the two sync paths
// identical and means "Reset apartment" is just clearing those cells.
//
// A cell holds a partial room override, a whole new room, or {deleted:true}
// as a tombstone. Tombstones matter for the same reason they do in sync.js:
// without one, deleting a shipped room on this device would be undone by the
// next merge from the other.
//
// resolveRooms() folds all of that into a plain array and writes it back to
// DB.home.rooms, so every existing reader — the map, the sun model, grouping,
// climate scoring — keeps working untouched.
// ===========================================================================
import { DB } from './state.js';
import { loadJournal, saveJournal, lww, lwwValue } from './sync.js';
import { edgeFacing } from './sun.js';

export const MIN_W = 2, MIN_H = 2;

export function roomOverrides(){ return loadJournal().rooms || {}; }

export function resolveRooms(){
  const over = roomOverrides();
  const shipped = DB.shippedRooms || [];
  const out = [];

  shipped.forEach(r => {
    const v = lwwValue(over[r.id]);
    if (v && v.deleted) return;                 // tombstoned
    out.push(v ? { ...r, ...v } : { ...r });
  });

  // rooms the builder created (no shipped counterpart)
  Object.keys(over).forEach(id => {
    const v = lwwValue(over[id]);
    if (!v || v.deleted) return;
    if (shipped.some(r => r.id === id)) return;
    out.push({ ...v, id });
  });

  return out;
}

/* Recompute DB.home.rooms + DB.roomById from shipped data plus overrides. */
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

export function deleteRoom(id){ return patchRoom(id, { deleted: true }); }

export function addRoom(partial){
  const id = partial.id || uniqueId(partial.name || 'room');
  const shipped = (DB.shippedRooms || []).find(r => r.id === id);
  const base = {
    id, name: partial.name || 'New Room',
    x: 0, y: 0, w: 3, h: 3, floor: 'wood', light: 2,
    windows: [], note: '', deleted: false,
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

/* Clamp a room to the grid and enforce a minimum footprint. */
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

/* ---------------- walls ----------------
   A wall segment is exterior when nothing sits on the far side of it. That
   distinction drives what a wall can carry: windows belong on exterior walls,
   doorways on interior ones. The builder still lets you put either anywhere —
   it just labels which is which so the sun model is not fed a "window" that
   actually faces the hallway. */
export function wallIsExterior(room, wall){
  const g = DB.home.grid;
  const others = (DB.home.rooms || []).filter(r => r.id !== room.id);
  const span = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

  if (wall === 'top'){
    if (room.y === 0) return true;
    return !others.some(o => o.y + o.h === room.y && span(o.x, o.x + o.w, room.x, room.x + room.w) > 0);
  }
  if (wall === 'bottom'){
    if (room.y + room.h === g.rows) return true;
    return !others.some(o => o.y === room.y + room.h && span(o.x, o.x + o.w, room.x, room.x + room.w) > 0);
  }
  if (wall === 'left'){
    if (room.x === 0) return true;
    return !others.some(o => o.x + o.w === room.x && span(o.y, o.y + o.h, room.y, room.y + room.h) > 0);
  }
  if (room.x + room.w === g.cols) return true;
  return !others.some(o => o.x === room.x + room.w && span(o.y, o.y + o.h, room.y, room.y + room.h) > 0);
}

export function hasWindow(room, wall){ return (room.windows || []).some(w => w.edge === wall); }
export function hasDoor(room, wall){ return (room.doors || []).some(d => d.edge === wall); }

/* Adding a window stamps the compass facing from the plan's orientation, so a
   builder-made window feeds sun.js with no extra step. */
export function toggleWindow(roomId, wall){
  const r = DB.roomById[roomId]; if (!r) return;
  const wins = (r.windows || []).slice();
  const at = wins.findIndex(w => w.edge === wall);
  if (at >= 0) wins.splice(at, 1);
  else wins.push({ edge: wall, direct: false, spread: 75, obstruction: 10,
                   facing: edgeFacing(DB.home.orientation, wall) });
  patchRoom(roomId, { windows: wins });
}
export function toggleDoor(roomId, wall){
  const r = DB.roomById[roomId]; if (!r) return;
  const doors = (r.doors || []).slice();
  const at = doors.findIndex(d => d.edge === wall);
  if (at >= 0) doors.splice(at, 1); else doors.push({ edge: wall });
  patchRoom(roomId, { doors });
}
export function cycleWindowSun(roomId, wall){
  const r = DB.roomById[roomId]; if (!r) return;
  const wins = (r.windows || []).map(w => w.edge === wall ? { ...w, direct: !w.direct } : w);
  patchRoom(roomId, { windows: wins });
}

export function roomsEdited(){ return Object.keys(roomOverrides()).length; }
