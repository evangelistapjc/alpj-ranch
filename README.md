# 🌾 ALPJ Ranch

A cozy, Stardew-styled plant care dashboard: watering tracker, per-plant care cards,
a hand-drawn map of your apartment's light, live weather, and Google Calendar export.

Built to **scale**: every plant is its own JSON file, and your home layout is a JSON file too —
so adding a plant or swapping in a new floor plan is a data edit, not a code rewrite.

```
alpj-ranch/
├── index.html                  ← the app (loads the JSON files)
├── alpj-ranch-standalone.html  ← same app, data baked in (no server needed)
├── manifest.webmanifest        ← PWA install config
├── sw.js                       ← offline service worker
├── build_data.py               ← regenerates the JSON from one place
├── icons/                      ← app icons
└── data/
    ├── index.json              ← lists every plant file (drives the plant count)
    ├── home.json               ← your apartment: rooms, windows, light levels
    └── plants/*.json           ← one file per plant
```

---

## ▶️ How to run it

### Option A — On your phone / share with the house (recommended)
Host the folder anywhere static and open the link on any device.

**GitHub Pages (free):**
1. Push this folder to a repo.
2. Settings → Pages → deploy from `main`, root.
3. Open the URL on your phone → **Share → Add to Home Screen**.

Now it's an app icon: full-screen, works **offline**, and pulls **live weather**.
Anyone you share the link with gets the same thing.

### Option B — Just open it (no server)
Double-click **`alpj-ranch-standalone.html`**. Data is baked in, so it works from the file directly.
To use it on your phone with no hosting: AirDrop / email / iCloud the single file to yourself,
open it in Safari/Chrome, and **Add to Home Screen**.

### Option C — Local dev server
```bash
cd alpj-ranch
python3 -m http.server 8000
# open http://localhost:8000
```

> **Why can't I just double-click `index.html`?**
> Browsers block a page opened via `file://` from reading sibling files (a security rule called
> the same-origin policy). The multi-file version needs to be *served* (Option A or C).
> The **standalone** file (Option B) sidesteps this by baking the data in.

---

## ➕ Add or edit a plant
Two ways:
- **Quick:** drop a new `data/plants/whatever.json` and add its path to `data/index.json`.
  The plant count and every view update automatically.
- **Clean:** edit `build_data.py` and run `python3 build_data.py` to regenerate all JSON,
  then rebuild the standalone (see below).

Each plant file has: `id, name, botanical, sprite, location (room id), zone, stage, medium
(soil|water), currentStatus, waterDays, growLight`, plus care text and `sources`.

## 🏠 Change the home layout
Edit `data/home.json`. Rooms are a simple grid (`x, y, w, h` in tiles). Each room has a
`light` level (0–5) and a `windows` list (`edge: top|bottom|left|right`, `direct: true|false`).
The map redraws itself from this — so if you move, or want to map a friend's place, just
swap the JSON.

## 🔄 Rebuild the standalone after data changes
```bash
python3 build_data.py            # regenerate JSON (if you edited build_data.py)
python3 build_standalone.py      # re-bake the standalone   (script included below)
```

## 🌤️ Weather
Live conditions come from **Open-Meteo** (free, no API key). It uses the `lat/lon` in
`home.json`, so it follows your home automatically.

---

## 📱 "Should this be a real app?" — your options

| Path | Effort | Gets you | Verdict |
|---|---|---|---|
| **PWA (this)** | none extra | Home-screen icon, offline, live data, shareable link | ✅ Start here — covers 95% of what you want |
| **Capacitor wrap** | low | Same code, packaged for App Store / Play Store, push notifications | Do this *if* you want store presence or reminders |
| **React Native / Expo / Flutter** | high | Fully native app, best device integration | Only if you outgrow the PWA |
| **Google Sheets template** | low | Spreadsheet tracker (like the one you referenced) | Great for data, but no map / theming / calendar export |

**Recommendation:** ship the PWA (Option A). If you later want phone reminders that fire even
when the app is closed, wrap this exact code in **Capacitor** — you keep everything and just add
a native notification layer. No rewrite.
