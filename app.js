/* global Chart */

// ---------- CONFIG ----------
const RACE = 'dgbr2025';
const SETUP_URL = `public/${RACE}/RaceSetup.json`;
const POS_URL   = `public/${RACE}/AllPositions3.json`;
const DIST_GLITCH_NM = 2;     // >2 nm jump in one fix = bad GPS
const SMOOTH_LEN     = 3;     // moving-average window (set 1 = off)

// ---------- DOM refs ----------
const boatSelect = document.getElementById('boatSelect');
const chartTitle = document.getElementById('chartTitle');
const ctx        = document.getElementById('speedChart').getContext('2d');
const rawToggle  = document.getElementById('rawToggle');

let positionsByBoat = {};       // { id: [ moments … ] }
let chart;                      // Chart.js instance

// ---------- MAIN ----------
(async function init () {
  try {
    /* 1.  metadata  ----------------------------------------------------- */
    const setup = await fetchJSON(SETUP_URL);

    // RaceSetup.json holds boats inside `teams`
    setup.teams
         .sort((a, b) => a.name.localeCompare(b.name))
         .forEach(team => {
           const o   = document.createElement('option');
           o.value   = team.id;          // numeric ID
           o.textContent = team.name;    // friendly name
           boatSelect.appendChild(o);
         });

    boatSelect.disabled = false;
    boatSelect.firstElementChild.textContent = 'Select a boat';

    /* 2.  positions file  ---------------------------------------------- */
    // AllPositions3.json is an ARRAY of { id, moments:[…] }
    const boats = await fetchJSON(POS_URL);
    boats.forEach(b => { positionsByBoat[b.id] = b.moments; });

    /* 3.  user interaction --------------------------------------------- */
    boatSelect.addEventListener('change', drawCurrent);
    rawToggle .addEventListener('change', drawCurrent);

    function drawCurrent () {
      const id   = Number(boatSelect.value);
      const name = boatSelect.selectedOptions[0].text;
      if (id) plotBoat(id, name, !rawToggle.checked);   // true = filtered
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

  const { sogKn, vmgKn, labels } = computeSeries(track, filtered);
  chartTitle.textContent = `${boatName} – Speed & VMG (${filtered ? 'filtered' : 'raw'})`;

  if (chart) chart.destroy();        // clear old chart

  chart = new Chart(ctx, {
    type : 'line',
    data : {
      labels,
      datasets : [
        { label:'Speed (kn)', data:sogKn, borderWidth:1, tension:0.2 },
        { label:'VMG (kn)',   data:vmgKn, borderWidth:1, tension:0.2, borderDash:[5,5] }
      ]
    },
    options : {
      responsive:true,
      scales:{
        x:{ type:'time', time:{ unit:'hour' } },
        y:{ title:{ display:true, text:'knots' } }
      }
    }
  });
}

/* ---------- maths ---------------------------------------------------- */


function computeSeries (rawMoments, filtered = true) {
  /* ---------- PASS 0 : chronological order ---------- */
  const moms = rawMoments.slice().sort((a, b) => a.at - b.at);

  /* ---------- PASS 1 : compute all speeds (no filter yet) ---------- */
  const speeds   = [];        // track per-leg speed for dynamic ceiling
  const legs     = [];        // we’ll reuse when filtering
  const finish   = moms[moms.length - 1];
  const crs      = bearingDeg(moms[0], finish);

  for (let i = 1; i < moms.length; i++) {
    const A = moms[i - 1], B = moms[i];
    const dtHr = (B.at - A.at) / 3600;
    if (dtHr <= 0) continue;

    const dist = haversineNm(A.lat, A.lon, B.lat, B.lon);
    const sog  = dist / dtHr;

    const brg  = bearingDeg(A, B);
    const vmg  = sog * Math.cos(deg2rad(brg - crs));

    legs.push({ t:B.at, sog, vmg, dist });
    speeds.push(sog);
  }

  /* ---------- dynamic ceiling from median speed ---------- */
  const median = speeds.slice().sort((x, y) => x - y)[Math.floor(speeds.length / 2)] || 0;
  const ceilKn = Math.min(25, 2.8 * median);

  /* ---------- PASS 2 : build final arrays with chosen filter ---------- */
  const sogArr = [], vmgArr = [], labels = [];

  legs.forEach(({ t, sog, vmg, dist }) => {
    const keep = !filtered
      || (sog <= ceilKn && dist <= DIST_GLITCH_NM);

    if (keep) {
      sogArr.push(sog);
      vmgArr.push(vmg);
      labels.push(new Date(t * 1000));
    }
  });

  /* ---------- optional smoothing ---------- */
  if (filtered && SMOOTH_LEN > 1) {
    return {
      sogKn : smooth(sogArr, SMOOTH_LEN),
      vmgKn : smooth(vmgArr, SMOOTH_LEN),
      labels
    };
  }
  return { sogKn: sogArr, vmgKn: vmgArr, labels };
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

