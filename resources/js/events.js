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
    if (e.target.closest?.('[data-chunk]')) return;      // handled on pointerdown
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
    case 'selwall':     A.selectWall(d.room, d.wall);         break;
    case 'blocktool':   A.setBlockTool(d.tool);               break;
    case 'applyblock':  A.applyBlock(d.room, d.wall);         break;
    case 'clearsel':    A.clearSel();                         break;
    case 'clearwall':   A.clearWallAction(d.room, d.wall);    break;
    case 'delfeature':  A.deleteFeature(d.pair);              break;
    case 'winsunpair':  A.toggleWinSun(d.pair);               break;
    case 'splitpot':    A.splitPot(d.id);                     break;
    case 'extendfeat':  A.extendFeature(d.room, d.wall, d.pair); break;
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
  if (d.joinpot)     A.combinePot(d.joinpot, e.target.value);
  if (d.roomw)       A.setRoomSize(d.roomw, 'w', e.target.value);
  if (d.roomh)       A.setRoomSize(d.roomh, 'h', e.target.value);
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
    // chunk strip in the side panel — click or drag across chunks
    const ck = e.target.closest?.('[data-chunk]');
    if (ck){ A.chunkDown(ck.dataset.room, ck.dataset.wall, +ck.dataset.chunk); e.preventDefault(); return; }
    // wall grab bar resizes that side only
    const wg = e.target.closest?.('[data-wallgrab]');
    if (wg){ if (A.roomDragStart(e, wg.dataset.wallgrab, 'resize', wg.dataset.wall)) e.preventDefault(); return; }
    const st = e.target.closest?.('[data-segroom]');
    if (st){ A.selectWall(st.dataset.segroom, st.dataset.wall); e.preventDefault(); return; }
    const rh = e.target.closest?.('[data-roomhit]');
    if (rh){ if (A.roomDragStart(e, rh.dataset.roomhit, 'move')) e.preventDefault(); return; }
  }
  const g = e.target.closest?.('.plant-g');
  if (g){ if (A.dragStart(e, g)) e.preventDefault(); return; }
  // tray → map
  const t = e.target.closest?.('[data-tray]');
  if (t){ if (A.trayDragStart(e, t)) e.preventDefault(); }
}
/* preventDefault only once a gesture has genuinely started moving. Calling it
   unconditionally meant a single stuck drag suppressed the click event for the
   whole document, leaving the UI dead with nothing in the console. */
function onPointerMove(e){
  if (A.chunkDragging()){
    const ck = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-chunk]');
    if (ck) A.chunkOver(ck.dataset.room, ck.dataset.wall, +ck.dataset.chunk);
    return;
  }
  if (A.roomDragging()){ if (A.roomDragMove(e)) e.preventDefault(); return; }
  if (A.dragging()){ if (A.dragMove(e)) e.preventDefault(); return; }
  if (A.trayDragging()){ if (A.trayDragMove(e)) e.preventDefault(); }
}
function onPointerUp(e){
  if (A.chunkDragging()){ A.chunkUp(); return; }
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
  // Safety nets. Any of these means the gesture is over whether or not a
  // pointerup reached us, so nothing can be left half-dragging.
  document.addEventListener('pointercancel', () => A.cancelAllDrags());
  document.addEventListener('lostpointercapture', () => A.cancelAllDrags());
  window.addEventListener('blur', () => A.cancelAllDrags());
}
