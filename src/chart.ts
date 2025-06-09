// Chart rendering and helpers
import { computeSeries, DEFAULT_SETTINGS } from './speedUtils';
import { getColor } from './palette';
import type { Moment, CourseNode } from './types';

// Global state provided by main.ts
let courseNodes: CourseNode[] = [];
let positionsByBoat: Record<number, Moment[]> = {};
let classInfo: Record<string, { name: string; id: number; boats: number[] }> = {};
let boatNames: Record<number, string> = {};
let chart: any;
let chartTitle: HTMLElement;
let ctx: CanvasRenderingContext2D;

export function initChart(opts: {
  courseNodesRef: CourseNode[];
  positionsByBoatRef: Record<number, Moment[]>;
  classInfoRef: Record<string, { name: string; id: number; boats: number[] }>;
  boatNamesRef: Record<number, string>;
  chartTitleEl: HTMLElement;
  ctx: CanvasRenderingContext2D;
}) {
  ({ courseNodes, positionsByBoat, classInfo, boatNames, chartTitle, ctx } = {
    courseNodes: opts.courseNodesRef,
    positionsByBoat: opts.positionsByBoatRef,
    classInfo: opts.classInfoRef,
    boatNames: opts.boatNamesRef,
    chartTitle: opts.chartTitleEl,
    ctx: opts.ctx,
  });
}

export function destroyChart() {
  if (!chart) return;
  chart.destroy();
  (window as any).Chart.unregister(sectorPlugin);
  chart = null;
}

export function plotBoat(boatId: number, boatName: string, filtered: boolean, settings: Partial<typeof DEFAULT_SETTINGS>) {
  const track = positionsByBoat[boatId];
  if (!track) return;
  const { sogKn, labels } = computeSeries(track, filtered, settings);
  const sectorInfo = computeSectorTimes(track);
  chartTitle.textContent = `${boatName} – Speed (${filtered ? 'filtered' : 'raw'})`;
  destroyChart();
  chart = new (window as any).Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Speed (kn)', data: sogKn, borderWidth: 2, tension: 0.2 }]
    },
    options: {
      responsive: true,
      scales: {
        x: { type: 'time', time: { unit: 'hour' }, grid: { color: 'rgba(0,0,0,0.06)', borderDash: [4,2] } },
        y: { title: { display: true, text: 'knots' }, grid: { color: 'rgba(0,0,0,0.06)', borderDash: [4,2] } }
      },
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: {
          onClick: (e: any, item: any, legend: any) => {
            const { chart } = legend;
            if (e.native.shiftKey) {
              chart.data.datasets.forEach((ds: any, i: number) => {
                const meta = chart.getDatasetMeta(i);
                meta.hidden = i === item.datasetIndex ? null : true;
              });
            } else {
              const meta = chart.getDatasetMeta(item.datasetIndex);
              meta.hidden = !meta.hidden;
            }
            chart.update();
          }
        },
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
          pan: { enabled: true, mode: 'x' },
          limits: { x: { min: 'original', max: 'original' } }
        },
        sectors: sectorInfo
      }
    },
    plugins: [sectorPlugin]
  });
}

export function plotClass(classKey: string, filtered: boolean, settings: Partial<typeof DEFAULT_SETTINGS>) {
  const info = classInfo[classKey];
  if (!info) return;
  const datasets: { label: string; data: { x: Date; y: number }[]; borderColor: string; backgroundColor: string; borderWidth: number; pointRadius: number; pointHoverRadius: number; spanGaps: boolean; cubicInterpolationMode: string }[] = [];
  const boatsArr = info.boats.slice();
  boatsArr.forEach((boatId: number, i: number) => {
    const track = positionsByBoat[boatId];
    if (!track) return;
    const { sogKn, labels } = computeSeries(track, filtered, settings);
    const color = getColor(i);
    datasets.push({
      label: boatNames[boatId] || `Boat ${boatId}`,
      data: labels.map((t, j) => ({ x: t, y: sogKn[j] })),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      spanGaps: true,
      cubicInterpolationMode: 'monotone'
    });
  });
  const sectorInfo = info.boats.length ? computeSectorTimes(positionsByBoat[info.boats[0]]) : { times:[], labels:[], mids:[] };
  chartTitle.textContent = `${info.name} – Speed (${filtered ? 'filtered' : 'raw'})`;
  destroyChart();
  chart = new (window as any).Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      scales: {
        x: { type: 'time', time: { unit: 'hour' }, grid: { color: 'rgba(0,0,0,0.06)', borderDash:[4,2] } },
        y: { title:{ display:true, text:'knots' }, grid:{ color:'rgba(0,0,0,0.06)', borderDash:[4,2] } }
      },
      interaction:{ mode:'nearest', intersect:false },
      plugins:{
        legend:{
          onClick:(e:any, item:any, legend:any)=>{
            const {chart} = legend;
            if (e.native.shiftKey) {
              chart.data.datasets.forEach((ds:any, i:number) => {
                const meta = chart.getDatasetMeta(i);
                meta.hidden = i === item.datasetIndex ? null : true;
              });
            } else {
              const meta = chart.getDatasetMeta(item.datasetIndex);
              meta.hidden = !meta.hidden;
            }
            chart.update();
          }
        },
        zoom:{
          zoom:{ wheel:{ enabled:true }, pinch:{ enabled:true }, mode:'x' },
          pan:{ enabled:true, mode:'x' },
          limits:{ x:{ min:'original', max:'original' } }
        },
        sectors: sectorInfo
      }
    },
    plugins:[sectorPlugin]
  });
}

const R_EARTH_NM = 3440.065;
const deg2rad = (d:number)=>d*Math.PI/180;
const rad2deg = (r:number)=>r*180/Math.PI;

function haversineNm(la1:number,lo1:number,la2:number,lo2:number){
  const φ1=deg2rad(la1), φ2=deg2rad(la2);
  const dφ=φ2-φ1, dλ=deg2rad(lo2-lo1);
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R_EARTH_NM*Math.asin(Math.sqrt(a));
}

export function computeSectorTimes(moments: Moment[]){
  if (!courseNodes.length) return { times: [], labels: [], mids: [] };
  const moms = moments.slice().sort((a,b)=>a.at-b.at);
  const times:number[] = [], labels:string[] = [], mids:number[] = [];
  let prevTime = moms[0]?.at || 0;
  let prevName = courseNodes[0].name || 'Start';
  for (let i=1;i<courseNodes.length;i++){
    const node=courseNodes[i];
    const { lat, lon } = node;
    let best: { dist: number; at: number | null } = { dist: Infinity, at: null };
    moms.forEach(m => { const d=haversineNm(lat,lon,m.lat,m.lon); if (d<best.dist) best={dist:d,at:m.at}; });
    if (best.at!==null){
      times.push(best.at);
      mids.push((prevTime+best.at)/2);
      const currName=node.name||(i===courseNodes.length-1?'Finish':`WP${i+1}`);
      labels.push(`${prevName} – ${currName}`);
      prevTime=best.at; prevName=currName;
    }
  }
  return { times, labels, mids };
}

const sectorPlugin = {
  id: 'sectors',
  afterDraw(chart:any, args:any, opts:any){
    const times = opts.times || [];
    const labels = opts.labels || [];
    const mids = opts.mids || [];
    if(!times.length) return;
    const { ctx, scales:{x,y} } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.setLineDash([4,4]);
    times.forEach((t:number)=>{ const px=x.getPixelForValue(new Date(t*1000)); ctx.beginPath(); ctx.moveTo(px,y.top); ctx.lineTo(px,y.bottom); ctx.stroke(); });
    ctx.restore();
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.font='12px sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='top';
    mids.forEach((t:number,i:number)=>{ const px=x.getPixelForValue(new Date(t*1000)); ctx.fillText(labels[i]||'',px,y.top+4); });
    ctx.restore();
  }
};
