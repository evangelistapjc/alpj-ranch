// ===========================================================================
// config.js — static constants only. No DOM, no state.
// ===========================================================================

export const ZONE  = { bright:'Bright', medium:'Medium', low:'Low' };
export const STAGE = { establishing:'Establishing', growing:'Growing', propReady:'Prop-ready' };

// WMO weather codes → [emoji, label]
export const WMO = {
  0:['☀️','Clear'], 1:['🌤️','Mostly clear'], 2:['⛅','Partly cloudy'], 3:['☁️','Cloudy'],
  45:['🌫️','Fog'], 48:['🌫️','Fog'], 51:['🌦️','Light drizzle'], 53:['🌦️','Drizzle'], 55:['🌧️','Drizzle'],
  61:['🌧️','Light rain'], 63:['🌧️','Rain'], 65:['🌧️','Heavy rain'], 71:['🌨️','Snow'], 80:['🌦️','Showers'],
  81:['🌧️','Showers'], 82:['⛈️','Heavy showers'], 95:['⛈️','Thunderstorm'], 96:['⛈️','Thunderstorm'], 99:['⛈️','Thunderstorm']
};

// modal tabs: [key, label]
export const TABS = [
  ['overview','🌟 Overview'], ['water','💧 Water'], ['placement','☀️ Placement'], ['soil','🪴 Soil'],
  ['climate','🌡️ Temp & Humidity'], ['fertilizer','🍽️ Fertilizer'], ['repot','📦 Repot'],
  ['propagate','✂️ Propagate'], ['issues','🐛 Issues & Log']
];

// grove grouping lenses. `of` maps a plant → its group key.
export const GROUPINGS = {
  light: { order:['bright','medium','low'], of:p=>p.zone, meta:{
    bright:{ emoji:'☀️', title:'Bright — Bedroom bay',            note:'Light-hungry & variegated' },
    medium:{ emoji:'🌤️', title:'Medium — Den / Kitchen / Living', note:'Tolerant of less light' },
    low:   { emoji:'🌑', title:'Low light',                        note:'Last resort only' } } },
  water: { order:['sip','regular'], of:p=>p.waterBucket, meta:{
    sip:    { emoji:'🏜️', title:'Sip — dry-down crew',    note:'Check every 2–3 wks' },
    regular:{ emoji:'💧', title:'Regular — weekly-ish',   note:'Check every ~10–14 days' } } },
  stage: { order:['establishing','growing','propReady'], of:p=>p.stage, meta:{
    establishing:{ emoji:'🌱', title:'Establishing — props & babies', note:'Gentle care, no fertilizer yet' },
    growing:     { emoji:'🌿', title:'Growing — established',         note:'Normal rhythm' },
    propReady:   { emoji:'✂️', title:'Propagation-ready',             note:'Coming up for cuttings' } } },
  room:  { order:[], of:p=>p.location, meta:{} }
};

// per-theme floor-plan palette (keyed by data-theme value)
export const MAP_THEME = {
  stardew:{ wood:'#c89b62',carpet:'#d9cbb6',tile:'#cfd8d2',grass:'#7cae48',plankW:'#a87c48',plankC:'#cabda6',plankT:'#bcc7bf',plankG:'#6a9c3a',hall:'#b48a52',hall2:'#a37e49',wall:'#4e341f',frameA:'#2a1e12',frameB:'#1c140b' },
  ghibli: { wood:'#d9c9a2',carpet:'#e6ddc6',tile:'#d4e0e1',grass:'#9ec87a',plankW:'#c4b184',plankC:'#d8ceb2',plankT:'#c2d2d0',plankG:'#8ab868',hall:'#cdbf98',hall2:'#bcac84',wall:'#5f7f6a',frameA:'#436068',frameB:'#2c443c' },
  lego:   { wood:'#e8b84b',carpet:'#f0d98a',tile:'#cfe0ee',grass:'#4caf3f',plankW:'#d0a03a',plankC:'#e0c56a',plankT:'#b8ccdc',plankG:'#3d9433',hall:'#d9a838',hall2:'#c89428',wall:'#1b1b1b',frameA:'#222',frameB:'#0d0d0d' }
};
