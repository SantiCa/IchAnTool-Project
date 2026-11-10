// Measure the application's analysis without changing its implementation or persistence paths.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeCPU(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const weights = new Map();
  assert.equal(profile.samples.length, profile.timeDeltas.length, 'CPU samples need matching weights');
  for (let index = 0; index < profile.samples.length; index++) {
    const id = profile.samples[index], weight = profile.timeDeltas[index];
    assert.ok(nodes.has(id) && Number.isFinite(weight) && weight >= 0, 'Invalid CPU sample');
    weights.set(id, (weights.get(id) || 0) + weight);
  }
  const sites = [...weights].map(([id, weight]) => {
    const frame = nodes.get(id).callFrame;
    return { function: frame.functionName || '(anonymous)',
      source: frame.url.startsWith('pptr:') ? '(benchmark)' : frame.url.split('/').slice(-2).join('/') || '(runtime)',
      line: frame.lineNumber + 1, sampled_self_ms: weight / 1000 };
  }).sort((a, b) => b.sampled_self_ms - a.sampled_self_ms);
  return { samples: profile.samples.length, sampled_ms: profile.timeDeltas.reduce((sum, dt) => sum + dt, 0) / 1000,
    sites };
}

async function main() {
  const [url, userDataDir, executablePath, snapshotFile, mode] = process.argv.slice(2);
  assert.ok(['measure', 'profile'].includes(mode));
  const expected = JSON.parse(await readFile(snapshotFile, 'utf8'));
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath, userDataDir, headless: true,
    args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
  const errors = [];
  try {
    const [page] = await browser.pages();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
    });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => {
      const S = window.ichantool?.S;
      return S?.sections[0]?.enh && document.getElementById('busy').hidden
        && document.getElementById('saveState').dataset.state === 'saved';
    });
    assert.deepEqual(await snapshot(page), expected, 'Edited fixture differs before analysis');
    const scenarios = [];
    const client = mode === 'profile' ? await page.createCDPSession() : null;
    if (client) { await client.send('Profiler.enable'); await client.send('Profiler.setSamplingInterval', { interval: 1000 }); }
    for (const binCm of [2, 1.37]) {
      const scenario = await measure(page, binCm);
      if (client) {
        scenario.cpu = {};
        for (const [cache, passes] of [['cold', 20], ['cached', 200]]) {
          await client.send('Profiler.start');
          await page.evaluate(({ cache, passes }) => {
            const { S, analyze } = window.ichantool;
            for (let pass = 0; pass < passes; pass++) for (const section of S.sections) {
              if (cache === 'cold') delete section._rc;
              analyze(section);
            }
          }, { cache, passes });
          scenario.cpu[cache] = { passes, ...summarizeCPU((await client.send('Profiler.stop')).profile) };
          assert.deepEqual(await bins(page), scenario.bins, 'Profiling changed interval results');
        }
      }
      scenarios.push(scenario);
    }
    if (client) { await client.send('Profiler.disable'); await client.detach(); }
    await page.evaluate(() => { window.ichantool.S.settings.binCm = 2; });
    assert.deepEqual(await snapshot(page), expected, 'Analysis changed input masks, classes or settings');
    assert.deepEqual(errors, [], 'Application errors');
    console.log(JSON.stringify({ scenarios, inputs_unchanged: true,
      chrome: await browser.version(), node: process.version,
      puppeteer: createRequire(import.meta.url)('puppeteer-core/package.json').version }));
  } finally { await browser.close(); }
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { S, serialize } = window.ichantool, { effClassArray } = await import('./js/app.js');
    const sections = S.sections;
    // Force resident masks before timing, as in M0.1. Never raise the application's memory budget.
    for (const s of sections) {
      if (s.labels.length !== s.w * s.h || s.exclude.length !== s.w * s.h) throw new Error('Invalid masks');
    }
    if (sections.some((s) => !s._mk.labels.loaded() || !s._mk.exclude.loaded())) throw new Error('Masks exceed resident budget');
    return { classes: S.classes.map((c) => c.id),
      settings: { binCm: S.settings.binCm, minValid: S.settings.minValid / 100, noDataPad: S.settings.noDataPad },
      sections: serialize().cores[0].sections.map(({ name, w, h, top, bottom, units, roi, filters, detect,
        labels, exclude, stacks, objects }, i) => ({ name, w, h, top, bottom, units, roi, filters, detect,
        labels, exclude, stacks, objectCount: objects.length, eff: Array.from(effClassArray(sections[i])) })) };
  });
}

async function bins(page) {
  return page.evaluate(() => window.ichantool.S.sections.map((s) => s.bins.map((b) => [
    b.dTop, b.dBottom, b.depth, 100 * b.valid / ((b.r1 - b.r0) * (s.roi.x1 - s.roi.x0)),
    b.pct, ...b.classPct, b.BI, b.ii,
  ])));
}

async function measure(page, binCm) {
  const result = await page.evaluate(async (binCm) => {
    const { S, analyze } = window.ichantool;
    const { effClassArray, pxPerCm } = await import('./js/app.js');
    const { rowCounts, binRows } = await import('./js/core.js');
    S.settings.binCm = binCm;
    if (S.settings.noDataPad !== 0 || S.settings.minValid !== 20) throw new Error('Unexpected analysis settings');
    const timed = (operation) => { const start = performance.now(); const value = operation(); return { value, ms: performance.now() - start }; };
    for (const section of S.sections) delete section._rc;
    const cold = timed(() => { for (const section of S.sections) analyze(section); });
    const reference = JSON.stringify(S.sections.map((s) => s.bins));
    const cachedPasses = 20;
    const cached = timed(() => {
      for (let pass = 0; pass < cachedPasses; pass++) for (const section of S.sections) analyze(section);
    });
    if (JSON.stringify(S.sections.map((s) => s.bins)) !== reference) throw new Error('Cached analysis changed results');
    const sections = [];
    for (const s of S.sections) {
      const classes = timed(() => effClassArray(s));
      const rows = timed(() => rowCounts({ labels: s.labels, width: s.w, roi: s.roi, exclude: s.exclude,
        effClass: classes.value, nClasses: S.classes.length, stacks: s.stacks }));
      const aggregate = timed(() => binRows(rows.value, { top: s.top, bottom: s.bottom,
        binPx: Math.max(1, binCm * pxPerCm(s)), minValid: S.settings.minValid / 100 }));
      // Compare full integer counts as well as shared scientific output, outside timed regions.
      const previous = s._rc.counts;
      for (const key of ['valid', 'bio', 'cls']) {
        if (rows.value[key].length !== previous[key].length || rows.value[key].some((v, i) => v !== previous[key][i])) {
          throw new Error('Direct row counts differ from application cache');
        }
      }
      const shared = (b) => [b.index, b.r0, b.r1, b.dTop, b.dBottom, b.depth, b.valid, b.pct, b.classPct, b.BI, b.ii];
      if (JSON.stringify(aggregate.value.map(shared)) !== JSON.stringify(s.bins.map(shared))) throw new Error('Direct bins differ');
      sections.push({ name: s.name, roi_pixels: rows.value.nRows * rows.value.nCols, intervals: s.bins.length,
        class_mapping_ms: classes.ms, row_counts_ms: rows.ms, bin_rows_ms: aggregate.ms });
    }
    return { bin_cm: binCm, cold_ms: cold.ms, cached_ms: cached.ms / cachedPasses, cached_passes: cachedPasses,
      class_mapping_ms: sections.reduce((sum, s) => sum + s.class_mapping_ms, 0),
      row_counts_ms: sections.reduce((sum, s) => sum + s.row_counts_ms, 0),
      bin_rows_ms: sections.reduce((sum, s) => sum + s.bin_rows_ms, 0), sections };
  }, binCm);
  return { ...result, bins: await bins(page) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
