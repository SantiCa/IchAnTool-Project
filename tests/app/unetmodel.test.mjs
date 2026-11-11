import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnetController } from '../../app/js/unetmodel.js';
import { predictProb, UNET_DEFAULTS } from '../../app/js/unet.js';

function unetHarness(channels = 1) {
  const section = { w: 7, h: 5, orig: new Uint8ClampedArray(7 * 5 * 4).fill(120),
    roi: { x0: 1, y0: 1, x1: 6, y1: 5 }, _unet: null };
  const other = { ...section, roi: { ...section.roi }, _unet: { key: 'old', prob: new Float32Array(1) } };
  const calls = { runtime: 0, runs: 0, creates: [], progress: [] };
  let scale = 10, count = 0, fail = '', failRun = false;
  const runtime = {
    Tensor: class { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } },
    InferenceSession: { async create(bytes, options) {
      calls.creates.push({ bytes, options });
      if (fail) throw new Error(fail);
      return { inputNames: ['image'], outputNames: ['prediction'], async run(feeds) {
        calls.runs++;
        assert.equal(feeds.image.type, 'float32');
        const [batch, inputChannels, tile, width] = feeds.image.dims;
        assert.deepEqual([batch, inputChannels, width], [1, 3, tile]);
        if (failRun) throw new Error('inference failed');
        return { prediction: { data: feeds.image.data.slice(0, channels * tile * tile), dims: [1, channels, tile, tile] } };
      } };
    } },
  };
  const controller = createUnetController({ getRuntime: async () => { calls.runtime++; return runtime; },
    sections: () => [section, other], pixelsPerCm: () => scale, id: () => `model-${++count}`,
    progress: (done, total) => calls.progress.push([done, total]) });
  return { section, other, calls, controller, setScale: (value) => { scale = value; },
    failLoad: (value) => { fail = value; }, failInference: () => { failRun = true; } };
}

test('U-Net controller preserves WASM loading, defaults, byte identity and all-section invalidation', async () => {
  const h = unetHarness(), bytes = new Uint8Array([1, 2, 3]);
  assert.equal(h.controller.model, null); assert.equal(h.calls.runtime, 0);
  assert.equal(h.controller.key(h.section), '');
  await h.controller.load(bytes, null, 'model.onnx');
  assert.strictEqual(h.calls.creates[0].bytes, bytes);
  assert.deepEqual(h.calls.creates[0].options, { executionProviders: ['wasm'] });
  assert.deepEqual(h.controller.model.cfg, UNET_DEFAULTS);
  assert.equal(h.controller.model.name, 'model.onnx');
  assert.equal(h.section._unet, null); assert.equal(h.other._unet, null);
  assert.equal(h.controller.key(h.section), 'model-1|1,1,6,5|7x5|10.0000');
});

test('U-Net controller exactly preserves scaled probabilities, cache ownership and progress', async () => {
  const h = unetHarness(), cfg = { tile: 4, overlap: 1, pxPerCm: 13 };
  await h.controller.load(new Uint8Array(1), JSON.stringify(cfg), 'scaled.onnx');
  const original = h.section.orig.slice();
  const actual = await h.controller.probability(h.section);
  const expected = await predictProb(async (data, tile) => ({ data: data.slice(0, tile * tile), channels: 1 }),
    h.section.orig, 7, 5, h.section.roi, cfg, 1.3);
  assert.deepEqual(actual.prob, expected.prob);
  assert.deepEqual(h.section.orig, original);
  const calls = h.calls.runs, runtimeCalls = h.calls.runtime;
  assert.strictEqual(await h.controller.probability(h.section), actual);
  assert.equal(h.calls.runs, calls); assert.equal(h.calls.runtime, runtimeCalls);
  assert.ok(h.calls.progress.length > 0);
  assert.deepEqual(h.calls.progress.at(-1), [h.calls.progress.length, h.calls.progress.length]);
  h.section.roi.x0 = 0;
  assert.notEqual((await h.controller.probability(h.section)).key, actual.key);
  const old = h.section._unet;
  h.setScale(11);
  assert.notEqual((await h.controller.probability(h.section)).key, old.key);
  h.section.w = 6;
  assert.notEqual(h.controller.key(h.section), h.section._unet.key);
  await h.controller.load(new Uint8Array(1), JSON.stringify(cfg), 'replacement.onnx');
  assert.equal(h.section._unet, null);
  assert.ok(h.controller.key(h.section).startsWith('model-2|'));
});

test('U-Net load and inference failures preserve previous failure/cache semantics', async () => {
  const h = unetHarness();
  await h.controller.load(new Uint8Array(1), '{"tile":4,"overlap":1}', 'ok.onnx');
  const old = await h.controller.probability(h.section);
  h.section.roi.x0 = 0; h.failInference();
  await assert.rejects(h.controller.probability(h.section), /inference failed/);
  assert.strictEqual(h.section._unet, old);
  await assert.rejects(h.controller.load(new Uint8Array(1), '{bad json', 'bad.onnx'), SyntaxError);
  assert.equal(h.controller.model, null);
  assert.strictEqual(h.section._unet, old);
  h.failLoad('bad ONNX');
  await assert.rejects(h.controller.load(new Uint8Array(1), null, 'bad.onnx'), /bad ONNX/);
  assert.equal(h.controller.model, null);
  await assert.rejects(h.controller.probability(h.other), /not loaded/);
});

test('U-Net controller uses the output channel dimension for multiclass softmax', async () => {
  const h = unetHarness(3), cfg = { tile: 4, overlap: 1, classes: ['matrix', 'a', 'b'] };
  await h.controller.load(new Uint8Array(1), JSON.stringify(cfg), 'multiclass.onnx');
  const actual = await h.controller.probability(h.section);
  const expected = await predictProb(async (data) => ({ data, channels: 3 }),
    h.section.orig, 7, 5, h.section.roi, cfg, 1);
  assert.deepEqual(actual.prob, expected.prob);
});
