/* global Chart */
import { parsePositions } from "./parsePositions.mjs";
import { computeSeries, DEFAULT_SETTINGS, clearCache } from "./speedUtils.mjs";

// ---------- CONFIG ----------

// ---------- DOM refs ----------
const boatSelect  = document.getElementById('boatSelect');
const classSelect = document.getElementById('classSelect');
const raceSelect  = document.getElementById('raceSelect');
const raceTitle   = document.getElementById('raceTitle');
const chartTitle  = document.getElementById('chartTitle');
const ctx         = document.getElementById('speedChart').getContext('2d');
const rawToggle   = document.getElementById('rawToggle');
const distInput = document.getElementById("distInput");
const percentileInput = document.getElementById("percentileInput");
const settings = loadSettings();
distInput.value = settings.distNm;
percentileInput.value = settings.percentile;

let positionsByBoat = {};       // { id: [ moments … ] }
let chart;                      // Chart.js instance
let courseNodes = [];           // course waypoints for sector boundaries
let classInfo = {};             // { key:{ name, boats:[ids] } }
let boatNames = {};             // id -> name
let leaderboardData = [];       // [{ id, rank, status, cElapsedFormatted, ... }]

async function loadRace(raceId) {
    if (!raceId) {
      // Clear everything if no race is selected
      raceTitle.textContent = 'Coach Regatta';
      boatSelect.innerHTML = '<option value="">Select a race first</option>';
      classSelect.innerHTML = '<option value="">Select a race first</option>';
      boatSelect.disabled = true;
      classSelect.disabled = true;
      destroyChart();
      chartTitle.textContent = '';
      document.getElementById('leaderboard-container').innerHTML = '';
      clearSectorTable();
      return;
    }

    const raceName = raceSelect.selectedOptions[0].text;
    raceTitle.textContent = raceName;
    boatSelect.innerHTML = '<option value="">Loading...</option>';
    classSelect.innerHTML = '<option value="">Loading...</option>';
    boatSelect.disabled = true;
    classSelect.disabled = true;
    destroyChart();
    chartTitle.textContent = '';
    document.getElementById('leaderboard-container').textContent = '';
    clearSectorTable();

    const SETUP_URL = `public/${raceId}/RaceSetup.json`;
    const POS_URL   = `public/${raceId}/AllPositions3.json`;
    const LEADER_URL = `public/${raceId}/leaderboard.json`;

    try {
        boatSelect.value = '';
        classSelect.value = '';
        leaderboardData = [];

        /* 1.  metadata  ----------------------------------------------------- */
        const setup = await fetchJSON(SETUP_URL);

        courseNodes = setup.course?.nodes || [];

        boatSelect.innerHTML = '';
        classSelect.innerHTML = '';

        // --- Populate Class Select ---
        classSelect.innerHTML = '';
        const defaultClassOpt = document.createElement('option');
        defaultClassOpt.value = "";
        defaultClassOpt.textContent = 'Select a class';
        classSelect.appendChild(defaultClassOpt);

        (setup.tags || [])
          .filter(t => /^IRC /i.test(t.name) && !/Overall|Two Handed/i.test(t.name))
          .forEach(tag => {
            const key = tag.name.toLowerCase().replace(/\s+/g, '').replace('zero', '0');
            classInfo[key] = { name: tag.name, id: tag.id, boats: [] };

            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = tag.name;
            classSelect.appendChild(opt);
          });
        classSelect.value = '';
        classSelect.disabled = false;

        // --- Populate Boat Select ---
        boatNames = {};
        boatSelect.innerHTML = '';
        const defaultBoatOpt = document.createElement('option');
        defaultBoatOpt.value = "";
        defaultBoatOpt.textContent = 'Select a boat';
        boatSelect.appendChild(defaultBoatOpt);

        setup.teams
             .sort((a, b) => a.name.localeCompare(b.name))
             .forEach(team => {
               const o   = document.createElement('option');
               o.value   = team.id;
               o.textContent = team.name;
               boatSelect.appendChild(o);

               boatNames[team.id] = team.name;
               const tags = team.tags || [];
               Object.keys(classInfo).forEach(k => {
                 const cid = classInfo[k].id;
                 if (tags.includes(cid)) classInfo[k].boats.push(team.id);
               });
             });
        boatSelect.value = '';
        boatSelect.disabled = false;

        /* 2.  positions file  ---------------------------------------------- */
        // AllPositions3.json is an ARRAY of { id, moments:[…] }
        const boats = await fetchJSON(POS_URL);
        positionsByBoat = parsePositions(boats);

        /* 2b. leaderboard data -------------------------------------------- */
        const lbJSON = await fetchJSON(LEADER_URL);
        leaderboardData = (lbJSON.tags?.[0]?.teams || []).map(t => ({
          id: t.id,
          rank: t.rankR ?? t.rankS,
          status: t.status,
          corrected: t.cElapsedFormatted
        }));

        /* 3.  user interaction --------------------------------------------- */
        boatSelect.onchange = () => {
          classSelect.value = '';
          drawBoat();
        };
        classSelect.onchange = () => {
          boatSelect.value = '';
          drawClass();
        };
        rawToggle.onchange = () => {
          if (boatSelect.value) drawBoat();
          else if (classSelect.value) drawClass();
        };

        renderLeaderboard();

        function drawBoat () {
          const id   = Number(boatSelect.value);
          const name = boatNames[id] || boatSelect.selectedOptions[0].text;
          if (id) {
            plotBoat(id, name, !rawToggle.checked);   // true = filtered
            renderLeaderboard(null, id);
            calculateSectorStats(id).then(renderSectorTable);
          }
        }

        function drawClass () {
          const classKey = classSelect.value;
          if (classKey && classInfo[classKey]) {
            plotClass(classKey, !rawToggle.checked);
            renderLeaderboard(classKey);
            clearSectorTable();
          }
        }

    } catch (err) {
        alert('Error initialising page – see console.');
        console.error(err);
    }
}

// ---------- MAIN ----------
async function init () {
  await populateRaceSelector();
  raceSelect.addEventListener("change", () => loadRace(raceSelect.value));
  distInput.addEventListener("change", () => {
    settings.distNm = Number(distInput.value);
    saveSettings();
    replotCurrent();
  });
  percentileInput.addEventListener("change", () => {
    settings.percentile = Number(percentileInput.value);
    clearCache();
    saveSettings();
    replotCurrent();
  });
}

window.addEventListener('DOMContentLoaded', init);

async function populateRaceSelector() {
  try {
    const races = await fetchJSON('public/races.json');
    raceSelect.innerHTML = '<option value="">Select a race</option>';
    races.forEach(race => {
      const option = document.createElement('option');
      option.value = race.id;
      option.textContent = race.name;
      raceSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Could not load races.json", err);
    raceSelect.innerHTML = '<option value="">Could not load races</option>';
    raceSelect.disabled = true;
  }
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem("settings") || "{}");
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem("settings", JSON.stringify({ distNm: settings.distNm, percentile: settings.percentile, smoothLen: settings.smoothLen }));
}

/* ---------- helpers -------------------------------------------------- */

async function fetchJSON (url) {
  const r = await fetch(url).catch(err => { throw new Error(`${url}: ${err}`); });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// Generate a distinct colour for each dataset
function getColor (idx, total) {
  // Spread hues 0-360°, keep good saturation & lightness
  const hue = (idx * 360 / total) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function plotBoat (boatId, boatName, filtered) {
  const track = positionsByBoat[boatId];
  if (!track) return;

  const { sogKn, labels } = computeSeries(track, filtered, settings);
  const sectorInfo = computeSectorTimes(track);
  chartTitle.textContent = `${boatName} – Speed (${filtered ? 'filtered' : 'raw'})`;

  destroyChart();

  chart = new Chart(ctx, {
    type : 'line',
    data : {
      labels,
      datasets : [
        { label:'Speed (kn)', data:sogKn, borderWidth:1, tension:0.2 }
      ]
    },
    options : {
      responsive:true,
      scales:{
        x:{
          type:'time',
          time:{ unit:'hour' },
          grid:{ color:'rgba(0,0,0,0.06)', borderDash:[4,2] }
        },
        y:{
          title:{ display:true, text:'knots' },
          grid:{ color:'rgba(0,0,0,0.06)', borderDash:[4,2] }
        }
      },
      interaction:{ mode:'nearest', intersect:false },
      plugins:{
        legend:{
          onClick:(e, item, legend)=>{
            const {chart} = legend;
            if (e.native.shiftKey) {
              chart.data.datasets.forEach((ds, i) => {
                const meta = chart.getDatasetMeta(i);
                meta.hidden = i === item.datasetIndex ? null : true;
              });
            } else {
              const meta = chart.getDatasetMeta(item.datasetIndex);
              meta.hidden = !meta.hidden;
            }
            chart.update();
          }
        },
        zoom:{
          zoom:{
            wheel:{ enabled:true },
            pinch:{ enabled:true },
            mode:'x'
          },
          pan:{
            enabled:true,
            mode:'x'
          },
          limits:{ x:{ min:'original', max:'original' } }
        },
        sectors:{
          times : sectorInfo.times,
          labels: sectorInfo.labels,
          mids  : sectorInfo.mids
        }
      }
    },
    plugins: [sectorPlugin]
  });
}

function plotClass (classKey, filtered) {
  const info = classInfo[classKey];
  if (!info) return;
  const datasets = [];
  const boatsArr = info.boats.slice();
  const total = boatsArr.length;

  boatsArr.forEach((boatId, i) => {
    const track = positionsByBoat[boatId];
    if (!track) return;
    const { sogKn, labels } = computeSeries(track, filtered, settings);
    const color = getColor(i, total);

    datasets.push({
      label : boatNames[boatId] || `Boat ${boatId}`,
      data  : labels.map((t, j) => ({ x: t, y: sogKn[j] })),
      borderColor      : color,
      backgroundColor  : color,
      borderWidth      : 1,
      pointRadius      : 0,
      pointHoverRadius : 4,
      spanGaps         : true,
      cubicInterpolationMode: 'monotone'
    });
  });
  const sectorInfo = info.boats.length ? computeSectorTimes(positionsByBoat[info.boats[0]])
                                       : { times:[], labels:[], mids:[] };
  chartTitle.textContent = `${info.name} – Speed (${filtered ? 'filtered' : 'raw'})`;

  destroyChart();

  chart = new Chart(ctx, {
    type:'line',
    data:{ datasets },
    options:{
      responsive:true,
      // parsing:false,
      scales:{
        x:{
          type:'time',
          time:{ unit:'hour' },
          grid:{ color:'rgba(0,0,0,0.06)', borderDash:[4,2] }
        },
        y:{
          title:{ display:true, text:'knots' },
          grid:{ color:'rgba(0,0,0,0.06)', borderDash:[4,2] }
        }
      },
      interaction:{ mode:'nearest', intersect:false },
      plugins:{
        legend:{
          onClick:(e, item, legend)=>{
            const {chart} = legend;
            if (e.native.shiftKey) {
              chart.data.datasets.forEach((ds, i) => {
                const meta = chart.getDatasetMeta(i);
                meta.hidden = i === item.datasetIndex ? null : true;
              });
            } else {
              const meta = chart.getDatasetMeta(item.datasetIndex);
              meta.hidden = !meta.hidden;
            }
            chart.update();
          }
        },
        zoom:{
          zoom:{
            wheel:{ enabled:true },
            pinch:{ enabled:true },
            mode:'x'
          },
          pan:{
            enabled:true,
            mode:'x'
          },
          limits:{ x:{ min:'original', max:'original' } }
        },
        sectors:{
          times : sectorInfo.times,
          labels: sectorInfo.labels,
          mids  : sectorInfo.mids
        }
      }
    },
    plugins:[sectorPlugin]
  });
}
function replotCurrent() {
  if (boatSelect.value) {
    const id = Number(boatSelect.value);
    const name = boatNames[id] || boatSelect.selectedOptions[0].text;
    plotBoat(id, name, !rawToggle.checked);
    renderLeaderboard(null, id);
  } else if (classSelect.value) {
    plotClass(classSelect.value, !rawToggle.checked);
    renderLeaderboard(classSelect.value);
  }
}

/* ---------- maths ---------------------------------------------------- */


const R_EARTH_NM = 3440.065;
const deg2rad = d => d*Math.PI/180;
const rad2deg = r => r*180/Math.PI;

function haversineNm (la1,lo1,la2,lo2){
  const φ1=deg2rad(la1), φ2=deg2rad(la2);
  const dφ=φ2-φ1, dλ=deg2rad(lo2-lo1);
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R_EARTH_NM*Math.asin(Math.sqrt(a));
}
function bearingDeg (p1,p2){
  const φ1=deg2rad(p1.lat), φ2=deg2rad(p2.lat);
  const λ1=deg2rad(p1.lon), λ2=deg2rad(p2.lon);
  const y = Math.sin(λ2-λ1)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  return (rad2deg(Math.atan2(y,x))+360)%360;
}

// Derive approximate times when the boat reaches each course node
function computeSectorTimes (moments) {
  if (!courseNodes.length) return { times: [], labels: [], mids: [] };
  const moms = moments.slice().sort((a, b) => a.at - b.at);
  const times  = [];
  const labels = [];
  const mids   = [];

  let prevTime = moms[0]?.at || 0;
  let prevName = courseNodes[0].name || 'Start';

  for (let i = 1; i < courseNodes.length; i++) {
    const node     = courseNodes[i];
    const { lat, lon } = node;
    let best = { dist: Infinity, at: null };
    moms.forEach(m => {
      const d = haversineNm(lat, lon, m.lat, m.lon);
      if (d < best.dist) best = { dist: d, at: m.at };
    });
    if (best.at !== null) {
      times.push(best.at);
      mids.push((prevTime + best.at) / 2);
      const currName = node.name || (i === courseNodes.length - 1 ? 'Finish' : `WP${i+1}`);
      labels.push(`${prevName} – ${currName}`);
      prevTime = best.at;
      prevName = currName;
    }
  }
  return { times, labels, mids };
}

// Plugin to draw dashed vertical lines at sector times
const sectorPlugin = {
  id: 'sectors',
  afterDraw (chart, args, opts) {
    const times  = opts.times  || [];
    const labels = opts.labels || [];
    const mids   = opts.mids   || [];
    if (!times.length) return;
    const { ctx, scales: { x, y } } = chart;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.setLineDash([4, 4]);
    times.forEach(t => {
      const px = x.getPixelForValue(new Date(t * 1000));
      ctx.beginPath();
      ctx.moveTo(px, y.top);
      ctx.lineTo(px, y.bottom);
      ctx.stroke();
    });
    ctx.restore();

    // draw sector labels at midpoints
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    mids.forEach((t, i) => {
      const px = x.getPixelForValue(new Date(t * 1000));
      ctx.fillText(labels[i] || '', px, y.top + 4);
    });
    ctx.restore();
  }
};

function destroyChart () {
  if (!chart) return;
  chart.destroy();
  Chart.unregister(sectorPlugin);
  chart = null;
}

function renderLeaderboard (classKey = null, boatId = null) {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  if (!leaderboardData.length) {
    container.textContent = 'No leaderboard data';
    return;
  }

  let data = leaderboardData.slice();
  if (classKey && classInfo[classKey]) {
    const ids = new Set(classInfo[classKey].boats);
    data = data.filter(d => ids.has(d.id));
  }
  data.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  let html = '<table><thead><tr><th>Rank</th><th>Boat</th><th>Status</th><th>Corrected</th></tr></thead><tbody>';
  data.forEach(d => {
    const name = boatNames[d.id] || `Boat ${d.id}`;
    const highlight = d.id === boatId ? ' style="background-color:#ffef99"' : '';
    html += `<tr${highlight}><td>${d.rank ?? ''}</td><td>${name}</td><td>${d.status}</td><td>${d.corrected || ''}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function clearSectorTable () {
  const c = document.getElementById('sector-analysis-container');
  if (c) c.innerHTML = '';
}

async function calculateSectorStats (boatId) {
  const track = positionsByBoat[boatId];
  if (!track || !courseNodes.length) return [];
  const moms = track.slice().sort((a,b) => a.at - b.at);

  const stats = [];
  for (let i = 0; i < courseNodes.length - 1; i++) {
    const start = courseNodes[i];
    const end   = courseNodes[i+1];
    let startIdx = null, endIdx = null, startDist=Infinity, endDist=Infinity;
    moms.forEach((m, idx) => {
      const ds = haversineNm(start.lat, start.lon, m.lat, m.lon);
      if (ds < startDist) { startDist = ds; startIdx = idx; }
      const de = haversineNm(end.lat, end.lon, m.lat, m.lon);
      if (de < endDist) { endDist = de; endIdx = idx; }
    });
    if (startIdx === null || endIdx === null || endIdx <= startIdx) continue;

    const startTime = moms[startIdx].at;
    const endTime = moms[endIdx].at;
    const timeTaken = endTime - startTime;
    let dist = 0;
    for (let j = startIdx + 1; j <= endIdx; j++) {
      const A = moms[j-1], B = moms[j];
      dist += haversineNm(A.lat, A.lon, B.lat, B.lon);
    }
    const avgSpeed = timeTaken > 0 ? dist / (timeTaken / 3600) : 0;
    stats.push({ timeTaken, distance: dist, avgSpeed });
  }
  return stats;
}

function renderSectorTable (stats = []) {
  const container = document.getElementById('sector-analysis-container');
  if (!container) return;
  if (!stats.length) { container.innerHTML = ''; return; }

  let html = '<table><thead><tr><th>Sector</th><th>Time</th><th>Distance (nm)</th><th>Avg Speed (kn)</th></tr></thead><tbody>';
  stats.forEach((s, i) => {
    html += `<tr><td>${i+1}</td><td>${formatDuration(s.timeTaken)}</td><td>${s.distance.toFixed(2)}</td><td>${s.avgSpeed.toFixed(2)}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function formatDuration (sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

