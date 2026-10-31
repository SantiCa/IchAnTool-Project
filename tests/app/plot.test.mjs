import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCurve, buildXYPlot, buildStratPlot, pearson, plotStats, axisRange } from '../../app/js/plot.js';

test('curve fits recover known functions', () => {
  const x = [1, 2, 3, 4, 5, 6], lin = x.map((v) => 2 + 3 * v), ex = x.map((v) => 1.5 * Math.exp(0.4 * v)), pw = x.map((v) => 2 * v ** 1.5), lg = x.map((v) => 1 + 2 * Math.log(v));
  const f1 = fitCurve(x, lin, 'linear'); assert.ok(Math.abs(f1.coef[1] - 3) < 1e-9 && Math.abs(f1.r2 - 1) < 1e-12);
  assert.ok(Math.abs(fitCurve(x, ex, 'exp').coef[1] - 0.4) < 1e-9);
  assert.ok(Math.abs(fitCurve(x, pw, 'power').coef[1] - 1.5) < 1e-9);
  assert.ok(Math.abs(fitCurve(x, lg, 'log').coef[1] - 2) < 1e-9);
  assert.ok(Math.abs(fitCurve(x, x.map((v) => v * v - v), 'poly', { deg: 2 }).coef[2] - 1) < 1e-9);
  assert.equal(fitCurve(x, lin, 'movavg', { window: 3 }).pts.length, 6);
  assert.ok(Math.abs(pearson(x, lin) - 1) < 1e-12); assert.equal(plotStats([1, 2, 3, null]).median, 2);
  assert.deepEqual(axisRange([1, 10], { log: true }), [1, 10]);
});

test('plots render SVG with fits and panels', () => {
  const x = [0, 1, 2, 3, 4], y = [1, 3, 2, 5, 4];
  const r = buildXYPlot({ title: 'T', x: { label: 'X' }, y: { label: 'Y' }, series: [{ name: 'a', x, y, type: 'linesym', fit: 'linear' }, { name: 'b', x, y: y.map((v) => v * 10), type: 'bar', y2: true }] });
  assert.match(r.svg, /<svg/); assert.equal(r.fits.length, 1); assert.match(r.svg, /\(Y2\)/);
  const s = buildStratPlot({ v: { label: 'Prof.' }, panels: [{ label: 'Ti/Ca', series: [{ name: 'A', x, y }] }, { label: 'TOC', series: [{ name: 'A', x, y, type: 'area' }] }] });
  assert.equal((s.svg.match(/clip-path="url\(#sp/g) || []).length, 2);
});
