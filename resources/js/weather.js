// ===========================================================================
// weather.js — live conditions from Open-Meteo (free, no API key), PLUS the
// weather log that the watering schedule leans on.
//
// Every successful fetch is written to `alpj_weather` as one row per calendar
// day (re-fetching the same day overwrites that day rather than piling up).
// From that log we derive `dryFactor` — how fast soil is drying relative to a
// 70°F / 50% RH baseline — and hand the 7-day mean to state.Cadence, which is
// what stretches or shortens every plant's next-check date.
// ===========================================================================
import { DB, Store, isoDay, day0, Cadence, DAY, today0 } from './state.js';
import { Live } from './climate.js';
import { WMO, WX_KEEP_DAYS } from './config.js';

const KEY = 'alpj_weather';

export function wxLog(){
  const w = Store.get(KEY);
  return (w && Array.isArray(w.days)) ? w.days : [];
}
function saveWx(days){
  const cut = today0().getTime() - WX_KEEP_DAYS*DAY;
  const kept = days.filter(d => day0(d.d).getTime() >= cut).sort((a,b) => a.d < b.d ? -1 : 1);
  Store.set(KEY, { days:kept, updated:new Date().toISOString() });
}

/* Relative dry-down speed vs. a 70°F / 50% RH baseline. Warm + dry air pulls
   water out of soil faster; cold + damp air keeps it in. Clamped so one freak
   day can never swing the schedule wildly. */
export function dryFactor(tF, rh){
  if (tF == null) return 1;
  const t = 1 + (tF - 70) / 90;
  const h = rh == null ? 1 : 1 + (50 - rh) / 220;
  return Math.round(Math.max(0.7, Math.min(1.4, t * h)) * 100) / 100;
}

/* Mean dry factor over the last `n` recorded days — the schedule multiplier. */
export function recentDryFactor(n = 7){
  const rows = wxLog().slice(-n);
  if (!rows.length) return 1;
  const mean = rows.reduce((s,r) => s + (r.dry || 1), 0) / rows.length;
  return Math.round(mean * 100) / 100;
}

/* A snapshot to stamp onto a watering entry, so the log records the conditions
   each watering actually happened in. */
export function currentWx(){
  const rows = wxLog();
  const r = rows.length ? rows[rows.length-1] : null;
  return r ? { tF:r.tF, rh:r.rh, code:r.code } : null;
}

/* Is right now a good moment to water? Morning + a drying stretch is ideal;
   watering into a cold damp evening is how you get rot. */
export function wateringWindow(){
  const hr = new Date().getHours(), f = recentDryFactor();
  const morning = hr >= 6 && hr < 12;
  if (f >= 1.15) return { v:'good', txt: morning
    ? 'Warm and drying fast — morning is the ideal window, water now.'
    : 'Warm and drying fast — water early tomorrow so leaves dry before dusk.' };
  if (f <= 0.9)  return { v:'poor', txt:'Cool and damp — soil is holding water. Finger-check before watering anything.' };
  return { v:'ok', txt: morning ? 'Average conditions — a normal morning watering is fine.'
                                : 'Average conditions — morning beats evening, but no harm either way.' };
}

export function record(tF, rh, code, hiF, loF){
  const d = isoDay(new Date()), rows = wxLog().filter(r => r.d !== d);
  rows.push({ d, tF, rh, code, hiF, loF, dry: dryFactor(tF, rh) });
  saveWx(rows);
  Cadence.weatherFactor = recentDryFactor();
}

export async function loadWeather(){
  // Restore the multiplier from the log immediately, so an offline boot still
  // schedules against the last week we know about.
  Cadence.weatherFactor = recentDryFactor();
  const last = wxLog().slice(-1)[0];
  if (last){ Live.tF = last.tF; Live.rh = last.rh; Live.code = last.code; Live.hiF = last.hiF; }

  if (!DB.home?.location) return;
  const tile = document.getElementById('wxTile');
  const { lat, lon, city } = DB.home.location;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
            + `&current=temperature_2m,relative_humidity_2m,weather_code`
            + `&daily=temperature_2m_max,temperature_2m_min`
            + `&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
    const w = await (await fetch(u)).json();
    const c = w.current;
    const t = Math.round(c.temperature_2m);
    const rh = c.relative_humidity_2m;
    const hi = Math.round(w.daily.temperature_2m_max[0]);
    const lo = Math.round(w.daily.temperature_2m_min[0]);
    const [emo, txt] = WMO[c.weather_code] || ['🌡️','—'];

    record(t, rh, c.weather_code, hi, lo);
    Live.tF = t; Live.rh = rh; Live.code = c.weather_code; Live.hiF = hi;

    if (tile){
      const nudge = t >= 85 ? 'Warm out — indoors dries a bit faster.'
                  : t <= 60 ? 'Cool — soil stays wet longer, ease off water.'
                  : 'Mild — normal watering rhythm.';
      tile.querySelector('.big').textContent = emo;
      tile.querySelector('.val').textContent = `${t}°F · ${txt}`;
      tile.querySelector('.sub').textContent = `${city.split(',')[0]} · ${rh}% RH · hi ${hi}° · ${nudge}`;
    }
  } catch (e) {
    if (tile){
      tile.querySelector('.val').textContent = Live.tF != null ? `${Live.tF}°F · last known` : 'Weather offline';
      tile.querySelector('.sub').textContent = Live.tF != null
        ? 'Offline — scheduling from the recorded log' : 'Connect to load live conditions';
    }
  }
}
