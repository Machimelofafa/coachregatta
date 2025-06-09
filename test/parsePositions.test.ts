import assert from 'assert';
import { parsePositions } from '../src/parsePositions';

const data = [
  { id: 1, moments:[
      { at: 1, lat: 10, lon: 20 },
      { at: 1, lat: 10, lon: 20 },
      { at: 2, lat: 10, lon: 20 },
      { at: 2, lat: 10.1, lon: 20.1 },
      { at: 3, lat: 11, lon: 21 }
  ]}
];

const res = parsePositions(data, 0.005); // 0.005 nm tolerance (~10m)
assert.equal(res[1].length, 4);
assert.deepEqual(res[1].map(m => m.at), [1, 2, 2, 3]);
console.log('ok');
