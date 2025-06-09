
let leaderboardData: any[] = [];
let classInfo: Record<string, any> = {};
let boatNames: Record<number, string> = {};
let positionsByBoat: Record<number, any[]> = {};
let chart: any;
let chartTitle: HTMLElement;
let boatSelect: HTMLSelectElement;
let classSelect: HTMLSelectElement;
let rawToggle: HTMLInputElement;

export function initUI(opts:{
  leaderboardDataRef:any[];
  classInfoRef:Record<string,any>;
  boatNamesRef:Record<number,string>;
  positionsByBoatRef:Record<number,any[]>;
  chartRef:any;
  chartTitleEl:HTMLElement;
  boatSelectEl:HTMLSelectElement;
  classSelectEl:HTMLSelectElement;
  rawToggleEl:HTMLInputElement;
}){
  leaderboardData = opts.leaderboardDataRef;
  classInfo = opts.classInfoRef;
  boatNames = opts.boatNamesRef;
  positionsByBoat = opts.positionsByBoatRef;
  chart = opts.chartRef;
  chartTitle = opts.chartTitleEl;
  boatSelect = opts.boatSelectEl;
  classSelect = opts.classSelectEl;
  rawToggle = opts.rawToggleEl;
}

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
    const highlight=d.id===boatId ? ' style="background-color:#ffef99"' : '';
    html+=`<tr${highlight}><td>${d.rank ?? ''}</td><td>${name}</td><td>${d.status}</td><td>${d.corrected || ''}</td></tr>`;
  });
  html+='</tbody></table>';
  container.innerHTML=html;
}

export function clearSectorTable(){
  const c=document.getElementById('sector-analysis-container');
  if(c) c.innerHTML='';
}

export async function calculateSectorStats(boatId:number){
  const track = positionsByBoat[boatId];
  if(!track) return [];
  const moms = track.slice().sort((a,b)=>a.at-b.at);
  const courseNodes = (window as any).courseNodes as any[] || [];
  if(!courseNodes.length) return [];
  const stats:any[]=[];
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

export function renderSectorTable(stats:any[]){
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

export function replotCurrent(){
  if(boatSelect.value){
    const id=Number(boatSelect.value);
    const name=boatNames[id] || boatSelect.selectedOptions[0].text;
    (window as any).plotBoat(id,name,!rawToggle.checked);
    renderLeaderboard(null,id);
  }else if(classSelect.value){
    (window as any).plotClass(classSelect.value,!rawToggle.checked);
    renderLeaderboard(classSelect.value);
  }
}
