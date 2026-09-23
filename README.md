# 🌾 ALPJ Ranch

A cozy, offline-capable plant-care dashboard for a low-light San Jose apartment.
Data-driven, installable as a PWA, and hosted on GitHub Pages.

**Live:** https://evangelistapjc.github.io/alpj-ranch/

---

## Architecture — clean separation of concerns

```
alpj-ranch/
├── index.html                 # STRUCTURE only (no styles, no logic)
├── manifest.webmanifest        # PWA manifest
├── sw.js                       # service worker — MUST stay at root (scope)
├── build_data.py               # regenerates the plant data layer
├── build_css.py                # compiles SCSS without Node (libsass fallback)
├── .github/workflows/deploy.yml# compiles SCSS + deploys to Pages
└── resources/
    ├── css/stylesheet.css      # COMPILED — do not edit by hand
    ├── scss/                    # STYLES (source of truth)
    │   ├── main.scss           #   @use entry
    │   ├── _tokens.scss        #   palette variables
    │   ├── _themes.scss        #   Stardew / Ghibli / Lego
    │   ├── _base.scss  _care.scss  _map.scss  _modal.scss
    ├── js/                      # LOGIC (ES modules, one concern each)
    │   ├── main.js             #   boot / orchestration (entry)
    │   ├── config.js           #   constants
    │   ├── state.js            #   storage, loaded data (DB), history, dates
    │   ├── weather.js          #   Open-Meteo + the recorded weather log
    │   ├── climate.js          #   room-vs-plant fit (pure, derived)
    │   ├── views.js            #   all HTML/SVG rendering
    │   ├── actions.js          #   user interactions + mutations
    │   └── events.js           #   delegated listeners
    ├── data/                    # DATA (edit freely)
    │   ├── index.json  home.json  almanac.json
    │   └── plants/*.json
    └── icons/                   # PWA icons
```

**The four layers never bleed into each other:** HTML is inert structure, SCSS is
all presentation, the JS modules hold logic, and JSON is the data. Rendering
functions live in `views.js`; nothing else builds markup.

### No inline handlers
Interactivity is expressed as `data-action` attributes; `events.js` runs the
delegated listeners (click / change / keydown, plus pointer events for map
dragging) and dispatches to `actions.js`. Because handlers live in module scope
(not on `window`), the `type="module"` + `onclick` conflict that causes
*"X is not defined"* simply cannot happen.

---

## Data model

### Shipped JSON is read-only
Nothing in `resources/data/` is ever written to at runtime — the site is static.
Everything you change lives in `localStorage` and is layered on top at read time:

| Key | Holds |
|---|---|
| `alpj_state` | per plant: `waterLog`, `fedLog`, `location` override, `status`, notes `log` |
| `alpj_weather` | one row per day of recorded Open-Meteo readings |
| `alpj_theme` | selected theme |

`state.loc(p)` returns the override if there is one, otherwise the shipped
`p.location`. Every downstream read — grove grouping, the map, light/temp/
humidity verdicts, the watering interval — goes through it, so moving a plant
updates the whole picture at once. **Map → Arrange → Export home data** writes
out `alpj-placement.json` if you want to fold a new layout back into
`build_data.py` permanently.

State written by v1 (a single `lastWatered` plus a one-level `prevWatered`
undo) is migrated to the history arrays on first load; the old undo timestamp
becomes a real second entry rather than being discarded.

### Rooms carry a microclimate
`home.json` → `rooms[].climate` gives each room a `tempF` / `humidityPct`
range, an `airflow` value (`still` / `calm` / `drafty`) and a `dryFactor` — how
fast soil dries there relative to the house average. Rooms flagged
`tracksWeather` (the patio) substitute live readings for their static range.

`plants/*.json` → `needs` states what the plant actually wants (`tempF`,
`humidityPct`, `draftSensitive`). `climate.js` scores one against the other and
returns good / workable / poor, which is what the fit chips, the placement tab
and the ⚠️ flags on the map are all reading.

### Watering cadence
`interval(p)` is the plant's own baseline. `effInterval(p)` divides it by the
room's `dryFactor` × the 7-day mean weather dry factor, so a hot dry stretch
pulls checks forward and a cold damp one pushes them out. The `.ics` export
deliberately keeps the **baseline** so calendar recurrence doesn't drift.

A plant with no recorded watering is due **now**, not "due in N days" counted
from today — that's what puts it in the Backlog instead of hiding it.

---

## The four views

- **🌿 Care** — today's nudges, the **Backlog** (never-recorded or long-overdue
  plants, each with an inline date box for backdating), and the Grove.
- **🗺️ Map** — the floor plan. **Arrange** turns on dragging: pull a pot into
  any room and its placement, fit verdicts and watering rhythm all re-derive.
  Tapping still opens the care card; a press that never travels more than 6px
  is treated as a tap, not a drag.
- **🌦️ Weather** — the recorded reading log, the rolling dry factor, and the
  per-plant "best watering times" derived from it.
- **📖 Almanac** — hand-authored reference content.

## Local development

```bash
npm install     # once — pulls Dart Sass, the same compiler CI uses
npm run dev     # rebuild everything, then serve on http://localhost:8000
```

| Script | Does |
|---|---|
| `npm run build` | data → sprites → CSS → service-worker stamp (in that order) |
| `npm run dev` | `build`, then serves on :8000 |
| `npm run serve` | serve only |
| `npm run check` | exits 1 if `sw.js` is stale — used by CI |
| `npm run bump` | patch bump (also `bump:minor`, `bump:major`) |

Order matters: `build:sw` runs last because it hashes the output of the others.

Without Node, every step has a Python equivalent — `python build_data.py`,
`build_sprites.py`, `build_css.py` (libsass fallback), `build_sw.py`.

Edit a plant in `resources/data/plants/*.json` (or `build_data.py` to regenerate
the set). Edit the Almanac in `resources/data/almanac.json`.

> The service worker caches the app shell. If the page looks stale, check the
> version chip in the footer — if it isn't the version you just built, hard-refresh
> (Ctrl+Shift+R) or unregister the worker in DevTools → Application.

## Versioning

`version.json` is the single source of truth; `build_sw.py` keeps `package.json`
in sync and stamps `sw.js` as `alpj-v<semver>+<hash>`.

The semver half is for humans and shows in the app footer. The hash half is
derived from every file the service worker caches, and exists because the worker
only refreshes its cache when the VERSION *string* changes — pure semver would
silently ship stale assets any time someone forgot to bump.

**You do not bump manually.** Every push to `master` bumps the patch version in
CI, commits it back, and deploys. To bump further, put `[minor]` or `[major]` in
the merge commit message, or run the workflow manually and pick a level.

Because CI commits that bump, `git pull` after a merge before starting new work.

## Deploy
Push or merge to `master`. The workflow rebuilds, bumps the version, commits
that bump back, and publishes to Pages — no manual step.
One-time: **Settings → Pages → Source: GitHub Actions**.

## 🎨 Themes
Header selector switches **🌾 Stardew**, **🌿 Studio Ghibli**, **🧱 Lego**.
Choice is saved and restyles the whole dashboard *and* the map palette.
