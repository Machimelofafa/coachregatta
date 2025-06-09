export const DEFAULT_SETTINGS = {
  distNm: 2,
  percentile: 95,
  smoothLen: 3
};

import { haversineNm } from './parsePositions';

let ceilCache = new WeakMap();

export function clearCache() { ceilCache = new WeakMap(); }
export function computeSeries(rawMoments, filtered = true, cfg = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...cfg };
  const moms = (rawMoments || []).slice().sort((a, b) => a.at - b.at);

  const legs = [];
  const speeds = [];
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

  let ceilKn = ceilCache.get(rawMoments);
  if (ceilKn === undefined) {
    ceilKn = percentile(speeds, settings.percentile);
    ceilCache.set(rawMoments, ceilKn);
  }

  const sogArr = [];
  const labels = [];
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

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function smooth(arr, len) {
  if (len < 2) return arr;
  const half = Math.floor(len / 2);
  const out = [];
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
