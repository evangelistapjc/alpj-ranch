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
    │   ├── state.js            #   storage, loaded data (DB), dates
    │   ├── weather.js          #   Open-Meteo
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
Interactivity is expressed as `data-action` attributes; `events.js` runs three
delegated listeners (click / change / keydown) and dispatches to `actions.js`.
Because handlers live in module scope (not on `window`), the `type="module"`
+ `onclick` conflict that causes *"X is not defined"* simply cannot happen.

---

## Local development

```bash
# 1. Compile styles (install Dart Sass once: npm i -g sass)
sass resources/scss/main.scss resources/css/stylesheet.css --watch

# 2. Serve (fetch() needs http://, not file://)
python3 -m http.server
# → open http://localhost:8000/
```

Edit a plant in `resources/data/plants/*.json` (or run `python3 build_data.py`
to regenerate the whole set). Edit the Almanac in `resources/data/almanac.json`.

## Deploy
Push to `main`. The workflow compiles SCSS and publishes to Pages.
One-time: **Settings → Pages → Source: GitHub Actions**.

## 🎨 Themes
Header selector switches **🌾 Stardew**, **🌿 Studio Ghibli**, **🧱 Lego**.
Choice is saved and restyles the whole dashboard *and* the map palette.
