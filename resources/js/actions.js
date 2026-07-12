// ===========================================================================
// actions.js — everything a user does. Mutates state, flips views, then asks
// views.js to re-render. events.js is the only caller.
// ===========================================================================
import { DB, UI, Store, ps, setPs, today0, isSameDay, fmtDate, nextCheck,
         interval, actWord, DAY, plant } from './state.js';
import { renderCare, renderGrove, renderHomeMap, renderAlmanac,
         renderModalTabs, renderModalBody, logHTML } from './views.js';

const $ = (id) => document.getElementById(id);

/* ---------------- toast ---------------- */
export function toast(m){
  const t = $('toast'); if (!t) return;
  t.textContent = m; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- watering / feeding (toggle + undo) ---------------- */
export function toggleWatered(id){
  const s = ps(id), p = plant(id);
  if (isSameDay(s.lastWatered)){ setPs(id, { lastWatered:s.prevWatered||null, prevWatered:null }); toast(`↩️ ${p.name} undone`); }
  else { setPs(id, { prevWatered:s.lastWatered||null, lastWatered:today0().toISOString() }); toast(`${p.medium==='water'?'🔄':'💧'} ${p.name} — next ${fmtDate(nextCheck(p))}`); }
  renderCare();
  if (UI.openId === id) renderModalBody();
}
export function toggleFed(id){
  const s = ps(id), p = plant(id);
  if (isSameDay(s.lastFed)){ setPs(id, { lastFed:s.prevFed||null, prevFed:null }); toast('↩️ feeding unmarked'); }
  else { setPs(id, { prevFed:s.lastFed||null, lastFed:today0().toISOString() }); toast(`🍽️ ${p.name} fertilized`); }
  if (UI.openId === id) renderModalBody();
}

/* ---------------- issue log ---------------- */
export function addLog(id){
  const i = $('logInput'); const txt = (i?.value || '').trim(); if (!txt) return;
  const log = ps(id).log || []; log.push({ t:new Date().toISOString(), txt }); setPs(id, { log });
  i.value = ''; $('logList').innerHTML = logHTML(id);
}
export function delLog(id, idx){
  const log = ps(id).log || []; log.splice(idx, 1); setPs(id, { log });
  $('logList').innerHTML = logHTML(id);
}

/* ---------------- modal ---------------- */
export function openModal(id){
  UI.openId = id; UI.openTab = 'overview';
  const p = plant(id);
  $('mSprite').textContent = p.sprite;
  $('mName').textContent = p.name;
  $('mBot').textContent = p.botanical;
  renderModalTabs(); renderModalBody();
  $('scrim').classList.add('open'); document.body.style.overflow = 'hidden';
}
export function closeModal(){
  $('scrim').classList.remove('open'); document.body.style.overflow = ''; UI.openId = null;
}
export function switchTab(k){
  UI.openTab = k; renderModalTabs(); renderModalBody();
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
  const map = { care:'careView', home:'homeView', almanac:'almanacView' };
  Object.entries(map).forEach(([k, id]) => { const el = $(id); if (el) el.hidden = (k !== v); });
  $('navCare').classList.toggle('on', v === 'care');
  $('navHome').classList.toggle('on', v === 'home');
  $('navAlmanac').classList.toggle('on', v === 'almanac');
  if (v === 'home') renderHomeMap();
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
    const ws = ps(p.id).lastWatered ? nextCheck(p) : start;
    ev.push(vevent({ uid:`water-${p.id}@alpj`, start: ws<today0()?start:ws, summary:`${p.medium==='water'?'🔄':'💧'} ${actWord(p)} ${p.name}`, desc:`${p.water}\\nFinger-check first.`, rrule:`FREQ=DAILY;INTERVAL=${interval(p)}` }));
    if (p.stage !== 'establishing') ev.push(vevent({ uid:`feed-${p.id}@alpj`, start:new Date(start.getTime()+3*DAY), summary:`🍽️ Feed ${p.name}`, desc:`${p.fertilizer}\\nGrowing season only.`, rrule:`FREQ=MONTHLY;INTERVAL=1` }));
    if (p.stage === 'propReady') ev.push(vevent({ uid:`prop-${p.id}@alpj`, start:new Date(today0().getTime()+90*DAY), summary:`✂️ Propagate ${p.name}?`, desc:p.propagate }));
    if (p.stage === 'establishing') ev.push(vevent({ uid:`root-${p.id}@alpj`, start:new Date(today0().getTime()+28*DAY), summary:`🌱 ${p.name}: rooted? pot up & normalize care`, desc:'Tug-test for roots, then reduce humidity & start normal watering.' }));
  });
  const cal = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ALPJ Ranch//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ALPJ Ranch 🌿', ...ev, 'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([cal], { type:'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'alpj-ranch.ics'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('📅 Calendar downloaded — import in Google Calendar');
}
