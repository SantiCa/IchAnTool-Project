import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, guessAxisColumn, niceTicks, invertModel, toAxis, compositeRows, buildLogSVG, windowCSV } from '../../app/js/log.js';
import { downsampleRGBA } from '../../app/js/imageproc.js';

test('parseTable: comma, semicolon with decimal comma, whitespace, comments', () => {
  assert.deepEqual(parseTable('depth,L*\n0.1,41.7\n0.2,45.5\n').rows, [[0.1, 41.7], [0.2, 45.5]]);
  assert.deepEqual(parseTable('# c\nprof;Ca\n1,5;3,25\n').rows, [[1.5, 3.25]]);
  assert.deepEqual(parseTable('1 2\n3 4').headers, ['col1', 'col2']);
});

test('axis column guess', () => {
  assert.deepEqual(guessAxisColumn(['sample', 'depth_m', 'Ca']), { col: 1, axis: 'depth' });
  assert.deepEqual(guessAxisColumn(['age_ka', 'd18O']), { col: 0, axis: 'age' });
});

test('ticks and axis transforms', () => {
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  const m = { depth: [0, 10], age: [0, 100] };
  assert.equal(toAxis(5, 'depth', 'age', m), 50);
  assert.equal(toAxis(50, 'age', 'depth', m, invertModel(m)), 5);
  assert.equal(toAxis(5, 'depth', 'depth', null), 5);
});

test('composite rows, SVG and CSV', () => {
  const bins = [{ dTop: 0, dBottom: 1, depth: 0.5, pct: 20, classPct: [10, 10], BI: 2, ii: 3, BIm: 3, iim: null },
    { dTop: 1, dBottom: 2, depth: 1.5, pct: 40, classPct: [40, 0], BI: 3, ii: 4, BIm: null, iim: null }];
  const model = { depth: [0, 2], age: [0, 20] };
  const rows = compositeRows([{ name: 'S1', bins }], { axis: 'age', model });
  assert.deepEqual(rows.map((r) => [r.a0, r.a1, r.age]), [[0, 10, 5], [10, 20, 15]]);
  const classes = [{ name: 'A', color: '#ff0000', index: 0 }, { name: 'B', color: '#0000ff', index: 1 }];
  const { svg } = buildLogSVG({ title: 'T', axisLabel: 'Age (ka)', from: 0, to: 20, height: 200, rows, classes,
    tracks: { total: true, species: true, BI: true, ii: true, manual: true }, records: [{ name: 'L*', color: '#000', pts: [[2, 1], [18, 3]] }] });
  assert.ok(svg.startsWith('<svg') && svg.includes('polyline') && svg.includes('>A<'));
  const csv = windowCSV({ rows, from: 0, to: 20, classes, records: [{ name: 'L*', axis: 'depth', x: [0, 2], y: [0, 4] }], units: 'm', ageUnits: 'ka' });
  assert.equal(csv.split('\n')[1].split(',').at(-1), '1');
});

test('downsample averages blocks', () => {
  const src = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255]);
  const r = downsampleRGBA(src, 2, 2, 2);
  assert.equal(r.w, 1); assert.equal(r.rgba[0], 100);
});
