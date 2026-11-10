import test from 'node:test';
import assert from 'node:assert/strict';
import { topAt } from '../../app/js/core.js';
import { buildNavigationLayers, NavigationPreviewCache } from '../../app/js/navpreview.js';

// Independent reference assigns source pixels to Float32 buckets, as the retained column reducer does.
function referenceLayer(width, height, w, h, pixel) {
  const sums = new Float32Array(w * h * 4), count = new Uint32Array(w * h), result = new Uint8ClampedArray(sums.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const out = Math.floor(y * h / height) * w + Math.floor(x * w / width), j = out * 4, p = pixel(y * width + x);
    count[out]++;
    if (p) { for (let channel = 0; channel < 3; channel++) sums[j + channel] += p[channel] * p[3]; sums[j + 3] += p[3]; }
  }
  for (let i = 0; i < count.length; i++) if (sums[i * 4 + 3]) {
    for (let channel = 0; channel < 3; channel++) result[i * 4 + channel] = sums[i * 4 + channel] / sums[i * 4 + 3];
    result[i * 4 + 3] = sums[i * 4 + 3] / count[i];
  }
  return result;
}

function fixture(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4), labels = new Int32Array(width * height), exclude = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    rgba.set([(i * 13) % 256, (i * 29) % 256, (i * 47) % 256, i % 256], i * 4);
    labels[i] = i % 7 === 0 ? -1 : i % 5 === 0 ? 1 : i % 3 === 0 ? 2 : 0; exclude[i] = i % 11 === 0 ? 1 : 0;
  }
  return { width, height, rgba, labels, exclude, classIndices: [-1, 0, 1], colors: [[251, 97, 31], [19, 167, 239]], stacks: [null, [1, 2]] };
}

test('one-pass layers exactly preserve premultiplied reduction, overlaps, exclusions and alpha quantisation', () => {
  for (const [width, height] of [[7, 13], [513, 79], [960, 255], [16384, 33]]) {
    const input = fixture(width, height), saved = input.rgba.slice();
    for (const overlay of [false, true]) for (const hideExcluded of [false, true]) for (const alpha of [0, 89, 128, 255]) {
      const result = buildNavigationLayers({ ...input, overlay, hideExcluded, alpha });
      const photo = referenceLayer(width, height, result.width, result.height, (i) => [...input.rgba.subarray(i * 4, i * 4 + 3), 255]);
      assert.deepEqual(result.photo, photo);
      if (overlay || hideExcluded) {
        const trace = referenceLayer(width, height, result.width, result.height, (i) => {
          if (input.exclude[i]) return hideExcluded ? [255, 255, 255, 255] : null;
          const id = topAt(input.labels[i], input.stacks), cls = id ? input.classIndices[id] : -1;
          return overlay && cls >= 0 ? [...input.colors[cls], alpha] : null;
        });
        assert.deepEqual(result.trace, trace);
      } else assert.equal(result.trace, null);
    }
    assert.deepEqual(input.rgba, saved);
  }
});

test('invalid image/mask dimensions and alpha are rejected before preview allocation', () => {
  const input = fixture(2, 3);
  for (const next of [{ width: 0 }, { height: 1.5 }, { rgba: { length: 24 } }, { labels: new Int32Array(2) }, { exclude: null }, { alpha: 256 }]) {
    assert.throws(() => buildNavigationLayers({ ...input, ...next }), RangeError);
  }
});

test('preview LRU bounds bytes, replaces invalidated entries and disposes without retaining section owners', () => {
  const disposed = [], cache = new NavigationPreviewCache(8, (value) => disposed.push(value.name));
  const a = {}, b = {}, c = {};
  assert.throws(() => cache.set(a, 'empty', {}, 0), RangeError);
  cache.set(a, 'one', { name: 'a' }, 4); cache.set(b, 'one', { name: 'b' }, 4);
  assert.equal(cache.get(a, 'one').name, 'a');
  cache.set(c, 'one', { name: 'c' }, 4);
  assert.equal(cache.get(b, 'one'), null); assert.deepEqual(disposed, ['b']); assert.equal(cache.bytes, 8);
  cache.set(a, 'two', { name: 'a2' }, 4);
  assert.equal(cache.get(a, 'one'), null); assert.equal(cache.get(a, 'two').name, 'a2');
  assert.equal(cache.set(b, 'large', { name: 'large' }, 9), false); assert.equal(cache.bytes, 8);
  cache.clear(); assert.equal(cache.bytes, 0); assert.equal(cache.get(c, 'one'), null);
  assert.deepEqual(disposed, ['b', 'a', 'c', 'a2']);
});
