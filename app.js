/* global Chart */

// paths are relative to the site root (GitHub Pages serves everything from /)
const RACE = 'dgbr2025';
const SETUP_URL = `public/${RACE}/RaceSetup.json`;
const POS_URL   = `public/${RACE}/AllPositions3.json`;

const boatSelect = document.getElementById('boatSelect');
const chartTitle = document.getElementById('chartTitle');
const ctx        = document.getElementById('speedChart').getContext('2d');

let positionsByBoat = null;   // filled after fetch
let chart = null;             // Chart.js instance

main();

async function main () {
  // 1) fetch metadata → populate dropdown
  const setup = await fetchJSON(SETUP_URL);
  setup.boats
       .sort((a,b) => a.name.localeCompare(b.name))
       .forEach(b => {
         const opt = document.createElement('option');
         opt.value = b.id;                // numeric internal id
         opt.text  = b.name;
         boatSelect.appendChild(opt);
       });
  boatSelect.disabled = false;
  boatSelect.firstElementChild.text = 'Select a boat';

  // 2) fetch heavy positions file **once** and index it by boatId
  const allPos = await fetchJSON(POS_URL);
  positionsByBoat = Object.fromEntries(
    allPos.boats.map(b => [b.id, b.positions])
  );

  // 3) hook listener
  boatSelect.addEventListener('change', () => {
    const boatId = Number(boatSelect.value);
    const boatName = boatSelect.selectedOptions[0].text;
    plotBoat(boatId, boatName);
  });
}

/* ========== helpers ========== */

async function fetchJSON (url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.json();
}

function plotBoat (boatId, boatName) {
  const pos = positionsByBoat[boatId];
  if (!pos) {
    alert('No positions for this boat!');
    return;
  }
  // compute SOG & VMG arrays
  const {sogKts, vmgKts, labels} = computeSeries(pos);

  chartTitle.textContent = `${boatName} – Speed & VMG`;

  // destroy previous chart if any
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,           // ISO timestamps → x-axis
      datasets: [
        {
          label: 'Speed (kn)',
          data: sogKts,
          tension: 0.2,
          borderWidth: 1
        },
        {
          label: 'VMG (kn)',
          data: vmgKts,
          tension: 0.2,
          borderDash: [5,5],
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { type: 'time', time: { unit: 'hour' } },
        y: { title: { display: true, text: 'knots' } }
      }
    }
  });
}

function computeSeries (posArr) {
  const sogKts = [];
  const vmgKts = [];
  const labels = [];

  // finish coordinates for VMG reference line = last fix
  const finish = posArr[posArr.length - 1];
  const courseBearing = bearingDeg(posArr[0], finish);

  for (let i = 1; i < posArr.length; i++) {
    const a = posArr[i-1];
    const b = posArr[i];

    const dtHr = (b.t - a.t) / 3600;          // seconds → hours
    if (dtHr <= 0) continue;

    const distNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    const speed  = distNm / dtHr;             // kn

    // direction of motion
    const brg = bearingDeg(a, b);
    const vmg = speed * Math.cos(deg2rad(brg - courseBearing));

    sogKts.push(speed.toFixed(2));
    vmgKts.push(vmg.toFixed(2));
    labels.push(new Date(b.t*1000));          // ms epoch
  }
  return {sogKts, vmgKts, labels};
}

/* ========== geo maths (small helpers; accuracy is plenty good) ========== */
const R_EARTH_NM = 3440.065;                  // nautical miles

function deg2rad (d) { return d * Math.PI / 180; }
function rad2deg (r) { return r * 180 / Math.PI; }

function haversineNm (lat1, lon1, lat2, lon2) {
  const φ1 = deg2rad(lat1),  φ2 = deg2rad(lat2);
  const dφ = φ2 - φ1;
  const dλ = deg2rad(lon2 - lon1);
  const a  = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2 * R_EARTH_NM * Math.asin(Math.sqrt(a));
}

function bearingDeg (p1, p2) {
  const φ1 = deg2rad(p1.lat), φ2 = deg2rad(p2.lat);
  const λ1 = deg2rad(p1.lon), λ2 = deg2rad(p2.lon);
  const y = Math.sin(λ2-λ1)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  return (rad2deg(Math.atan2(y,x)) + 360) % 360;
}
