import assert from 'assert';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { palette } from '../palette.mjs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'fs';
import contrast from 'get-contrast';

const width = 400;
const height = 200;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback: (ChartJS) => {
  ChartJS.defaults.responsive = false;
  ChartJS.defaults.animation = false;
}});

const data = {
  labels: [0,1,2,3],
  datasets: [{
    label: 'demo',
    data: [1,2,3,4],
    borderColor: palette[0],
    borderWidth: 2,
    backgroundColor: 'transparent',
    fill: false,
    tension: 0.2
  }]
};

const cfg = { type: 'line', data };

const buffer = await chartJSNodeCanvas.renderToBuffer(cfg);
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync('test-output/chart.png', buffer);

const baselineBase64 = fs.readFileSync('test/snapshots/chart.base64.txt', 'utf8');
const baseline = Buffer.from(baselineBase64, 'base64');
const img1 = PNG.sync.read(baseline);
const img2 = PNG.sync.read(buffer);
const diff = pixelmatch(img1.data, img2.data, null, width, height);
assert.ok(diff < 500, `snapshot diff ${diff}`);

const ratio = contrast.ratio(palette[0], '#ffffff');
assert.ok(ratio >= 4.5, 'contrast ratio is below 4.5:1');

console.log('ok');
