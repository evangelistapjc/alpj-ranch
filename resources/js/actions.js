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
         placement } from './state.js';
import { renderCare, renderGrove, renderHomeMap, renderWeather, renderAlmanac,
         renderModalTabs, renderModalBody, logHTML, roomAt, slotAt,
         renderTray, sprite as spriteFor } from './views.js';
import { currentWx } from './weather.js';
import { assess, VERDICT } from './climate.js';

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
  if (loc(p) === roomId){ toast(`${p.name} is already in ${DB.roomById[roomId].name}`); return; }
  setPlacement(id, { room: roomId });
  const a = assess(p), r = DB.roomById[roomId];
  toast(`${VERDICT[a.overall][0]} ${p.name} → ${r.name} · ${VERDICT[a.overall][1].toLowerCase()} · check ~every ${a.water.eff}d`);
  refresh(id);
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
  toast(`🏗️ Apartment reset — ${n} room edit${n>1?'s':''} discarded`);
  renderHomeMap();
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

export function dragStart(e, g){
  if (!UI.arrange) return false;
  const svg = $('mapsvg'); if (!svg) return false;
  const p = toSvg(svg, e.clientX, e.clientY);
  drag = { id:g.dataset.plant, g, svg, startX:p.x, startY:p.y,
           hx:+g.dataset.hx, hy:+g.dataset.hy, moved:false, room:null };
  try { g.setPointerCapture(e.pointerId); } catch (err) {}
  return true;
}
export function dragMove(e){
  if (!drag) return;
  const p = toSvg(drag.svg, e.clientX, e.clientY);
  const dx = p.x - drag.startX, dy = p.y - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < DRAG_MIN) return;
  drag.moved = true;
  drag.g.classList.add('dragging');
  drag.g.setAttribute('transform', `translate(${drag.hx + dx},${drag.hy + dy})`);
  const over = roomAt(p.x, p.y);
  if (over !== drag.room){
    drag.room = over;
    drag.svg.querySelectorAll('.droptarget').forEach(t =>
      t.classList.toggle('over', t.dataset.room === over));
  }
}
export function dragEnd(e){
  if (!drag) return;
  const d = drag; drag = null;
  try { d.g.releasePointerCapture(e.pointerId); } catch (err) {}
  d.g.classList.remove('dragging');
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
  const taken = DB.plants.find(q => {
    if (q.id === id) return false;
    const pl = placement(q);
    return pl.room === slot.room && pl.wall === slot.wall && pl.slot === slot.slot;
  });
  if (taken){ swapWith(id, taken.id); return; }
  setPlacement(id, { room:slot.room, wall:slot.wall, slot:slot.slot, order:null });
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
  setPlacement(id, { room:null, wall:null, slot:null, order:null });
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
