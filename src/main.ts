import { fetchRaceSetup, fetchPositions, populateRaceSelector, settings, saveSettings } from './raceLoader';
import { initChart, renderChart, Series, computeSectorTimes } from './chart';
import { initUI, updateUiWithRace, getClassInfo, getBoatId, getBoatNames, disableSelectors, displaySectorAnalysis, showSectors, setComparisonMode, isComparisonMode, getComparisonBoats, setComparisonBoats } from './ui';
import { computeSeries, calculateBoatStatistics } from './speedUtils';
import { getColor } from './palette';
import type { RaceSetup, BoatStats, Moment, CourseNode } from './types';
import Choices from 'choices.js';
import 'choices.js/public/assets/styles/choices.min.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const boatSelect  = document.getElementById('boatSelect') as HTMLSelectElement;
const classSelect = document.getElementById('classSelect') as HTMLSelectElement;
const raceSelect  = document.getElementById('raceSelect') as HTMLSelectElement;
const chartTitle  = document.getElementById('chartTitle') as HTMLElement;
const ctx         = (document.getElementById('speedChart') as HTMLCanvasElement).getContext('2d')!;
const rawToggle   = document.getElementById('rawToggle') as HTMLInputElement;
const compareToggle = document.getElementById('compareToggle') as HTMLInputElement;
const sectorToggle = document.getElementById('sectorToggle') as HTMLInputElement;
const distInput   = document.getElementById('distInput') as HTMLInputElement;
const percentileInput = document.getElementById('percentileInput') as HTMLInputElement;
const boatStatus  = document.getElementById('boatStatus') as HTMLElement;
const classStatus = document.getElementById('classStatus') as HTMLElement;
const map = L.map('map-container');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);
map.setView([0, 0], 2);
let polylines: L.Polyline[] = [];
let sectorPolygons: L.Polygon[] = [];

let boatChoices: Choices | null = null;
let classChoices: Choices | null = null;
let comparisonMode = false;

function drawTracks(pos: Record<number, Moment[]>, ids: number[]) {
  if(isComparisonMode()){
    const set = new Set(getComparisonBoats());
    ids = ids.filter(id => set.has(getBoatNames()[id] || String(id)));
  }
  polylines.forEach(p => p.remove());
  polylines = [];
  const group: L.Polyline[] = [];
  ids.forEach((id, idx) => {
    const track = pos[id];
    if(!track || !track.length) return;
    const coords = track.map(m => [m.lat, m.lon] as [number, number]);
    const poly = L.polyline(coords, { color: getColor(idx) }).addTo(map);
    polylines.push(poly);
    group.push(poly);
  });
  if(group.length){
    const fg = L.featureGroup(group);
    map.fitBounds(fg.getBounds());
  }
}

function drawSectorPolygons(){
  sectorPolygons.forEach(p => p.remove());
  sectorPolygons = [];
  if(!showSectors() || !courseNodes.length) return;
  courseNodes.forEach((node, idx) => {
    if(idx >= courseNodes.length - 1) return;
    const next = courseNodes[idx+1];
    const coords: [number, number][] = [
      [node.lat, node.lon],
      [next.lat, next.lon],
      [node.lat, node.lon]
    ];
    const color = idx % 2 === 0 ? '#3388ff' : '#ff8800';
    const poly = L.polygon(coords, { color, weight: 2, fillOpacity: 0.1 }).addTo(map);
    const startName = node.name || (idx === 0 ? 'Start' : `WP${idx+1}`);
    const endName = next.name || (idx+1 === courseNodes.length-1 ? 'Finish' : `WP${idx+2}`);
    poly.bindTooltip(`${startName} – ${endName}`);
    sectorPolygons.push(poly);
  });
}

function refreshDropdowns(){
  if(boatChoices) boatChoices.destroy();
  if(classChoices) classChoices.destroy();
  boatChoices = new Choices(boatSelect, { searchEnabled: true, shouldSort: false });
  classChoices = new Choices(classSelect, { searchEnabled: true, shouldSort: false });
}

let currentRace = '';
let raceSetup: RaceSetup | null = null;
let boatStats: Record<number, BoatStats> = {};
let courseNodes: CourseNode[] = [];

initChart({ ctx, chartTitleEl: chartTitle });
initUI({ leaderboardDataRef: [], classInfoRef: {}, boatNamesRef: {}, positionsByBoatRef: {}, chartRef: null, chartTitleEl: chartTitle, boatSelectEl: boatSelect, classSelectEl: classSelect, rawToggleEl: rawToggle, sectorToggleEl: sectorToggle }, handleSelectionChange);
disableSelectors();
compareToggle.addEventListener('change', () => {
  comparisonMode = compareToggle.checked;
  setComparisonMode(comparisonMode);
  if(comparisonMode){
    boatSelect.setAttribute('multiple', '');
    const names = Array.from(boatSelect.selectedOptions).map(o=>o.value).filter(Boolean);
    setComparisonBoats(names);
  } else {
    boatSelect.removeAttribute('multiple');
    boatSelect.selectedIndex = 0;
    setComparisonBoats([]);
  }
  refreshDropdowns();
  if(boatSelect.value){
    handleSelectionChange({ boat: boatSelect.value });
  } else if(classSelect.value){
    handleSelectionChange({ className: classSelect.value });
  }
});
sectorToggle.addEventListener('change', drawSectorPolygons);

async function handleSelectionChange(sel:{ boat?: string; className?: string }){
  if(!currentRace || !raceSetup) return;
  let ids: number[] = [];
  let selectedNames: string[] = [];
  if(sel.boat){
    if(isComparisonMode()){
      selectedNames = getComparisonBoats();
      ids = selectedNames.map(n => getBoatId(n)).filter((n):n is number => !!n);
    } else {
      const id = getBoatId(sel.boat);
      if(id){ ids = [id]; selectedNames = [sel.boat]; }
    }
  }else if(sel.className){
    const info = getClassInfo()[sel.className];
    if(info){
      ids = info.boats.slice();
      selectedNames = ids.map(id => getBoatNames()[id] || String(id));
    }
  }
  if(!ids.length) return;
  const positions = await fetchPositions(currentRace, ids);
  const series: Series[] = ids.map(id => {
    const track = positions[id];
    if(!track) return null as any;
    const { sogKn, labels } = computeSeries(track, !rawToggle.checked, settings);
    return { name: getBoatNames()[id] || String(id), data: labels.map((t,j)=>({ x:t, y:sogKn[j] })) };
  }).filter(Boolean);
  let sectorInfo = { times: [] as number[], labels: [] as string[], mids: [] as number[] };
  if(courseNodes.length && positions[ids[0]]){
    sectorInfo = computeSectorTimes(positions[ids[0]], courseNodes);
  }
  renderChart(series, selectedNames, showSectors() ? sectorInfo : undefined);
  drawTracks(positions, ids);
}

async function loadRace(raceId:string){
  if(!raceId) return;
  currentRace = raceId;
  raceSetup = await fetchRaceSetup(raceId);
  courseNodes = raceSetup.course?.nodes || [];
  (window as any).courseNodes = courseNodes;
  drawSectorPolygons();
  updateUiWithRace(raceSetup);
  refreshDropdowns();
  const ids = raceSetup.teams.map(t => t.id);
  const positions = await fetchPositions(raceId, ids);
  boatStats = {};
  ids.forEach(id => {
    const track = positions[id];
    if(track) boatStats[id] = calculateBoatStatistics(track);
  });
  displaySectorAnalysis(boatStats);
  drawTracks({}, []);
}

async function init(){
  const races = await populateRaceSelector();
  if(!races.length) return;
  refreshDropdowns();
  raceSelect.value = races[0].id;
  await loadRace(races[0].id);
  raceSelect.addEventListener('change', async () => {
    if(!raceSelect.value){
      disableSelectors();
      boatStatus.textContent = '';
      classStatus.textContent = '';
      return;
    }
    boatStatus.textContent = 'Loading...';
    classStatus.textContent = 'Loading...';
    disableSelectors();
    await loadRace(raceSelect.value);
    boatStatus.textContent = '';
    classStatus.textContent = '';
  });
  distInput.value = String(settings.distNm);
  percentileInput.value = String(settings.percentile);
  distInput.addEventListener('change', () => { settings.distNm = Number(distInput.value); saveSettings(); });
  percentileInput.addEventListener('change', () => { settings.percentile = Number(percentileInput.value); saveSettings(); });
}

window.addEventListener('DOMContentLoaded', init);
