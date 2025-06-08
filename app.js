/* global Chart */

// ---------- CONFIG ----------
const RACE = 'dgbr2025';
const SETUP_URL = `public/${RACE}/RaceSetup.json`;
const POS_URL   = `public/${RACE}/AllPositions3.json`;
const DIST_GLITCH_NM = 2;     // >2 nm jump in one fix = bad GPS
const SMOOTH_LEN     = 3;     // moving-average window (set 1 = off)

// ---------- DOM refs ----------
const boatSelect  = document.getElementById('boatSelect');
const classSelect = document.getElementById('classSelect');
const chartTitle  = document.getElementById('chartTitle');
const ctx         = document.getElementById('speedChart').getContext('2d');
const rawToggle   = document.getElementById('rawToggle');

let positionsByBoat = {};       // { id: [ moments … ] }
let chart;                      // Chart.js instance
let courseNodes = [];           // course waypoints for sector boundaries
let classInfo = {};             // { key:{ name, boats:[ids] } }
let boatNames = {};             // id -> name

// ---------- MAIN ----------
(async function init () {
  try {
    /* 1.  metadata  ----------------------------------------------------- */
    const setup = await fetchJSON(SETUP_URL);

    courseNodes = setup.course?.nodes || [];

    // ----- build class list from tags -----
    (setup.tags || [])
      .filter(t => /^IRC /i.test(t.name) && !/Overall|Two Handed/i.test(t.name))
      .forEach(tag => {
        const key = tag.name.toLowerCase().replace(/\s+/g, '').replace('zero','0');
        classInfo[key] = { name: tag.name, id: tag.id, boats: [] };
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = tag.name;
        classSelect.appendChild(opt);
      });

    classSelect.disabled = false;
    classSelect.firstElementChild.textContent = 'Select a class';

    // RaceSetup.json holds boats inside `teams`
    setup.teams
         .sort((a, b) => a.name.localeCompare(b.name))
         .forEach(team => {
           const o   = document.createElement('option');
           o.value   = team.id;          // numeric ID
           o.textContent = team.name;    // friendly name
           boatSelect.appendChild(o);

           boatNames[team.id] = team.name;
           const tags = team.tags || [];
           Object.keys(classInfo).forEach(k => {
             const cid = classInfo[k].id;
             if (tags.includes(cid)) classInfo[k].boats.push(team.id);
           });
         });

    boatSelect.disabled = false;
    boatSelect.firstElementChild.textContent = 'Select a boat';

    /* 2.  positions file  ---------------------------------------------- */
    // AllPositions3.json is an ARRAY of { id, moments:[…] }
    const boats = await fetchJSON(POS_URL);
    boats.forEach(b => { positionsByBoat[b.id] = b.moments; });

    /* 3.  user interaction --------------------------------------------- */
    boatSelect.addEventListener('change', () => {
      classSelect.value = '';
      drawBoat();
    });
    classSelect.addEventListener('change', () => {
      boatSelect.value = '';
      drawClass();
    });
    rawToggle.addEventListener('change', () => {
      if (boatSelect.value) drawBoat();
      else if (classSelect.value) drawClass();
    });

    function drawBoat () {
      const id   = Number(boatSelect.value);
      const name = boatNames[id] || boatSelect.selectedOptions[0].text;
      if (id) plotBoat(id, name, !rawToggle.checked);   // true = filtered
    }

    function drawClass () {
      const key = classSelect.value;
      if (key && classInfo[key]) plotClass(key, !rawToggle.checked);
    }

  } catch (err) {
    alert('Error initialising page – see console.');
    console.error(err);
  }
})();

/* ---------- helpers -------------------------------------------------- */

async function fetchJSON (url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function plotBoat (boatId, boatName, filtered) {
  const track = positionsByBoat[boatId];
  if (!track) return;

  const { sogKn, labels } = computeSeries(track, filtered);
  const sectorInfo = computeSectorTimes(track);
  chartTitle.textContent = `${boatName} – Speed (${filtered ? 'filtered' : 'raw'})`;

  if (chart) chart.destroy();        // clear old chart

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
        x:{ type:'time', time:{ unit:'hour' } },
        y:{ title:{ display:true, text:'knots' } }
      },
      plugins:{
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
  info.boats.forEach(id => {
    const track = positionsByBoat[id];
    if (!track) return;
    const { sogKn, labels } = computeSeries(track, filtered);
    const data = labels.map((t, i) => ({ x: t, y: sogKn[i] }));
    datasets.push({ label: boatNames[id] || `Boat ${id}`, data, borderWidth:1, tension:0.2 });
  });
  const sectorInfo = info.boats.length ? computeSectorTimes(positionsByBoat[info.boats[0]])
                                       : { times:[], labels:[], mids:[] };
  chartTitle.textContent = `${info.name} – Speed (${filtered ? 'filtered' : 'raw'})`;

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type:'line',
    data:{ datasets },
    options:{
      responsive:true,
      parsing:false,
      scales:{
        x:{ type:'time', time:{ unit:'hour' } },
        y:{ title:{ display:true, text:'knots' } }
      },
      plugins:{
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

/* ---------- maths ---------------------------------------------------- */


function computeSeries (rawMoments, filtered = true) {
  /* ---------- PASS 0 : chronological order ---------- */
  const moms = rawMoments.slice().sort((a, b) => a.at - b.at);

  /* ---------- PASS 1 : compute all speeds (no filter yet) ---------- */
  const speeds   = [];        // track per-leg speed for dynamic ceiling
  const legs     = [];        // we’ll reuse when filtering
  // course bearing not needed without VMG

  for (let i = 1; i < moms.length; i++) {
    const A = moms[i - 1], B = moms[i];
    const dtHr = (B.at - A.at) / 3600;
    if (dtHr <= 0) continue;

    const dist = haversineNm(A.lat, A.lon, B.lat, B.lon);
    const sog  = dist / dtHr;

    legs.push({ t:B.at, sog, dist });
    speeds.push(sog);
  }

  /* ---------- dynamic ceiling from median speed ---------- */
  const median = speeds.slice().sort((x, y) => x - y)[Math.floor(speeds.length / 2)] || 0;
  const ceilKn = Math.min(25, 2.8 * median);

  /* ---------- PASS 2 : build final arrays with chosen filter ---------- */
  const sogArr = [], labels = [];

  legs.forEach(({ t, sog, dist }) => {
    const keep = !filtered
      || (sog <= ceilKn && dist <= DIST_GLITCH_NM);

    if (keep) {
      sogArr.push(sog);
      labels.push(new Date(t * 1000));
    }
  });

  /* ---------- optional smoothing ---------- */
  if (filtered && SMOOTH_LEN > 1) {
    return {
      sogKn : smooth(sogArr, SMOOTH_LEN),
      labels
    };
  }
  return { sogKn: sogArr, labels };
}

/* helper: centred moving-average (len must be odd) */
function smooth (arr, len) {
  if (len < 2) return arr;          // no smoothing
  const half = Math.floor(len / 2);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, cnt = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j < 0 || j >= arr.length) continue;
      sum += arr[j]; cnt++;
    }
    out.push(+ (sum / cnt).toFixed(2));
  }
  return out;
}
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

