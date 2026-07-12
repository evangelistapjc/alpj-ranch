/* ============ storage shim (localStorage → memory fallback) ============ */
const Store=(()=>{let mem={},ok=false;try{const k='__alpj__';localStorage.setItem(k,'1');localStorage.removeItem(k);ok=true;}catch(e){}
  return{get(k){try{return ok?JSON.parse(localStorage.getItem(k)||'null'):(mem[k]??null)}catch(e){return mem[k]??null}},
         set(k,v){try{ok?localStorage.setItem(k,JSON.stringify(v)):(mem[k]=v)}catch(e){mem[k]=v}},persists:ok};})();

/* ============ data loading (embedded OR fetched JSON) ============ */
let HOME=null, PLANTS=[], ROOM_BY_ID={};
async function loadData(){
  if(window.EMBEDDED_DATA) return window.EMBEDDED_DATA;         // standalone build
  const base='data/';
  const idx=await (await fetch(base+'index.json')).json();
  const home=await (await fetch(base+idx.home)).json();
  const plants=await Promise.all(idx.plants.map(p=>fetch(base+p).then(r=>r.json())));
  return {home, plants};
}

/* ============ weather (Open-Meteo, free, no key) ============ */
const WMO={0:['☀️','Clear'],1:['🌤️','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁️','Cloudy'],
  45:['🌫️','Fog'],48:['🌫️','Fog'],51:['🌦️','Light drizzle'],53:['🌦️','Drizzle'],55:['🌧️','Drizzle'],
  61:['🌧️','Light rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],71:['🌨️','Snow'],80:['🌦️','Showers'],
  81:['🌧️','Showers'],82:['⛈️','Heavy showers'],95:['⛈️','Thunderstorm'],96:['⛈️','Thunderstorm'],99:['⛈️','Thunderstorm']};
async function loadWeather(){
  if(!HOME?.location) return;
  const {lat,lon}=HOME.location;
  const tile=document.getElementById('wxTile'); if(!tile) return;
  try{
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
    const w=await (await fetch(u)).json();
    const c=w.current, t=Math.round(c.temperature_2m), rh=c.relative_humidity_2m, hi=Math.round(w.daily.temperature_2m_max[0]);
    const [emo,txt]=WMO[c.weather_code]||['🌡️','—'];
    let nudge = t>=85 ? 'Warm out — indoors dries a bit faster.' : t<=60 ? 'Cool — soil stays wet longer, ease off water.' : 'Mild — normal watering rhythm.';
    tile.querySelector('.big').textContent=emo;
    tile.querySelector('.val').textContent=`${t}°F · ${txt}`;
    tile.querySelector('.sub').textContent=`${HOME.location.city.split(',')[0]} · ${rh}% RH · hi ${hi}° · ${nudge}`;
  }catch(e){ tile.querySelector('.val').textContent='Weather offline'; tile.querySelector('.sub').textContent='Connect to load live conditions'; }
}

/* ============ state / dates ============ */
function state(){return Store.get('alpj_state')||{}}
function saveState(s){Store.set('alpj_state',s)}
function ps(id){return state()[id]||{}}
function setPs(id,patch){const s=state();s[id]={...(s[id]||{}),...patch};saveState(s)}
const DAY=86400000;
function today0(){const d=new Date();d.setHours(0,0,0,0);return d}
function fmtDate(d){return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function isSameDay(iso){if(!iso)return false;const d=new Date(iso),t=today0();return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate()}
function interval(p){return p.medium==='water'?6:p.waterDays}
function nextCheck(p){const b=ps(p.id).lastWatered?new Date(ps(p.id).lastWatered):today0();return new Date(b.getTime()+interval(p)*DAY)}
function daysUntil(p){return Math.round((nextCheck(p)-today0())/DAY)}
function actWord(p){return p.medium==='water'?'Refresh':'Water'}

/* ============ labels ============ */
const ZONE={bright:'Bright',medium:'Medium',low:'Low'};
const STAGE={establishing:'Establishing',growing:'Growing',propReady:'Prop-ready'};

/* ============ boot ============ */
let currentGroup='light', currentView='care', openId=null, openTab='overview';
(async function boot(){
  try{
    const data=await loadData();
    HOME=data.home; PLANTS=data.plants;
    ROOM_BY_ID={}; (HOME.rooms||[]).forEach(r=>ROOM_BY_ID[r.id]=r);
    renderShell(); render(); loadWeather();
    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('sw.js').catch(()=>{});
    }
    if(!Store.persists) setTimeout(()=>toast('👀 Preview mode — install or download to save tracking'),700);
  }catch(e){
    document.getElementById('app').innerHTML=`<div class="panel" style="padding:20px">
      <h2 class="pixel" style="color:var(--wood-d)">🌱 ALPJ Ranch</h2>
      <div class="errbox"><b>Couldn't load the plant data files.</b><br><br>
      This version reads separate JSON files, which browsers block when you open the file directly
      (the <code>file://</code> security rule). Two easy fixes:<br><br>
      <b>1 · Serve it locally</b> — in the project folder run:<br>
      <code>python3 -m http.server</code><br>then open <code>http://localhost:8000</code>.<br><br>
      <b>2 · Use the standalone file</b> — open <code>alpj-ranch-standalone.html</code> instead (data is baked in; works by double-click and on your phone).<br><br>
      <b>3 · Host it</b> — push to GitHub Pages / Netlify for a phone-friendly link.</div>
      <div style="font-size:12px;color:var(--ink-soft)">Technical: ${String(e).slice(0,120)}</div></div>`;
  }
})();

/* ============ shell ============ */
function renderShell(){
  const app=document.getElementById('app');
  app.innerHTML=`
  <header class="sign">
    <svg width="50" height="50" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="#3f6d2c"><rect x="7" y="9" width="2" height="5"/></g>
      <g fill="#5f9a37"><rect x="4" y="8" width="3" height="2"/><rect x="3" y="9" width="2" height="2"/><rect x="9" y="8" width="3" height="2"/><rect x="11" y="9" width="2" height="2"/></g>
      <g fill="#e8b23a"><rect x="6" y="2" width="4" height="4"/><rect x="5" y="3" width="6" height="2"/><rect x="7" y="0" width="2" height="2"/><rect x="7" y="6" width="2" height="1"/><rect x="2" y="3" width="2" height="1"/><rect x="12" y="3" width="2" height="1"/></g>
    </svg>
    <div><h1 class="pixel">${HOME.name}</h1><p>Plant care · ${HOME.location.city} · low-light, first-floor apartment</p></div>
    <div class="plot-count"><b class="pixel">${PLANTS.length}</b><span>plants in the plot</span></div>
  </header>

  <div class="conditions">
    <div class="cond" id="wxTile"><span class="big">🌡️</span><div><div class="lbl">Live weather</div><div class="val">Loading…</div><div class="sub">fetching…</div></div></div>
    <div class="cond"><span class="big">💡</span><div><div class="lbl">Home light</div><div class="val">Bright-indirect</div><div class="sub">1 direct-sun sill (kitchen)</div></div></div>
    <div class="cond"><span class="big">🏠</span><div><div class="lbl">Indoor temp</div><div class="val">Cool ~${HOME.indoor.tempF[0]}–${HOME.indoor.tempF[1]}°F</div><div class="sub">slow-drying soil</div></div></div>
    <div class="cond"><span class="big">🌤️</span><div><div class="lbl">Brightest spot</div><div class="val">Bedroom bay</div><div class="sub">bright, but indirect</div></div></div>
  </div>

  <div class="viewnav">
    <button id="navCare" class="on" onclick="switchView('care')">🌿 Care Dashboard</button>
    <button id="navHome" onclick="switchView('home')">🗺️ Home Map</button>
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
          <button data-g="light" class="on">☀️ Light</button>
          <button data-g="water">💧 Water</button>
          <button data-g="stage">🌱 Stage</button>
          <button data-g="room">🏠 Room</button>
          <button data-g="none">🔲 All</button>
        </div></div>
      <div id="grove"></div>
    </section>
    <section class="export panel">
      <span style="font-size:34px">📅</span>
      <div class="txt"><h2 class="pixel">Send to Google Calendar</h2>
        <p>Downloads an <b>.ics</b> with recurring watering/feeding + prop reminders. In Google Calendar: Settings → Import &amp; export.</p></div>
      <button class="sky" onclick="exportICS()">⬇️ Download .ics</button>
    </section>
  </div>

  <section id="homeView" class="mapwrap panel" hidden>
    <h2 class="pixel"><span>🗺️</span> Home Map</h2>
    <p class="sub">Your apartment, drawn top-down. Glowing edges are windows; brighter floors = more light. Tap a plant to open its care card.</p>
    <div class="mapframe" id="mapframe"></div>
    <div class="maplegend" id="maplegend"></div>
  </section>

  <p class="foot">${HOME.name} 🌾 · care facts from horticulture guides (linked per plant) · live weather via Open-Meteo · tuned for ${HOME.location.city}</p>`;
  document.getElementById('groupSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    currentGroup=b.dataset.g;document.querySelectorAll('#groupSeg button').forEach(x=>x.classList.toggle('on',x===b));renderGrove();});
}

/* ============ render care view ============ */
function render(){renderTasks();renderGrove();}
function renderTasks(){
  const el=document.getElementById('tasks');
  const due=PLANTS.map(p=>({p,d:daysUntil(p)})).filter(x=>x.d<=2).sort((a,b)=>a.d-b.d);
  if(!due.length){el.innerHTML='<div class="all-good">🌾 Nothing thirsty today. The ranch is content.</div>';return;}
  el.innerHTML=due.map(({p,d})=>{const dry=d<=0,over=d<0;
    const meta=over?`Overdue ${Math.abs(d)}d`:d===0?'Check today':`In ${d}d`;
    return `<div class="task ${dry?'dry':''}"><span class="t-emoji">${p.sprite}</span>
      <div class="t-main"><div class="t-name">${p.name}</div><div class="t-meta">${p.medium==='water'?'🔄':'💧'} ${meta} · ${p.medium==='water'?'refresh water':'finger-check'}</div></div>
      ${waterBtn(p.id,false)}</div>`;}).join('');
}
const GROUPINGS={
  light:{order:['bright','medium','low'],of:p=>p.zone,meta:{
    bright:{emoji:'☀️',title:'Bright — Bedroom bay',note:'Light-hungry & variegated'},
    medium:{emoji:'🌤️',title:'Medium — Den / Kitchen / Living',note:'Tolerant of less light'},
    low:{emoji:'🌑',title:'Low light',note:'Last resort only'}}},
  water:{order:['sip','regular'],of:p=>p.waterBucket,meta:{
    sip:{emoji:'🏜️',title:'Sip — dry-down crew',note:'Check every 2–3 wks'},
    regular:{emoji:'💧',title:'Regular — weekly-ish',note:'Check every ~10–14 days'}}},
  stage:{order:['establishing','growing','propReady'],of:p=>p.stage,meta:{
    establishing:{emoji:'🌱',title:'Establishing — props & babies',note:'Gentle care, no fertilizer yet'},
    growing:{emoji:'🌿',title:'Growing — established',note:'Normal rhythm'},
    propReady:{emoji:'✂️',title:'Propagation-ready',note:'Coming up for cuttings'}}},
  room:{order:[],of:p=>p.location,meta:{}},
};
function renderGrove(){
  const grove=document.getElementById('grove');
  if(currentGroup==='none'){grove.innerHTML=`<div class="plot">${PLANTS.map(cardHTML).join('')}</div>`;bindCards();return;}
  const G=GROUPINGS[currentGroup];
  let keys=G.order.length?G.order.slice():[...new Set(PLANTS.map(G.of))];
  [...new Set(PLANTS.map(G.of))].forEach(k=>{if(!keys.includes(k))keys.push(k)});
  let html='';
  keys.forEach(k=>{const members=PLANTS.filter(p=>G.of(p)===k);if(!members.length)return;
    let m=(G.meta&&G.meta[k]);
    if(!m && currentGroup==='room'){const r=ROOM_BY_ID[k];m={emoji:'🏠',title:r?r.name:k,note:r?r.note:''};}
    m=m||{emoji:'🏠',title:k,note:''};
    html+=`<div class="group"><div class="group-head"><span class="g-emoji">${m.emoji}</span><span class="g-title">${m.title}</span>${m.note?`<span class="g-note">${m.note}</span>`:''}</div><div class="plot">${members.map(cardHTML).join('')}</div></div>`;});
  grove.innerHTML=html;bindCards();
}
function cardHTML(p){
  const d=daysUntil(p),due=d<=0;
  const nextTxt=due?`${actWord(p)} now`:`${p.medium==='water'?'Refresh':'Check'} ${fmtDate(nextCheck(p))}`;
  const st=ps(p.id).status||p.currentStatus;
  return `<div class="card" tabindex="0" data-id="${p.id}" role="button">
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
function bindCards(){document.querySelectorAll('.card').forEach(c=>{c.addEventListener('click',()=>openModal(c.dataset.id));
  c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openModal(c.dataset.id);}});});}

/* ============ water/fed buttons ============ */
function isWateredToday(id){return isSameDay(ps(id).lastWatered)}
function isFedToday(id){return isSameDay(ps(id).lastFed)}
function toggleWatered(id,ev){if(ev)ev.stopPropagation();const s=ps(id),p=PLANTS.find(x=>x.id===id);
  if(isSameDay(s.lastWatered)){setPs(id,{lastWatered:s.prevWatered||null,prevWatered:null});toast(`↩️ ${p.name} undone`);}
  else{setPs(id,{prevWatered:s.lastWatered||null,lastWatered:today0().toISOString()});toast(`${p.medium==='water'?'🔄':'💧'} ${p.name} — next ${fmtDate(nextCheck(p))}`);}
  render();if(openId===id)renderModalBody();}
function waterBtn(id,big){const on=isWateredToday(id),p=PLANTS.find(x=>x.id===id);
  const cls='sky '+(big?'':'tiny ')+(on?'watered':'');
  const w=actWord(p); const label=big?(on?`✓ Done today — tap to undo`:`${p.medium==='water'?'🔄':'💧'} Mark ${w.toLowerCase()}ed today`):(on?'✓ Done':(p.medium==='water'?'🔄 Refresh':'💧 Water'));
  return `<button class="${cls}" onclick="toggleWatered('${id}',event)">${label}</button>`;}
function toggleFed(id){const s=ps(id),p=PLANTS.find(x=>x.id===id);
  if(isSameDay(s.lastFed)){setPs(id,{lastFed:s.prevFed||null,prevFed:null});toast(`↩️ feeding unmarked`);}
  else{setPs(id,{prevFed:s.lastFed||null,lastFed:today0().toISOString()});toast(`🍽️ ${p.name} fertilized`);}
  if(openId===id)renderModalBody();}
function fedBtn(id){const on=isFedToday(id);
  return `<button class="ghost ${on?'done':''}" onclick="toggleFed('${id}')">${on?'✓ Fertilized today — tap to undo':'🍽️ Mark fertilized today'}</button>`;}

/* ============ modal ============ */
const TABS=[['overview','🌟 Overview'],['water','💧 Water'],['placement','☀️ Placement'],['soil','🪴 Soil'],
  ['climate','🌡️ Temp & Humidity'],['fertilizer','🍽️ Fertilizer'],['repot','📦 Repot'],['propagate','✂️ Propagate'],['issues','🐛 Issues & Log']];
function openModal(id){openId=id;openTab='overview';const p=PLANTS.find(x=>x.id===id);
  document.getElementById('mSprite').textContent=p.sprite;
  document.getElementById('mName').textContent=p.name;
  document.getElementById('mBot').textContent=p.botanical;
  document.getElementById('mTabs').innerHTML=TABS.map(([k,l])=>`<button data-tab="${k}" class="${k===openTab?'on':''}" onclick="switchTab('${k}')">${l}</button>`).join('');
  renderModalBody();document.getElementById('scrim').classList.add('open');document.body.style.overflow='hidden';}
function closeModal(){document.getElementById('scrim').classList.remove('open');document.body.style.overflow='';openId=null;}
function switchTab(k){openTab=k;document.querySelectorAll('#mTabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===k));renderModalBody();}
function srcHTML(p){return p.sources&&p.sources.length?`<div class="sources">📚 ${p.sources.map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join(' · ')}</div>`:''}
function renderModalBody(){
  const p=PLANTS.find(x=>x.id===openId),body=document.getElementById('mBody');
  const d=daysUntil(p),due=d<=0,s=ps(p.id);
  const lastW=s.lastWatered?fmtDate(new Date(s.lastWatered)):'—', fed=s.lastFed?fmtDate(new Date(s.lastFed)):'—';
  const st=s.status||p.currentStatus, room=ROOM_BY_ID[p.location];
  let h='';
  if(openTab==='overview'){h=`<div class="pane">
    <div class="note-box"><b>${p.headline}</b></div>
    ${st?`<div class="note-box ${p.medium==='water'?'water':''}">📍 <b>Right now:</b> ${st}</div>`:''}
    <div class="kv"><dt>Plot ID</dt><dd>${p.id}</dd><dt>Home</dt><dd>${room?room.name:p.location}</dd>
      <dt>Medium</dt><dd>${p.medium==='water'?'Rooting in water 💧':'Potted in soil 🪴'}</dd>
      <dt>Light zone</dt><dd>${ZONE[p.zone]} indirect${p.growLight?' · ⚡ grow light':''}</dd>
      <dt>Stage</dt><dd>${STAGE[p.stage]}</dd><dt>Last ${p.medium==='water'?'refreshed':'watered'}</dt><dd>${lastW}</dd>
      <dt>Next check</dt><dd>${due?'now':fmtDate(nextCheck(p))}</dd></div>
    <h4>Quick tips</h4><ul>${p.tips.map(t=>`<li>${t}</li>`).join('')}</ul>
    <div class="actions-row">${waterBtn(p.id,true)}${fedBtn(p.id)}</div>${srcHTML(p)}</div>`;}
  else if(openTab==='water'){h=`<div class="pane"><h4>💧 Watering</h4><p>${p.water}</p>
    <div class="note-box warn">Cool &amp; dim home = slow-drying soil. <b>Finger-check 2" down first;</b> when in doubt, wait.</div>
    <div class="kv"><dt>Check every</dt><dd>~${interval(p)} days${p.medium==='water'?' (water refresh)':''}</dd>
      <dt>Last ${p.medium==='water'?'refreshed':'watered'}</dt><dd>${lastW}</dd><dt>Next</dt><dd>${due?'now':fmtDate(nextCheck(p))}</dd></div>
    <div class="actions-row">${waterBtn(p.id,true)}</div></div>`;}
  else if(openTab==='placement'){h=`<div class="pane"><h4>☀️ Light &amp; placement</h4><p>${p.light}</p>
    <div class="kv"><dt>Best spot</dt><dd>${room?room.name+' — '+room.note:p.location}</dd><dt>Zone</dt><dd>${ZONE[p.zone]} indirect</dd></div>${srcHTML(p)}</div>`;}
  else if(openTab==='soil'){h=`<div class="pane"><h4>🪴 Soil</h4><p>${p.soil}</p></div>`;}
  else if(openTab==='climate'){h=`<div class="pane"><h4>🌡️ Temperature</h4><p>${p.temp}</p><h4>💦 Humidity</h4><p>${p.humidity}</p></div>`;}
  else if(openTab==='fertilizer'){h=`<div class="pane"><h4>🍽️ Fertilizer</h4><p>${p.fertilizer}</p>
    <div class="note-box">🍽️ <b>"Fertilized" = you gave it plant food</b> (diluted liquid feed). Mark it each time you feed — ~monthly spring–summer. <b>Skip fresh cuttings & winter.</b> The date stops you double-feeding (salt buildup burns tips).</div>
    <div class="kv"><dt>Last fertilized</dt><dd>${fed}</dd></div><div class="actions-row">${fedBtn(p.id)}</div></div>`;}
  else if(openTab==='repot'){h=`<div class="pane"><h4>📦 Repotting</h4><p>${p.repot}</p></div>`;}
  else if(openTab==='propagate'){h=`<div class="pane"><h4>✂️ Propagation</h4><p>${p.propagate}</p></div>`;}
  else if(openTab==='issues'){h=`<div class="pane"><h4>🐛 Common issues</h4>
    <ul>${p.issues.map(i=>`<li><b>${i.sign}</b> → ${i.fix}</li>`).join('')}</ul>
    <h4>📓 Your log</h4><div id="logList">${logHTML(p.id)}</div>
    <div class="log-form"><input id="logInput" placeholder="Note an observation…" onkeydown="if(event.key==='Enter')addLog('${p.id}')"><button onclick="addLog('${p.id}')">Add</button></div></div>`;}
  body.innerHTML=h;
}
function logHTML(id){const log=ps(id).log||[];if(!log.length)return '<div class="log-empty">No notes yet. 🌱</div>';
  return log.slice().reverse().map((e,ri)=>{const idx=log.length-1-ri;
    return `<div class="log-item"><span class="date">${fmtDate(new Date(e.t))}</span><span>${e.txt}</span><button class="ghost tiny" style="margin-left:auto" onclick="delLog('${id}',${idx})">✕</button></div>`;}).join('');}
function addLog(id){const i=document.getElementById('logInput'),txt=(i.value||'').trim();if(!txt)return;
  const log=ps(id).log||[];log.push({t:new Date().toISOString(),txt});setPs(id,{log});i.value='';document.getElementById('logList').innerHTML=logHTML(id);}
function delLog(id,idx){const log=ps(id).log||[];log.splice(idx,1);setPs(id,{log});document.getElementById('logList').innerHTML=logHTML(id);}

/* ============ HOME MAP (hand-drawn SVG from home.json) ============ */
const FLOOR={wood:'#c89b62',carpet:'#d9cbb6',tile:'#cfd8d2',grass:'#7cae48'};
const PLANK={wood:'#a87c48',carpet:'#cabda6',tile:'#bcc7bf',grass:'#6a9c3a'};
function renderHomeMap(){
  const T=HOME.grid.tile, W=HOME.grid.cols*T, H=HOME.grid.rows*T;
  let defs='', floors='', walls='', wins='', glows='', labels='', plants='';
  // base hall floor
  floors+=`<rect x="0" y="0" width="${W}" height="${H}" fill="#b98f57"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#hall)"/>`;
  defs+=`<pattern id="hall" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#b48a52"/><rect width="16" height="2" fill="#a37e49"/></pattern>`;
  (HOME.rooms||[]).forEach(r=>{
    const x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T;
    const base=FLOOR[r.floor]||'#c89b62', plank=PLANK[r.floor]||'#a87c48';
    const pid=`f_${r.id}`;
    defs+=`<pattern id="${pid}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${base}"/><rect width="20" height="2" fill="${plank}"/></pattern>`;
    floors+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pid})"/>`;
    // light glow from window(s) or ambient
    const gs={5:.55,4:.42,3:.34,2:.22,1:.12,0:0}[r.light]||0;
    const dark=Math.max(0,5-r.light)*0.05;
    (r.windows||[]).forEach((wd,i)=>{
      const gid=`g_${r.id}_${i}`; let cx,cy;
      if(wd.edge==='top'){cx=x+w/2;cy=y;} else if(wd.edge==='bottom'){cx=x+w/2;cy=y+h;}
      else if(wd.edge==='left'){cx=x;cy=y+h/2;} else {cx=x+w;cy=y+h/2;}
      const strength=wd.direct?gs+0.22:gs;
      defs+=`<radialGradient id="${gid}" cx="${((cx-x)/w*100)}%" cy="${((cy-y)/h*100)}%" r="90%">
        <stop offset="0%" stop-color="rgba(255,241,190,${Math.min(.85,strength)})"/><stop offset="70%" stop-color="rgba(255,241,190,0)"/></radialGradient>`;
      glows+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${gid})"/>`;
    });
    if(dark>0) glows+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(24,16,32,${dark})"/>`;
    // walls
    walls+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#4e341f" stroke-width="5"/>`;
    // windows (glowing strips on the edge)
    (r.windows||[]).forEach(wd=>{
      const th=6; let wx,wy,ww,wh;
      if(wd.edge==='top'){ww=w*0.6;wh=th;wx=x+(w-ww)/2;wy=y-th/2;}
      else if(wd.edge==='bottom'){ww=w*0.68;wh=th;wx=x+(w-ww)/2;wy=y+h-th/2;}
      else if(wd.edge==='left'){wh=h*0.6;ww=th;wx=x-th/2;wy=y+(h-wh)/2;}
      else {wh=h*0.6;ww=th;wx=x+w-th/2;wy=y+(h-wh)/2;}
      wins+=`<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="2" fill="#dff0f7" stroke="#8bb8cc" stroke-width="1.5"/>`;
      if(wd.direct){const sx=(wd.edge==='top'||wd.edge==='bottom')?wx+ww+6:wx+ww/2;const sy=(wd.edge==='top')?wy+8:wd.edge==='bottom'?wy-8:wy-8;
        wins+=`<text x="${sx}" y="${sy}" font-size="12" text-anchor="middle">☀️</text>`;}
    });
    // label
    const dim=r.light<=2&&!r.outdoor;
    labels+=`<text x="${x+8}" y="${y+16}" font-family="'Pixelify Sans',monospace" font-size="12" font-weight="700" fill="${dim?'#f4ead9':'#3a2413'}" style="paint-order:stroke;stroke:${dim?'rgba(0,0,0,.5)':'rgba(255,255,255,.35)'};stroke-width:2px">${r.name}</text>`;
    labels+=`<text x="${x+w-6}" y="${y+16}" text-anchor="end" font-size="9">${r.outdoor?'🌳':(r.light>0?'☀️'.repeat(r.light):'🌑')}</text>`;
    // plants in this room
    const here=PLANTS.filter(p=>p.location===r.id);
    if(here.length){
      const padX=26, span=w-padX*2, step=here.length>1?span/(here.length-1):0;
      const py=y+h-30;
      here.forEach((p,i)=>{
        const px=here.length>1?x+padX+step*i:x+w/2;
        plants+=`<g class="plant-g" onclick="openModal('${p.id}')" transform="translate(${px},${py})">
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
  const svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Apartment map">
    <defs>${defs}</defs>${floors}${glows}${walls}${wins}${labels}${plants}</svg>`;
  document.getElementById('mapframe').innerHTML=svg;
  document.getElementById('maplegend').innerHTML=`<span>☀️ <b>light</b> (1–5)</span><span>☀️ next to a window = <b>direct sun</b></span><span><b>⚡</b> grow light</span><span>🌑 no light</span><span>Tap a plant to open its card</span>`;
}
function switchView(v){const care=v==='care';currentView=v;
  document.getElementById('careView').hidden=!care;document.getElementById('homeView').hidden=care;
  document.getElementById('navCare').classList.toggle('on',care);document.getElementById('navHome').classList.toggle('on',!care);
  if(!care)renderHomeMap();window.scrollTo({top:0,behavior:'smooth'});}

/* ============ ICS export ============ */
function icsDate(d){return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`}
function icsStamp(){return new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'}
function fold(l){const o=[];while(l.length>73){o.push(l.slice(0,73));l=' '+l.slice(73);}o.push(l);return o.join('\r\n');}
function vevent({uid,start,summary,desc,rrule}){let s=['BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${icsStamp()}`,`DTSTART;VALUE=DATE:${icsDate(start)}`,fold(`SUMMARY:${summary}`)];
  if(desc)s.push(fold(`DESCRIPTION:${desc.replace(/\n/g,'\\n')}`));if(rrule)s.push(`RRULE:${rrule}`);
  s.push('BEGIN:VALARM','TRIGGER:PT0S','ACTION:DISPLAY',fold(`DESCRIPTION:${summary}`),'END:VALARM','END:VEVENT');return s.join('\r\n');}
function exportICS(){const ev=[],start=new Date(today0().getTime()+DAY);
  PLANTS.forEach(p=>{const ws=ps(p.id).lastWatered?nextCheck(p):start;
    ev.push(vevent({uid:`water-${p.id}@alpj`,start:ws<today0()?start:ws,summary:`${p.medium==='water'?'🔄':'💧'} ${actWord(p)} ${p.name}`,desc:`${p.water}\\nFinger-check first.`,rrule:`FREQ=DAILY;INTERVAL=${interval(p)}`}));
    if(p.stage!=='establishing')ev.push(vevent({uid:`feed-${p.id}@alpj`,start:new Date(start.getTime()+3*DAY),summary:`🍽️ Feed ${p.name}`,desc:`${p.fertilizer}\\nGrowing season only.`,rrule:`FREQ=MONTHLY;INTERVAL=1`}));
    if(p.stage==='propReady')ev.push(vevent({uid:`prop-${p.id}@alpj`,start:new Date(today0().getTime()+90*DAY),summary:`✂️ Propagate ${p.name}?`,desc:p.propagate}));
    if(p.stage==='establishing')ev.push(vevent({uid:`root-${p.id}@alpj`,start:new Date(today0().getTime()+28*DAY),summary:`🌱 ${p.name}: rooted? pot up & normalize care`,desc:'Tug-test for roots, then reduce humidity & start normal watering.'}));});
  const cal=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ALPJ Ranch//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ALPJ Ranch 🌿',...ev,'END:VCALENDAR'].join('\r\n');
  const blob=new Blob([cal],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='alpj-ranch.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('📅 Calendar downloaded — import in Google Calendar');}

/* ============ misc ============ */
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2600);}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});