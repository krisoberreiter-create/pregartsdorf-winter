const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');

const app = express();
const PORT = 3000;

const LAT = 48.35;
const LON = 14.53;
const STATION_ID = '11035';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/wetter', async (req, res) => {
  
  // ---------- VERSUCH 1: GeoSphere Austria ----------
  try {
    const gsUrl = `https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=TL,RR,FF,SO&station_ids=${STATION_ID}`;
    const gsRes = await fetch(gsUrl);
    if (!gsRes.ok) throw new Error('HTTP ' + gsRes.status);
    
    const gsData = await gsRes.json();
    const feature = gsData.features && gsData.features[0];
    const params = feature && feature.properties && feature.properties.parameters;
    
    if (params && params.TL && params.TL.data) {
      const tlData = params.TL.data;
      const tempRaw = Array.isArray(tlData) ? tlData[0] : tlData;
      
      if (tempRaw !== null && tempRaw !== undefined && !isNaN(tempRaw)) {
        let temp = tempRaw;
        if (tempRaw > 100) temp = tempRaw - 273.15;
        
        const getVal = (p) => {
          if (!p || !p.data) return 0;
          const d = p.data;
          const v = Array.isArray(d) ? d[0] : d;
          return (v === null || v === undefined || isNaN(v)) ? 0 : v;
        };
        
        const regen = getVal(params.RR);
        const wind = getVal(params.FF);
        const sonne = getVal(params.SO);
        
        let wetterCode = 'bewoelkt';
        let blitz = false;
        
        // Gewitter-Erkennung: viel Regen + starke Böen
        if (regen > 2 && wind > 40) {
          wetterCode = 'gewitter';
          blitz = true;
        }
        else if (regen > 0.3 && temp <= 0) wetterCode = 'schnee';
        else if (regen > 0.3) wetterCode = 'regen';
        else if (sonne > 0.3) wetterCode = 'sonnig';
        else if (wind > 30) wetterCode = 'windig';
        
        console.log('✅ GeoSphere:', temp.toFixed(1) + '°C', wetterCode);
        
        return res.json({
          erfolg: true,
          quelle: 'geosphere',
          ort: 'Pregartsdorf',
          temperatur: Math.round(temp * 10) / 10,
          niederschlag: Math.round(regen * 10) / 10,
          wind: Math.round(wind * 10) / 10,
          wetterCode,
          blitz
        });
      }
    }
    throw new Error('Unerwartete Struktur');
  } catch (e) {
    console.log('❌ GeoSphere:', e.message);
  }

  // ---------- VERSUCH 2: Bright Sky ----------
  try {
    const bsUrl = `https://api.brightsky.dev/current_weather?lat=${LAT}&lon=${LON}`;
    const bsRes = await fetch(bsUrl);
    if (bsRes.ok) {
      const bsData = await bsRes.json();
      const w = bsData.weather;
      const temp = w.temperature;
      const condition = w.condition;
      const precip = w.precipitation_60 || 0;
      const wind = w.wind_speed_30 || 0;
      const sun = w.sunshine_60 || 0;
      
      let wetterCode = 'bewoelkt';
      let blitz = false;
      
      if (condition === 'thunderstorm') { wetterCode = 'gewitter'; blitz = true; }
      else if (condition === 'snow' || condition === 'sleet') wetterCode = 'schnee';
      else if (condition === 'rain' || precip > 0.3) wetterCode = 'regen';
      else if (condition === 'fog') wetterCode = 'nebel';
      else if (sun > 0.3) wetterCode = 'sonnig';
      else if (wind > 20) wetterCode = 'windig';
      
      console.log('✅ Bright Sky:', temp + '°C', wetterCode);
      
      return res.json({
        erfolg: true,
        quelle: 'brightsky',
        ort: 'Pregartsdorf',
        temperatur: Math.round(temp * 10) / 10,
        niederschlag: precip,
        wind: wind,
        wetterCode,
        blitz
      });
    }
  } catch (e) {
    console.log('❌ Bright Sky:', e.message);
  }

  // ---------- VERSUCH 3: Open-Meteo ----------
  try {
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const omRes = await fetch(omUrl);
    const omData = await omRes.json();
    const current = omData.current;
    const code = current.weather_code;
    
    let wetterCode = 'bewoelkt';
    let blitz = false;
    
    if ([95, 96, 99].includes(code)) { wetterCode = 'gewitter'; blitz = true; }
    else if ([61, 63, 65, 80, 81, 82].includes(code)) wetterCode = 'regen';
    else if ([71, 73, 75, 77, 85, 86].includes(code)) wetterCode = 'schnee';
    else if ([45, 48].includes(code)) wetterCode = 'nebel';
    else if (code === 0) wetterCode = 'sonnig';
    else if (code === 1 || code === 2) wetterCode = 'sonnig';
    
    console.log('⚠️ Open-Meteo:', current.temperature_2m + '°C', wetterCode);
    
    return res.json({
      erfolg: true,
      quelle: 'openmeteo',
      ort: 'Pregartsdorf',
      temperatur: current.temperature_2m,
      niederschlag: current.precipitation || 0,
      wind: current.wind_speed_10m || 0,
      wetterCode,
      blitz
    });
  } catch (e) {
    console.log('❌ Open-Meteo:', e.message);
    res.status(500).json({ erfolg: false });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('✅ Wetter-App läuft auf http://localhost:' + PORT);
  console.log('📍 Pregartsdorf (Station Freistadt)');
  console.log('🌐 Für Handy: http://10.0.0.248:' + PORT);
  console.log('═══════════════════════════════════════');
  console.log('');
});