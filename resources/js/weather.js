// ===========================================================================
// weather.js — live conditions from Open-Meteo (free, no API key).
// ===========================================================================
import { DB } from './state.js';
import { WMO } from './config.js';

export async function loadWeather(){
  if (!DB.home?.location) return;
  const tile = document.getElementById('wxTile');
  if (!tile) return;
  const { lat, lon, city } = DB.home.location;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
            + `&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max`
            + `&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
    const w = await (await fetch(u)).json();
    const c = w.current;
    const t = Math.round(c.temperature_2m);
    const rh = c.relative_humidity_2m;
    const hi = Math.round(w.daily.temperature_2m_max[0]);
    const [emo, txt] = WMO[c.weather_code] || ['🌡️','—'];
    const nudge = t >= 85 ? 'Warm out — indoors dries a bit faster.'
                : t <= 60 ? 'Cool — soil stays wet longer, ease off water.'
                : 'Mild — normal watering rhythm.';
    tile.querySelector('.big').textContent = emo;
    tile.querySelector('.val').textContent = `${t}°F · ${txt}`;
    tile.querySelector('.sub').textContent = `${city.split(',')[0]} · ${rh}% RH · hi ${hi}° · ${nudge}`;
  } catch (e) {
    tile.querySelector('.val').textContent = 'Weather offline';
    tile.querySelector('.sub').textContent = 'Connect to load live conditions';
  }
}
