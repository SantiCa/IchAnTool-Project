import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pxPerCm, depthAtRow, rowAtDepth } from '../../app/js/sectiondepth.js';
import { binEdge } from '../../app/js/core.js';

test('depth selectors retain exact ROI endpoints, unit scale and extrapolation', () => {
  for (const [units, top, bottom, scale] of [['mm', 200, 600, 5], ['cm', 20, 60, 5], ['m', .2, .6, 5]]) {
    const s = Object.freeze({ units, top, bottom, roi: Object.freeze({ y0: 50, y1: 250 }) });
    assert.equal(depthAtRow(s, 50), top);
    assert.equal(depthAtRow(s, 250), bottom);
    assert.equal(rowAtDepth(s, top), 50);
    assert.equal(rowAtDepth(s, bottom), 250);
    assert.equal(pxPerCm(s), scale);
    assert.equal(depthAtRow(s, -50), top - .5 * (bottom - top));
    assert.equal(rowAtDepth(s, top - (bottom - top)), -150);
  }
});

test('shared fractional fixtures preserve exact centimetre conversion and half-row edges', () => {
  const cases = JSON.parse(readFileSync(new URL('../fixtures/fractional-boundaries.json', import.meta.url), 'utf8'));
  for (const c of cases) {
    const section = { top: c.top, bottom: c.bottom, units: c.units, roi: { y0: 37, y1: 37 + c.rows } };
    const binPx = c.bin_cm * pxPerCm(section);
    assert.equal(binPx, c.bin_px);
    assert.deepEqual(c.edges.map((_, index) => Math.min(c.rows, binEdge(index, binPx))), c.edges);
    for (const edge of c.edges) {
      const depth = depthAtRow(section, 37 + edge);
      // Binary64 inverse cancellation is bounded here; this is not an interval rounding tolerance.
      assert.ok(Math.abs(rowAtDepth(section, depth) - (37 + edge)) <= 1e-9);
    }
  }
});

test('bounded generated geometries have monotonic, invertible depth maps without mutation', () => {
  let seed = 138501;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let index = 0; index < 1000; index++) {
    const top = next() * 100 - 50, bottom = top + 1 + next() * 100;
    const y0 = Math.floor(next() * 200), y1 = y0 + 1 + Math.floor(next() * 10000);
    const s = Object.freeze({ top, bottom, units: ['mm', 'cm', 'm'][index % 3], roi: Object.freeze({ y0, y1 }) });
    const row = y0 + (next() * 3 - 1) * (y1 - y0), depth = depthAtRow(s, row);
    assert.ok(depthAtRow(s, row + 1) > depth);
    assert.ok(Math.abs(rowAtDepth(s, depth) - row) <= 1e-9);
    assert.ok(pxPerCm(s) > 0);
  }
});

test('degenerate legacy geometry retains fallback and non-finite behaviour', () => {
  const s = { top: 3, bottom: 3, units: 'cm', roi: { y0: 10, y1: 20 } };
  assert.equal(pxPerCm(s), 1);
  assert.ok(Number.isNaN(rowAtDepth(s, 3)));
  assert.equal(rowAtDepth(s, 4), Infinity);
  s.bottom = 2;
  assert.equal(pxPerCm(s), 1);
  s.bottom = 4; s.roi.y1 = 10;
  assert.equal(pxPerCm(s), 0);
  assert.ok(Number.isNaN(depthAtRow(s, 10)));
  assert.equal(depthAtRow(s, 11), Infinity);
});
