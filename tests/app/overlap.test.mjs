import test from 'node:test';
import assert from 'node:assert/strict';
import { rowCounts, stackIndex, codeFor, withId, withoutId, renameId, idsAt, topAt, compactStacks, rleEncode } from '../../app/js/core.js';
import { undoPixels } from '../../app/js/edit.js';
import { objectStats } from '../../app/js/imageproc.js';

test('V0.20: stack helpers add, remove, rename and merge ids', () => {
  const st = [null], ix = stackIndex(st);
  let v = withId(0, 3, st, ix); assert.equal(v, 3);
  v = withId(v, 5, st, ix); assert.ok(v < 0); assert.deepEqual(idsAt(v, st), [3, 5]); assert.equal(topAt(v, st), 5);
  assert.equal(withId(3, 5, st, ix), v, 'same stack reuses its code');
  assert.equal(withoutId(v, 5, st, ix), 3);
  assert.deepEqual(idsAt(renameId(v, 3, 7, st, ix), st), [7, 5]);
  assert.equal(renameId(v, 3, 5, st, ix), 5, 'merging into an id already present drops the other');
});

test('V0.20: overlaps count once in the total and once per class', () => {
  // 1 row × 4 px: [A, A+B, B, matrix]; A → class 0, B → class 1
  const st = [null, [1, 2]], labels = new Int32Array([1, -1, 2, 0]);
  const r = rowCounts({ labels, width: 4, roi: { x0: 0, y0: 0, x1: 4, y1: 1 }, exclude: null, effClass: Int16Array.from([-1, 0, 1]), nClasses: 2, stacks: st });
  assert.equal(r.valid[0], 4); assert.equal(r.bio[0], 3);
  assert.equal(r.cls[0], 2); assert.equal(r.cls[1], 2);   // 50 % + 50 % > 75 % total
  const same = rowCounts({ labels, width: 4, roi: { x0: 0, y0: 0, x1: 4, y1: 1 }, exclude: null, effClass: Int16Array.from([-1, 0, 0]), nClasses: 2, stacks: st });
  assert.equal(same.cls[0], 3, 'two objects of the same class in one pixel count once');
  const a = objectStats(labels, 4, 1, new Uint8ClampedArray(16), null, null, st);
  assert.equal(a.get(1).n, 2); assert.equal(a.get(2).n, 2);
});

test('V0.20: compacting renumbers stacks in an RLE array', () => {
  const st = [null, [1, 2], [2, 3]], rle = rleEncode(new Int32Array([0, -2, -2, 1]));
  const out = compactStacks(rle, st, 2);
  assert.deepEqual(out, [null, [2, 3]]); assert.deepEqual(rle, [0, 1, -1, 2, 1, 1]);
});

test('undo restores shared overlap lists after their old codes have been reclaimed', () => {
  let stacks = [null, [10, 11], [3, 5], [8, 9]];
  const previous = stacks[2];
  const labels = new Int32Array([-3, 5, 0]);
  const exclude = new Uint8Array([0, 0, 1]);
  const history = [1, previous, 1, 3, 2, previous];
  stacks = compactStacks(labels, stacks);
  assert.deepEqual(stacks, [null, [8, 9]]);
  assert.deepEqual([...labels], [-1, 5, 0]);

  const index = stackIndex(stacks);
  undoPixels(labels, exclude, history, [2, 0], stacks, index);
  assert.deepEqual(Array.from(labels, (code) => idsAt(code, stacks)), [[8, 9], [3, 5], [3, 5]]);
  assert.equal(topAt(labels[1], stacks), 5);
  assert.equal(labels[1], labels[2], 'both pixels reuse the same interned stack');
  assert.equal(codeFor([3, 5], stacks, index), labels[1]);
  assert.deepEqual([...exclude], [0, 0, 0]);
});
