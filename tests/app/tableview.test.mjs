import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTableRows } from '../../app/js/tableview.js';

test('visible table ranges cover the viewport and clamp to available rows', () => {
  const options = { rowCount: 10400, scrollTop: 0, height: 560, rowHeight: 28, headerHeight: 40, overscan: 12 };
  assert.deepEqual(visibleTableRows(options), { start: 0, end: 33 });
  assert.deepEqual(visibleTableRows({ ...options, scrollTop: 2840 }), { start: 88, end: 133 });
  assert.deepEqual(visibleTableRows({ ...options, scrollTop: 1e9 }), { start: 10387, end: 10400 });
  assert.deepEqual(visibleTableRows({ ...options, rowCount: 0 }), { start: 0, end: 0 });
  assert.deepEqual(visibleTableRows({ ...options, rowCount: 5 }), { start: 0, end: 5 });
});

test('visible row preparation remains bounded at generated scroll offsets and sizes', () => {
  for (const rowCount of [0, 1, 2, 400, 2000, 20000, 100000]) for (const height of [1, 280, 560, 900]) {
    for (let step = 0; step < 100; step++) {
      const scrollTop = step * rowCount * 28 / 99;
      const { start, end } = visibleTableRows({ rowCount, scrollTop, height, rowHeight: 28 });
      assert.ok(start >= 0 && start <= end && end <= rowCount);
      assert.ok(end - start <= Math.ceil(height / 28) + 25);
      if (rowCount) {
        const first = Math.min(rowCount - 1, Math.floor(scrollTop / 28));
        assert.ok(start <= first && end > first);
      }
    }
  }
});

test('visible row geometry rejects invalid counts, heights and offsets', () => {
  const options = { rowCount: 10, scrollTop: 0, height: 560, rowHeight: 28 };
  for (const invalid of [{ rowCount: -1 }, { rowCount: 1.5 }, { rowHeight: 0 }, { rowHeight: NaN },
    { scrollTop: Infinity }, { height: NaN }, { headerHeight: Infinity }, { overscan: -1 }]) {
    assert.throws(() => visibleTableRows({ ...options, ...invalid }), RangeError);
  }
});
