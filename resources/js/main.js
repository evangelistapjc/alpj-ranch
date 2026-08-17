// ===========================================================================
// main.js — entry point. Loaded once via <script type="module">. Orchestrates
// boot; every other concern lives in its own module.
//   state → data + persistence + dates      views  → all rendering
//   weather → live conditions               actions→ user interactions
//   events → delegated listeners            config → constants
// ===========================================================================
import { loadData, Store, UI } from './state.js';
import { renderShell, renderCare, renderWeather, renderModalBody } from './views.js';
import { loadWeather } from './weather.js';
import { initTheme, toast } from './actions.js';
import { wireEvents } from './events.js';
import { applyRooms } from './rooms.js';

async function boot(){
  const app = document.getElementById('app');
  try {
    await loadData();      // fetch the JSON dataset into DB
    applyRooms();          // layer any room-builder edits over the shipped plan
    renderShell();         // build the page chrome + section containers
    initTheme();           // apply saved theme (stardew / ghibli / lego)
    renderCare();          // default view
    wireEvents();          // one-time delegated listeners

    // Weather is async and feeds the schedule (dry factor) plus the outdoor
    // microclimate, so repaint once it lands.
    loadWeather().then(() => {
      renderCare();
      if (UI.view === 'weather') renderWeather();
      if (UI.openId) renderModalBody();
    });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (!Store.persists){
      setTimeout(() => toast('👀 Preview mode — changes won\'t save here'), 800);
    }
  } catch (err){
    console.error('[ALPJ Ranch] boot failed:', err);
    if (app) app.innerHTML = `<div class="errbox">
      <b>🌵 Could not load the ranch.</b><br>
      The data files under <code>resources/data/</code> didn't load. If you opened this
      by double-clicking the file, run a local server instead
      (<code>python3 -m http.server</code>) — browsers block <code>fetch()</code> on <code>file://</code>.
    </div>`;
  }
}

boot();
