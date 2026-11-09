// Drive the real history handlers on a deterministic, disposable browser project.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const [url, profilePath, executablePath, size, rounds, mode] = process.argv.slice(2);
const traceCount = Number(size), cycles = Number(rounds), profileCpu = mode === 'profile';
const browser = await puppeteer.launch({
  executablePath, userDataDir: profilePath, headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});
const timeout = 120_000;
const errors = [];

try {
  const [page] = await browser.pages();
  page.setDefaultTimeout(timeout);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(new URL(url).origin + '/app/js/')) {
      errors.push(request.failure()?.errorText + ' ' + new URL(request.url()).pathname);
    }
  });
  await page.goto(url, { waitUntil: 'load', timeout });
  assert.equal(await page.evaluate(() => !!window.ichantool), true, 'Application did not initialise');
  await page.waitForSelector('#projList .pempty');
  const fixture = await page.evaluate(prepareHistoryFixture, traceCount);
  await waitForHistoryProject(page, traceCount + 1);

  const client = await page.createCDPSession();
  if (profileCpu) {
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 100 });
    await client.send('Profiler.start');
  }
  const { latency, history } = await page.evaluate(exerciseHistory, traceCount, cycles);
  const result = { fixture, history };
  if (profileCpu) {
    const { profile } = await client.send('Profiler.stop');
    result.cpu = attributeHistoryCpu(profile);
  }
  await waitForHistoryProject(page, traceCount - 35);
  if (!profileCpu) {
    result.latency_ms = latency;
    result.heap_bytes = await historyHeap(page, client);
  }
  await client.detach();

  await page.reload({ waitUntil: 'domcontentloaded', timeout });
  await waitForHistoryProject(page, traceCount - 35);
  result.reload_verified = await page.evaluate((count) => {
    const { S } = window.ichantool, s = S.sections[0];
    return S.undo.length === 0 && !s.objects.has(36) && s.labels[350] === count + 1
      && s.labels[351] === 0 && s.objects.has(count);
  }, traceCount);
  assert.equal(result.reload_verified, true);
  assert.deepEqual(errors, [], 'Application errors');
  console.log(JSON.stringify({
    ...result, chrome: await browser.version(), node: process.version,
    puppeteer: createRequire(import.meta.url)('puppeteer-core/package.json').version,
  }));
} catch (error) {
  if (errors.length) console.error(errors.join('\n'));
  throw error;
} finally {
  await browser.close();
}

async function prepareHistoryFixture(count) {
  const { rleEncode } = await import('./js/core.js');
  const { DEFAULT_FILTERS, DEFAULT_DETECT } = await import('./js/imageproc.js');
  const width = 1024, height = 1024, columns = 96, stride = 10, tile = 6, targets = 36;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#b7a896'; context.fillRect(0, 0, width, height);
  const labels = new Int32Array(width * height), objects = [], stacks = [null];
  for (let id = 1; id <= count; id++) {
    const x = ((id - 1) % columns) * stride, y = Math.floor((id - 1) / columns) * stride;
    for (let r = y; r < y + tile; r++) labels.fill(id, r * width + x, r * width + x + tile);
    if (id <= targets) {
      labels[y * width + x] = -id;
      stacks.push([count + 1, id]);
    }
    objects.push({ id, cls: null, src: 'draw' });
  }
  objects.push({ id: count + 1, cls: null, src: 'draw' });
  const section = {
    id: 'history-section', name: 'Synthetic history section', w: width, h: height,
    ds: 1, full: { w: width, h: height }, top: 0, bottom: 100, units: 'cm',
    file: { name: 'history.png', type: 'image/png', b64: canvas.toDataURL('image/png').split(',')[1] },
    roi: { x0: 0, y0: 0, x1: width, y1: height }, filters: DEFAULT_FILTERS, detect: DEFAULT_DETECT,
    labels: rleEncode(labels), exclude: [0, labels.length], objects, nextId: count + 2, stacks,
  };
  const project = {
    app: 'SedCoreTool', kind: 'project', version: 5, id: 'benchmark-history', name: 'History benchmark',
    cores: [{ id: 'history-core', name: 'Synthetic history core', units: 'cm', sections: [section] }],
  };
  const transfer = new DataTransfer();
  transfer.items.add(new File([JSON.stringify(project)], 'history.json', { type: 'application/json' }));
  const input = document.querySelector('#impProj'); input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { width, height, trace_count: objects.length, tile_size_px: tile, stride_px: stride,
    columns, deletion_targets: targets, overlaps_per_target: 1, depth_cm: 100 };
}

async function waitForHistoryProject(page, count) {
  await page.waitForFunction((n) => {
    const S = window.ichantool?.S, s = S?.sections[0];
    return S?.id === 'benchmark-history' && s?.enh && s.objects.size === n
      && document.querySelector('#busy').hidden && document.querySelector('#saveState').dataset.state === 'saved';
  }, {}, count);
}

async function exerciseHistory(count, repeats) {
  const { idsAt } = await import('./js/core.js');
  const { S } = window.ichantool, s = S.sections[0];
  const undoButton = document.querySelector('#undoBtn');
  if (!document.querySelector('#home').hidden || S.undo.length) throw new Error('Unexpected initial history');
  const latency = { delete: [], undo: [], reapply: [] };
  const renderFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

  function remove(id, series) {
    S.selected = id;  // Selection uses the existing test hook. The app handles Delete normally.
    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
    const start = performance.now();
    document.body.dispatchEvent(event);
    latency[series].push(performance.now() - start);
    if (s.objects.has(id)) throw new Error('Delete did not remove trace ' + id);
  }

  function checkTargets(restore) {
    for (let id = 1; id <= 36; id++) {
      const restored = restore && id > 6, x0 = (id - 1) * 10;
      if (s.objects.has(id) !== restored) throw new Error('Unexpected trace ' + id);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
        const label = s.labels[y * s.w + x0 + x];
        if (x === 0 && y === 0 && restored) {
          const ids = idsAt(label, s.stacks);
          if (ids.length !== 2 || ids[0] !== count + 1 || ids[1] !== id) throw new Error('Overlap order changed');
        } else if (label !== (x === 0 && y === 0 ? count + 1 : restored ? id : 0)) {
          throw new Error('Unexpected pixel for trace ' + id);
        }
      }
    }
  }

  for (let id = 1; id <= 36; id++) remove(id, 'delete');
  if (S.undo.length !== 30) throw new Error('Expected the 30-step history limit');
  const initial = historyShape(S.undo);
  await renderFrame();
  for (let cycle = 0; cycle < repeats; cycle++) {
    for (let id = 36; id >= 7; id--) {
      const start = performance.now();
      undoButton.click();
      latency.undo.push(performance.now() - start);
      if (!s.objects.has(id)) throw new Error('Undo did not restore trace ' + id);
    }
    if (S.undo.length) throw new Error('History did not drain');
    checkTargets(true);
    await renderFrame();
    for (let id = 7; id <= 36; id++) remove(id, 'reapply');
    if (S.undo.length !== 30) throw new Error('Reapplied history did not fill');
    checkTargets(false);
    await renderFrame();
  }
  const final = historyShape(S.undo);
  if (JSON.stringify(initial) !== JSON.stringify(final)) throw new Error('History payload grew across cycles');
  return { latency, history: { initial_full: initial, final_full: final } };

  function historyShape(steps) {
    return {
      steps: steps.length, object_records: steps.reduce((n, step) => n + (step.objs.size ?? step.objs.length), 0),
      label_pixel_changes: steps.reduce((n, step) => n + step.lm.length / 2, 0),
      exclusion_pixel_changes: steps.reduce((n, step) => n + step.ex.length / 2, 0),
      overlap_lists: new Set(steps.flatMap((step) => step.lm.filter(Array.isArray))).size,
    };
  }
}

async function historyHeap(page, client) {
  async function used() {
    await client.send('HeapProfiler.collectGarbage');
    return (await client.send('Runtime.getHeapUsage')).usedSize;
  }
  const full = await used();
  await page.evaluate(() => { for (const step of window.ichantool.S.undo) step.objs = null; });
  const withoutObjects = await used();
  await page.evaluate(() => { window.ichantool.S.undo.length = 0; });
  return { full, without_objects: withoutObjects, without_history: await used() };
}

function attributeHistoryCpu(profile) {
  const functions = new Set(['deleteObjects', 'beginOp', 'undoOne']);
  const parents = new Map(), nodes = new Map(), totals = {};
  for (const name of functions) totals[name] = { sample_count: 0, sampled_ms: 0 };
  for (const node of profile.nodes) {
    nodes.set(node.id, node);
    for (const child of node.children || []) parents.set(child, node.id);
  }
  for (const [i, id] of profile.samples.entries()) {
    for (let current = id; current != null; current = parents.get(current)) {
      const { functionName, url } = nodes.get(current).callFrame;
      if (url.endsWith('/app/js/app.js') && functions.has(functionName)) {
        const total = totals[functionName];
        total.sample_count++;
        total.sampled_ms += profile.timeDeltas[i] / 1000;
      }
    }
  }
  return { requested_interval_us: 100, profile_sample_count: profile.samples.length, functions: totals };
}
