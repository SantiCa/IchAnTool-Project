import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analysisRevision, buildIntervalSnapshot, computeSectionBins, referenceColumns, resultToBins } from '../../app/js/sectionanalysis.js';
import { createEngineClient, EngineError } from '../../app/js/engineclient.js';
import { createEngineAnalysis } from '../../app/js/engineanalysis.js';

const CLASSES = [{ id: 'a', name: 'A', counts: true }, { id: 'b', name: 'B', counts: true }, { id: 'n', name: 'N', counts: false }, { id: 'undet', name: 'undet', counts: true }];
const SETTINGS = { includePred: true, predThr: 0.5, countCandidates: true, binCm: 3.7, minValid: 20, noDataPad: 2 };
const MODEL = { depth: [0, 10, 40], age: [1, 2.5, 9], min: [0.5, 2, 8], max: [1.5, 3, 10] };
const project = (over = {}) => ({ classes: CLASSES, settings: { ...SETTINGS, ...over.settings }, ageModel: over.ageModel === undefined ? MODEL : over.ageModel, ageUnits: 'ka' });

/** A seeded section as the interface keeps it, with objects, predictions, exclusions, an overlap stack and a manual range. */
function section(seed, { w = 24, h = 90 } = {}) {
  let state = seed; const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const objects = new Map([[1, { id: 1, cls: 'a' }], [2, { id: 2, cls: 'b' }], [3, { id: 3, cls: 'n' }], [4, { id: 4, pred: 'a', conf: 0.7 }], [5, { id: 5, pred: 'b', conf: 0.3 }], [6, { id: 6 }]]);
  const labels = new Int32Array(w * h), exclude = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) { if (random() < 0.45) labels[i] = 1 + Math.floor(random() * 6); if (random() < 0.08) exclude[i] = 1; }
  for (let r = 40; r < 55; r++) exclude.fill(1, r * w, (r + 1) * w);     // a gap that the no-data padding widens
  labels[10] = 7; labels[11] = 7;                                         // an overlap stack made of objects 1 and 2
  return { w, h, roi: { x0: 2, y0: 3, x1: w - 1, y1: h - 4 }, top: 12.5, bottom: 77.25, units: 'cm', labels, exclude, objects,
    stacks: [null, null, null, null, null, null, null, [1, 2]], nextId: 8, manual: [{ from: 20, to: 30, BI: 3, ii: null }], _mv: 1 };
}

test('result columns convert to exactly the bins of the JavaScript calculation, with and without ages and overlap', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const s = section(seed), p = project(seed % 3 === 0 ? { ageModel: null } : seed % 3 === 1 ? { ageModel: { depth: MODEL.depth, age: MODEL.age } } : {});
    if (seed % 4 === 0) s.stacks = [null];
    const reference = computeSectionBins(s, p).bins, converted = resultToBins(referenceColumns(s, p));
    assert.deepEqual(converted, reference, `seed ${seed}`);
    assert.ok(reference.some((b) => b.classPct.some((x) => x > 0)) && reference.some((b) => b.noData) && reference.some((b) => b.BI !== null), `seed ${seed} exercises classes, no-data and indices`);
  }
});

test('resultToBins rejects results it cannot interpret', () => {
  const good = referenceColumns(section(1), project());
  assert.throws(() => resultToBins({ ...good, dimensions: { ...good.dimensions, schemes: 3 } }), /two index schemes/);
  const { depth, ...missing } = good.columns;
  assert.throws(() => resultToBins({ dimensions: good.dimensions, columns: missing }), /Missing result column depth/);
});

test('the revision changes with every input of the calculation and with nothing else', () => {
  const base = () => section(5), p = project(), reference = analysisRevision(base(), p);
  assert.equal(analysisRevision(base(), p), reference, 'stable');
  const edits = {
    'mask version': (s) => { s._mv++; }, 'roi': (s) => { s.roi.y1--; }, 'top': (s) => { s.top += 1; }, 'bottom': (s) => { s.bottom += 1; }, 'units': (s) => { s.units = 'mm'; },
    'manual range': (s) => { s.manual[0].BI = 4; }, 'size': (s) => { s.w += 1; }, 'class assigned': (s) => { s.objects.get(6).cls = 'b'; },
    'prediction class': (s) => { s.objects.get(4).pred = 'b'; }, 'load warning': (s) => { s.loadWarnings = { region: true, mask: false }; },
  };
  for (const [name, edit] of Object.entries(edits)) { const s = base(); edit(s); assert.notEqual(analysisRevision(s, p), reference, name); }
  const settings = { includePred: false, predThr: 0.9, countCandidates: false, binCm: 4, minValid: 30, noDataPad: 3 };
  for (const [key, value] of Object.entries(settings)) assert.notEqual(analysisRevision(base(), project({ settings: { [key]: value } })), reference, `setting ${key}`);
  assert.notEqual(analysisRevision(base(), project({ ageModel: null })), reference, 'age model removed');
  assert.notEqual(analysisRevision(base(), project({ ageModel: { ...MODEL, age: [1, 2.5, 9.1] } })), reference, 'age value');
  assert.notEqual(analysisRevision(base(), project({ ageModel: { ...MODEL, depth: [0, 10, 41] } })), reference, 'age depth');
  assert.notEqual(analysisRevision(base(), { ...p, classes: [CLASSES[0], { ...CLASSES[1], counts: false }, ...CLASSES.slice(2)] }), reference, 'counted classes');
  assert.notEqual(analysisRevision(base(), { ...p, ageUnits: 'Ma' }), reference, 'age units');
  const untouched = base(); untouched.objects.get(1).name = 'renamed'; untouched.view = { zoom: 3 }; untouched.bins = [{}];
  assert.equal(analysisRevision(untouched, p), reference, 'display state is not an input');
});

// ---- the renderer client against an in-memory bridge -----------------------------------------------------------------

const TYPES = { u8: Uint8Array, i32le: Int32Array, u32le: Uint32Array, u64le: BigUint64Array, f64le: Float64Array };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A bridge that stores uploads, "analyses" by answering with the JavaScript reference, and serves downloads in ranges. */
function memoryBridge({ state = 'ready', answer = 'reference', failAt = null } = {}) {
  const buffers = new Map(), released = [], calls = [], log = [];
  let reference = null, hold = null;
  const bridge = {
    buffers, released, calls, log,
    setReference: (value) => { reference = value; },
    holdAnalysis: () => new Promise((resolve) => { hold = resolve; }),
    status: async () => ({ state }),
    beginBuffer: async (descriptor) => { log.push('begin'); if (failAt === 'begin') return { error: { code: 'LIMIT_EXCEEDED', field: 'byte_length' } };
      const token = crypto.randomUUID(); buffers.set(token, { ...descriptor, data: new Uint8Array(descriptor.byte_length), next: 0, committed: false }); return { token }; },
    appendBuffer: async (token, offset, bytes) => { log.push('append'); const b = buffers.get(token); assert.equal(offset, b.next); assert.ok(bytes.length >= 1 && bytes.length <= 1048576);
      b.data.set(bytes, offset); b.next += bytes.length; return { next_offset: b.next }; },
    commitBuffer: async (token) => { log.push('commit'); const b = buffers.get(token); assert.equal(b.next, b.byte_length); assert.equal(sha(b.data), b.sha256); b.committed = true; return { token, byte_length: b.byte_length, sha256: b.sha256 }; },
    cancel: async (key) => { calls.push(['cancel', key]); return { state: 'requested' }; },
    release: async (tokens) => { released.push(...tokens); for (const t of tokens) buffers.delete(t); return { released: tokens.length }; },
    readBuffer: async (token, offset, length) => { const b = buffers.get(token); if (!b) return { error: { code: 'INVALID_BUFFER', field: 'token' } };
      return { offset, bytes: new Uint8Array(b.data.subarray(offset, offset + length)) }; },
    analyzeSection: async (request) => {
      calls.push(['analyze', request]);
      if (hold) await new Promise((resolve) => { const done = hold; hold = null; done(() => resolve()); });
      if (answer === 'error') return { error: { code: 'UNSUPPORTED_INPUT', field: 'settings.roi' } };
      if (answer === 'cancelled') return { cancelled: true };
      const outputs = {};
      for (const [name, column] of Object.entries(reference.columns)) {
        const put = (suffix, dtype, values) => {
          const typed = TYPES[dtype].from(values, (v) => (dtype === 'u64le' ? BigInt(v) : v)), bytes = new Uint8Array(typed.buffer.slice(0)), token = crypto.randomUUID();
          buffers.set(token, { data: bytes, byte_length: bytes.length, committed: true });
          outputs[name + suffix] = { token, dtype, shape: column.shape, byte_length: bytes.length, sha256: sha(bytes) };
        };
        put('', column.dtype, column.data); if (column.valid) put('_valid', 'u8', column.valid);
      }
      return { dimensions: reference.dimensions, outputs, provenance: { engine_version: 'test' }, ...request };
    },
  };
  return bridge;
}

test('the client uploads every input in bounded chunks, downloads the columns and releases every token', async () => {
  const s = section(3, { w: 600, h: 700 }), p = project(), bridge = memoryBridge();
  bridge.setReference(referenceColumns(s, p));
  const client = createEngineClient(bridge), snapshot = buildIntervalSnapshot(s, p);
  const result = await client.analyze(snapshot);
  assert.deepEqual(resultToBins(result), computeSectionBins(s, p).bins, 'the decoded result is the reference');
  const [, request] = bridge.calls.find(([kind]) => kind === 'analyze');
  assert.deepEqual(Object.keys(request.inputs).sort(), ['age_model', 'classes', 'exclude', 'labels', 'manual_indices', 'objects', 'settings', 'stack_members', 'stack_offsets']);
  assert.equal(request.method, 'section.intervals/1');
  assert.equal(request.settings_hash, sha(new TextEncoder().encode(JSON.stringify(snapshot.settings))), 'the settings hash is the hash of the settings buffer');
  assert.ok(bridge.log.filter((entry) => entry === 'append').length >= 2, 'the 1.6 MB label image went in more than one chunk');
  assert.equal(bridge.buffers.size, 0, 'nothing is left in the engine');
  assert.equal(bridge.released.length, 9 + Object.keys(result.columns).length + Object.values(result.columns).filter((c) => c.valid).length);
});

test('a section without overlap sends no stack_members buffer', async () => {
  const s = section(2); s.stacks = [null]; s.labels.fill(0);
  const bridge = memoryBridge(); bridge.setReference(referenceColumns(s, project()));
  await createEngineClient(bridge).analyze(buildIntervalSnapshot(s, project()));
  assert.ok(!('stack_members' in bridge.calls.find(([kind]) => kind === 'analyze')[1].inputs));
});

test('engine failures reach the caller as an EngineError and every uploaded token is still released', async () => {
  const s = section(4), p = project();
  const failing = memoryBridge({ answer: 'error' }), client = createEngineClient(failing);
  await assert.rejects(client.analyze(buildIntervalSnapshot(s, p)), (error) => error instanceof EngineError && error.code === 'UNSUPPORTED_INPUT' && error.field === 'settings.roi');
  assert.equal(failing.buffers.size, 0);
  const limited = memoryBridge({ failAt: 'begin' });
  await assert.rejects(createEngineClient(limited).analyze(buildIntervalSnapshot(s, p)), { code: 'LIMIT_EXCEEDED', field: 'byte_length' });
  const cancelled = memoryBridge({ answer: 'cancelled' });
  await assert.rejects(createEngineClient(cancelled).analyze(buildIntervalSnapshot(s, p)), { name: 'AbortError' });
  assert.equal(cancelled.buffers.size, 0);
});

test('an unavailable engine is an error before anything is uploaded, never a silent fallback', async () => {
  for (const state of ['unavailable', 'disabled']) {
    const bridge = memoryBridge({ state });
    await assert.rejects(createEngineClient(bridge).analyze(buildIntervalSnapshot(section(1), project())), { code: 'ENGINE_UNAVAILABLE' }, state);
    assert.deepEqual(bridge.log, []);
    let polls = 0; const status = bridge.status; bridge.status = async () => { polls++; return status(); };
    await assert.rejects(createEngineClient(bridge, { readyTimeoutMs: 5000 }).analyze(buildIntervalSnapshot(section(1), project())), { code: 'ENGINE_UNAVAILABLE' });
    assert.equal(polls, 1, `${state}: a failed engine is reported at once, without waiting`);
  }
});

test('the client waits for an engine that is still starting', async () => {
  const bridge = memoryBridge(); bridge.setReference(referenceColumns(section(1), project()));
  let polls = 0; bridge.status = async () => ({ state: ++polls < 3 ? 'starting' : 'ready' });
  await createEngineClient(bridge).analyze(buildIntervalSnapshot(section(1), project()));
  assert.equal(polls, 3);
  const never = memoryBridge({ state: 'starting' });
  await assert.rejects(createEngineClient(never, { readyTimeoutMs: 250 }).analyze(buildIntervalSnapshot(section(1), project())), { code: 'ENGINE_UNAVAILABLE' });
});

test('aborting a running analysis cancels it in the engine and releases the uploads', async () => {
  const s = section(6), p = project(), bridge = memoryBridge(); bridge.setReference(referenceColumns(s, p));
  const controller = new AbortController(), release = bridge.holdAnalysis();
  const running = createEngineClient(bridge).analyze(buildIntervalSnapshot(s, p), { signal: controller.signal });
  const resume = await release;   // the engine has the request
  controller.abort(); resume();
  await assert.rejects(running, { name: 'AbortError' });
  const [, key] = bridge.calls.find(([kind]) => kind === 'cancel');
  assert.equal(key, bridge.calls.find(([kind]) => kind === 'analyze')[1].requestKey, 'the engine was asked to cancel this very request');
  assert.equal(bridge.buffers.size, 0);
});

test('a download answer for another range or of the wrong length is rejected', async () => {
  for (const tamper of [(r, offset) => ({ ...r, offset: offset + 1 }), (r) => ({ ...r, bytes: r.bytes.subarray(1) }), (r) => ({ ...r, bytes: Array.from(r.bytes) })]) {
    const s = section(7), p = project(), bridge = memoryBridge(); bridge.setReference(referenceColumns(s, p));
    const read = bridge.readBuffer; bridge.readBuffer = async (token, offset, length) => tamper(await read(token, offset, length), offset);
    await assert.rejects(createEngineClient(bridge).analyze(buildIntervalSnapshot(s, p)), { code: 'INTERNAL' });
  }
});

test('a corrupted download is rejected', async () => {
  const s = section(7), p = project(), bridge = memoryBridge(); bridge.setReference(referenceColumns(s, p));
  const read = bridge.readBuffer; bridge.readBuffer = async (...args) => { const r = await read(...args); if (r.bytes) r.bytes[0] ^= 1; return r; };
  await assert.rejects(createEngineClient(bridge).analyze(buildIntervalSnapshot(s, p)), { code: 'INTERNAL' });
  assert.equal(bridge.buffers.size, 0);
});

// ---- publication rules ------------------------------------------------------------------------------------------------

/** A client that answers from the JavaScript reference, optionally waiting for the test to let each call finish. */
function manualClient(p) {
  const pending = [];
  return { pending, analyze: (snapshot, { signal }) => new Promise((resolve, reject) => {
    const entry = { snapshot, signal, finish: (value) => resolve(value), fail: (error) => reject(error) };
    signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
    pending.push(entry);
  }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a result is published only for the revision that was requested and older revisions are never shown', async () => {
  const s = section(8), p = project(), client = manualClient(p), changes = [];
  const analysis = createEngineAnalysis({ client, project: () => p, onChange: (x) => changes.push(x) });
  s.bins = [{ stale: true }];
  const first = analysis.request(s);
  assert.deepEqual(s.bins, [], 'while waiting, the section shows no bins');
  assert.deepEqual(s.analysis, { state: 'pending' });
  await flush(); assert.equal(client.pending.length, 1);
  s._mv++;                                              // the user edits the mask while the engine works
  const second = analysis.request(s);
  assert.equal(client.pending[0].signal.aborted, true, 'the older request is cancelled');
  assert.deepEqual(s.bins, []);
  client.pending[0].finish(referenceColumns(section(8), p));   // a late answer for the old revision
  await first; assert.deepEqual(s.bins, [], 'the old answer changes nothing'); assert.equal(changes.length, 0);
  await flush(); assert.equal(client.pending.length, 2);
  client.pending[1].finish(referenceColumns(s, p));
  await second;
  assert.deepEqual(s.bins, computeSectionBins(s, p).bins);
  assert.deepEqual(s.analysis, { state: 'ready' }); assert.deepEqual(changes, [s]);
});

test('a result that finishes after the section changed again is discarded', async () => {
  const s = section(9), p = project(), client = manualClient(p), changes = [];
  const analysis = createEngineAnalysis({ client, project: () => p, onChange: (x) => changes.push(x) });
  const done = analysis.request(s); await flush();
  s.roi.y1--;                                           // changed, but no new request yet (the next render has not asked)
  client.pending[0].finish(referenceColumns(section(9), p));
  await done;
  assert.deepEqual(s.bins, []); assert.equal(changes.length, 0);
  assert.deepEqual(s.analysis, { state: 'pending' }, 'still waiting for a result of the current revision');
});

test('an unchanged revision does not start a second analysis, and a finished one is not repeated', async () => {
  const s = section(10), p = project(), client = manualClient(p);
  const analysis = createEngineAnalysis({ client, project: () => p, onChange() {} });
  const a = analysis.request(s), b = analysis.request(s); await flush();
  assert.equal(client.pending.length, 1, 'two requests for one revision are one analysis');
  client.pending[0].finish(referenceColumns(s, p)); await Promise.all([a, b]);
  await analysis.request(s); await flush();
  assert.equal(client.pending.length, 1, 'the ready result is reused');
  assert.equal(s.analysis.state, 'ready');
});

test('a failure is shown as an error state with no bins and no JavaScript calculation, until an edit or a retry', async () => {
  const s = section(11), p = project(), calls = [];
  const client = { analyze: async () => { calls.push(1); throw new EngineError('LIMIT_EXCEEDED', 'byte_length'); } };
  const analysis = createEngineAnalysis({ client, project: () => p, onChange() {} });
  await analysis.request(s);
  assert.deepEqual(s.analysis, { state: 'error', code: 'LIMIT_EXCEEDED', field: 'byte_length' }); assert.deepEqual(s.bins, []); assert.equal(s._rc, undefined, 'the JavaScript row counts were not built');
  await analysis.request(s); assert.equal(calls.length, 1, 'the same revision is not retried on every render');
  s._mv++; await analysis.request(s); assert.equal(calls.length, 2, 'an edit tries again');
  analysis.retry(s); await analysis.request(s); assert.equal(calls.length, 3, 'so does an explicit retry');
  const odd = createEngineAnalysis({ client: { analyze: async () => { throw new Error('boom'); } }, project: () => p, onChange() {} });
  const t = section(12); await odd.request(t);
  assert.deepEqual(t.analysis, { state: 'error', code: 'INTERNAL', field: null }, 'an unexpected error never leaks its message');
});

test('sections are analysed one at a time, in request order', async () => {
  const p = project(), client = manualClient(p), sections = [section(1), section(2), section(3)];
  const analysis = createEngineAnalysis({ client, project: () => p, onChange() {} });
  const all = analysis.all(sections); await flush();
  assert.equal(client.pending.length, 1, 'only the first is with the engine');
  for (let i = 0; i < 3; i++) { await flush(); assert.equal(client.pending.length, i + 1); client.pending[i].finish(referenceColumns(sections[i], p)); }
  await all;
  sections.forEach((s) => assert.equal(s.analysis.state, 'ready'));
  assert.deepEqual(sections.map((s) => s.bins.length > 0), [true, true, true]);
});

test('a request that was replaced while it waited in the queue never reaches the engine', async () => {
  const p = project(), client = manualClient(p), a = section(1), b = section(2);
  const analysis = createEngineAnalysis({ client, project: () => p, onChange() {} });
  void analysis.request(a); const queued = analysis.request(b); await flush();
  b._mv++; void analysis.request(b);                    // b changes while a is still running
  client.pending[0].finish(referenceColumns(a, p)); await flush(); await flush();
  assert.equal(client.pending.length, 2, 'one request for b, the current one');
  assert.equal(client.pending[1].snapshot.settings.width, b.w);
  client.pending[1].finish(referenceColumns(b, p)); await queued;
  assert.equal(b.analysis.state, 'ready');
});
