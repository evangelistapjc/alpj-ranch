// ===========================================================================
// events.js — ALL interactivity funnels through delegated listeners.
// Because nothing is wired with inline onclick, the "X is not defined" class
// of bug is impossible: handlers live in module scope, not on window.
//
// Click / change / keydown cover the whole app. The three pointer listeners
// exist only for dragging pots around the map — SVG plus touch rules out
// HTML5 drag-and-drop, so the drag is driven by pointer events instead.
// ===========================================================================
import * as A from './actions.js';
import { UI } from './state.js';

function onClick(e){
  // backdrop click closes the modal (but clicks inside it don't)
  if (e.target.id === 'scrim'){ A.closeModal(); return; }

  // A drag that ended on a pot already fired its own handling in dragEnd;
  // swallow the click the browser sends afterwards so it can't also open the card.
  const g = e.target.closest?.('.plant-g');
  if (g && UI.arrange) return;
  if (UI.arrange && e.target.closest?.('[data-tray]')) return;

  if (UI.build){
    const wb = e.target.closest?.('.wallbtn');
    if (wb){ A.wallWindow(wb.dataset.wallroom, wb.dataset.wall); return; }
    const rh = e.target.closest?.('[data-roomhit]');
    if (rh && !e.target.closest('[data-action]')){ A.selectRoom(rh.dataset.roomhit); return; }
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const d = el.dataset;
  switch (d.action){
    case 'view':        A.switchView(d.view);                 break;
    case 'group':       A.setGroup(d.group);                  break;
    case 'open':        A.openModal(d.id);                    break;
    case 'water':       A.toggleWatered(d.id);                break;
    case 'fed':         A.toggleFed(d.id);                    break;
    case 'tab':         A.switchTab(d.tab);                   break;
    case 'close':       A.closeModal();                       break;
    case 'addlog':      A.addLog(d.id);                       break;
    case 'dellog':      A.delLog(d.id, d.eid);                break;
    case 'export':      A.exportICS();                        break;
    // watering history
    case 'addwater':    A.addWatering(d.id, d.src);           break;
    case 'backdate':    A.addWatering(d.id, d.src);           break;
    case 'editwater':   A.editWatering(d.eid);                break;
    case 'savewater':   A.saveWatering(d.id, d.eid, d.src);   break;
    case 'delwater':    A.delWatering(d.id, d.eid);           break;
    case 'canceledit':  A.cancelEdit();                       break;
    // placement
    case 'moveto':      A.moveTo(d.id, d.room);               break;
    case 'arrange':     A.toggleArrange();                    break;
    case 'resetlayout': A.resetLayout();                      break;
    case 'resetapartment': A.resetApartment();                break;
    case 'exporthome':  A.exportHome();                       break;
    // room builder
    case 'build':       A.toggleBuild();                      break;
    case 'addroom':     A.addNewRoom();                       break;
    case 'selroom':     A.selectRoom(d.room);                 break;
    case 'deselroom':   A.deselectRoom();                     break;
    case 'delroom':     A.deleteRoomAction(d.room);           break;
    case 'togglewin':   A.wallWindow(d.room, d.wall);         break;
    case 'toggledoor':  A.wallDoor(d.room, d.wall);           break;
    case 'winsun':      A.wallSun(d.room, d.wall);            break;
    // journal sync between origins (phone ⇄ laptop)
    case 'exportjournal': A.exportJournalFile();              break;
    case 'importjournal': A.importJournalFile();              break;
  }
}

function onChange(e){
  if (e.target.id === 'themeSel') A.setTheme(e.target.value);
  const d = e.target.dataset || {};
  if (d.roomname)    A.renameRoom(d.roomname, e.target.value);
  if (d.roomlight)   A.setRoomLight(d.roomlight, e.target.value);
  if (d.roomfloor)   A.setRoomFloor(d.roomfloor, e.target.value);
  if (d.roomoutdoor) A.setRoomOutdoor(d.roomoutdoor, e.target.checked);
}

function onKey(e){
  if (e.key === 'Escape'){
    if (UI.editWater !== null){ A.cancelEdit(); return; }
    A.closeModal(); return;
  }
  // keyboard-open a focused card (a div acting as a button). Real <button>s
  // fire their own click, so we only handle the card element itself here.
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-action="open"]')){
    e.preventDefault(); A.openModal(e.target.dataset.id); return;
  }
  // Enter in the log input adds the note
  if (e.key === 'Enter' && e.target.dataset?.logid) A.addLog(e.target.dataset.logid);
  // Enter in a date box commits that date
  if (e.key === 'Enter' && e.target.dataset?.waterdate) A.addWatering(e.target.dataset.waterdate, 'wDate');
  if (e.key === 'Enter' && e.target.dataset?.backdate){
    const id = e.target.dataset.backdate; A.addWatering(id, `bd_${id}`);
  }
}

/* --- map drag (arrange mode only) --- */
function onPointerDown(e){
  if (e.button != null && e.button !== 0) return;         // left button / touch only
  if (UI.build){
    const rs = e.target.closest?.('[data-resize]');
    if (rs){ if (A.roomDragStart(e, rs.dataset.resize, 'resize')) e.preventDefault(); return; }
    if (e.target.closest?.('.wallbtn')) return;           // let the click handler take it
    const rh = e.target.closest?.('[data-roomhit]');
    if (rh){ if (A.roomDragStart(e, rh.dataset.roomhit, 'move')) e.preventDefault(); return; }
  }
  const g = e.target.closest?.('.plant-g');
  if (g){ if (A.dragStart(e, g)) e.preventDefault(); return; }
  // tray → map
  const t = e.target.closest?.('[data-tray]');
  if (t){ if (A.trayDragStart(e, t)) e.preventDefault(); }
}
function onPointerMove(e){
  if (A.roomDragging()){ e.preventDefault(); A.roomDragMove(e); return; }
  if (A.dragging()){ e.preventDefault(); A.dragMove(e); return; }
  if (A.trayDragging()){ e.preventDefault(); A.trayDragMove(e); }
}
function onPointerUp(e){
  if (A.roomDragging()){ A.roomDragEnd(e); return; }
  if (A.dragging()){ A.dragEnd(e); return; }
  if (A.trayDragging()) A.trayDragEnd(e);
}

export function wireEvents(){
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive:false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}
