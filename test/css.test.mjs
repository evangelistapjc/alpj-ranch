// Guard against CSS class collisions that silently kill interactivity.
//
// Born from a real bug: _map.scss declared a bare `.ghost { pointer-events:none }`
// for the SVG drag-preview rect, while _base.scss uses `button.ghost` as the
// secondary button style. The buttons still LOOKED correct, because
// button.ghost (0,1,1) outranks .ghost (0,1,0) on colour — but nothing in
// _base declared pointer-events, so the map's rule applied unopposed and every
// ghost button in the app (Arrange plants, Edit rooms, every room-edit control)
// became untouchable by mouse. No console error, no visual clue.
//
// So: any compiled rule that disables pointer-events must not match a class
// that views.js/actions.js put on a <button>.
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = 'C:/xampp/htdocs/alpj-ranch/';
const css = readFileSync(ROOT + 'resources/css/stylesheet.css', 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

// --- every class this app puts on a <button> ---
const js = readdirSync(ROOT + 'resources/js')
  .filter(f => f.endsWith('.js'))
  .map(f => readFileSync(ROOT + 'resources/js/' + f, 'utf8'))
  .join('\n');

const buttonClasses = new Set();
// <button class="..."> and <button class="${cond?'a':'b'}" ...>
for (const m of js.matchAll(/<button[^>]*?class="([^"]*)"/g)){
  m[1]
    // pull literals out of ${ ... ? 'x' : 'y' } as well as plain text
    .replace(/\$\{[^}]*\}/g, s => ' ' + (s.match(/'([^']*)'/g) || []).join(' ').replace(/'/g, '') + ' ')
    .split(/\s+/).filter(Boolean)
    .forEach(c => buttonClasses.add(c));
}

console.log('\n--- pointer-events collisions ---');
ok('found the button classes to check', buttonClasses.size > 3, `got ${buttonClasses.size}`);

// --- compiled rules that turn pointer events off ---
const offenders = [];
for (const m of css.matchAll(/([^{}]+)\{([^}]*pointer-events\s*:\s*none[^}]*)\}/g)){
  const selectors = m[1].split(',').map(s => s.trim());
  for (const sel of selectors){
    // Only bare/leading class selectors can reach a button by accident;
    // `button.x`, `svg .x`, `.plant-g .x` are already scoped away from it.
    const bare = /^\.([A-Za-z0-9_-]+)((\.[A-Za-z0-9_-]+)|(:[A-Za-z-]+))*$/.exec(sel);
    if (!bare) continue;
    const cls = bare[1];
    if (buttonClasses.has(cls)) offenders.push(`${sel} → matches <button class="${cls}">`);
  }
}
ok('no pointer-events:none rule matches a button class', offenders.length === 0, '\n      ' + offenders.join('\n      '));

// The specific regression, named so a future rename can't quietly reintroduce it.
ok('.ghost is not used as an SVG drag-preview class',
   !/(^|[,}])\s*\.ghost\s*\{[^}]*pointer-events\s*:\s*none/.test(css));
ok('the drag preview uses .dragghost instead', /\.dragghost\s*\{/.test(css));
ok('actions.js paints the preview with .dragghost',
   /'dragghost '/.test(readFileSync(ROOT + 'resources/js/actions.js', 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
