import { parsePositions } from './parsePositions';
import { clearCache, DEFAULT_SETTINGS } from './speedUtils';
import { plotBoat, plotClass } from './chart';
import { renderLeaderboard, clearSectorTable, calculateSectorStats, renderSectorTable } from './ui';

export let positionsByBoat: Record<number, any[]> = {};
export let courseNodes: any[] = [];
export let classInfo: Record<string, any> = {};
export let boatNames: Record<number, string> = {};
export let leaderboardData: any[] = [];

export const settings = loadSettings();

export async function loadRace(raceId: string){
  const boatSelect = document.getElementById('boatSelect') as HTMLSelectElement;
  const classSelect = document.getElementById('classSelect') as HTMLSelectElement;
  const raceSelect = document.getElementById('raceSelect') as HTMLSelectElement;
  const raceTitle = document.getElementById('raceTitle')!;
  const chartTitle = document.getElementById('chartTitle')!;
  const rawToggle = document.getElementById('rawToggle') as HTMLInputElement;

  if (!raceId) {
    raceTitle.textContent = 'Coach Regatta';
    boatSelect.innerHTML = '<option value="">Select a race first</option>';
    classSelect.innerHTML = '<option value="">Select a race first</option>';
    boatSelect.disabled = true; classSelect.disabled = true;
    (window as any).destroyChart();
    chartTitle.textContent = '';
    document.getElementById('leaderboard-container')!.innerHTML = '';
    clearSectorTable();
    return;
  }

  const raceName = raceSelect.selectedOptions[0].text;
  raceTitle.textContent = raceName;
  boatSelect.innerHTML = '<option value="">Loading...</option>';
  classSelect.innerHTML = '<option value="">Loading...</option>';
  boatSelect.disabled = true; classSelect.disabled = true;
  (window as any).destroyChart();
  chartTitle.textContent = '';
  document.getElementById('leaderboard-container')!.textContent = '';
  clearSectorTable();

  const SETUP_URL = `public/${raceId}/RaceSetup.json`;
  const POS_URL = `public/${raceId}/AllPositions3.json`;
  const LEADER_URL = `public/${raceId}/leaderboard.json`;

  try {
    boatSelect.value = '';
    classSelect.value = '';
    leaderboardData = [];

    const setup = await fetchJSON(SETUP_URL);
    courseNodes = setup.course?.nodes || [];
    boatSelect.innerHTML = '';
    classSelect.innerHTML = '';

    classSelect.innerHTML = '';
    const defaultClassOpt = document.createElement('option');
    defaultClassOpt.value = '';
    defaultClassOpt.textContent = 'Select a class';
    classSelect.appendChild(defaultClassOpt);

    (setup.tags || [])
      .filter((t: any) => /^IRC /i.test(t.name) && !/Overall|Two Handed/i.test(t.name))
      .forEach((tag: any) => {
        const key = tag.name.toLowerCase().replace(/\s+/g, '').replace('zero', '0');
        classInfo[key] = { name: tag.name, id: tag.id, boats: [] };
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = tag.name; classSelect.appendChild(opt);
      });
    classSelect.value = ''; classSelect.disabled = false;

    boatNames = {}; boatSelect.innerHTML = '';
    const defaultBoatOpt = document.createElement('option');
    defaultBoatOpt.value = '';
    defaultBoatOpt.textContent = 'Select a boat';
    boatSelect.appendChild(defaultBoatOpt);

    setup.teams.sort((a: any,b: any)=>a.name.localeCompare(b.name)).forEach((team:any)=>{
      const o=document.createElement('option'); o.value=team.id; o.textContent=team.name; boatSelect.appendChild(o);
      boatNames[team.id]=team.name;
      const tags=team.tags || [];
      Object.keys(classInfo).forEach(k=>{ const cid=classInfo[k].id; if(tags.includes(cid)) classInfo[k].boats.push(team.id); });
    });
    boatSelect.value=''; boatSelect.disabled=false;

    const boats=await fetchJSON(POS_URL);
    positionsByBoat=parsePositions(boats);

    const lbJSON=await fetchJSON(LEADER_URL);
    leaderboardData=(lbJSON.tags?.[0]?.teams || []).map((t:any)=>({ id:t.id, rank:t.rankR ?? t.rankS, status:t.status, corrected:t.cElapsedFormatted }));

    boatSelect.onchange=()=>{ classSelect.value=''; drawBoat(); };
    classSelect.onchange=()=>{ boatSelect.value=''; drawClass(); };
    rawToggle.onchange=()=>{ if(boatSelect.value) drawBoat(); else if(classSelect.value) drawClass(); };

    renderLeaderboard();

    function drawBoat(){
      const id=Number(boatSelect.value); const name=boatNames[id] || boatSelect.selectedOptions[0].text;
      if(id){ (window as any).plotBoat(id,name,!rawToggle.checked); renderLeaderboard(null,id); calculateSectorStats(id).then(renderSectorTable); }
    }
    function drawClass(){
      const classKey=classSelect.value;
      if(classKey && classInfo[classKey]){ (window as any).plotClass(classKey,!rawToggle.checked); renderLeaderboard(classKey); clearSectorTable(); }
    }
  } catch(err){
    alert('Error initialising page – see console.'); console.error(err);
  }
}

export async function populateRaceSelector(){
  const raceSelect = document.getElementById('raceSelect') as HTMLSelectElement;
  try{
    const races = await fetchJSON('public/races.json');
    raceSelect.innerHTML = '<option value="">Select a race</option>';
    races.forEach((race:any)=>{ const option=document.createElement('option'); option.value=race.id; option.textContent=race.name; raceSelect.appendChild(option); });
  }catch(err){
    console.error('Could not load races.json', err);
    raceSelect.innerHTML = '<option value="">Could not load races</option>';
    raceSelect.disabled = true;
  }
}

export function loadSettings(){
  try { const data = JSON.parse(localStorage.getItem('settings') || '{}'); return { ...DEFAULT_SETTINGS, ...data }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(){
  localStorage.setItem('settings', JSON.stringify({ distNm: settings.distNm, percentile: settings.percentile, smoothLen: settings.smoothLen }));
}

export async function fetchJSON(url:string){
  const r = await fetch(url).catch(err => { throw new Error(`${url}: ${err}`); });
  if(!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
