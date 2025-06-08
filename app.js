/* global Chart */

// ---------- CONFIG ----------
const RACE = 'dgbr2025';
const SETUP_URL = `public/${RACE}/RaceSetup.json`;
const POS_URL   = `public/${RACE}/AllPositions3.json`;
const MAX_KNOTS   = 25;   // anything faster is discarded as a spike
const SMOOTH_LEN  = 3;    // 3-point moving-average; set 1 to disable

// ---------- DOM refs ----------
const boatSelect = document.getElementById('boatSelect');
const chartTitle = document.getElementById('chartTitle');
const ctx        = document.getElementById('speedChart').getContext('2d');

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
    boatSelect.addEventListener('change', () => {
      const id   = Number(boatSelect.value);
      const name = boatSelect.selectedOptions[0].text;
      plotBoat(id, name);
    });

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

function plotBoat (id, name) {
  const track = positionsByBoat[id];
  if (!track) { alert('No data for this boat'); return; }

  const { sogKn, vmgKn, labels } = computeSeries(track);

  chartTitle.textContent = `${name} – Speed & VMG`;

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


function computeSeries (rawMoments) {
  const moms = rawMoments.slice().sort((a, b) => a.at - b.at);   // oldest→newest

  const speedRaw = [];   // will become speed after spike filter
  const vmgRaw   = [];
  const labels   = [];

  const finish = moms[moms.length - 1];
  const courseBearing = bearingDeg(moms[0], finish);

  for (let i = 1; i < moms.length; i++) {
    const A = moms[i - 1];
    const B = moms[i];

    const dtHr = (B.at - A.at) / 3600;
    if (dtHr <= 0) continue;                       // safety

    const distNm = haversineNm(A.lat, A.lon, B.lat, B.lon);
    const speed  = distNm / dtHr;                 // kn

    if (speed > MAX_KNOTS) continue;              // spike → skip

    const brg = bearingDeg(A, B);
    const vmg = speed * Math.cos(deg2rad(brg - courseBearing));

    speedRaw.push(speed);
    vmgRaw.push(vmg);
    labels.push(new Date(B.at * 1000));
  }

  /* ------- optional tiny smoothing ---------- */
  const sogKn = smooth(speedRaw, SMOOTH_LEN);
  const vmgKn = smooth(vmgRaw,   SMOOTH_LEN);

  return { sogKn, vmgKn, labels };
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

