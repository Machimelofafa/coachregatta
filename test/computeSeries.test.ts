import assert from "assert";
import { computeSeries, clearCache } from "../src/speedUtils";

function makeTrack() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    pts.push({ at: i * 600, lat: 0, lon: i / 60 });
  }
  pts.push({ at: 11 * 600, lat: 0, lon: 15 / 60 }); // 5 nm jump
  return pts;
}

const track = makeTrack();

const resDefault = computeSeries(track, true, { distNm: 2, percentile: 95, smoothLen: 1 });
assert.equal(resDefault.sogKn.length, 10);

clearCache();
const resCustom = computeSeries(track, true, { distNm: 10, percentile: 100, smoothLen: 1 });
assert.equal(resCustom.sogKn.length, 11);

console.log('ok');
