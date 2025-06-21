import { fetchRaceSetup, fetchPositions, populateRaceSelector, settings, saveSettings, fetchLeaderboard } from './raceLoader';
import { initChart, renderChart, Series, computeSectorTimes,
  initSectorCharts, renderDistancePerSector, renderSpeedPerSector,
  clearSectorCharts, highlightChartLine, setLegendVisibility } from './chart';
import { initUI, updateUiWithRace, getClassInfo, getBoatId, getBoatNames, disableSelectors, showSectors, setComparisonMode, isComparisonMode, getComparisonBoats, setComparisonBoats, createUnifiedTable } from './ui';
import { computeSeries, calculateBoatStatistics, averageSpeedsBySector, distancesBySector, applyMovingAverage } from './speedUtils';
import { getColor } from './palette';
import type { RaceSetup, BoatStats, Moment, CourseNode } from './types';
import Choices from 'choices.js';
import 'choices.js/public/assets/styles/choices.min.css';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const boatSelect  = document.getElementById('boatSelect') as HTMLSelectElement;
const classSelect = document.getElementById('classSelect') as HTMLSelectElement;
const raceSelect  = document.getElementById('raceSelect') as HTMLSelectElement;
const chartTitle  = document.getElementById('chartTitle') as HTMLElement;
const ctx         = (document.getElementById('speedChart') as HTMLCanvasElement).getContext('2d')!;
const distCtx     = (document.getElementById('distSectorChart') as HTMLCanvasElement).getContext('2d')!;
const avgCtx      = (document.getElementById('avgSectorChart') as HTMLCanvasElement).getContext('2d')!;
const rawToggle   = document.getElementById('rawToggle') as HTMLInputElement;
const compareToggle = document.getElementById('compareToggle') as HTMLInputElement;
const sectorToggle = document.getElementById('sectorToggle') as HTMLInputElement;
const legendToggle = document.getElementById('legendToggle') as HTMLInputElement;
const smoothingSelect = document.getElementById('smoothing-selector') as HTMLSelectElement;
const distInput   = document.getElementById('distInput') as HTMLInputElement;
const percentileInput = document.getElementById('percentileInput') as HTMLInputElement;
const boatStatus  = document.getElementById('boatStatus') as HTMLElement;
const classStatus = document.getElementById('classStatus') as HTMLElement;
const tableWrapper = document.getElementById('table-wrapper') as HTMLElement;
const map = L.map('map-container');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);
map.setView([0, 0], 2);
let polylines: { id: number; poly: L.Polyline }[] = [];
let sectorPolygons: any[] = [];

export let highlightedBoatId: number | null = null;

export function setHighlightedBoatId(id: number | null){
  highlightedBoatId = id;
  highlightMapTrack(id);
  highlightChartLine(id);
}

export function highlightMapTrack(boatId: number | null){
  polylines.forEach(p => p.poly.setStyle({ weight: 3, opacity: 0.7 }));
  if(boatId===null) return;
  const item = polylines.find(p=>p.id===boatId);
  if(item){
    item.poly.setStyle({ weight: 6, opacity: 1 });
    item.poly.bringToFront();
  }
}

let boatChoices: Choices | null = null;
let classChoices: Choices | null = null;
let comparisonMode = false;

function drawTracks(pos: Record<number, Moment[]>, ids: number[]) {
  if(isComparisonMode()){
    const set = new Set(getComparisonBoats());
    ids = ids.filter(id => set.has(getBoatNames()[id] || String(id)));
  }
  polylines.forEach(p => p.poly.remove());
  polylines = [];
  const group: any[] = [];
  ids.forEach((id, idx) => {
    const track = pos[id];
    if(!track || !track.length) return;
    const coords = track.map(m => [m.lat, m.lon] as [number, number]);
    const poly = L.polyline(coords, {
      color: getColor(idx),
      weight: 3,
      opacity: 0.7
    }).addTo(map);
    polylines.push({ id, poly });
    group.push(poly);
  });
  if(group.length){
    const fg = L.featureGroup(group);
    map.fitBounds(fg.getBounds());
  }
  highlightMapTrack(highlightedBoatId);
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
let positionsByBoat: Record<number, Moment[]> = {};
let allUnifiedTableRows: any[] = [];

initChart({ ctx, chartTitleEl: chartTitle });
initSectorCharts({ distCtx, avgCtx });
initUI({ leaderboardDataRef: [], classInfoRef: {}, boatNamesRef: {}, positionsByBoatRef: positionsByBoat, chartRef: null, chartTitleEl: chartTitle, boatSelectEl: boatSelect, classSelectEl: classSelect, rawToggleEl: rawToggle, sectorToggleEl: sectorToggle }, async (sel: any) => {
  if(sel.comparison !== undefined){
    setComparisonMode(sel.comparison);
    await updateChartWithSelections();
    return;
  }
  if(sel.className){
    settings.className = sel.className;
    saveSettings();
    const rows = (() => {
      if(!sel.className || sel.className.toLowerCase() === 'all') return allUnifiedTableRows;
      const info = getClassInfo()[sel.className];
      if(!info) return allUnifiedTableRows;
      const names = new Set(info.boats.map(id => getBoatNames()[id] || `Boat ${id}`));
      return allUnifiedTableRows.filter(r => names.has(r.boat));
    })();
    createUnifiedTable(tableWrapper, rows);
  }
  await updateChartWithSelections();
});
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
  updateChartWithSelections();
});
sectorToggle.addEventListener('change', drawSectorPolygons);
smoothingSelect.addEventListener('change', updateChartWithSelections);
legendToggle.addEventListener('change', () => setLegendVisibility(legendToggle.checked));

async function updateChartWithSelections(){
  if(!currentRace || !raceSetup) return;
  let ids: number[] = [];
  let selectedNames: string[] = [];
  if(boatSelect.value){
    if(isComparisonMode()){
      selectedNames = getComparisonBoats();
      ids = selectedNames.map(n=>getBoatId(n)).filter((n):n is number => !!n);
    } else {
      const id = getBoatId(boatSelect.value);
      if(id){ ids=[id]; selectedNames=[boatSelect.value]; }
    }
  } else if(classSelect.value){
    const info = getClassInfo()[classSelect.value];
    if(info){
      ids = info.boats.slice();
      selectedNames = ids.map(id=>getBoatNames()[id] || String(id));
    }
  }
  if(!ids.length){
    clearSectorCharts();
    return;
  }
  const positions = await fetchPositions(currentRace, ids);
  const windowSize = Number(smoothingSelect.value||'0');
  const series: Series[] = ids.map(id => {
    const track = positions[id];
    if(!track) return null as any;
    const { sogKn, labels } = computeSeries(track, !rawToggle.checked, settings);
    let data = labels.map((t,j)=>({ x:t, y:sogKn[j] }));
    if(windowSize > 1) data = applyMovingAverage(data as any, windowSize) as any;
    return { name: getBoatNames()[id] || String(id), data };
  }).filter(Boolean);
  let sectorInfo = { times: [] as number[], labels: [] as string[], mids: [] as number[] };
  if(courseNodes.length && positions[ids[0]]){
    sectorInfo = computeSectorTimes(positions[ids[0]], courseNodes);
  }
  renderChart(series, selectedNames, showSectors() ? sectorInfo : undefined);
  drawTracks(positions, ids);

  const labels = courseNodes.slice(0,-1).map((n,idx)=>{
    const start = n.name || (idx===0 ? 'Start' : `WP${idx+1}`);
    const end = courseNodes[idx+1].name || (idx+1===courseNodes.length-1 ? 'Finish' : `WP${idx+2}`);
    return `${start} – ${end}`;
  });
  const distSeries = ids.map(id=>({
    name: getBoatNames()[id] || String(id),
    data: distancesBySector(positions[id], courseNodes)
  }));
  const speedSeries = ids.map(id=>({
    name: getBoatNames()[id] || String(id),
    data: averageSpeedsBySector(positions[id], courseNodes)
  }));
  if(labels.length){
    renderDistancePerSector(labels, distSeries);
    renderSpeedPerSector(labels, speedSeries);
  } else {
    clearSectorCharts();
  }
}
async function loadRace(raceId:string){
  if(!raceId) return;
  currentRace = raceId;
  clearSectorCharts();
  raceSetup = await fetchRaceSetup(raceId);
  courseNodes = raceSetup.course?.nodes || [];
  (window as any).courseNodes = courseNodes;
  drawSectorPolygons();
  const leaderboard = await fetchLeaderboard(raceId);
  updateUiWithRace(raceSetup, leaderboard);
  refreshDropdowns();
  const ids = raceSetup.teams.map(t => t.id);
  const positions = await fetchPositions(raceId, ids);
  Object.keys(positionsByBoat).forEach(k=>delete (positionsByBoat as any)[k]);
  Object.assign(positionsByBoat, positions);
  boatStats = {};
  ids.forEach(id => {
    const track = positions[id];
    if(track) boatStats[id] = calculateBoatStatistics(track, settings);
  });

  const unifiedTableRows: any[] = [];
  leaderboard.forEach(entry => {
    const id = entry.id;
    const name = getBoatNames()[id] || `Boat ${id}`;
    const track = positions[id];
    const stats = boatStats[id];
    const sectorSpeeds = track ? averageSpeedsBySector(track, courseNodes) : [];
    const sectorDistances = track ? distancesBySector(track, courseNodes) : [];
    unifiedTableRows.push({
      rank: entry.rank,
      boat: name,
      corrected: entry.corrected,
      topSpeed: stats?.maxSpeed ?? 0,
      totalAvgSpeed: stats?.avgSpeed ?? 0,
      sectorDistances,
      avgSectorSpeeds: sectorSpeeds
    });
  });
  allUnifiedTableRows = unifiedTableRows;
  createUnifiedTable(tableWrapper, allUnifiedTableRows);

  drawTracks({}, []);
}

async function init(){
  const races = await populateRaceSelector();
  if(!races.length) return;
  refreshDropdowns();
  setLegendVisibility(legendToggle.checked);
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
