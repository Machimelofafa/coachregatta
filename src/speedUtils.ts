export const DEFAULT_SETTINGS = {
  distNm: 2,
  percentile: 95,
  smoothLen: 3
};

import { haversineNm } from './parsePositions';
import type { Moment, CourseNode } from './types';

let ceilCache = new WeakMap<object, number>();

export function clearCache() { ceilCache = new WeakMap(); }
export function computeSeries(rawMoments: Moment[], filtered: boolean = true, cfg: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...cfg };
  const moms = (rawMoments || []).slice().sort((a, b) => a.at - b.at);

  const legs: { t: number; sog: number; dist: number }[] = [];
  const speeds: number[] = [];
  for (let i = 1; i < moms.length; i++) {
    const A = moms[i - 1];
    const B = moms[i];
    const dtHr = (B.at - A.at) / 3600;
    if (dtHr <= 0) continue;
    const dist = haversineNm(A.lat, A.lon, B.lat, B.lon);
    const sog = dist / dtHr;
    legs.push({ t: B.at, sog, dist });
    speeds.push(sog);
  }

  let ceilKn = ceilCache.get(rawMoments as unknown as object);
  if (ceilKn === undefined) {
    ceilKn = percentile(speeds, settings.percentile);
    ceilCache.set(rawMoments, ceilKn);
  }

  const sogArr: number[] = [];
  const labels: Date[] = [];
  legs.forEach(({ t, sog, dist }) => {
    const keep = !filtered || (sog <= ceilKn && dist <= settings.distNm);
    if (keep) {
      sogArr.push(sog);
      labels.push(new Date(t * 1000));
    }
  });

  if (filtered && settings.smoothLen > 1) {
    return { sogKn: smooth(sogArr, settings.smoothLen), labels };
  }
  return { sogKn: sogArr, labels };
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function smooth(arr: number[], len: number): number[] {
  if (len < 2) return arr;
  const half = Math.floor(len / 2);
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, cnt = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j < 0 || j >= arr.length) continue;
      sum += arr[j];
      cnt++;
    }
    out.push(+ (sum / cnt).toFixed(2));
  }
  return out;
}

export function applyMovingAverage(seriesData: {x:number, y:number}[], windowSize: number){
  if(windowSize <= 1) return seriesData.slice();
  const out: {x:number, y:number}[] = [];
  let sum = 0;
  for(let i=0;i<seriesData.length;i++){
    sum += seriesData[i].y;
    if(i >= windowSize) sum -= seriesData[i-windowSize].y;
    const denom = i < windowSize ? i+1 : windowSize;
    out.push({ x: seriesData[i].x, y: +(sum/denom).toFixed(2) });
  }
  return out;
}

export function calculateBoatStatistics(track: Moment[], cfg: Partial<typeof DEFAULT_SETTINGS> = {}): { maxSpeed: number; avgSpeed: number } {
  const settings = { ...DEFAULT_SETTINGS, ...cfg, smoothLen: 1 };
  const { sogKn } = computeSeries(track, true, settings);
  let maxSpeed = 0;
  let sum = 0;
  for (const s of sogKn) {
    if (s > maxSpeed) maxSpeed = s;
    sum += s;
  }
  const avgSpeed = sogKn.length ? sum / sogKn.length : 0;
  return { maxSpeed, avgSpeed };
}

export function averageSpeedsBySector(moments: Moment[], nodes: CourseNode[]): number[] {
  const moms = moments.slice().sort((a,b)=>a.at-b.at);
  if(!moms.length || !nodes.length) return [];
  const speeds: number[] = [];
  for(let i=0;i<nodes.length-1;i++){
    const start = nodes[i];
    const end = nodes[i+1];
    let startIdx: number | null = null, endIdx: number | null = null;
    let startDist = Infinity, endDist = Infinity;
    moms.forEach((m,idx)=>{
      const ds = haversineNm(start.lat,start.lon,m.lat,m.lon);
      if(ds < startDist){ startDist = ds; startIdx = idx; }
      const de = haversineNm(end.lat,end.lon,m.lat,m.lon);
      if(de < endDist){ endDist = de; endIdx = idx; }
    });
    if(startIdx===null || endIdx===null || endIdx<=startIdx) continue;
    const startTime = moms[startIdx].at;
    const endTime = moms[endIdx].at;
    const timeTaken = endTime - startTime;
    let dist = 0;
    for(let j=startIdx+1;j<=endIdx;j++){
      const A = moms[j-1], B = moms[j];
      dist += haversineNm(A.lat,A.lon,B.lat,B.lon);
    }
    const avg = timeTaken>0 ? dist/(timeTaken/3600) : 0;
    speeds.push(avg);
  }
  return speeds;
}
