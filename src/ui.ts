
import type { LeaderboardEntry, Moment, CourseNode, SectorStat, RaceSetup } from './types';
import { highlightSeries } from './chart';

let leaderboardData: LeaderboardEntry[] = [];
let classInfo: Record<string, { name: string; id: number; boats: number[] }> = {};
let boatNames: Record<number, string> = {};
let positionsByBoat: Record<number, Moment[]> = {};
let chart: any;
let chartTitle: HTMLElement;
let boatSelect: HTMLSelectElement;
let classSelect: HTMLSelectElement;
let rawToggle: HTMLInputElement;
let sectorToggle: HTMLInputElement;
let selectionCb: (sel:{boat?:string; className?:string})=>void = ()=>{};
let nameToId: Record<string, number> = {};
let comparisonMode = false;
let comparisonBoats: string[] = [];

export function setComparisonMode(on: boolean){
  comparisonMode = on;
  if(!on) comparisonBoats = [];
}
export function isComparisonMode(){ return comparisonMode; }
export function setComparisonBoats(names: string[]){ comparisonBoats = names.slice(); }
export function getComparisonBoats(){ return comparisonBoats.slice(); }

export function disableSelectors(){
  if(boatSelect){
    boatSelect.disabled = true;
    boatSelect.innerHTML = '<option value="">Select a race first</option>';
  }
  if(classSelect){
    classSelect.disabled = true;
    classSelect.innerHTML = '<option value="">Select a race first</option>';
  }
  if(boatSelect) boatSelect.selectedIndex = 0;
  if(classSelect) classSelect.selectedIndex = 0;
}

export function enableSelectors(){
  if(boatSelect) boatSelect.disabled = false;
  if(classSelect) classSelect.disabled = false;
}

export function initUI(opts:{
  leaderboardDataRef: LeaderboardEntry[];
  classInfoRef: Record<string, { name: string; id: number; boats: number[] }>;
  boatNamesRef: Record<number, string>;
  positionsByBoatRef: Record<number, Moment[]>;
  chartRef: any;
  chartTitleEl: HTMLElement;
  boatSelectEl: HTMLSelectElement;
  classSelectEl: HTMLSelectElement;
  rawToggleEl: HTMLInputElement;
  sectorToggleEl: HTMLInputElement;
}, onSelect:(sel:{boat?:string; className?:string})=>void){
  leaderboardData = opts.leaderboardDataRef;
  classInfo = opts.classInfoRef;
  boatNames = opts.boatNamesRef;
  positionsByBoat = opts.positionsByBoatRef;
  chart = opts.chartRef;
  chartTitle = opts.chartTitleEl;
  boatSelect = opts.boatSelectEl;
  classSelect = opts.classSelectEl;
  rawToggle = opts.rawToggleEl;
  sectorToggle = opts.sectorToggleEl;
  selectionCb = onSelect;
  boatSelect.addEventListener('change', () => {
    if(boatSelect.hasAttribute('multiple')){
      const names = Array.from(boatSelect.selectedOptions).map(o=>o.value).filter(Boolean);
      setComparisonBoats(names);
    } else {
      setComparisonBoats([]);
    }
    if(boatSelect.value){
      classSelect.selectedIndex = 0;
      renderLeaderboard(null, getBoatId(boatSelect.value));
      selectionCb({ boat: boatSelect.value });
    } else {
      renderLeaderboard(null);
    }
  });
  classSelect.addEventListener('change', () => {
    if(classSelect.value){
      boatSelect.selectedIndex = 0;
      renderLeaderboard(classSelect.value);
      selectionCb({ className: classSelect.value });
    } else {
      renderLeaderboard(null);
    }
  });
  sectorToggle.addEventListener('change', () => {
    if(boatSelect.value){
      selectionCb({ boat: boatSelect.value });
    } else if(classSelect.value){
      selectionCb({ className: classSelect.value });
    }
  });
}

export function updateUiWithRace(setup: RaceSetup, leaderboard: LeaderboardEntry[] = []){
  leaderboardData = leaderboard.slice();
  nameToId = {};
  classInfo = {};
  boatNames = {};

  boatSelect.innerHTML = '';
  classSelect.innerHTML = '';
  const boatDefault = document.createElement('option');
  boatDefault.disabled = true;
  boatDefault.selected = true;
  boatDefault.value = '';
  boatDefault.textContent = 'Select Boat';
  boatSelect.appendChild(boatDefault);

  const classDefault = document.createElement('option');
  classDefault.disabled = true;
  classDefault.selected = true;
  classDefault.value = '';
  classDefault.textContent = 'Select Class';
  classSelect.appendChild(classDefault);

  (setup.tags || [])
    .forEach(tag => {
      if(!tag.name) return;
      const key = tag.name.toLowerCase().replace(/\s+/g,'').replace('zero','0');
      classInfo[key] = { name: tag.name, id: tag.id, boats: [] };
      const opt=document.createElement('option');
      opt.value = key;
      opt.textContent = tag.name;
      classSelect.appendChild(opt);
    });

  setup.teams.sort((a,b)=>a.name.localeCompare(b.name)).forEach(team => {
    const opt=document.createElement('option');
    opt.value = team.name;
    opt.textContent = team.name;
    boatSelect.appendChild(opt);
    nameToId[team.name]=team.id;
    boatNames[team.id]=team.name;
    const tags=team.tags||[];
    Object.keys(classInfo).forEach(k=>{
      if(tags.includes(classInfo[k].id)) classInfo[k].boats.push(team.id);
    });
  });

  boatSelect.selectedIndex = 0;
  classSelect.selectedIndex = 0;
  enableSelectors();
}

export function getBoatId(name:string){ return nameToId[name]; }
export function getClassInfo(){ return classInfo; }
export function getBoatNames(){ return boatNames; }
export function showSectors(){ return sectorToggle && sectorToggle.checked; }

export function renderLeaderboard(classKey:string|null=null, boatId:number|null=null){
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  if (!leaderboardData.length) { container.textContent = 'No leaderboard data'; return; }
  let data = leaderboardData.slice();
  if (classKey && classInfo[classKey]) {
    const ids = new Set(classInfo[classKey].boats);
    data = data.filter(d => ids.has(d.id));
  }
  data.sort((a,b)=>(a.rank ?? Infinity)-(b.rank ?? Infinity));
  let html='<table><thead><tr><th>Rank</th><th>Boat</th><th>Status</th><th>Corrected</th></tr></thead><tbody>';
  data.forEach(d=>{
    const name=boatNames[d.id] || `Boat ${d.id}`;
    const highlight=d.id===boatId ? ' class="selected"' : '';
    html+=`<tr data-boat="${name}"${highlight}><td>${d.rank ?? ''}</td><td>${name}</td><td>${d.status}</td><td>${d.corrected || ''}</td></tr>`;
  });
  html+='</tbody></table>';
  container.innerHTML=html;

  container.querySelectorAll('tr[data-boat]').forEach(tr=>{
    const boat=(tr as HTMLElement).dataset.boat as string;
    tr.addEventListener('mouseover',()=>{ highlightSeries(boat); });
    tr.addEventListener('mouseout',()=>{ highlightSeries(null); });
  });
}

export function clearSectorTable(){
  const c=document.getElementById('sector-analysis-container');
  if(c) c.innerHTML='';
}

export async function calculateSectorStats(boatId: number): Promise<SectorStat[]> {
  const track = positionsByBoat[boatId];
  if(!track) return [];
  const moms = track.slice().sort((a,b)=>a.at-b.at);
  const courseNodes = (window as any).courseNodes as CourseNode[] || [];
  if(!courseNodes.length) return [];
  const stats: SectorStat[] = [];
  for(let i=0;i<courseNodes.length-1;i++){
    const start=courseNodes[i];
    const end=courseNodes[i+1];
    let startIdx=null as number|null, endIdx=null as number|null, startDist=Infinity, endDist=Infinity;
    moms.forEach((m,idx)=>{
      const ds=computeDistance(start.lat,start.lon,m.lat,m.lon);
      if(ds<startDist){ startDist=ds; startIdx=idx; }
      const de=computeDistance(end.lat,end.lon,m.lat,m.lon);
      if(de<endDist){ endDist=de; endIdx=idx; }
    });
    if(startIdx===null || endIdx===null || endIdx<=startIdx) continue;
    const startTime=moms[startIdx].at;
    const endTime=moms[endIdx].at;
    const timeTaken=endTime-startTime;
    let dist=0;
    for(let j=startIdx+1;j<=endIdx;j++){
      const A=moms[j-1], B=moms[j];
      dist+=computeDistance(A.lat,A.lon,B.lat,B.lon);
    }
    const avgSpeed=timeTaken>0? dist/(timeTaken/3600):0;
    stats.push({timeTaken,distance:dist,avgSpeed});
  }
  return stats;
}

function computeDistance(la1:number,lo1:number,la2:number,lo2:number){
  const R=3440.065;
  const deg2rad=(d:number)=>d*Math.PI/180;
  const phi1=deg2rad(la1), phi2=deg2rad(la2);
  const dphi=phi2-phi1, dl=deg2rad(lo2-lo1);
  const a=Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

export function renderSectorTable(stats: SectorStat[]){
  const container=document.getElementById('sector-analysis-container');
  if(!container) return;
  if(!stats.length){ container.innerHTML=''; return; }
  let html='<table><thead><tr><th>Sector</th><th>Time</th><th>Distance (nm)</th><th>Avg Speed (kn)</th></tr></thead><tbody>';
  stats.forEach((s,i)=>{ html+=`<tr><td>${i+1}</td><td>${formatDuration(s.timeTaken)}</td><td>${s.distance.toFixed(2)}</td><td>${s.avgSpeed.toFixed(2)}</td></tr>`; });
  html+='</tbody></table>';
  container.innerHTML=html;
}

export function formatDuration(sec:number){
  const h=Math.floor(sec/3600);
  const m=Math.floor((sec%3600)/60);
  const s=Math.round(sec%60);
  const pad=(n:number)=>n.toString().padStart(2,'0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function displaySectorAnalysis(stats: Record<number, { maxSpeed: number; avgSpeed: number }>){
  const container=document.getElementById('sector-analysis-container');
  if(!container) return;
  const entries=Object.entries(stats);
  if(!entries.length){ container.innerHTML=''; return; }
  let html='<table><thead><tr><th>Boat</th><th>Top Speed (kn)</th><th>Avg Speed (kn)</th></tr></thead><tbody>';
  entries.forEach(([id,s])=>{
    const name=boatNames[Number(id)] || `Boat ${id}`;
    html+=`<tr><td>${name}</td><td>${s.maxSpeed.toFixed(2)}</td><td>${s.avgSpeed.toFixed(2)}</td></tr>`;
  });
  html+='</tbody></table>';
  container.innerHTML=html;
}

export function createUnifiedTable(container: HTMLElement, tableData: any[]){
  if(!container) return;
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Overall Rank</th><th>Boat</th><th>Corrected Time</th><th>Top Speed</th><th>Total Avg Speed</th><th>Distance Per Sector (nm)</th><th>Avg Speed Per Sector</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  (tableData || []).forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.boat = row.boat;
    const distSector = Array.isArray(row.sectorDistances) ? row.sectorDistances.map((n:number)=>n.toFixed(2)).join(', ') : '';
    const avgSector = Array.isArray(row.avgSectorSpeeds) ? row.avgSectorSpeeds.map((n:number)=>n.toFixed(2)).join(', ') : '';
    tr.innerHTML = `<td>${row.rank ?? ''}</td><td>${row.boat}</td><td>${row.corrected ?? ''}</td><td>${row.topSpeed?.toFixed ? row.topSpeed.toFixed(2) : row.topSpeed}</td><td>${row.totalAvgSpeed?.toFixed ? row.totalAvgSpeed.toFixed(2) : row.totalAvgSpeed}</td><td>${distSector}</td><td>${avgSector}</td>`;
    tr.addEventListener('mouseover', ()=>{ highlightSeries(row.boat); });
    tr.addEventListener('mouseout', ()=>{ highlightSeries(null); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

