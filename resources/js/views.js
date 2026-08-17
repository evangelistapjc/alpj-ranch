// ===========================================================================
// views.js — presentation layer. Every function here only READS state and
// injects markup. Interactivity is expressed as data-action attributes that
// events.js delegates to actions.js — there are no inline handlers.
// ===========================================================================
import { DB, UI, fmtDate, isoDay, relDay, nextCheck, daysUntil, interval,
         effInterval, actWord, isWateredToday, isFedToday, plant, waterLog,
         fedLog, notesLog, lastWatered, lastFed, hasHistory, isBacklog, loc, room,
         today0, movedPlants, placement, status, plantsIn, unplacedPlants } from './state.js';
import { assess, bestRooms, diagnose, sunToday, VERDICT, roomRanges } from './climate.js';
import { wxLog, recentDryFactor, wateringWindow } from './weather.js';
import { ZONE, STAGE, TABS, GROUPINGS, MAP_THEME, WMO, SLOTS_PER_WALL, WALLS } from './config.js';
import { wallIsExterior, hasWindow, hasDoor, roomsEdited } from './rooms.js';

const $ = (id) => document.getElementById(id);

/* Sprite: the authored SVG when a plant has one, emoji otherwise. onerror
   swaps the emoji back in, so a missing file degrades instead of showing a
   broken-image icon. */
export function sprite(p, size){
  const px = size || 30;
  if (!p.spriteFile) return `<span class="sprite-emoji" style="font-size:${px}px">${p.sprite}</span>`;
  return `<img class="sprite-img" src="${p.spriteFile}" alt="" width="${px}" height="${px}"
    onerror="this.outerHTML='<span class=\'sprite-emoji\' style=\'font-size:${px}px\'>${p.sprite}</span>'">`;
}

/* Rooms with meaningful direct sun today, measured rather than asserted. */
function sunRooms(){
  return (DB.home.rooms || []).map(r => ({ r, s: sunToday(r) }))
    .filter(x => x.s.hours >= 1).sort((a,b) => b.s.hours - a.s.hours);
}
function brightest(){
  const all = (DB.home.rooms || []).map(r => ({ r, s: sunToday(r) }))
    .sort((a,b) => b.s.hours - a.s.hours)[0];
  return all ? { r:all.r, h:all.s.hours, label:all.s.label } : { r:{name:'—'}, h:0, label:'' };
}

/* ---------------- shell ---------------- */
export function renderShell(){
  const H = DB.home;
  $('app').innerHTML = `
  <header class="sign">
    <svg width="50" height="50" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="#3f6d2c"><rect x="7" y="9" width="2" height="5"/></g>
      <g fill="#5f9a37"><rect x="4" y="8" width="3" height="2"/><rect x="3" y="9" width="2" height="2"/><rect x="9" y="8" width="3" height="2"/><rect x="11" y="9" width="2" height="2"/></g>
      <g fill="#e8b23a"><rect x="6" y="2" width="4" height="4"/><rect x="5" y="3" width="6" height="2"/><rect x="7" y="0" width="2" height="2"/><rect x="7" y="6" width="2" height="1"/><rect x="2" y="3" width="2" height="1"/><rect x="12" y="3" width="2" height="1"/></g>
    </svg>
    <div><h1 class="pixel">${H.name}</h1><p>Plant care · ${H.location.city} · low-light, first-floor apartment</p></div>
    <div class="plot-count"><b class="pixel">${DB.plants.length}</b><span>plants in the plot</span></div>
    <select id="themeSel" class="theme-sel" aria-label="Theme">
      <option value="stardew">🌾 Stardew</option>
      <option value="ghibli">🌿 Ghibli</option>
      <option value="lego">🧱 Lego</option>
    </select>
  </header>

  <div class="conditions">
    <div class="cond" id="wxTile"><span class="big">🌡️</span><div><div class="lbl">Live weather</div><div class="val">Loading…</div><div class="sub">fetching…</div></div></div>
    <div class="cond"><span class="big">💡</span><div><div class="lbl">Direct-sun rooms</div><div class="val">${sunRooms().length} of ${(H.rooms||[]).length}</div><div class="sub">${sunRooms().map(x=>x.r.name).join(', ') || 'none'}</div></div></div>
    <div class="cond"><span class="big">🏠</span><div><div class="lbl">Indoor temp</div><div class="val">Cool ~${H.indoor.tempF[0]}–${H.indoor.tempF[1]}°F</div><div class="sub">slow-drying soil</div></div></div>
    <div class="cond"><span class="big">🌤️</span><div><div class="lbl">Sunniest spot</div><div class="val">${brightest().r.name}</div><div class="sub">${brightest().h.toFixed(1)}h direct today · ${brightest().label}</div></div></div>
  </div>

  <div class="viewnav">
    <button data-action="view" data-view="care" id="navCare" class="on">🌿 Care</button>
    <button data-action="view" data-view="home" id="navHome">🗺️ Map</button>
    <button data-action="view" data-view="weather" id="navWeather">🌦️ Weather</button>
    <button data-action="view" data-view="almanac" id="navAlmanac">📖 Almanac</button>
  </div>

  <div id="careView">
    <section class="board panel">
      <h2 class="pixel"><span>📋</span> Today on the Ranch</h2>
      <p class="sub">Cool + low light = slow-drying soil. These are <b>check-first</b> nudges — poke a finger 2" down; only water if dry.</p>
      <div id="tasks" class="tasks"></div>
    </section>
    <section class="board panel backlog" id="backlogSec" hidden>
      <h2 class="pixel"><span>🗂️</span> Backlog — not recorded yet</h2>
      <p class="sub">Plants you've never marked, or that are long past due. If you watered one and forgot to log it, <b>backdate it</b> — the schedule recalculates from the real date.</p>
      <div id="backlog" class="tasks"></div>
    </section>
    <section class="grove panel">
      <h2 class="pixel"><span>🌿</span> The Grove</h2>
      <div class="toolbar"><span style="font-size:12px;color:var(--ink-soft);font-weight:700">Organize by:</span>
        <div class="seg" id="groupSeg">
          <button data-action="group" data-group="light" class="on">☀️ Light</button>
          <button data-action="group" data-group="water">💧 Water</button>
          <button data-action="group" data-group="stage">🌱 Stage</button>
          <button data-action="group" data-group="room">🏠 Room</button>
          <button data-action="group" data-group="none">🔲 All</button>
        </div></div>
      <div id="grove"></div>
    </section>
    <section class="export panel" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:16px 18px;margin-top:8px">
      <span style="font-size:34px">📅</span>
      <div style="flex:1;min-width:220px"><h2 class="pixel" style="margin:0 0 3px">Send to Google Calendar</h2>
        <p style="margin:0;font-size:12px;color:var(--ink-soft)">Downloads an <b>.ics</b> with recurring watering/feeding + prop reminders. In Google Calendar: Settings → Import &amp; export.</p></div>
      <button class="sky" data-action="export">⬇️ Download .ics</button>
    </section>

    <section class="export panel" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:16px 18px;margin-top:8px">
      <span style="font-size:34px">🔀</span>
      <div style="flex:1;min-width:220px"><h2 class="pixel" style="margin:0 0 3px">Sync between devices</h2>
        <p style="margin:0;font-size:12px;color:var(--ink-soft)">Your phone and this computer keep <b>separate</b> journals — browsers can't share storage across origins. Import <b>merges</b>: waterings from both sides are kept, nothing is overwritten, and deletes stay deleted.</p></div>
      <button class="ghost" data-action="exportjournal">⬇️ Export journal</button>
      <button class="sky" data-action="importjournal">🔀 Import &amp; merge</button>
    </section>
  </div>

  <section id="homeView" class="mapwrap panel" hidden>
    <h2 class="pixel"><span>🗺️</span> Home Map</h2>
    <p class="sub">Your apartment, drawn top-down. Glowing edges are windows; brighter floors = more light. Tap a plant to open its care card — or turn on <b>Arrange</b> and drag plants between rooms.</p>
    <div class="maptools" id="maptools"></div>
    <div class="maprow">
      <div class="mapframe" id="mapframe"></div>
      <aside class="planttray" id="planttray"></aside>
    </div>
    <div class="maplegend" id="maplegend"></div>
  </section>

  <section id="weatherView" class="mapwrap panel" hidden>
    <h2 class="pixel"><span>🌦️</span> Weather Log</h2>
    <p class="sub">Every reading pulled from Open-Meteo is recorded here. The <b>dry factor</b> — how fast soil gives up water at that temperature and humidity — is what stretches or shortens each plant's next check.</p>
    <div id="weatherBody"></div>
  </section>

  <section id="almanacView" class="mapwrap panel" hidden>
    <h2 class="pixel"><span>📖</span> <span id="almTitle">Almanac</span></h2>
    <p class="sub" id="almSub"></p>
    <div id="almanac"></div>
  </section>

  <p class="foot">${H.name} 🌾 · care facts from horticulture guides (linked per plant) · live weather via Open-Meteo · tuned for ${H.location.city}</p>`;
}

/* ---------------- care view ---------------- */
export function renderCare(){ renderTasks(); renderBacklog(); renderGrove(); }

function renderTasks(){
  const el = $('tasks');
  const due = DB.plants.filter(p => hasHistory(p.id) && !isBacklog(p))
                       .map(p => ({ p, d: daysUntil(p) }))
                       .filter(x => x.d <= 2).sort((a,b) => a.d - b.d);
  if (!due.length){ el.innerHTML = '<div class="all-good">🌾 Nothing thirsty today. The ranch is content.</div>'; return; }
  el.innerHTML = due.map(({ p, d }) => {
    const dry = d <= 0, over = d < 0;
    const meta = over ? `Overdue ${Math.abs(d)}d` : d === 0 ? 'Check today' : `In ${d}d`;
    return `<div class="task ${dry?'dry':''}"><span class="t-emoji">${sprite(p,24)}</span>
      <div class="t-main"><div class="t-name">${p.name}</div>
        <div class="t-meta">${p.medium==='water'?'🔄':'💧'} ${meta} · ${p.medium==='water'?'refresh water':'finger-check'}</div></div>
      ${waterBtn(p.id,false)}</div>`;
  }).join('');
}

/* Never-recorded + long-overdue plants, each with an inline backdate control
   so "I watered it Tuesday, I just never marked it" is one action. */
function renderBacklog(){
  const sec = $('backlogSec'), el = $('backlog');
  const items = DB.plants.filter(isBacklog);
  sec.hidden = !items.length;
  if (!items.length) return;
  const max = isoDay(today0());
  el.innerHTML = items.map(p => {
    const lw = lastWatered(p.id);
    const meta = lw ? `Last logged ${fmtDate(lw)} · ${relDay(lw)}` : 'Never recorded';
    return `<div class="task backlog-item"><span class="t-emoji">${sprite(p,24)}</span>
      <div class="t-main"><div class="t-name">${p.name}</div>
        <div class="t-meta">🗂️ ${meta}</div>
        <div class="backdate">
          <input type="date" max="${max}" value="${max}" id="bd_${p.id}" data-backdate="${p.id}" aria-label="Date ${p.name} was watered">
          <button class="ghost tiny" data-action="backdate" data-id="${p.id}" data-src="bd_${p.id}">💾 Log this date</button>
        </div>
      </div>
      ${waterBtn(p.id,false)}</div>`;
  }).join('');
}

export function renderGrove(){
  const grove = $('grove');
  if (UI.group === 'none'){ grove.innerHTML = `<div class="plot">${DB.plants.map(cardHTML).join('')}</div>`; return; }
  const G = GROUPINGS[UI.group];
  // Room grouping reads through the placement overlay, so a plant dragged on
  // the map regroups here immediately. Unplaced plants (room === null) get a
  // real bucket instead of a group literally titled "null", and rooms follow
  // the map's own order so the two views read the same way.
  const UNPLACED = '__unplaced__';
  const of = UI.group === 'room' ? (p => loc(p) || UNPLACED) : G.of;
  let keys;
  if (UI.group === 'room'){
    keys = (DB.home.rooms || []).map(r => r.id);
    if (DB.plants.some(p => !loc(p))) keys.push(UNPLACED);
  } else {
    keys = G.order.length ? G.order.slice() : [...new Set(DB.plants.map(of))];
    [...new Set(DB.plants.map(of))].forEach(k => { if (!keys.includes(k)) keys.push(k); });
  }
  grove.innerHTML = keys.map(k => {
    const members = DB.plants.filter(p => of(p) === k);
    if (!members.length) return '';
    let m = G.meta && G.meta[k];
    if (!m && k === UNPLACED) m = { emoji:'🪴', title:'Not placed yet',
                                    note:'drag these onto the map from The Plot' };
    if (!m && UI.group === 'room'){ const r = DB.roomById[k]; m = { emoji:'🏠', title:r?r.name:k, note:r?r.note:'' }; }
    m = m || { emoji:'🏠', title:k, note:'' };
    return `<div class="group"><div class="group-head"><span class="g-emoji">${m.emoji}</span><span class="g-title">${m.title}</span>${m.note?`<span class="g-note">${m.note}</span>`:''}</div><div class="plot">${members.map(cardHTML).join('')}</div></div>`;
  }).join('');
}

function cardHTML(p){
  const d = daysUntil(p), due = d <= 0, lw = lastWatered(p.id);
  const nextTxt = due ? `${actWord(p)} now` : `${p.medium==='water'?'Refresh':'Check'} ${fmtDate(nextCheck(p))}`;
  const st = status(p);
  const fit = assess(p);
  const [fe] = VERDICT[fit.overall];
  const lastTxt = lw ? `Last ${p.medium==='water'?'refreshed':'watered'} <b>${fmtDate(lw)}</b> · ${relDay(lw)}`
                     : `Never ${p.medium==='water'?'refreshed':'watered'} — <b>not recorded yet</b>`;
  return `<div class="card" tabindex="0" role="button" data-action="open" data-id="${p.id}">
    <div class="c-top"><span class="c-sprite">${sprite(p,34)}</span>
      <div><div class="c-name">${p.name}</div><div class="c-bot">${p.botanical}</div></div>
      <span class="c-id">${p.id}</span></div>
    <div class="c-body">
      <div class="chips">
        <span class="chip light">☀️ ${ZONE[p.zone]}</span>
        <span class="chip water">${p.medium==='water'?'🔄 water-prop':'💧 '+effInterval(p)+'d'}</span>
        <span class="chip stage">🌱 ${STAGE[p.stage]}</span>
        ${p.growLight?'<span class="chip grow">⚡ grow light</span>':''}
        <span class="chip fit ${fit.overall}">${fe} ${room(p)?room(p).name:'unplaced'}</span>
      </div>
      ${st?`<div class="c-status ${p.medium==='water'?'water':''}">📍 ${st}</div>`:''}
      <div class="c-last ${lw?'':'never'}">🕘 ${lastTxt}</div>
      <div class="c-water-row"><span class="c-next ${due?'due':''}">${p.medium==='water'?'🔄':'💧'} <b>${nextTxt}</b></span>${waterBtn(p.id,false)}</div>
    </div></div>`;
}

export function waterBtn(id, big){
  const on = isWateredToday(id), p = plant(id), w = actWord(p);
  const cls = 'sky ' + (big?'':'tiny ') + (on?'watered':'');
  const label = big ? (on ? '✓ Done today — tap to undo' : `${p.medium==='water'?'🔄':'💧'} Mark ${w.toLowerCase()}ed today`)
                    : (on ? '✓ Done' : (p.medium==='water' ? '🔄 Refresh' : '💧 Water'));
  return `<button class="${cls}" data-action="water" data-id="${id}">${label}</button>`;
}
export function fedBtn(id){
  const on = isFedToday(id);
  return `<button class="ghost ${on?'done':''}" data-action="fed" data-id="${id}">${on ? '✓ Fertilized today — tap to undo' : '🍽️ Mark fertilized today'}</button>`;
}

/* ---------------- modal ---------------- */
export function renderModalTabs(){
  $('mTabs').innerHTML = TABS.map(([k,l]) =>
    `<button data-action="tab" data-tab="${k}" class="${k===UI.openTab?'on':''}">${l}</button>`).join('');
}
function srcHTML(p){
  return p.sources && p.sources.length
    ? `<div class="sources">📚 ${p.sources.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join(' · ')}</div>` : '';
}
export function logHTML(id){
  const log = notesLog(id);
  if (!log.length) return '<div class="log-empty">No notes yet. 🌱</div>';
  return log.slice().reverse().map(e =>
    `<div class="log-item"><span class="date">${fmtDate(e.t)}</span><span>${e.txt}</span><button class="ghost tiny" style="margin-left:auto" data-action="dellog" data-id="${id}" data-eid="${e.id}">✕</button></div>`
  ).join('');
}

/* The watering history: newest first, each row editable (change the date) or
   removable. UI.editWater holds the index currently being re-dated. */
export function waterLogHTML(id){
  const p = plant(id), log = waterLog(id), max = isoDay(today0());
  if (!log.length) return `<div class="log-empty">Nothing recorded yet — use the date box below if you watered it earlier. 🌱</div>`;
  return log.slice().reverse().map(e => {
    if (UI.editWater === e.id){
      return `<div class="log-item wlog-item editing">
        <input type="date" max="${max}" value="${isoDay(e.t)}" id="we_${e.id}" data-editwater="${id}">
        <button class="sky tiny" data-action="savewater" data-id="${id}" data-eid="${e.id}" data-src="we_${e.id}">💾 Save</button>
        <button class="ghost tiny" data-action="canceledit">Cancel</button></div>`;
    }
    const wx = e.wx ? ` · ${e.wx.tF}°F, ${e.wx.rh}% RH` : '';
    const kind = e.kind === 'refresh' ? '🔄 refreshed' : '💧 watered';
    return `<div class="log-item wlog-item">
      <span class="date">${fmtDate(e.t)}</span>
      <span>${kind} · <i>${relDay(e.t)}</i><span class="wx-stamp">${wx}</span></span>
      <button class="ghost tiny" data-action="editwater" data-eid="${e.id}" title="Change this date">✎</button>
      <button class="ghost tiny" data-action="delwater" data-id="${id}" data-eid="${e.id}" title="Delete">✕</button></div>`;
  }).join('');
}

function fitRow(label, f){
  const [emo, txt] = VERDICT[f.v];
  return `<div class="fit-row ${f.v}"><span class="fit-emo">${emo}</span>
    <div><b>${label} — ${txt}</b><div class="fit-note">${f.note}</div></div></div>`;
}

export function renderModalBody(){
  const p = plant(UI.openId), body = $('mBody');
  const d = daysUntil(p), due = d <= 0;
  const lw = lastWatered(p.id), lf = lastFed(p.id);
  const lastW = lw ? `${fmtDate(lw)} · ${relDay(lw)}` : '— never recorded';
  const fed   = lf ? `${fmtDate(lf)} · ${relDay(lf)}` : '—';
  const st = status(p), r = room(p);
  const fit = assess(p), moved = loc(p) !== p.location;
  const max = isoDay(today0());
  let h = '';
  const T = UI.openTab;

  if (T === 'overview') h = `<div class="pane">
      <div class="note-box"><b>${p.headline}</b></div>
      ${st?`<div class="note-box ${p.medium==='water'?'water':''}">📍 <b>Right now:</b> ${st}</div>`:''}
      <div class="fit-banner ${fit.overall}">${VERDICT[fit.overall][0]} <b>${r?r.name:'Unplaced'}</b> — ${VERDICT[fit.overall][1].toLowerCase()} for this plant${moved?' <span class="moved-tag">moved</span>':''}</div>
      <div class="kv"><dt>Plot ID</dt><dd>${p.id}</dd><dt>Home</dt><dd>${r?r.name:loc(p)}</dd>
        <dt>Medium</dt><dd>${p.medium==='water'?'Rooting in water 💧':'Potted in soil 🪴'}</dd>
        <dt>Light zone</dt><dd>${ZONE[p.zone]} indirect${p.growLight?' · ⚡ grow light':''}</dd>
        <dt>Stage</dt><dd>${STAGE[p.stage]}</dd><dt>Last ${p.medium==='water'?'refreshed':'watered'}</dt><dd>${lastW}</dd>
        <dt>Next check</dt><dd>${due?'now':fmtDate(nextCheck(p))}</dd></div>
      <h4>Quick tips</h4><ul>${p.tips.map(t=>`<li>${t}</li>`).join('')}</ul>
      <div class="actions-row">${waterBtn(p.id,true)}${fedBtn(p.id)}</div>${srcHTML(p)}</div>`;

  else if (T === 'water'){
    const win = wateringWindow(), f = recentDryFactor();
    h = `<div class="pane"><h4>💧 Watering</h4><p>${p.water}</p>
      <div class="note-box warn">Cool &amp; dim home = slow-drying soil. <b>Finger-check 2" down first;</b> when in doubt, wait.</div>
      <div class="kv"><dt>Base cadence</dt><dd>~${interval(p)} days</dd>
        <dt>Adjusted for ${r?r.name:'here'} + weather</dt><dd><b>~${effInterval(p)} days</b></dd>
        <dt>Last ${p.medium==='water'?'refreshed':'watered'}</dt><dd>${lastW}</dd><dt>Next</dt><dd>${due?'now':fmtDate(nextCheck(p))}</dd></div>
      <div class="actions-row">${waterBtn(p.id,true)}</div>
      ${fitRow('Rhythm in this room', fit.water)}
      <div class="note-box ${win.v==='poor'?'warn':'water'}">🌦️ <b>Best watering window:</b> ${win.txt} <i>(7-day dry factor ${f.toFixed(2)}×)</i></div>

      <h4>📓 Watering history</h4>
      <div id="wLogList">${waterLogHTML(p.id)}</div>
      <div class="log-form backdate-form">
        <label for="wDate">Watered earlier?</label>
        <input type="date" id="wDate" max="${max}" value="${max}" data-waterdate="${p.id}">
        <button data-action="addwater" data-id="${p.id}" data-src="wDate">＋ Record it</button>
      </div></div>`;
  }

  else if (T === 'placement'){
    const dx = diagnose(p);
    const sun = fit.light.sun || { label:'—', hours:0 };
    h = `<div class="pane"><h4>☀️ Light &amp; placement</h4><p>${p.light}</p>
      <div class="fit-banner ${fit.overall}">${VERDICT[fit.overall][0]} Currently in <b>${r?r.name:'nowhere'}</b> — ${VERDICT[fit.overall][1].toLowerCase()}</div>

      <div class="kv"><dt>Spot</dt><dd>${r?r.name+' — '+r.note:loc(p)}</dd>
        <dt>Direct sun here</dt><dd><b>${(fit.light.hours||0).toFixed(1)}h</b> today · ${sun.label}</dd>
        <dt>This plant wants</dt><dd>${fit.light.want ? fit.light.want[0]+'–'+fit.light.want[1]+'h' : '—'} (${ZONE[p.zone]})</dd></div>

      <h4>🩺 What's wrong here</h4>
      ${dx.issues.length ? `<div class="issues">${dx.issues.map(i => `
        <div class="issue ${i.sev}">
          <div class="issue-top"><span class="sev">${i.sev==='high'?'⚠️':'🟡'}</span><b>${i.title}</b></div>
          <div class="issue-why">${i.why}</div>
          <div class="issue-fix"><b>If it stays here:</b> ${i.fix}</div>
        </div>`).join('')}</div>`
        : '<div class="note-box">✅ Nothing wrong with this spot for this plant — light, temperature and humidity all land inside its range.</div>'}

      <h4>📍 Where it should go</h4>
      ${dx.alreadyBest
        ? `<div class="note-box">✅ <b>${r?r.name:'Here'}</b> is already the best room you have for it — nothing else scores higher.</div>`
        : `<div class="note-box">Best available: <b>${dx.best.room.name}</b> — ${dx.best.room.note}</div>`}
      ${dx.better.length ? `<div class="room-ranks">${dx.better.map(x => `<div class="room-rank ${x.a.overall}">
        <span>${VERDICT[x.a.overall][0]}</span><b>${x.room.name}</b>
        <span class="rr-note">${(x.a.light.hours||0).toFixed(1)}h sun · ${x.room.note}</span>
        <button class="ghost tiny" data-action="moveto" data-id="${p.id}" data-room="${x.room.id}">Move here</button></div>`).join('')}</div>`
        : ''}
      <p class="hint">Or drag it around directly on the 🗺️ Map tab with <b>Arrange</b> turned on.</p>
      ${srcHTML(p)}</div>`;
  }

  else if (T === 'soil') h = `<div class="pane"><h4>🪴 Soil</h4><p>${p.soil}</p></div>`;

  else if (T === 'climate'){
    const R = roomRanges(r);
    h = `<div class="pane"><h4>🌡️ Temperature</h4><p>${p.temp}</p>
      ${fitRow('Temperature here', fit.temp)}
      <h4>💦 Humidity</h4><p>${p.humidity}</p>
      ${fitRow('Humidity here', fit.humidity)}
      <div class="kv"><dt>Room</dt><dd>${r?r.name:'—'}${R.live?' <i>(outdoor — tracks live weather)</i>':''}</dd>
        <dt>Measured range</dt><dd>${R.tempF[0]}–${R.tempF[1]}°F · ${R.humidityPct[0]}–${R.humidityPct[1]}% RH</dd>
        <dt>Airflow</dt><dd>${R.airflow}${p.needs&&p.needs.draftSensitive?' · <b>this plant is draft-sensitive</b>':''}</dd>
        <dt>Plant wants</dt><dd>${p.needs?`${p.needs.tempF[0]}–${p.needs.tempF[1]}°F · ${p.needs.humidityPct[0]}–${p.needs.humidityPct[1]}% RH`:'—'}</dd></div>
      ${R.note?`<div class="note-box">🏠 ${R.note}</div>`:''}</div>`;
  }

  else if (T === 'fertilizer') h = `<div class="pane"><h4>🍽️ Fertilizer</h4><p>${p.fertilizer}</p>
      <div class="note-box">🍽️ <b>"Fertilized" = you gave it plant food</b> (diluted liquid feed). Mark it each time you feed — ~monthly spring–summer. <b>Skip fresh cuttings & winter.</b> The date stops you double-feeding (salt buildup burns tips).</div>
      <div class="kv"><dt>Last fertilized</dt><dd>${fed}</dd><dt>Times fed</dt><dd>${fedLog(p.id).length}</dd></div>
      <div class="actions-row">${fedBtn(p.id)}</div></div>`;

  else if (T === 'repot') h = `<div class="pane"><h4>📦 Repotting</h4><p>${p.repot}</p></div>`;
  else if (T === 'propagate') h = `<div class="pane"><h4>✂️ Propagation</h4><p>${p.propagate}</p></div>`;
  else if (T === 'issues') h = `<div class="pane"><h4>🐛 Common issues</h4>
      <ul>${p.issues.map(i=>`<li><b>${i.sign}</b> → ${i.fix}</li>`).join('')}</ul>
      <h4>📓 Your log</h4><div id="logList">${logHTML(p.id)}</div>
      <div class="log-form"><input id="logInput" data-logid="${p.id}" placeholder="Note an observation…"><button data-action="addlog" data-id="${p.id}">Add</button></div></div>`;
  body.innerHTML = h;
}

/* ---------------- home map (SVG) ----------------
   Room geometry is computed once here and exported, because actions.js needs
   the same rectangles to hit-test where a dragged pot was dropped.          */
export function roomRects(){
  const T = DB.home.grid.tile;
  return (DB.home.rooms || []).map(r => ({ id:r.id, room:r, x:r.x*T, y:r.y*T, w:r.w*T, h:r.h*T }));
}
/* The 5 addressable positions along each wall of a room, in SVG units.
   Inset from the wall so a pot sits *against* it rather than on the line. */
const SLOT_INSET = 34;
export function slotsFor(rect){
  const { x, y, w, h } = rect, N = SLOTS_PER_WALL, out = [];
  WALLS.forEach(wall => {
    for (let i = 0; i < N; i++){
      const f = (i + 0.5) / N;
      let sx, sy;
      if (wall === 'top'){ sx = x + w*f; sy = y + SLOT_INSET; }
      else if (wall === 'bottom'){ sx = x + w*f; sy = y + h - SLOT_INSET; }
      else if (wall === 'left'){ sx = x + SLOT_INSET; sy = y + h*f; }
      else { sx = x + w - SLOT_INSET; sy = y + h*f; }
      out.push({ room: rect.id, wall, slot: i, x: sx, y: sy });
    }
  });
  return out;
}
export function allSlots(){ return roomRects().flatMap(slotsFor); }

/* Nearest slot to a point, within `max` SVG units — null if the drop was
   nowhere near one, so a loose drop still just lands in the room. */
export function slotAt(x, y, max = 30){
  let best = null;
  allSlots().forEach(s => {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= max && (!best || d < best.d)) best = { ...s, d };
  });
  return best;
}

/* Where a plant's pot actually draws: its assigned slot, else auto-spaced
   along the bottom wall the way the map always did it. */
export function potPos(p, rect, autoIndex, autoCount){
  const pl = placement(p);
  if (pl.wall != null && pl.slot != null){
    const hit = slotsFor(rect).find(s => s.wall === pl.wall && s.slot === pl.slot);
    if (hit) return { x: hit.x, y: hit.y };
  }
  const padX = 26, span = rect.w - padX*2;
  const step = autoCount > 1 ? span/(autoCount-1) : 0;
  return { x: autoCount > 1 ? rect.x + padX + step*autoIndex : rect.x + rect.w/2,
           y: rect.y + rect.h - 30 };
}

export function roomAt(x, y){
  const hit = roomRects().find(r => x >= r.x && x <= r.x+r.w && y >= r.y && y <= r.y+r.h);
  return hit ? hit.id : null;
}

function curTheme(){ return document.documentElement.getAttribute('data-theme') || 'stardew'; }

function renderMapTools(){
  const moved = movedPlants().length, edits = roomsEdited();
  $('maptools').innerHTML = `
    <button class="${UI.arrange?'sky':'ghost'}" data-action="arrange">${UI.arrange?'✓ Done arranging':'✋ Arrange plants'}</button>
    <button class="${UI.build?'sky':'ghost'}" data-action="build">${UI.build?'✓ Done building':'🏗️ Edit rooms'}</button>
    ${UI.build?'<button class="ghost" data-action="addroom">➕ Add room</button>':''}
    ${edits?`<span class="moved-count">${edits} room edit${edits>1?'s':''}</span>`:''}
    ${UI.arrange?`<button class="ghost" data-action="resetlayout">↩️ Reset plants</button>
      <button class="ghost" data-action="resetapartment">🏗️ Reset apartment</button>
      <button class="ghost" data-action="exporthome">⬇️ Export placement</button>`:''}
    ${moved?`<span class="moved-count">${moved} plant${moved>1?'s':''} moved from the shipped layout</span>`:''}
    ${UI.arrange?'<span class="arrange-hint">Drag a pot into any room to move it. Its light, temp, humidity and watering rhythm all re-derive from where it lands.</span>':''}`;
}

/* Side tray: every plant, placed ones dimmed, unplaced ones full-colour and
   asking for a home. Doubles as a drop target — dropping a pot here lifts it
   off the map without deleting anything. */
export function renderRoomPanel(){
  const el = $('planttray'); if (!el) return;
  const r = DB.roomById[UI.selRoom];
  if (!r){
    el.classList.remove('arranging-tray');
    el.innerHTML = `<div class="tray-head pixel">🏗️ Rooms</div>
      <div class="tray-note">Tap a room on the map to edit it, or ➕ Add room.</div>
      <div class="tray-list">${(DB.home.rooms||[]).map(x =>
        `<div class="tray-item placed" data-action="selroom" data-room="${x.id}" role="button" tabindex="0">
          <span class="tray-sprite">${x.outdoor?'🌳':'🏠'}</span>
          <div class="tray-main"><div class="tray-name">${x.name}</div>
          <div class="tray-sub">${x.w}×${x.h} · light ${x.light}</div></div></div>`).join('')}</div>`;
    return;
  }
  const walls = WALLS.map(wl => {
    const ext = wallIsExterior(r, wl);
    return `<div class="wallrow"><b>${wl}</b><span class="wtag">${ext?'exterior':'interior'}</span>
      <button class="ghost tiny" data-action="togglewin" data-room="${r.id}" data-wall="${wl}">${hasWindow(r,wl)?'🪟 remove':'🪟 window'}</button>
      <button class="ghost tiny" data-action="toggledoor" data-room="${r.id}" data-wall="${wl}">${hasDoor(r,wl)?'🚪 remove':'🚪 door'}</button>
      ${hasWindow(r,wl)?`<button class="ghost tiny" data-action="winsun" data-room="${r.id}" data-wall="${wl}">${(r.windows.find(w=>w.edge===wl)||{}).direct?'☀️ direct':'🌤️ indirect'}</button>`:''}
    </div>`;
  }).join('');
  el.innerHTML = `<div class="tray-head pixel">🏗️ ${r.name}</div>
    <div class="tray-note">Drag the room to move · corner handle to resize</div>
    <div class="roomform">
      <label>Name<input id="rmName" type="text" value="${r.name.replace(/"/g,'&quot;')}" data-roomname="${r.id}"></label>
      <label>Light 0–5<input id="rmLight" type="number" min="0" max="5" value="${r.light||0}" data-roomlight="${r.id}"></label>
      <label>Floor<select id="rmFloor" data-roomfloor="${r.id}">
        ${['wood','carpet','tile','grass'].map(f=>`<option value="${f}" ${r.floor===f?'selected':''}>${f}</option>`).join('')}
      </select></label>
      <label class="chk"><input type="checkbox" id="rmOutdoor" data-roomoutdoor="${r.id}" ${r.outdoor?'checked':''}> Outdoor</label>
      <div class="wallset">${walls}</div>
      <div class="roomacts">
        <button class="ghost" data-action="deselroom">Done</button>
        <button class="danger" data-action="delroom" data-room="${r.id}">🗑️ Delete room</button>
      </div>
    </div>`;
}

export function renderTray(){
  const el = $('planttray'); if (!el) return;
  if (UI.build) return renderRoomPanel();
  const un = unplacedPlants();
  const rows = DB.plants.map(p => {
    const r = room(p), placed = !!r;
    const fit = placed ? assess(p) : null;
    return `<div class="tray-item ${placed?'placed':'unplaced'}" data-action="open" data-id="${p.id}"
                 data-tray="${p.id}" role="button" tabindex="0"
                 title="${placed ? 'In '+r.name : 'Not on the map yet'}">
      <span class="tray-sprite">${sprite(p,22)}</span>
      <div class="tray-main">
        <div class="tray-name">${p.name}</div>
        <div class="tray-sub">${placed
          ? `${VERDICT[fit.overall][0]} ${r.name}`
          : '<span class="placeme">place me!</span>'}</div>
      </div>
    </div>`;
  }).join('');
  el.classList.toggle('arranging-tray', !!UI.arrange);
  el.innerHTML = `<div class="tray-head pixel">🪴 The Plot</div>
    <div class="tray-note">${un.length ? `${un.length} waiting for a spot` : 'everyone has a home'}</div>
    <div class="tray-list">${rows}</div>
    ${UI.arrange ? '<div class="tray-drop">drag a plant onto the map to place it · drop a pot here to lift it off</div>' : ''}`;
}

export function renderHomeMap(){
  renderMapTools();
  renderTray();
  const TH = MAP_THEME[curTheme()] || MAP_THEME.stardew;
  const FLOOR = { wood:TH.wood, carpet:TH.carpet, tile:TH.tile, grass:TH.grass };
  const PLANK = { wood:TH.plankW, carpet:TH.plankC, tile:TH.plankT, grass:TH.plankG };
  const T = DB.home.grid.tile, W = DB.home.grid.cols*T, H = DB.home.grid.rows*T;
  let defs='', floors='', walls='', wins='', glows='', labels='', plants='', drops='', slots='', build='';
  floors += `<rect x="0" y="0" width="${W}" height="${H}" fill="${TH.hall}"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#hall)"/>`;
  defs += `<pattern id="hall" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${TH.hall}"/><rect width="16" height="2" fill="${TH.hall2}"/></pattern>`;
  (DB.home.rooms || []).forEach(r => {
    const x=r.x*T, y=r.y*T, w=r.w*T, h=r.h*T;
    const base=FLOOR[r.floor]||'#c89b62', plank=PLANK[r.floor]||'#a87c48', pid=`f_${r.id}`;
    defs += `<pattern id="${pid}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${base}"/><rect width="20" height="2" fill="${plank}"/></pattern>`;
    floors += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid})"/>`;
    const gs = {5:.55,4:.42,3:.34,2:.22,1:.12,0:0}[r.light] || 0;
    const dark = Math.max(0, 5 - r.light) * 0.05;
    (r.windows || []).forEach((wd, i) => {
      const gid = `g_${r.id}_${i}`; let cx, cy;
      if (wd.edge==='top'){ cx=x+w/2; cy=y; } else if (wd.edge==='bottom'){ cx=x+w/2; cy=y+h; }
      else if (wd.edge==='left'){ cx=x; cy=y+h/2; } else { cx=x+w; cy=y+h/2; }
      const strength = wd.direct ? gs + 0.22 : gs;
      defs += `<radialGradient id="${gid}" cx="${(cx-x)/w*100}%" cy="${(cy-y)/h*100}%" r="90%"><stop offset="0%" stop-color="rgba(255,241,190,${Math.min(.85,strength)})"/><stop offset="70%" stop-color="rgba(255,241,190,0)"/></radialGradient>`;
      glows += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${gid})"/>`;
    });
    if (dark > 0) glows += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(24,16,32,${dark})"/>`;
    walls += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${TH.wall}" stroke-width="5"/>`;
    // drop target outline — only visible while arranging (CSS drives opacity)
    drops += `<rect class="droptarget" data-room="${r.id}" x="${x+3}" y="${y+3}" width="${w-6}" height="${h-6}" rx="4"
      fill="rgba(255,241,190,.10)" stroke="#ffeaa0" stroke-width="3" stroke-dasharray="7 5"/>`;
    // 5 slots per wall, shown only in arrange mode (CSS drives visibility)
    slots += slotsFor({ id:r.id, x, y, w, h }).map(sl =>
      `<circle class="slotdot" data-room="${sl.room}" data-wall="${sl.wall}" data-slot="${sl.slot}"
         cx="${sl.x}" cy="${sl.y}" r="7"/>`).join('');
    (r.windows || []).forEach(wd => {
      const th=6; let wx, wy, ww, wh;
      if (wd.edge==='top'){ ww=w*0.6; wh=th; wx=x+(w-ww)/2; wy=y-th/2; }
      else if (wd.edge==='bottom'){ ww=w*0.68; wh=th; wx=x+(w-ww)/2; wy=y+h-th/2; }
      else if (wd.edge==='left'){ wh=h*0.6; ww=th; wx=x-th/2; wy=y+(h-wh)/2; }
      else { wh=h*0.6; ww=th; wx=x+w-th/2; wy=y+(h-wh)/2; }
      wins += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="2" fill="#dff0f7" stroke="#8bb8cc" stroke-width="1.5"/>`;
      if (wd.direct){ const sx=(wd.edge==='top'||wd.edge==='bottom')?wx+ww+6:wx+ww/2; const sy=(wd.edge==='top')?wy+8:wy-8;
        wins += `<text x="${sx}" y="${sy}" font-size="12" text-anchor="middle">☀️</text>`; }
    });
    const dim = r.light <= 2 && !r.outdoor;
    labels += `<text x="${x+8}" y="${y+16}" font-family="'Pixelify Sans',monospace" font-size="12" font-weight="700" fill="${dim?'#f4ead9':'#3a2413'}" style="paint-order:stroke;stroke:${dim?'rgba(0,0,0,.5)':'rgba(255,255,255,.35)'};stroke-width:2px">${r.name}</text>`;
    labels += `<text x="${x+w-6}" y="${y+16}" text-anchor="end" font-size="9">${r.outdoor?'🌳':(r.light>0?'☀️'.repeat(r.light):'🌑')}</text>`;
    // placement reads through the overlay, so dragged plants land in the new room
    if (UI.build){
      const sel = UI.selRoom === r.id;
      build += `<rect class="roomhit ${sel?'sel':''}" data-roomhit="${r.id}" x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent"/>`;
      if (sel){
        build += `<rect class="roomsel" x="${x+2}" y="${y+2}" width="${w-4}" height="${h-4}" rx="3"/>`;
        // corner handle resizes; the room body itself moves
        build += `<rect class="roomresize" data-resize="${r.id}" x="${x+w-13}" y="${y+h-13}" width="13" height="13" rx="2"/>`;
        // one control per wall: click toggles a window (exterior) or door (interior)
        WALLS.forEach(wl => {
          let cx, cy;
          if (wl==='top'){ cx=x+w/2; cy=y+9; } else if (wl==='bottom'){ cx=x+w/2; cy=y+h-9; }
          else if (wl==='left'){ cx=x+9; cy=y+h/2; } else { cx=x+w-9; cy=y+h/2; }
          const ext = wallIsExterior(r, wl), win = hasWindow(r, wl), door = hasDoor(r, wl);
          const glyph = win ? '🪟' : door ? '🚪' : (ext ? '+' : '·');
          build += `<g class="wallbtn ${ext?'ext':'int'} ${win||door?'on':''}" data-wall="${wl}" data-wallroom="${r.id}">
            <circle cx="${cx}" cy="${cy}" r="8"/>
            <text x="${cx}" y="${cy+3.5}" text-anchor="middle" font-size="9">${glyph}</text></g>`;
        });
      }
    }
    const rect = { id:r.id, x, y, w, h };
    const here = plantsIn(r.id);
    const auto = here.filter(p => placement(p).wall == null);
    if (here.length){
      here.forEach((p) => {
        const ai = auto.indexOf(p);
        const pos = potPos(p, rect, ai < 0 ? 0 : ai, auto.length || 1);
        const px = pos.x, py = pos.y;
        const fit = assess(p);
        plants += `<g class="plant-g fit-${fit.overall}" data-action="open" data-id="${p.id}" data-plant="${p.id}"
             data-hx="${px}" data-hy="${py}" transform="translate(${px},${py})">
          <g transform="translate(0,-14)">
          <ellipse cx="0" cy="20" rx="15" ry="4" fill="rgba(0,0,0,.22)"/>
          <path d="M-11 6 L11 6 L8 20 L-8 20 Z" fill="#b5623a" stroke="#7a3f24" stroke-width="1.5"/>
          <rect x="-12" y="3" width="24" height="4" rx="1.5" fill="#c8703f" stroke="#7a3f24" stroke-width="1.2"/>
          ${p.spriteFile
            ? `<image class="pot-img" href="${p.spriteFile}" x="-15" y="-16" width="30" height="30" preserveAspectRatio="xMidYMid meet"/>`
            : `<text class="pot-emoji" x="0" y="2" font-size="21" text-anchor="middle">${p.sprite}</text>`}
          ${p.growLight?'<text x="12" y="-6" font-size="11" text-anchor="middle">⚡</text>':''}
          ${fit.overall!=='good'?`<text class="fit-flag" x="-13" y="-6" font-size="11" text-anchor="middle">${VERDICT[fit.overall][0]}</text>`:''}
          <rect x="-11" y="21" width="22" height="11" rx="3" fill="#6f4526"/>
          <text x="0" y="29" font-size="8" font-weight="800" text-anchor="middle" fill="#fff5df">${p.id}</text>
          </g>
        </g>`;
      });
    }
  });
  const svg = `<svg id="mapsvg" class="${UI.arrange?'arranging':''} ${UI.build?'building':''}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Apartment map"><defs>${defs}</defs>${floors}${glows}${walls}${wins}${labels}${drops}${slots}${plants}${build}</svg>`;
  const mf = $('mapframe'); mf.style.background = `linear-gradient(${TH.frameA},${TH.frameB})`; mf.innerHTML = svg;
  $('maplegend').innerHTML = `<span>☀️ <b>light</b> (1–5)</span><span>☀️ next to a window = <b>direct sun</b></span><span><b>⚡</b> grow light</span><span>⚠️ <b>poor fit</b> for that spot</span><span>🌑 no light</span><span>${UI.arrange?'<b>Drag</b> a pot to move it':'Tap a plant to open its card'}</span>`;
}

/* ---------------- weather log view ---------------- */
export function renderWeather(){
  const wrap = $('weatherBody'); if (!wrap) return;
  const rows = wxLog().slice().reverse(), f = recentDryFactor(), win = wateringWindow();
  if (!rows.length){
    wrap.innerHTML = `<div class="note-box warn">No readings recorded yet. Open the app while online and the log starts filling — one row per day.</div>`;
    return;
  }
  const head = `
    <div class="wx-cards">
      <div class="wx-card"><div class="lbl">7-day dry factor</div><div class="val">${f.toFixed(2)}×</div>
        <div class="sub">${f > 1.05 ? 'Drying faster than baseline — checks move up' : f < 0.95 ? 'Drying slower than baseline — checks stretch out' : 'About the baseline rhythm'}</div></div>
      <div class="wx-card"><div class="lbl">Days recorded</div><div class="val">${wxLog().length}</div><div class="sub">kept rolling, newest first</div></div>
      <div class="wx-card ${win.v}"><div class="lbl">Watering window</div><div class="val">${win.v==='good'?'✅ Good':win.v==='poor'?'⚠️ Hold off':'🟡 Fine'}</div><div class="sub">${win.txt}</div></div>
    </div>`;

  const table = `<h4 class="wx-h">📈 Recorded readings</h4>
    <div class="wx-tablewrap"><table class="wx-table">
      <thead><tr><th>Date</th><th>Conditions</th><th>Temp</th><th>Hi/Lo</th><th>RH</th><th>Dry factor</th></tr></thead>
      <tbody>${rows.map(r => {
        const [emo, txt] = WMO[r.code] || ['🌡️','—'];
        const cls = r.dry >= 1.1 ? 'fast' : r.dry <= 0.9 ? 'slow' : '';
        return `<tr><td>${fmtDate(r.d)}</td><td>${emo} ${txt}</td><td>${r.tF}°F</td>
          <td>${r.hiF!=null?r.hiF+'°':'—'}${r.loF!=null?' / '+r.loF+'°':''}</td><td>${r.rh}%</td>
          <td class="dry ${cls}">${(r.dry||1).toFixed(2)}×</td></tr>`;
      }).join('')}</tbody></table></div>`;

  const plan = `<h4 class="wx-h">💧 Best watering times</h4>
    <p class="hint">Base cadence, adjusted by the room the plant is standing in and the weather actually recorded above.</p>
    <div class="wx-plan">${DB.plants.map(p => {
      const lw = lastWatered(p.id), d = daysUntil(p), due = d <= 0;
      const r = room(p);
      return `<div class="plan-row ${due?'due':''}" data-action="open" data-id="${p.id}" role="button" tabindex="0">
        <span class="t-emoji">${sprite(p,24)}</span>
        <div class="t-main"><div class="t-name">${p.name}</div>
          <div class="t-meta">${r?r.name:'unplaced'} · every ~${effInterval(p)}d (base ${interval(p)}d) · ${lw?'last '+fmtDate(lw):'never logged'}</div></div>
        <span class="plan-next ${due?'due':''}">${!hasHistory(p.id) ? 'not recorded' : due ? `${actWord(p)} now` : fmtDate(nextCheck(p))}</span>
      </div>`;
    }).join('')}</div>`;

  wrap.innerHTML = head + table + plan;
}

/* ---------------- almanac ---------------- */
export function renderAlmanac(){
  const wrap = $('almanac'); if (!wrap) return;
  if (!DB.almanac){ wrap.innerHTML = '<p style="font-size:13px">No almanac loaded.</p>'; return; }
  $('almTitle').textContent = DB.almanac.title || 'Almanac';
  $('almSub').textContent = DB.almanac.subtitle || '';
  wrap.innerHTML = (DB.almanac.sections || []).map(s => `
    <div class="alm-sec">
      <div class="alm-head pixel"><span class="alm-emoji">${s.icon||'📄'}</span><span>${s.title}</span></div>
      ${s.intro?`<p class="alm-intro">${s.intro}</p>`:''}
      ${(s.groups||[]).map(g => `
        ${g.heading?`<div class="alm-gh">${g.heading}</div>`:''}
        <ul class="alm-list">${(g.items||[]).map(it => `<li><b>${it.name}</b>${it.detail?` — ${it.detail}`:''}</li>`).join('')}</ul>`).join('')}
      ${s.note?`<div class="note-box">${s.note}</div>`:''}
      ${s.sources&&s.sources.length?`<div class="sources">📚 ${s.sources.map(x=>`<a href="${x.url}" target="_blank" rel="noopener">${x.label}</a>`).join(' · ')}</div>`:''}
    </div>`).join('');
}
