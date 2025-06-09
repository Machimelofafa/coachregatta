import type { BoatData, Moment } from './types';

export const EPSILON_NM = 0.001;
const R_EARTH_NM = 3440.065;
const deg2rad = (d: number) => d*Math.PI/180;
export function haversineNm(la1:number, lo1:number, la2:number, lo2:number){
  const phi1=deg2rad(la1), phi2=deg2rad(la2);
  const dphi=phi2-phi1, dl=deg2rad(lo2-lo1);
  const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dl/2)**2;
  return 2*R_EARTH_NM*Math.asin(Math.sqrt(a));
}

export function parsePositions(boats: BoatData[], epsNm: number = EPSILON_NM): Record<number, Moment[]> {
  const out: Record<number, Moment[]> = {};
  (boats || []).forEach(b => {
    out[b.id] = dedupeMoments(b.moments || [], epsNm);
  });
  return out;
}

function dedupeMoments(moments: Moment[], epsNm: number): Moment[] {
  const byTime = new Map<number, Moment[]>();
  const result: Moment[] = [];
  for (const m of moments) {
    const list = byTime.get(m.at) || [];
    let dup = false;
    for (const prev of list) {
      if (haversineNm(prev.lat, prev.lon, m.lat, m.lon) <= epsNm) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      list.push(m);
      byTime.set(m.at, list);
      result.push(m);
    }
  }
  result.sort((a,b)=>a.at-b.at);
  return result;
}
