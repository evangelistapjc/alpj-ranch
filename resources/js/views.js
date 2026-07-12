// ===========================================================================
// views.js — presentation layer. Every function here only READS state and
// injects markup. Interactivity is expressed as data-action attributes that
// events.js delegates to actions.js — there are no inline handlers.
// ===========================================================================
import { DB, UI, ps, fmtDate, nextCheck, daysUntil, interval, actWord,
         isWateredToday, isFedToday, plant } from './state.js';
import { ZONE, STAGE, TABS, GROUPINGS, MAP_THEME } from './config.js';

const $ = (id) => document.getElementById(id);

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
    <div class="cond"><span class="big">💡</span><div><div class="lbl">Home light</div><div class="val">Bright-indirect</div><div class="sub">1 direct-sun sill (kitchen)</div></div></div>
    <div class="cond"><span class="big">🏠</span><div><div class="lbl">Indoor temp</div><div class="val">Cool ~${H.indoor.tempF[0]}–${H.indoor.tempF[1]}°F</div><div class="sub">slow-drying soil</div></div></div>
    <div class="cond"><span class="big">🌤️</span><div><div class="lbl">Brightest spot</div><div class="val">Bedroom bay</div><div class="sub">bright, but indirect</div></div></div>
  </div>

  <div class="viewnav">
    <button data-action="view" data-view="care" id="navCare" class="on">🌿 Care</button>
    <button data-action="view" data-view="home" id="navHome">🗺️ Map</button>
    <button data-action="view" data-view="almanac" id="navAlmanac">📖 Almanac</button>
  </div>

  <div id="careView">
    <section class="board panel">
      <h2 class="pixel"><span>📋</span> Today on the Ranch</h2>
      <p class="sub">Cool + low light = slow-drying soil. These are <b>check-first</b> nudges — poke a finger 2" down; only water if dry.</p>
      <div id="tasks" class="tasks"></div>
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
  </div>

  <section id="homeView" class="mapwrap panel" hidden>
    <h2 class="pixel"><span>🗺️</span> Home Map</h2>
    <p class="sub">Your apartment, drawn top-down. Glowing edges are windows; brighter floors = more light. Tap a plant to open its care card.</p>
    <div class="mapframe" id="mapframe"></div>
    <div class="maplegend" id="maplegend"></div>
  </section>

  <section id="almanacView" class="mapwrap panel" hidden>
    <h2 class="pixel"><span>📖</span> <span id="almTitle">Almanac</span></h2>
    <p class="sub" id="almSub"></p>
    <div id="almanac"></div>
  </section>

  <p class="foot">${H.name} 🌾 · care facts from horticulture guides (linked per plant) · live weather via Open-Meteo · tuned for ${H.location.city}</p>`;
}

/* ---------------- care view ---------------- */
export function renderCare(){ renderTasks(); renderGrove(); }

function renderTasks(){
  const el = $('tasks');
  const due = DB.plants.map(p => ({ p, d: daysUntil(p) })).filter(x => x.d <= 2).sort((a,b) => a.d - b.d);
  if (!due.length){ el.innerHTML = '<div class="all-good">🌾 Nothing thirsty today. The ranch is content.</div>'; return; }
  el.innerHTML = due.map(({ p, d }) => {
    const dry = d <= 0, over = d < 0;
    const meta = over ? `Overdue ${Math.abs(d)}d` : d === 0 ? 'Check today' : `In ${d}d`;
    return `<div class="task ${dry?'dry':''}"><span class="t-emoji">${p.sprite}</span>
      <div class="t-main"><div class="t-name">${p.name}</div>
        <div class="t-meta">${p.medium==='water'?'🔄':'💧'} ${meta} · ${p.medium==='water'?'refresh water':'finger-check'}</div></div>
      ${waterBtn(p.id,false)}</div>`;
  }).join('');
}

export function renderGrove(){
  const grove = $('grove');
  if (UI.group === 'none'){ grove.innerHTML = `<div class="plot">${DB.plants.map(cardHTML).join('')}</div>`; return; }
  const G = GROUPINGS[UI.group];
  let keys = G.order.length ? G.order.slice() : [...new Set(DB.plants.map(G.of))];
  [...new Set(DB.plants.map(G.of))].forEach(k => { if (!keys.includes(k)) keys.push(k); });
  grove.innerHTML = keys.map(k => {
    const members = DB.plants.filter(p => G.of(p) === k);
    if (!members.length) return '';
    let m = G.meta && G.meta[k];
    if (!m && UI.group === 'room'){ const r = DB.roomById[k]; m = { emoji:'🏠', title:r?r.name:k, note:r?r.note:'' }; }
    m = m || { emoji:'🏠', title:k, note:'' };
    return `<div class="group"><div class="group-head"><span class="g-emoji">${m.emoji}</span><span class="g-title">${m.title}</span>${m.note?`<span class="g-note">${m.note}</span>`:''}</div><div class="plot">${members.map(cardHTML).join('')}</div></div>`;
  }).join('');
}

function cardHTML(p){
  const d = daysUntil(p), due = d <= 0;
  const nextTxt = due ? `${actWord(p)} now` : `${p.medium==='water'?'Refresh':'Check'} ${fmtDate(nextCheck(p))}`;
  const st = ps(p.id).status || p.currentStatus;
  return `<div class="card" tabindex="0" role="button" data-action="open" data-id="${p.id}">
    <div class="c-top"><span class="c-sprite">${p.sprite}</span>
      <div><div class="c-name">${p.name}</div><div class="c-bot">${p.botanical}</div></div>
      <span class="c-id">${p.id}</span></div>
    <div class="c-body">
      <div class="chips">
        <span class="chip light">☀️ ${ZONE[p.zone]}</span>
        <span class="chip water">${p.medium==='water'?'🔄 water-prop':'💧 '+p.waterDays+'d'}</span>
        <span class="chip stage">🌱 ${STAGE[p.stage]}</span>
        ${p.growLight?'<span class="chip grow">⚡ grow light</span>':''}
      </div>
      ${st?`<div class="c-status ${p.medium==='water'?'water':''}">📍 ${st}</div>`:''}
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
  const log = ps(id).log || [];
  if (!log.length) return '<div class="log-empty">No notes yet. 🌱</div>';
  return log.slice().reverse().map((e, ri) => {
    const idx = log.length - 1 - ri;
    return `<div class="log-item"><span class="date">${fmtDate(new Date(e.t))}</span><span>${e.txt}</span><button class="ghost tiny" style="margin-left:auto" data-action="dellog" data-id="${id}" data-idx="${idx}">✕</button></div>`;
  }).join('');
}
export function renderModalBody(){
  const p = plant(UI.openId), body = $('mBody');
  const d = daysUntil(p), due = d <= 0, s = ps(p.id);
  const lastW = s.lastWatered ? fmtDate(new Date(s.lastWatered)) : '—';
  const fed   = s.lastFed ? fmtDate(new Date(s.lastFed)) : '—';
  const st = s.status || p.currentStatus, room = DB.roomById[p.location];
  let h = '';
  const T = UI.openTab;
  if (T === 'overview') h = `<div class="pane">
      <div class="note-box"><b>${p.headline}</b></div>
      ${st?`<div class="note-box ${p.medium==='water'?'water':''}">📍 <b>Right now:</b> ${st}</div>`:''}
      <div class="kv"><dt>Plot ID</dt><dd>${p.id}</dd><dt>Home</dt><dd>${room?room.name:p.location}</dd>
        <dt>Medium</dt><dd>${p.medium==='water'?'Rooting in water 💧':'Potted in soil 🪴'}</dd>
        <dt>Light zone</dt><dd>${ZONE[p.zone]} indirect${p.growLight?' · ⚡ grow light':''}</dd>
        <dt>Stage</dt><dd>${STAGE[p.stage]}</dd><dt>Last ${p.medium==='water'?'refreshed':'watered'}</dt><dd>${lastW}</dd>
        <dt>Next check</dt><dd>${due?'now':fmtDate(nextCheck(p))}</dd></div>
      <h4>Quick tips</h4><ul>${p.tips.map(t=>`<li>${t}</li>`).join('')}</ul>
      <div class="actions-row">${waterBtn(p.id,true)}${fedBtn(p.id)}</div>${srcHTML(p)}</div>`;
  else if (T === 'water') h = `<div class="pane"><h4>💧 Watering</h4><p>${p.water}</p>
      <div class="note-box warn">Cool &amp; dim home = slow-drying soil. <b>Finger-check 2" down first;</b> when in doubt, wait.</div>
      <div class="kv"><dt>Check every</dt><dd>~${interval(p)} days${p.medium==='water'?' (water refresh)':''}</dd>
        <dt>Last ${p.medium==='water'?'refreshed':'watered'}</dt><dd>${lastW}</dd><dt>Next</dt><dd>${due?'now':fmtDate(nextCheck(p))}</dd></div>
      <div class="actions-row">${waterBtn(p.id,true)}</div></div>`;
  else if (T === 'placement') h = `<div class="pane"><h4>☀️ Light &amp; placement</h4><p>${p.light}</p>
      <div class="kv"><dt>Best spot</dt><dd>${room?room.name+' — '+room.note:p.location}</dd><dt>Zone</dt><dd>${ZONE[p.zone]} indirect</dd></div>${srcHTML(p)}</div>`;
  else if (T === 'soil') h = `<div class="pane"><h4>🪴 Soil</h4><p>${p.soil}</p></div>`;
  else if (T === 'climate') h = `<div class="pane"><h4>🌡️ Temperature</h4><p>${p.temp}</p><h4>💦 Humidity</h4><p>${p.humidity}</p></div>`;
  else if (T === 'fertilizer') h = `<div class="pane"><h4>🍽️ Fertilizer</h4><p>${p.fertilizer}</p>
      <div class="note-box">🍽️ <b>"Fertilized" = you gave it plant food</b> (diluted liquid feed). Mark it each time you feed — ~monthly spring–summer. <b>Skip fresh cuttings & winter.</b> The date stops you double-feeding (salt buildup burns tips).</div>
      <div class="kv"><dt>Last fertilized</dt><dd>${fed}</dd></div><div class="actions-row">${fedBtn(p.id)}</div></div>`;
  else if (T === 'repot') h = `<div class="pane"><h4>📦 Repotting</h4><p>${p.repot}</p></div>`;
  else if (T === 'propagate') h = `<div class="pane"><h4>✂️ Propagation</h4><p>${p.propagate}</p></div>`;
  else if (T === 'issues') h = `<div class="pane"><h4>🐛 Common issues</h4>
      <ul>${p.issues.map(i=>`<li><b>${i.sign}</b> → ${i.fix}</li>`).join('')}</ul>
      <h4>📓 Your log</h4><div id="logList">${logHTML(p.id)}</div>
      <div class="log-form"><input id="logInput" data-logid="${p.id}" placeholder="Note an observation…"><button data-action="addlog" data-id="${p.id}">Add</button></div></div>`;
  body.innerHTML = h;
}

/* ---------------- home map (SVG) ---------------- */
function curTheme(){ return document.documentElement.getAttribute('data-theme') || 'stardew'; }
export function renderHomeMap(){
  const TH = MAP_THEME[curTheme()] || MAP_THEME.stardew;
  const FLOOR = { wood:TH.wood, carpet:TH.carpet, tile:TH.tile, grass:TH.grass };
  const PLANK = { wood:TH.plankW, carpet:TH.plankC, tile:TH.plankT, grass:TH.plankG };
  const T = DB.home.grid.tile, W = DB.home.grid.cols*T, H = DB.home.grid.rows*T;
  let defs='', floors='', walls='', wins='', glows='', labels='', plants='';
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
    const here = DB.plants.filter(p => p.location === r.id);
    if (here.length){
      const padX=26, span=w-padX*2, step=here.length>1?span/(here.length-1):0, py=y+h-30;
      here.forEach((p, i) => {
        const px = here.length>1 ? x+padX+step*i : x+w/2;
        plants += `<g class="plant-g" data-action="open" data-id="${p.id}" transform="translate(${px},${py})">
          <ellipse cx="0" cy="20" rx="15" ry="4" fill="rgba(0,0,0,.22)"/>
          <path d="M-11 6 L11 6 L8 20 L-8 20 Z" fill="#b5623a" stroke="#7a3f24" stroke-width="1.5"/>
          <rect x="-12" y="3" width="24" height="4" rx="1.5" fill="#c8703f" stroke="#7a3f24" stroke-width="1.2"/>
          <text class="pot-emoji" x="0" y="2" font-size="21" text-anchor="middle">${p.sprite}</text>
          ${p.growLight?'<text x="12" y="-6" font-size="11" text-anchor="middle">⚡</text>':''}
          <rect x="-11" y="21" width="22" height="11" rx="3" fill="#6f4526"/>
          <text x="0" y="29" font-size="8" font-weight="800" text-anchor="middle" fill="#fff5df">${p.id}</text>
        </g>`;
      });
    }
  });
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Apartment map"><defs>${defs}</defs>${floors}${glows}${walls}${wins}${labels}${plants}</svg>`;
  const mf = $('mapframe'); mf.style.background = `linear-gradient(${TH.frameA},${TH.frameB})`; mf.innerHTML = svg;
  $('maplegend').innerHTML = `<span>☀️ <b>light</b> (1–5)</span><span>☀️ next to a window = <b>direct sun</b></span><span><b>⚡</b> grow light</span><span>🌑 no light</span><span>Tap a plant to open its card</span>`;
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
