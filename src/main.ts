import { loadRace, populateRaceSelector, settings, saveSettings } from './raceLoader';
import { plotBoat, plotClass, destroyChart, initChart } from './chart';
import { renderLeaderboard, clearSectorTable, calculateSectorStats, renderSectorTable, replotCurrent, initUI } from './ui';

const boatSelect  = document.getElementById('boatSelect') as HTMLSelectElement;
const classSelect = document.getElementById('classSelect') as HTMLSelectElement;
const raceSelect  = document.getElementById('raceSelect') as HTMLSelectElement;
const raceTitle   = document.getElementById('raceTitle') as HTMLElement;
const chartTitle  = document.getElementById('chartTitle') as HTMLElement;
const ctx         = (document.getElementById('speedChart') as HTMLCanvasElement).getContext('2d')!;
const rawToggle   = document.getElementById('rawToggle') as HTMLInputElement;
const distInput   = document.getElementById('distInput') as HTMLInputElement;
const percentileInput = document.getElementById('percentileInput') as HTMLInputElement;

initChart({ courseNodesRef:(window as any).courseNodes || [], positionsByBoatRef:(window as any).positionsByBoat || {}, classInfoRef:(window as any).classInfo || {}, boatNamesRef:(window as any).boatNames || {}, chartTitleEl: chartTitle, ctx });
initUI({ leaderboardDataRef:(window as any).leaderboardData || [], classInfoRef:(window as any).classInfo || {}, boatNamesRef:(window as any).boatNames || {}, positionsByBoatRef:(window as any).positionsByBoat || {}, chartRef:null, chartTitleEl: chartTitle, boatSelectEl:boatSelect, classSelectEl:classSelect, rawToggleEl:rawToggle });

async function init(){
  await populateRaceSelector();
  raceSelect.addEventListener('change', () => loadRace(raceSelect.value));
  distInput.addEventListener('change', () => { settings.distNm = Number(distInput.value); saveSettings(); replotCurrent(); });
  percentileInput.addEventListener('change', () => { settings.percentile = Number(percentileInput.value); saveSettings(); replotCurrent(); });
}

(window as any).plotBoat = plotBoat;
(window as any).plotClass = plotClass;
(window as any).destroyChart = destroyChart;
(window as any).courseNodes = (window as any).courseNodes || [];

window.addEventListener('DOMContentLoaded', init);
