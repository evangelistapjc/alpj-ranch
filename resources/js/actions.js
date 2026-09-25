// ===========================================================================
// actions.js — everything a user does. Mutates state, flips views, then asks
// views.js to re-render. events.js is the only caller.
// ===========================================================================
import { DB, UI, Store, today0, day0, isoDay, parseDayInput, isSameDay,
         fmtDate, relDay, nextCheck, interval, actWord, DAY, plant, waterLog,
         fedLog, addEntry, updateEntry, removeEntry, lastWatered,
         loc, room, movedPlants, setPlacement,
         exportJournal, parseImport, mergeIntoStored, loadJournal,
         saveJournal, swapPlacement, plantsIn, unplacedPlants,
         placement, potMates, sharesPot, splitFromPot, joinPot } from './state.js';
import { renderCare, renderGrove, renderHomeMap, renderWeather, renderAlmanac,
         renderModalTabs, renderModalBody, logHTML, roomAt, slotAt,
         renderTray, sprite as spriteFor } from './views.js';
import { currentWx } from './weather.js';
import { assess, VERDICT } from './climate.js';
import { applyRooms, patchRoom, deleteRoom as rmRoom, addRoom, clampRect,
         tryMove, resizeByWall, wallSegments, wallLength, addFeature,
         removeFeature, clearWall, toggleWindowDirect, chunkBusy,
         resizeLimits, rectAfterResize, nearestFreeRect, collides,
         featuresOn } from './rooms.js';

const $ = (id) => document.getElementById(id);

/* ---------------- toast ---------------- */
export function toast(m){
  const t = $('toast'); if (!t) return;
  t.textContent = m; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/* Repaint whatever is currently on screen after a mutation. */
function refresh(id){
  renderCare();
  if (UI.view === 'weather') renderWeather();
  if (UI.view === 'home') renderHomeMap();
  if (UI.openId === id || id == null) renderModalBody();
}

/* ---------------- watering / feeding ----------------
   Both are now append-only histories. "Mark watered today" pushes an entry
   stamped with the weather it happened in; tapping again removes today's
   entry, which is the same undo the single-timestamp version offered but
   without losing everything before it.                                    */
export function toggleWatered(id){
  const p = plant(id);
  const todays = waterLog(id).filter(e => isSameDay(e.t));
  if (todays.length){
    todays.forEach(e => removeEntry(id, 'water', e.id));
    toast(`↩️ ${p.name} undone`);
  } else {
    addEntry(id, 'water', { t: today0().toISOString(),
                            kind: p.medium === 'water' ? 'refresh' : 'water', wx: currentWx() });
    toast(`${p.medium==='water'?'🔄':'💧'} ${p.name} — next ${fmtDate(nextCheck(p))}`);
  }
  refresh(id);
}
export function toggleFed(id){
  const p = plant(id);
  const todays = fedLog(id).filter(e => isSameDay(e.t));
  if (todays.length){
    todays.forEach(e => removeEntry(id, 'fed', e.id));
    toast('↩️ feeding unmarked');
  } else {
    addEntry(id, 'fed', { t: today0().toISOString() });
    toast(`🍽️ ${p.name} fertilized`);
  }
  refresh(id);
}

/* --- backdating: "I watered it 3 days ago, I just never marked it" --- */
function readDate(srcId){
  const el = $(srcId); if (!el) return null;
  const d = parseDayInput(el.value);
  if (!d){ toast('📅 Pick a date first'); return null; }
  if (d > today0()){ toast('📅 That date is in the future'); return null; }
  return d;
}
export function addWatering(id, srcId){
  const d = readDate(srcId); if (!d) return;
  const p = plant(id);
  if (waterLog(id).some(e => day0(e.t).getTime() === d.getTime())){
    toast('📅 Already logged for that day'); return;
  }
  addEntry(id, 'water', { t: d.toISOString(),
                          kind: p.medium === 'water' ? 'refresh' : 'water', backdated:true });
  UI.editWater = null;
  toast(`📅 ${p.name} — logged ${fmtDate(d)} (${relDay(d)})`);
  refresh(id);
}
// Entries are addressed by id, not index — an index would be wrong the moment
// a merge reorders the log.
export function editWatering(entryId){ UI.editWater = entryId; renderModalBody(); }
export function cancelEdit(){ UI.editWater = null; renderModalBody(); }
export function saveWatering(id, entryId, srcId){
  const d = readDate(srcId); if (!d) return;
  updateEntry(id, 'water', entryId, { t: d.toISOString(), backdated:true });
  UI.editWater = null;
  toast(`📅 Date changed to ${fmtDate(d)}`);
  refresh(id);
}
export function delWatering(id, entryId){
  removeEntry(id, 'water', entryId);
  UI.editWater = null;
  toast('🗑️ Entry removed');
  refresh(id);
}

/* ---------------- issue log ---------------- */
export function addLog(id){
  const i = $('logInput'); const txt = (i?.value || '').trim(); if (!txt) return;
  addEntry(id, 'notes', { t:new Date().toISOString(), txt });
  i.value = ''; $('logList').innerHTML = logHTML(id);
}
export function delLog(id, entryId){
  removeEntry(id, 'notes', entryId);
  $('logList').innerHTML = logHTML(id);
}

/* ---------------- placement ----------------
   The shipped JSON is never written to; a move is an entry in alpj_state that
   loc() layers on top. Everything downstream — grouping, light/temp/humidity
   verdicts, the watering interval — reads through loc(), so one assignment
   updates the whole picture.                                              */
export function moveTo(id, roomId){
  const p = plant(id); if (!p || !DB.roomById[roomId]) return;
  const wasUnplaced = !loc(p);
  if (!wasUnplaced && loc(p) === roomId){
    toast(`${p.name} is already in ${DB.roomById[roomId].name}`); return;
  }
  // a shared pot is one object — everything in it travels together
  potMates(p).forEach(q => setPlacement(q.id, { room: roomId, wall:null, slot:null, order:null }));
  const a = assess(p), r = DB.roomById[roomId];
  toast(`${VERDICT[a.overall][0]} ${p.name} → ${r.name} · ${VERDICT[a.overall][1].toLowerCase()} · check ~every ${a.water.eff}d`);
  refresh(id);
}
/* ---------------- room builder ----------------
   Geometry is authored content, so edits land in journal.rooms via rooms.js
   rather than in a plant's placement cell. Everything downstream reads
   DB.home.rooms, which applyRooms() rebuilds on every change, so the sun
   model, slot geometry and fit verdicts all follow with no extra wiring. */
export function toggleBuild(){
  UI.build = !UI.build;
  if (!UI.build){ UI.selRoom = null; UI.wallSel = null; }
  if (UI.build) UI.arrange = false;          // the two modes fight over drags
  renderHomeMap();
  toast(UI.build ? 'Room editing on — tap a room to select it' : 'Apartment saved');
}
export function selectRoom(id){
  UI.selRoom = id; UI.selWall = UI.selWall || 'top'; UI.wallSel = null;
  renderHomeMap();
}
export function deselectRoom(){ UI.selRoom = null; UI.wallSel = null; renderHomeMap(); }
export function selectWall(roomId, wall){
  UI.selRoom = roomId; UI.selWall = wall; UI.wallSel = null;
  renderHomeMap();
}
export function setBlockTool(tool){
  UI.blockTool = tool;
  // Picking the tool AFTER highlighting should just place it — either order works.
  if (UI.wallSel) return applyBlock(UI.wallSel.room, UI.wallSel.wall);
  renderHomeMap();
}

/* Chunk selection. A click selects one chunk; click-drag extends the range.

   Painting the highlight directly rather than re-rendering matters: a full
   render rebuilds the strip under the cursor mid-drag, so the element the
   pointer is over is destroyed and the drag only ever registers its first
   chunk. Toggling classes keeps the nodes alive (and is far cheaper). */
let chunkDrag = null;
function paintChunkSel(){
  const sel = UI.wallSel;
  document.querySelectorAll('.chunkstrip .chunk').forEach(el => {
    const i = +el.dataset.chunk;
    const on = sel && el.dataset.room === sel.room && el.dataset.wall === sel.wall
               && i >= sel.from && i <= sel.to;
    el.classList.toggle('sel', !!on);
  });
  const n = sel ? (sel.to - sel.from + 1) : 0;
  const btn = document.querySelector('[data-action="applyblock"]');
  if (btn) btn.textContent = `Place on ${n} chunk${n === 1 ? '' : 's'}`;
}

export function chunkDown(roomId, wall, chunk){
  const r = DB.roomById[roomId];
  // Clicking a chunk that already holds something selects THAT block, so it can
  // be extended or removed without hunting for it in the list below.
  const hit = r && featuresOn(r, wall).find(f => chunk >= (f.from ?? 0) && chunk < (f.to ?? 0));
  if (hit){
    UI.selRoom = roomId; UI.selWall = wall;
    UI.featSel = UI.featSel === hit.pairId ? null : hit.pairId;
    UI.wallSel = null;
    renderHomeMap();
    return;
  }
  UI.featSel = null;
  const switching = UI.selRoom !== roomId || UI.selWall !== wall;
  chunkDrag = { room: roomId, wall, anchor: chunk };
  UI.selRoom = roomId; UI.selWall = wall;
  UI.wallSel = { room: roomId, wall, from: chunk, to: chunk };
  // only a full render when the wall itself changed; otherwise just repaint
  if (switching) renderHomeMap(); else { paintChunkSel(); ensureApplyButton(); }
}
export function chunkOver(roomId, wall, chunk){
  if (!chunkDrag || chunkDrag.room !== roomId || chunkDrag.wall !== wall) return;
  const from = Math.min(chunkDrag.anchor, chunk), to = Math.max(chunkDrag.anchor, chunk);
  if (UI.wallSel && UI.wallSel.from === from && UI.wallSel.to === to) return;
  UI.wallSel = { room: roomId, wall, from, to };
  paintChunkSel();
}
export function chunkUp(){ chunkDrag = null; renderHomeMap(); }

/* The Place/Cancel pair only exists once something is highlighted, and the
   selection is now painted without a re-render — so add them on demand. */
function ensureApplyButton(){
  const tools = document.querySelector('.wp-tools');
  if (!tools || !UI.wallSel || tools.querySelector('[data-action="applyblock"]')) return;
  const n = UI.wallSel.to - UI.wallSel.from + 1;
  tools.insertAdjacentHTML('beforeend',
    `<button class="sky tiny" data-action="applyblock" data-room="${UI.wallSel.room}" data-wall="${UI.wallSel.wall}">Place on ${n} chunk${n===1?'':'s'}</button>
     <button class="ghost tiny" data-action="clearsel">Cancel</button>`);
}
export function chunkDragging(){ return !!chunkDrag; }
export function clearSel(){ UI.wallSel = null; UI.featSel = null; renderHomeMap(); }

/* Grow an already-placed block to cover the highlighted chunks too. */
export function extendFeature(roomId, wall, pairId){
  const r = DB.roomById[roomId]; if (!r) return;
  const sel = UI.wallSel;
  if (!sel || sel.room !== roomId || sel.wall !== wall){
    toast('Highlight the chunks to add first'); return;
  }
  const f = featuresOn(r, wall).find(x => x.pairId === pairId);
  if (!f) return;
  const from = Math.min(f.from ?? 0, sel.from), to = Math.max(f.to ?? 0, sel.to + 1);
  for (let c = from; c < to; c++){
    const other = featuresOn(r, wall).find(x => x.pairId !== pairId &&
      c >= (x.from ?? 0) && c < (x.to ?? 0));
    if (other){ toast('Something else is in the way at chunk ' + (c + 1)); return; }
  }
  const kind = f.kind;
  const direct = !!f.direct;
  removeFeature(pairId);
  addFeature(roomId, wall, from, to, kind, { direct });
  UI.wallSel = null; UI.featSel = null;
  renderHomeMap(); renderCare();
  toast(`${kind === 'window' ? '🪟' : '🚪'} extended to chunks ${from + 1}–${to}`);
}

export function applyBlock(roomId, wall){
  const sel = UI.wallSel;
  if (!sel || sel.room !== roomId || sel.wall !== wall){
    toast('Highlight part of the wall first'); return;
  }
  const r = DB.roomById[roomId]; if (!r) return;
  // refuse to stack two blocks on the same chunk
  for (let c = sel.from; c <= sel.to; c++){
    if (chunkBusy(r, wall, c)){
      toast('Something is already on chunk ' + (c + 1)); return;
    }
  }
  const kind = UI.blockTool || 'window';
  const segs = wallSegments(r, wall);
  const touchesNeighbour = segs.some(sg => sg.neighbor &&
    Math.max(sg.from, sel.from) < Math.min(sg.to, sel.to + 1));

  addFeature(roomId, wall, sel.from, sel.to + 1, kind);
  UI.wallSel = null;
  renderHomeMap(); renderCare();
  toast(touchesNeighbour
    ? `${kind === 'window' ? '🪟' : '🚪'} added — paired to the room on the other side`
    : `${kind === 'window' ? '🪟' : '🚪'} added`);
}

export function deleteFeature(pairId){
  removeFeature(pairId);
  renderHomeMap(); renderCare();
  toast('Removed from both sides');
}
export function clearWallAction(roomId, wall){
  clearWall(roomId, wall);
  UI.wallSel = null;
  renderHomeMap(); renderCare();
  toast(`${wall} wall cleared — the wall itself stays`);
}
export function toggleWinSun(pairId){
  toggleWindowDirect(pairId);
  renderHomeMap(); renderCare();
}

export function addNewRoom(){
  const g = DB.home.grid;
  let x = 0, y = 0, found = false;
  for (let ty = 0; ty <= g.rows - 6 && !found; ty++){
    for (let tx = 0; tx <= g.cols - 6 && !found; tx++){
      const clash = (DB.home.rooms || []).some(r =>
        tx < r.x + r.w && tx + 6 > r.x && ty < r.y + r.h && ty + 6 > r.y);
      if (!clash){ x = tx; y = ty; found = true; }
    }
  }
  if (!found){ toast('No free space — shrink or move a room first'); return; }
  const id = addRoom({ name:'New Room', x, y, w:6, h:6 });
  UI.selRoom = id; UI.selWall = 'top';
  renderHomeMap(); renderCare();
  toast('Room added — name it in the panel');
}

export function deleteRoomAction(id){
  const r = DB.roomById[id]; if (!r) return;
  const here = DB.plants.filter(p => loc(p) === id);
  rmRoom(id);
  // anything standing in it would otherwise point at a room that no longer
  // exists, so lift those plants into the tray rather than orphaning them
  here.forEach(p => setPlacement(p.id, { room:null, wall:null, slot:null, order:null }));
  UI.selRoom = null; UI.wallSel = null;
  renderHomeMap(); renderCare();
  toast(here.length
    ? r.name + ' deleted — ' + here.length + ' plant(s) moved to the tray'
    : r.name + ' deleted');
}

export function renameRoom(id, name){
  patchRoom(id, { name: (name || '').trim() || 'Room' });
  renderHomeMap(); renderCare();
}
export function setRoomLight(id, v){
  patchRoom(id, { light: Math.max(0, Math.min(5, parseInt(v, 10) || 0)) });
  renderHomeMap(); renderCare();
}
export function setRoomFloor(id, v){ patchRoom(id, { floor: v }); renderHomeMap(); }
export function setRoomOutdoor(id, on){ patchRoom(id, { outdoor: !!on }); renderHomeMap(); renderCare(); }

/* --- drag a room to move it, or a wall bar to resize that side ---
   Nothing is written while the pointer is down. A ghost rectangle previews
   where the room would land and the real geometry is committed on release.
   Two reasons: patching every frame made a resize crawl one chunk at a time
   because a blocked step aborted the rest of the drag, and a room that starts
   overlapping could never be dragged free at all. */
let roomDrag = null;

function setGhost(rect, ok){
  const g = $('ghostRect'); if (!g) return;
  const T = DB.home.grid.tile;
  g.setAttribute('x', rect.x * T); g.setAttribute('y', rect.y * T);
  g.setAttribute('width', rect.w * T); g.setAttribute('height', rect.h * T);
  g.setAttribute('class', 'dragghost ' + (ok ? 'ok' : 'bad'));
  g.style.display = '';
  const lab = $('ghostLabel');
  if (lab){
    lab.setAttribute('x', rect.x * T + rect.w * T / 2);
    lab.setAttribute('y', rect.y * T + rect.h * T / 2 + 4);
    lab.textContent = `${rect.w} × ${rect.h}`;
    lab.style.display = '';
  }
}
function hideGhost(){
  const g = $('ghostRect'); if (g) g.style.display = 'none';
  const l = $('ghostLabel'); if (l) l.style.display = 'none';
}

export function roomDragStart(e, id, mode, wall){
  if (!UI.build) return false;
  const svg = $('mapsvg'); if (!svg) return false;
  const r = DB.roomById[id]; if (!r) return false;
  const p = toSvg(svg, e.clientX, e.clientY);
  roomDrag = { id, mode, wall, svg, startX:p.x, startY:p.y,
               orig:{ x:r.x, y:r.y, w:r.w, h:r.h },
               limits: mode === 'resize' ? resizeLimits(r, wall) : null,
               ghost: null, moved:false };
  UI.selRoom = id;
  if (wall) UI.selWall = wall;
  return true;
}

export function roomDragMove(e){
  if (!roomDrag) return false;
  const T = DB.home.grid.tile, g = DB.home.grid;
  const p = toSvg(roomDrag.svg, e.clientX, e.clientY);
  const dx = (p.x - roomDrag.startX) / T, dy = (p.y - roomDrag.startY) / T;
  if (!roomDrag.moved && Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) return false;
  roomDrag.moved = true;
  const o = roomDrag.orig;

  let rect, ok = true;
  if (roomDrag.mode === 'resize'){
    const raw = (roomDrag.wall === 'left' || roomDrag.wall === 'right') ? dx : dy;
    // clamp to the legal span so the phantom slides freely and simply stops
    // at whatever it would have collided with
    const L = roomDrag.limits;
    const d = Math.max(L.min, Math.min(L.max, Math.round(raw)));
    rect = rectAfterResize(o, roomDrag.wall, d);
  } else {
    rect = { x: Math.round(o.x + dx), y: Math.round(o.y + dy), w:o.w, h:o.h };
    rect.x = Math.max(0, Math.min(g.cols - rect.w, rect.x));
    rect.y = Math.max(0, Math.min(g.rows - rect.h, rect.y));
    ok = !collides(rect, roomDrag.id);
  }

  roomDrag.ghost = rect;
  roomDrag.ok = ok;
  setGhost(rect, ok);
  return true;
}

export function roomDragEnd(){
  if (!roomDrag) return;
  const d = roomDrag; roomDrag = null;
  hideGhost();
  if (!d.moved || !d.ghost){ renderHomeMap(); return; }

  let rect = d.ghost;
  if (collides(rect, d.id)){
    // dropped on top of something — settle at the closest spot that fits
    const free = nearestFreeRect(rect, d.id);
    if (!free){ toast('No room for that — nothing changed'); renderHomeMap(); return; }
    rect = free;
    patchRoom(d.id, rect);
    renderHomeMap(); renderCare();
    toast(`Moved to the nearest free spot (${rect.x}, ${rect.y})`);
    return;
  }
  patchRoom(d.id, rect);
  renderHomeMap(); renderCare();
  toast(d.mode === 'resize' ? `Resized to ${rect.w} × ${rect.h}` : 'Room moved');
}
export function roomDragging(){ return !!roomDrag; }

/* Directly set width/height from the panel inputs. */
export function setRoomSize(id, dim, value){
  const r = DB.roomById[id]; if (!r) return;
  const n = Math.max(2, parseInt(value, 10) || 2);
  const rect = { ...{ x:r.x, y:r.y, w:r.w, h:r.h }, [dim]: n };
  const g = DB.home.grid;
  if (rect.x + rect.w > g.cols || rect.y + rect.h > g.rows || collides(rect, id)){
    toast('That size would overlap — trim the neighbour first');
    renderHomeMap(); return;
  }
  patchRoom(id, rect);
  renderHomeMap(); renderCare();
}

/* ---------------- shared pots ---------------- */
export function splitPot(id){
  const p = plant(id);
  const had = potMates(p).filter(q => q.id !== id).map(q => q.name);
  splitFromPot(id);
  refresh(id);
  toast(had.length ? `✂️ ${p.name} separated from ${had.join(', ')}` : `${p.name} already had its own pot`);
}
export function combinePot(id, otherId){
  if (!otherId) return;
  const p = plant(id), o = plant(otherId);
  joinPot(id, otherId);
  refresh(id);
  toast(`🪴 ${p.name} now shares a pot with ${o.name}`);
}

export function toggleArrange(){
  UI.arrange = !UI.arrange;
  renderHomeMap();
  toast(UI.arrange ? '✋ Arrange on — drag pots between rooms' : '✓ Layout saved');
}
export function resetLayout(){
  const moved = movedPlants();
  if (!moved.length){ toast('Nothing to reset — this is the shipped layout'); return; }
  moved.forEach(p => setPlacement(p.id, { room:p.location, wall:null, slot:null, order:null }));
  toast(`↩️ ${moved.length} plant${moved.length>1?'s':''} returned to the shipped layout`);
  renderHomeMap(); renderCare();
}
/* ---------------- journal sync ----------------
   Export writes the whole journal; import MERGES it into what's already here
   rather than replacing it. That's what makes moving data between the phone
   (github.io) and the laptop (localhost) safe — the two origins keep separate
   localStorage, so a replace would silently destroy whichever side is older. */
export function exportJournalFile(){
  const payload = exportJournal();
  const n = Object.keys(payload.journal.plants || {}).length;
  download(`alpj-journal-${isoDay(new Date())}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast(`⬇️ Journal exported — ${n} plant${n===1?'':'s'}`);
}

export function importJournalFile(){
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files && input.files[0]; if (!f) return;
    try {
      const incoming = parseImport(await f.text());
      const { stats } = mergeIntoStored(incoming);
      renderCare();
      if (UI.view === 'home') renderHomeMap();
      if (UI.view === 'weather') renderWeather();
      toast(stats.added
        ? `🔀 Merged — ${stats.added} new entr${stats.added===1?'y':'ies'} added, nothing overwritten`
        : '🔀 Merged — already up to date, nothing lost');
    } catch (err){
      toast(`⚠️ ${err.message}`);
    }
  };
  input.click();
}

/* Apartment geometry is authored content, not journal data — this clears any
   room-builder overrides and falls back to the shipped home.json. */
export function resetApartment(){
  const j = loadJournal();
  const n = Object.keys(j.rooms || {}).length;
  if (!n){ toast('Nothing to reset — this is the shipped apartment'); return; }
  j.rooms = {}; saveJournal(j);
  applyRooms();          // rebuild DB.home.rooms, or the map keeps the edits
  toast(`🏗️ Apartment reset — ${n} room edit${n>1?'s':''} discarded`);
  renderHomeMap(); renderCare();
}

/* Escape hatch for the localStorage overlay: hand back a file you can fold
   into build_data.py / the plant JSON when you want a move to be permanent. */
export function exportHome(){
  const placements = {};
  DB.plants.forEach(p => { placements[p.id] = loc(p); });
  const payload = {
    exported: new Date().toISOString(),
    note: 'Set "location" in resources/data/plants/<slug>.json (or build_data.py) to these values to make the layout permanent.',
    placements,
    moved: movedPlants().map(p => ({ id:p.id, name:p.name, from:p.location, to:loc(p) }))
  };
  download('alpj-placement.json', JSON.stringify(payload, null, 2), 'application/json');
  toast('⬇️ Placement exported');
}

function download(name, text, type){
  const blob = new Blob([text], { type:`${type};charset=utf-8` });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- map drag ----------------
   Pointer events, not HTML5 drag-and-drop: DnD doesn't work inside SVG on
   touch. A press that never travels more than DRAG_MIN px is left alone so it
   still registers as a tap and opens the card.                            */
const DRAG_MIN = 6;
let drag = null;

function toSvg(svg, cx, cy){
  const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  const m = svg.getScreenCTM(); if (!m) return { x:0, y:0 };
  return pt.matrixTransform(m.inverse());
}

/* --- dragging OUT of the tray and onto the map ---------------------------
   The counterpart to dropping a pot on the tray. Without it an unplaced plant
   could only be re-placed from the modal, which strands anything you lift off.
   The tray item is HTML, not SVG, so this tracks the pointer directly and
   resolves the drop against the map on release. */
let trayDrag = null;

export function trayDragStart(e, el){
  if (UI.build) return false;                   // room editing owns drags

  // Record the drag BEFORE anything can re-render, and never capture the
  // pointer on this element. renderHomeMap() rebuilds the tray, so `el` would
  // be detached the instant we touched it — the pointerup then fired on an
  // orphaned node, never reached the document listener, and the drag stayed
  // "active" forever. From then on every pointermove called preventDefault and
  // silently swallowed every click in the app. Document-level listeners make
  // pointer capture unnecessary anyway.
  trayDrag = { id: el.dataset.tray, moved:false, sx:e.clientX, sy:e.clientY,
               pointerId: e.pointerId };
  if (!UI.arrange){ UI.arrange = true; renderHomeMap(); }
  markTrayDragging(true);
  return true;
}

/* The tray is re-rendered constantly, so style the dragged row by id rather
   than holding a reference to a node that may no longer exist. */
function markTrayDragging(on){
  document.querySelectorAll('.tray-item.dragging').forEach(n => n.classList.remove('dragging'));
  if (on && trayDrag){
    const n = document.querySelector(`[data-tray="${trayDrag.id}"]`);
    if (n) n.classList.add('dragging');
  }
}
export function trayDragMove(e){
  if (!trayDrag) return false;
  if (!trayDrag.moved && Math.hypot(e.clientX-trayDrag.sx, e.clientY-trayDrag.sy) < DRAG_MIN) return false;
  trayDrag.moved = true;
  markTrayDragging(true);
  const svg = $('mapsvg'); if (!svg) return;
  const p = toSvg(svg, e.clientX, e.clientY);
  const over = roomAt(p.x, p.y);
  svg.querySelectorAll('.droptarget').forEach(t => t.classList.toggle('over', t.dataset.room === over));
  const near = slotAt(p.x, p.y);
  svg.querySelectorAll('.slotdot').forEach(d => d.classList.toggle('near',
    !!near && d.dataset.room === near.room && d.dataset.wall === near.wall && +d.dataset.slot === near.slot));
  return true;
}
export function trayDragEnd(e){
  if (!trayDrag) return;
  const d = trayDrag; trayDrag = null;
  markTrayDragging(false);
  if (!d.moved){ openModal(d.id); return; }        // a tap still opens the card

  const svg = $('mapsvg');
  const overMap = svg && document.elementFromPoint(e.clientX, e.clientY)?.closest('#mapframe');
  if (!svg || !overMap){ renderHomeMap(); return; }

  const p = toSvg(svg, e.clientX, e.clientY);
  const slot = slotAt(p.x, p.y);
  if (slot){ placeInSlot(d.id, slot); return; }
  const target = roomAt(p.x, p.y);
  if (!target){ toast('🚫 Drop it inside a room'); renderHomeMap(); return; }
  moveTo(d.id, target);
}
export function trayDragging(){ return !!trayDrag; }

/* Abandon anything in flight. Called on pointercancel, on lostpointercapture
   and when the window loses focus, so a drag can never outlive the gesture
   that began it — a stuck drag used to make the entire UI unclickable. */
export function cancelAllDrags(){
  const had = !!(trayDrag || drag || roomDrag || chunkDragging());
  trayDrag = null;
  drag = null;
  roomDrag = null;
  chunkUp();
  markTrayDragging(false);
  document.querySelectorAll('.plant-g.dragging').forEach(n => n.classList.remove('dragging'));
  hideGhost();
  if (had && UI.view === 'home') renderHomeMap();
  return had;
}

export function dragStart(e, g){
  if (!UI.arrange) return false;
  const svg = $('mapsvg'); if (!svg) return false;
  const p = toSvg(svg, e.clientX, e.clientY);
  drag = { id:g.dataset.plant, g, svg, startX:p.x, startY:p.y,
           hx:+g.dataset.hx, hy:+g.dataset.hy, moved:false, room:null };
  // No pointer capture here either: the map re-renders during a drag and the
  // captured <g> would be replaced, stranding the gesture.
  return true;
}
export function dragMove(e){
  if (!drag) return false;
  // the node can vanish if anything re-rendered mid-gesture
  if (!drag.g.isConnected){ drag = null; return false; }
  const p = toSvg(drag.svg, e.clientX, e.clientY);
  const dx = p.x - drag.startX, dy = p.y - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < DRAG_MIN) return false;
  drag.moved = true;
  drag.g.classList.add('dragging');
  drag.g.setAttribute('transform', `translate(${drag.hx + dx},${drag.hy + dy})`);
  const over = roomAt(p.x, p.y);
  if (over !== drag.room){
    drag.room = over;
    drag.svg.querySelectorAll('.droptarget').forEach(t =>
      t.classList.toggle('over', t.dataset.room === over));
  }
  return true;
}
export function dragEnd(e){
  if (!drag) return;
  const d = drag; drag = null;
  if (d.g.isConnected) d.g.classList.remove('dragging');
  if (!d.moved){ openModal(d.id); return; }          // never travelled → it was a tap

  const pl = plant(d.id);

  // 1. dropped on the tray → lift it off the map entirely
  const overEl = document.elementFromPoint(e.clientX, e.clientY);
  if (overEl && overEl.closest('#planttray')){ unplace(d.id); return; }

  const p = toSvg(d.svg, e.clientX, e.clientY);

  // 2. dropped on ANOTHER pot → trade places.
  //    Hit-test against each pot's recorded anchor (data-hx/hy) rather than
  //    getBBox(): a <g> wrapping an <image> reports no usable box until the
  //    sprite has loaded, which silently broke swapping.
  const HIT_R = 22;
  let hitId = null, bestD = Infinity;
  d.svg.querySelectorAll('.plant-g').forEach(g => {
    if (g.dataset.plant === d.id) return;
    const gx = +g.dataset.hx, gy = +g.dataset.hy;
    if (!isFinite(gx) || !isFinite(gy)) return;
    const dist = Math.hypot(p.x - gx, p.y - gy);
    if (dist <= HIT_R && dist < bestD){ bestD = dist; hitId = g.dataset.plant; }
  });
  if (hitId){ swapWith(d.id, hitId); return; }

  // 3. near a wall slot → take that exact spot
  const slot = slotAt(p.x, p.y);
  if (slot){ placeInSlot(d.id, slot); return; }

  // 4. otherwise just the room
  const target = roomAt(p.x, p.y);
  if (!target){ toast('🚫 Drop a plant in a room, or on the tray to unplace it'); renderHomeMap(); return; }
  if (target === loc(pl)){ renderHomeMap(); return; }
  moveTo(d.id, target);
}

const WALL_LABEL = { top:'top', bottom:'bottom', left:'left', right:'right' };
export function placeInSlot(id, slot){
  const p = plant(id);
  // One plant per slot. If someone already has it, the two trade places —
  // which is also the natural way to reorder pots along a wall.
  const mates = new Set(potMates(p).map(q => q.id));
  const taken = DB.plants.find(q => {
    if (mates.has(q.id)) return false;          // sharing a pot is not a collision
    const pl = placement(q);
    return pl.room === slot.room && pl.wall === slot.wall && pl.slot === slot.slot;
  });
  if (taken){ swapWith(id, taken.id); return; }
  potMates(p).forEach(q =>
    setPlacement(q.id, { room:slot.room, wall:slot.wall, slot:slot.slot, order:null }));
  const r = DB.roomById[slot.room], a = assess(p);
  toast(`${VERDICT[a.overall][0]} ${p.name} → ${r.name}, ${WALL_LABEL[slot.wall]} wall #${slot.slot+1}`);
  refresh(id);
}
export function swapWith(idA, idB){
  const a = plant(idA), b = plant(idB);
  swapPlacement(idA, idB);
  toast(`🔄 ${a.name} ⇄ ${b.name}`);
  refresh(idA);
}
export function unplace(id){
  const p = plant(id);
  potMates(p).forEach(q => setPlacement(q.id, { room:null, wall:null, slot:null, order:null }));
  toast(`🪴 ${p.name} lifted off the map — it's in the tray`);
  refresh(id);
}
export function dragging(){ return !!drag; }

/* ---------------- modal ---------------- */
export function openModal(id){
  UI.openId = id; UI.openTab = 'overview'; UI.editWater = null;
  const p = plant(id);
  $('mSprite').innerHTML = spriteFor(p, 42);
  $('mName').textContent = p.name;
  $('mBot').textContent = p.botanical;
  renderModalTabs(); renderModalBody();
  $('scrim').classList.add('open'); document.body.style.overflow = 'hidden';
}
export function closeModal(){
  $('scrim').classList.remove('open'); document.body.style.overflow = '';
  UI.openId = null; UI.editWater = null;
}
export function switchTab(k){
  UI.openTab = k; UI.editWater = null; renderModalTabs(); renderModalBody();
}

/* ---------------- grove grouping ---------------- */
export function setGroup(g){
  UI.group = g;
  document.querySelectorAll('#groupSeg button').forEach(b => b.classList.toggle('on', b.dataset.group === g));
  renderGrove();
}

/* ---------------- views ---------------- */
export function switchView(v){
  UI.view = v;
  const map = { care:'careView', home:'homeView', weather:'weatherView', almanac:'almanacView' };
  Object.entries(map).forEach(([k, id]) => { const el = $(id); if (el) el.hidden = (k !== v); });
  [['navCare','care'],['navHome','home'],['navWeather','weather'],['navAlmanac','almanac']]
    .forEach(([id,k]) => { const b = $(id); if (b) b.classList.toggle('on', v === k); });
  if (v === 'home') renderHomeMap();
  if (v === 'weather') renderWeather();
  if (v === 'almanac') renderAlmanac();
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ---------------- themes ---------------- */
export function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  Store.set('alpj_theme', t);
  const sel = $('themeSel'); if (sel) sel.value = t;
  if (UI.view === 'home' && !$('homeView').hidden) renderHomeMap();
}
export function initTheme(){ setTheme(Store.get('alpj_theme') || 'stardew'); }

/* ---------------- Google Calendar (.ics) export ---------------- */
const icsDate  = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
const icsStamp = () => new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
function fold(l){ const o=[]; while (l.length>73){ o.push(l.slice(0,73)); l=' '+l.slice(73); } o.push(l); return o.join('\r\n'); }
function vevent({ uid, start, summary, desc, rrule }){
  const s = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${icsStamp()}`, `DTSTART;VALUE=DATE:${icsDate(start)}`, fold(`SUMMARY:${summary}`)];
  if (desc) s.push(fold(`DESCRIPTION:${desc.replace(/\n/g,'\\n')}`));
  if (rrule) s.push(`RRULE:${rrule}`);
  s.push('BEGIN:VALARM','TRIGGER:PT0S','ACTION:DISPLAY', fold(`DESCRIPTION:${summary}`), 'END:VALARM','END:VEVENT');
  return s.join('\r\n');
}
export function exportICS(){
  const ev = [], start = new Date(today0().getTime() + DAY);
  DB.plants.forEach(p => {
    // Recurrence uses the stable baseline interval, not the weather-adjusted
    // one — a calendar series shouldn't drift every time it rains.
    const ws = lastWatered(p.id) ? nextCheck(p) : start;
    ev.push(vevent({ uid:`water-${p.id}@alpj`, start: ws<today0()?start:ws, summary:`${p.medium==='water'?'🔄':'💧'} ${actWord(p)} ${p.name}`, desc:`${p.water}\\nFinger-check first.`, rrule:`FREQ=DAILY;INTERVAL=${interval(p)}` }));
    if (p.stage !== 'establishing') ev.push(vevent({ uid:`feed-${p.id}@alpj`, start:new Date(start.getTime()+3*DAY), summary:`🍽️ Feed ${p.name}`, desc:`${p.fertilizer}\\nGrowing season only.`, rrule:`FREQ=MONTHLY;INTERVAL=1` }));
    if (p.stage === 'propReady') ev.push(vevent({ uid:`prop-${p.id}@alpj`, start:new Date(today0().getTime()+90*DAY), summary:`✂️ Propagate ${p.name}?`, desc:p.propagate }));
    if (p.stage === 'establishing') ev.push(vevent({ uid:`root-${p.id}@alpj`, start:new Date(today0().getTime()+28*DAY), summary:`🌱 ${p.name}: rooted? pot up & normalize care`, desc:'Tug-test for roots, then reduce humidity & start normal watering.' }));
  });
  const cal = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ALPJ Ranch//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ALPJ Ranch 🌿', ...ev, 'END:VCALENDAR'].join('\r\n');
  download('alpj-ranch.ics', cal, 'text/calendar');
  toast('📅 Calendar downloaded — import in Google Calendar');
}
