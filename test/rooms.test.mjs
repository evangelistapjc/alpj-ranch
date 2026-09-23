// Exercise rooms.js geometry against the real home.json, in Node.
// A tiny localStorage stub is all the browser surface it actually needs.
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const BASE = 'file:///C:/xampp/htdocs/alpj-ranch/resources/js/';
const { DB } = await import(BASE + 'state.js');
const R = await import(BASE + 'rooms.js');

const home = JSON.parse(readFileSync('C:/xampp/htdocs/alpj-ranch/resources/data/home.json', 'utf8'));
DB.home = home;
DB.shippedRooms = JSON.parse(JSON.stringify(home.rooms));
R.applyRooms();

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

console.log('\n--- wall segments: one wall, several neighbours ---');
const bed = DB.roomById.bedroom;

const right = R.wallSegments(bed, 'right');
console.log('  bedroom RIGHT:', right.map(s => `[${s.from}-${s.to}) -> ${s.neighbor ?? 'outside'}`).join('  '));
ok('bedroom right wall splits into 2 segments', right.length === 2, JSON.stringify(right));
ok('  ... one borders the living room', right.some(s => s.neighbor === 'living'));
ok('  ... one borders the patio', right.some(s => s.neighbor === 'patio'));

const top = R.wallSegments(bed, 'top');
console.log('  bedroom TOP  :', top.map(s => `[${s.from}-${s.to}) -> ${s.neighbor ?? 'outside'}`).join('  '));
ok('bedroom top wall splits by neighbour', top.length >= 2, JSON.stringify(top));
ok('  ... part of it meets the closet', top.some(s => s.neighbor === 'closet'));

const bottom = R.wallSegments(bed, 'bottom');
ok('bedroom bottom is fully exterior', bottom.every(s => s.neighbor === null && s.exterior));

console.log('\n--- collision ---');
const bath = DB.roomById.bathroom;
ok('current layout is collision-free',
   !DB.home.rooms.some(r => R.collides(R.rectOf(r), r.id)));
ok('dragging Bath onto the Living Room is refused',
   R.tryMove('bathroom', { x: 20, y: 14, w: bath.w, h: bath.h }) === null);
ok('dragging Bath to genuinely free space is allowed',
   R.tryMove('bathroom', { x: 9, y: 9, w: bath.w, h: bath.h }) !== null);
ok('a move off-grid is clamped back inside',
   (() => { const m = R.tryMove('bathroom', { x: 99, y: 99, w: bath.w, h: bath.h });
            return m === null || (m.x + m.w <= 36 && m.y + m.h <= 30); })());

console.log('\n--- resize by wall ---');
const den = DB.roomById.den;
const grow = R.resizeByWall(den, 'bottom', 1);
ok('den can grow downward into free space', grow === null || grow.h === den.h + 1,
   JSON.stringify(grow));
const shrinkTop = R.resizeByWall(den, 'top', 2);
ok('dragging the TOP wall moves y and h together',
   shrinkTop && shrinkTop.y === den.y + 2 && shrinkTop.h === den.h - 2, JSON.stringify(shrinkTop));
ok('resize is refused below the minimum size',
   R.resizeByWall(den, 'top', den.h) === null);
ok('resize into a neighbour is refused',
   R.resizeByWall(DB.roomById.bathroom, 'bottom', 6) === null);

console.log('\n--- paired features ---');
const beforeBed = (DB.roomById.bedroom.doors || []).length;
const beforeCloset = (DB.roomById.closet.doors || []).length;
const seg = R.wallSegments(DB.roomById.bedroom, 'top').find(s => s.neighbor === 'closet');
const pid = R.addFeature('bedroom', 'top', seg.from, seg.from + 2, 'door');
const afterBed = (DB.roomById.bedroom.doors || []).length;
const afterCloset = (DB.roomById.closet.doors || []).length;
ok('adding a door on a shared stretch writes it to BOTH rooms',
   afterBed === beforeBed + 1 && afterCloset === beforeCloset + 1,
   `bed ${beforeBed}->${afterBed}, closet ${beforeCloset}->${afterCloset}`);

const bedDoor = DB.roomById.bedroom.doors.find(d => d.pairId === pid);
const closDoor = DB.roomById.closet.doors.find(d => d.pairId === pid);
ok('  ... on opposite walls', bedDoor && closDoor && closDoor.edge === R.OPPOSITE[bedDoor.edge],
   `${bedDoor?.edge} vs ${closDoor?.edge}`);
ok('  ... aligned to the same absolute position',
   bedDoor && closDoor &&
   (DB.roomById.bedroom.x + bedDoor.from) === (DB.roomById.closet.x + closDoor.from),
   `${DB.roomById.bedroom.x + (bedDoor?.from ?? 0)} vs ${DB.roomById.closet.x + (closDoor?.from ?? 0)}`);

R.removeFeature(pid);
ok('removing one end removes both',
   (DB.roomById.bedroom.doors || []).length === beforeBed &&
   (DB.roomById.closet.doors || []).length === beforeCloset);

console.log('\n--- exterior features are not paired ---');
const bBefore = (DB.roomById.bedroom.windows || []).length;
const pid2 = R.addFeature('bedroom', 'bottom', 14, 17, 'window');
ok('a window on an outside wall is added once',
   (DB.roomById.bedroom.windows || []).length === bBefore + 1);
const strays = DB.home.rooms.filter(r => r.id !== 'bedroom' &&
  (r.windows || []).some(w => w.pairId === pid2));
ok('  ... with no phantom twin in another room', strays.length === 0,
   strays.map(r => r.id).join(','));

console.log('\n--- clear wall ---');
R.clearWall('bedroom', 'bottom');
ok('clearing a wall strips its features',
   (DB.roomById.bedroom.windows || []).filter(w => w.edge === 'bottom').length === 0);
ok('  ... but the wall itself still exists',
   R.wallSegments(DB.roomById.bedroom, 'bottom').length > 0 &&
   R.wallLength(DB.roomById.bedroom, 'bottom') === DB.roomById.bedroom.w);

console.log('\n--- resize limits (how far a phantom wall may travel) ---');
const lim = (id, w) => R.resizeLimits(DB.roomById[id], w);
const denR = lim('den', 'right');
console.log('  den right   :', JSON.stringify(denR));
console.log('  bath bottom :', JSON.stringify(lim('bathroom', 'bottom')));
ok('a wall can travel more than one chunk', denR.max > 1, JSON.stringify(denR));
ok('  ... and stops before leaving the grid',
   DB.roomById.den.x + DB.roomById.den.w + denR.max <= 36);
ok('a wall hard against a neighbour reports no room to grow',
   lim('bathroom', 'bottom').max === 0, JSON.stringify(lim('bathroom', 'bottom')));
ok('shrinking is bounded by the minimum size',
   lim('bathroom', 'right').min === 2 - DB.roomById.bathroom.w);

console.log('\n--- nearest free spot (a room dropped on top of everything) ---');
const onTop = R.nearestFreeRect({ x: 0, y: 0, w: 6, h: 6 }, '__none__');
ok('finds somewhere the rect actually fits',
   !!onTop && !R.collides(onTop, '__none__'), JSON.stringify(onTop));
const already = R.nearestFreeRect({ x: 9, y: 9, w: 6, h: 6 }, '__none__');
ok('  ... and leaves an already-valid position untouched',
   already && already.x === 9 && already.y === 9, JSON.stringify(already));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
