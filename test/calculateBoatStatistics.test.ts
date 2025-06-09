import assert from 'assert';
import { calculateBoatStatistics } from '../src/speedUtils';

function makeTrack(){
  const pts=[];
  for(let i=0;i<=10;i++){
    pts.push({at:i*600, lat:0, lon:i/60});
  }
  pts.push({at:11*600, lat:0, lon:15/60});
  return pts;
}

const res = calculateBoatStatistics(makeTrack());
assert.ok(Math.abs(res.maxSpeed - 30) < 0.1);
assert.ok(Math.abs(res.avgSpeed - (90/11)) < 0.1);
console.log('ok');
