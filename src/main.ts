import { fetchRaceSetup, fetchPositions, populateRaceSelector, settings, saveSettings } from './raceLoader';
import { initChart, renderChart, Series } from './chart';
import { initUI, updateUiWithRace, getClassInfo, getBoatId, getBoatNames } from './ui';
import { computeSeries } from './speedUtils';
import type { RaceSetup } from './types';

const boatSelect  = document.getElementById('boatSelect') as HTMLSelectElement;
const classSelect = document.getElementById('classSelect') as HTMLSelectElement;
const raceSelect  = document.getElementById('raceSelect') as HTMLSelectElement;
const chartTitle  = document.getElementById('chartTitle') as HTMLElement;
const ctx         = (document.getElementById('speedChart') as HTMLCanvasElement).getContext('2d')!;
const rawToggle   = document.getElementById('rawToggle') as HTMLInputElement;
const distInput   = document.getElementById('distInput') as HTMLInputElement;
const percentileInput = document.getElementById('percentileInput') as HTMLInputElement;

let currentRace = '';
let raceSetup: RaceSetup | null = null;

initChart({ ctx, chartTitleEl: chartTitle });
initUI({ leaderboardDataRef: [], classInfoRef: {}, boatNamesRef: {}, positionsByBoatRef: {}, chartRef: null, chartTitleEl: chartTitle, boatSelectEl: boatSelect, classSelectEl: classSelect, rawToggleEl: rawToggle }, handleSelectionChange);

async function handleSelectionChange(sel:{ boat?: string; className?: string }){
  if(!currentRace || !raceSetup) return;
  let ids: number[] = [];
  if(sel.boat){
    const id = getBoatId(sel.boat);
    if(id) ids = [id];
  }else if(sel.className){
    const info = getClassInfo()[sel.className];
    if(info) ids = info.boats.slice();
  }
  if(!ids.length) return;
  const positions = await fetchPositions(currentRace, ids);
  const series: Series[] = ids.map(id => {
    const track = positions[id];
    if(!track) return null as any;
    const { sogKn, labels } = computeSeries(track, !rawToggle.checked, settings);
    return { name: getBoatNames()[id] || String(id), data: labels.map((t,j)=>({ x:t, y:sogKn[j] })) };
  }).filter(Boolean);
  renderChart(series);
}

async function loadRace(raceId:string){
  if(!raceId) return;
  currentRace = raceId;
  raceSetup = await fetchRaceSetup(raceId);
  updateUiWithRace(raceSetup);
}

async function init(){
  const races = await populateRaceSelector();
  if(!races.length) return;
  raceSelect.value = races[0].id;
  await loadRace(races[0].id);
  raceSelect.addEventListener('change', () => loadRace(raceSelect.value));
  distInput.value = String(settings.distNm);
  percentileInput.value = String(settings.percentile);
  distInput.addEventListener('change', () => { settings.distNm = Number(distInput.value); saveSettings(); });
  percentileInput.addEventListener('change', () => { settings.percentile = Number(percentileInput.value); saveSettings(); });
}

window.addEventListener('DOMContentLoaded', init);
