// ===========================================================================
// events.js — ALL interactivity funnels through three delegated listeners.
// Because nothing is wired with inline onclick, the "X is not defined" class
// of bug is impossible: handlers live in module scope, not on window.
// ===========================================================================
import * as A from './actions.js';

function onClick(e){
  // backdrop click closes the modal (but clicks inside it don't)
  if (e.target.id === 'scrim'){ A.closeModal(); return; }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const d = el.dataset;
  switch (d.action){
    case 'view':   A.switchView(d.view);        break;
    case 'group':  A.setGroup(d.group);         break;
    case 'open':   A.openModal(d.id);           break;
    case 'water':  A.toggleWatered(d.id);       break;
    case 'fed':    A.toggleFed(d.id);           break;
    case 'tab':    A.switchTab(d.tab);          break;
    case 'close':  A.closeModal();              break;
    case 'addlog': A.addLog(d.id);              break;
    case 'dellog': A.delLog(d.id, +d.idx);      break;
    case 'export': A.exportICS();               break;
  }
}

function onChange(e){
  if (e.target.id === 'themeSel') A.setTheme(e.target.value);
}

function onKey(e){
  if (e.key === 'Escape'){ A.closeModal(); return; }
  // keyboard-open a focused card (a div acting as a button). Real <button>s
  // fire their own click, so we only handle the card element itself here.
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-action="open"]')){
    e.preventDefault(); A.openModal(e.target.dataset.id); return;
  }
  // Enter in the log input adds the note
  if (e.key === 'Enter' && e.target.dataset?.logid) A.addLog(e.target.dataset.logid);
}

export function wireEvents(){
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
}
