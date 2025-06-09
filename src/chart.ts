// Chart rendering and helpers
import { computeSeries, DEFAULT_SETTINGS } from './speedUtils';
import { getColor } from './palette';
import type { Moment } from './types';
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
  chart.data.datasets.forEach((ds: any) => {
    ds.borderWidth = name && ds.label === name ? 4 : 2;
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

export function renderChart(series: Series[], selectedNames: string[] = []) {
  destroyChart();
  if(selectedNames.length){
    const set = new Set(selectedNames);
    series = series.filter(s => set.has(s.name));
  }
  const datasets = series.map((s, i) => ({
    label: s.name,
    data: s.data,
    borderColor: getColor(i),
    backgroundColor: getColor(i),
    borderWidth: 2,
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
        }
      }
    } as any
  });
  chart.canvas.addEventListener('mouseleave', ()=>{ highlightRow(null); lastHovered=null; });
}

