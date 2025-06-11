// Chart rendering and helpers
import { computeSeries, DEFAULT_SETTINGS } from './speedUtils';
import { getColor } from './palette';
import type { Moment, CourseNode } from './types';
import { haversineNm } from './parsePositions';
import { isComparisonMode, getComparisonBoats } from './ui';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';

Chart.register(zoomPlugin);

let chart: any;
let lastHovered: string | null = null;
let chartTitle: HTMLElement;
let ctx: CanvasRenderingContext2D;

function highlightRow(name: string | null) {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  container.querySelectorAll('tr[data-boat]').forEach(row => {
    const el = row as HTMLElement;
    if (name && el.dataset.boat === name) {
      el.classList.add('lb-highlight');
    } else {
      el.classList.remove('lb-highlight');
    }
  });
}

export function highlightSeries(name: string | null) {
  if (!chart) return;
  const baseWidth = chart.data.datasets.length > 5 ? 1 : 2;
  chart.data.datasets.forEach((ds: any) => {
    ds.borderWidth = name && ds.label === name ? 4 : baseWidth;
  });
  chart.update('none');
}

export function initChart(opts: { ctx: CanvasRenderingContext2D; chartTitleEl: HTMLElement }) {
  ({ ctx, chartTitle } = { ctx: opts.ctx, chartTitle: opts.chartTitleEl });
}

export function destroyChart() {
  if (!chart) return;
  chart.destroy();
  chart = null;
}

export interface Series { name: string; data: { x: Date; y: number }[] }
export interface SectorInfo { times: number[]; labels: string[]; mids: number[] }

export function renderChart(series: Series[], selectedNames: string[] = [], sectorInfo?: SectorInfo) {
  destroyChart();
  if(isComparisonMode()){
    const set = new Set(getComparisonBoats());
    series = series.filter(s => set.has(s.name));
  } else if(selectedNames.length){
    const set = new Set(selectedNames);
    series = series.filter(s => set.has(s.name));
  }
  const lineWidth = series.length > 5 ? 1 : 2;
  const datasets = series.map((s, i) => ({
    label: s.name,
    data: s.data,
    borderColor: getColor(i),
    backgroundColor: getColor(i),
    borderWidth: lineWidth,
    pointRadius: 0,
    pointHoverRadius: 4,
    spanGaps: true,
    tension: 0.2
  }));
  chartTitle.textContent = series.length === 1 ? `${series[0].name} – Speed` : 'Speed';
  chart = new Chart(ctx, {
    type: 'line',
    data: { datasets } as any,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'time', time: { unit: 'hour' }, grid: { color: 'rgba(0,0,0,0.06)', borderDash:[4,2] } },
        y: { title:{ display:true, text:'knots' }, grid:{ color:'rgba(0,0,0,0.06)', borderDash:[4,2] } }
      },
      interaction:{ mode:'nearest', intersect:false },
      onHover: (_e:any, active:any[]) => {
        if(!active || !active.length){
          if(lastHovered){ highlightRow(null); lastHovered=null; }
          return;
        }
        const idx = active[0].datasetIndex;
        const ds = chart.data.datasets[idx];
        if(ds && ds.label !== lastHovered){
          lastHovered = ds.label;
          highlightRow(ds.label);
        }
      },
      plugins:{
        zoom:{
          zoom:{ wheel:{ enabled:true }, pinch:{ enabled:true }, mode:'x' },
          pan:{ enabled:true, mode:'x' },
          limits:{ x:{ min:'original', max:'original' } }
        },
        sectors: sectorInfo
      }
    } as any,
    plugins: sectorInfo ? [sectorPlugin] : []
  });
  chart.canvas.addEventListener('mouseleave', ()=>{ highlightRow(null); lastHovered=null; });
}

export function computeSectorTimes(moments: Moment[], nodes: CourseNode[]): SectorInfo {
  if (!nodes.length) return { times: [], labels: [], mids: [] };
  const moms = moments.slice().sort((a,b)=>a.at-b.at);
  const times:number[] = [], labels:string[] = [], mids:number[] = [];
  let prevTime = moms[0]?.at || 0;
  let prevName = nodes[0].name || 'Start';
  for(let i=1;i<nodes.length;i++){
    const node = nodes[i];
    let bestDist = Infinity;
    let at: number | null = null;
    moms.forEach(m => {
      const d = haversineNm(node.lat, node.lon, m.lat, m.lon);
      if(d < bestDist){ bestDist = d; at = m.at; }
    });
    if(at!==null){
      times.push(at);
      mids.push((prevTime + at)/2);
      const currName = node.name || (i===nodes.length-1 ? 'Finish' : `WP${i+1}`);
      labels.push(`${prevName} – ${currName}`);
      prevTime = at;
      prevName = currName;
    }
  }
  return { times, labels, mids };
}

const sectorPlugin = {
  id: 'sectors',
  afterDraw(chart:any, _args:any, opts:any){
    const times = opts?.times || [];
    const labels = opts?.labels || [];
    const mids = opts?.mids || [];
    if(!times.length) return;
    const { ctx, scales:{x,y} } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.setLineDash([4,4]);
    times.forEach((t:number)=>{
      const px = x.getPixelForValue(new Date(t*1000));
      ctx.beginPath();
      ctx.moveTo(px, y.top);
      ctx.lineTo(px, y.bottom);
      ctx.stroke();
    });
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    mids.forEach((t:number,i:number)=>{
      const px = x.getPixelForValue(new Date(t*1000));
      ctx.fillText(labels[i]||'', px, y.top+4);
    });
    ctx.restore();
  }
};

let distCtx: CanvasRenderingContext2D;
let avgCtx: CanvasRenderingContext2D;
let distChart: any = null;
let avgChart: any = null;

export function initSectorCharts(opts:{distCtx:CanvasRenderingContext2D; avgCtx:CanvasRenderingContext2D;}){
  distCtx = opts.distCtx;
  avgCtx = opts.avgCtx;
}

export function clearSectorCharts(){
  if(distChart){ distChart.destroy(); distChart=null; }
  if(avgChart){ avgChart.destroy(); avgChart=null; }
}

function renderSimpleChart(ctx:CanvasRenderingContext2D, chartRef:any, labels:string[],
  dataSeries:{name:string; data:number[]}[], yLabel:string){
  if(chartRef){ chartRef.destroy(); }
  const lineWidth = dataSeries.length > 5 ? 1 : 2;
  const datasets = dataSeries.map((s,i)=>({
    label:s.name,
    data:s.data,
    borderColor:getColor(i),
    backgroundColor:getColor(i),
    borderWidth: lineWidth,
    pointRadius:0,
    tension:0
  }));
  return new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{color:'rgba(0,0,0,0.06)',borderDash:[4,2]}},y:{title:{display:true,text:yLabel},grid:{color:'rgba(0,0,0,0.06)',borderDash:[4,2]}}}} as any});
}

export function renderDistancePerSector(labels:string[], series:{name:string; data:number[]}[]){
  distChart = renderSimpleChart(distCtx, distChart, labels, series, 'nm');
}

export function renderSpeedPerSector(labels:string[], series:{name:string; data:number[]}[]){
  avgChart = renderSimpleChart(avgCtx, avgChart, labels, series, 'kn');
}

