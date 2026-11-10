// Profile normal section opening/navigation without changing application cache or loading rules.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const [url, profile, executablePath, caseId, mode, previewMode = 'legacy'] = process.argv.slice(2);
const projectId = caseId === 'u1385' ? 'test-u1385' : 'benchmark-synthetic';
const browser = await puppeteer.launch({ executablePath, userDataDir: profile, headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const errors = [], profiling = mode === 'profile', workerProfiles = [];
let main, cpuOpen;
try {
  const [page] = await browser.pages(); page.setDefaultTimeout(120000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForSelector(`#projList [data-id="${projectId}"] [data-act="open"]`, { visible: true });
  const navPreview = await page.evaluate((selection) => {
    const checkbox = document.getElementById('navPreview');
    if (!checkbox) { if (selection === 'legacy') return false; throw new Error('Navigation preview is unavailable'); }
    if (selection === 'default') {
      if (!checkbox.checked) throw new Error('Navigation preview must be enabled by default');
    } else if (checkbox.checked !== (selection === 'preview')) checkbox.click();
    return checkbox.checked;
  }, previewMode);
  if (profiling) {
    main = await page.createCDPSession(); await main.send('Profiler.enable'); await main.send('Profiler.start');
    const attach = (worker) => {
      const pending = (async () => {
        await worker.client.send('Profiler.enable'); await worker.client.send('Profiler.start');
        return { client: worker.client, url: worker.url() };
      })();
      workerProfiles.push(pending);
    };
    page.on('workercreated', attach); page.workers().forEach(attach);
  }
  await page.evaluate((id) => {
    window.__imageBenchmarkStart = performance.now();
    document.querySelector(`#projList [data-id="${id}"] [data-act="open"]`).click();
  }, projectId);
  const ready = await page.waitForFunction((id) => {
    const S = window.ichantool?.S, s = S?.sections[0];
    return S?.id === id && s?.enh && !s._loading && document.getElementById('busy').hidden
      && document.getElementById('saveState').dataset.state === 'saved' && performance.now() - window.__imageBenchmarkStart;
  }, {}, projectId);
  const open_ready_ms = await ready.jsonValue(); await ready.dispose();
  const open_painted_ms = await painted(page);
  console.error(caseId, mode, 'opened');
  if (profiling) cpuOpen = sites((await main.send('Profiler.stop')).profile);
  const fixture = await page.evaluate(() => {
    const S = window.ichantool.S;
    return { settings: S.settings, sections: S.sections.map((s, index) => ({ index, w: s.w, h: s.h, ds: s.ds,
      top: s.top, bottom: s.bottom, units: s.units, roi: s.roi, filters: s.filters, objects: s.objects.size })) };
  });
  assert.equal(fixture.sections.length, caseId === 'u1385' ? 6 : 8);
  if (caseId !== 'u1385') for (const section of fixture.sections) {
    assert.equal(section.w, 960); assert.equal(section.h, caseId === 'large' ? 16000 : 6400); assert.equal(section.ds, 1);
  }
  const firstPixels = await imageHashes(page);
  const initial = await snapshot(page), navigation = [], visual = [];
  const compare = mode === 'visual' ? (await import('../tests/e2e/navigation-preview.mjs')).compareNavigationPreview : null;
  if (compare) visual.push(await compare(page));
  const last = fixture.sections.length - 1;
  if (profiling) await main.send('Profiler.start');
  for (const index of [...Array.from({ length: last }, (_, i) => i + 1), 0, last, 0]) {
    const entry = await page.evaluate((index) => {
      const S = window.ichantool.S, section = S.sections[index];
      const entry = { index, resident_before: !!section.orig, labels_loaded_before: section._mk.labels.loaded(),
        exclude_loaded_before: section._mk.exclude.loaded() };
      window.__imageBenchmarkStart = performance.now();
      const select = document.getElementById('secSel'); select.value = String(index);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return entry;
    }, index);
    const ready = await page.waitForFunction((index) => {
      const S = window.ichantool.S, s = S.sections[index];
      return S.cur === index && s.orig && s.enh && !s._loading && document.getElementById('busy').hidden
        && performance.now() - window.__imageBenchmarkStart;
    }, {}, index);
    entry.ready_ms = await ready.jsonValue(); await ready.dispose();
    entry.painted_ms = await painted(page);
    entry.cache = await page.evaluate(() => {
      const sections = window.ichantool.S.sections;
      return { pixel_indices: sections.flatMap((s, i) => s.orig ? [i] : []),
        mask_indices: sections.flatMap((s, i) => s._mk.labels.loaded() || s._mk.exclude.loaded() ? [i] : []),
        pixel_buffer_bytes: sections.reduce((sum, s) => sum + (s.orig?.byteLength || 0) + (s.enh?.byteLength || 0), 0) };
    });
    navigation.push(entry);
    if (compare) visual.push(await compare(page));
  }
  console.error(caseId, mode, 'navigated');
  const interactions = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.__imageBenchmarkStart = performance.now(); document.getElementById('zoomIn').click(); });
    interactions.push({ action: 'zoom', painted_ms: await painted(page) });
  }
  const view = await page.$('#view'), box = await view.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => { window.__imageBenchmarkStart = performance.now(); });
    await page.mouse.move(box.x + box.width / 2 - 15 * i, box.y + box.height / 2 - 10 * i);
    interactions.push({ action: 'pan', painted_ms: await painted(page) });
  }
  await page.mouse.up({ button: 'middle' });
  let cpu_main, cpu_workers;
  if (profiling) {
    cpu_main = { open: cpuOpen, navigation: sites((await main.send('Profiler.stop')).profile) }; await main.send('Profiler.disable');
    cpu_workers = [];
    for (const pending of workerProfiles) {
      const { client, url } = await pending;
      cpu_workers.push({ url: url.split('/').at(-1), sites: sites((await client.send('Profiler.stop')).profile) });
      await client.send('Profiler.disable');
    }
  }
  assert.deepEqual(await imageHashes(page), firstPixels, 'Decoded/processed image buffers changed after navigation');
  assert.deepEqual(await snapshot(page), initial, 'Navigation changed scientific inputs or interval results');
  const edit = await verifyEdit(page);
  const exported = await verifyMaskPNG(page);
  console.error(caseId, mode, 'verified edit/PNG');
  await page.evaluate(() => window.ichantool.saveToDB());
  const saved = await snapshot(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction((id) => window.ichantool?.S.id === id && window.ichantool.S.sections[0]?.enh
    && document.getElementById('busy').hidden, {}, projectId);
  assert.deepEqual(await snapshot(page), saved, 'The saved edit changed after reload');
  assert.deepEqual(await imageHashes(page), firstPixels, 'Image bytes changed after save/reload');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ fixture, open_ready_ms, open_painted_ms, navigation, interactions,
    navigation_total_ms: navigation.reduce((sum, step) => sum + step.painted_ms, 0),
    first_visits_total_ms: navigation.slice(0, last).reduce((sum, step) => sum + step.painted_ms, 0),
    return_first_ms: navigation[last].painted_ms, warm_return_ms: navigation.at(-1).painted_ms,
    zoom_total_ms: interactions.filter((step) => step.action === 'zoom').reduce((sum, step) => sum + step.painted_ms, 0),
    pan_total_ms: interactions.filter((step) => step.action === 'pan').reduce((sum, step) => sum + step.painted_ms, 0),
    initial, saved, firstPixels, edit, exported, cpu_main, cpu_workers, visual, nav_preview: navPreview,
    chrome: await browser.version(), node: process.version,
    puppeteer: createRequire(import.meta.url)('puppeteer-core/package.json').version }));
} catch (error) {
  console.error('Image benchmark failure:', errors, await browser.pages().then(async (pages) => pages[0].evaluate(() => ({
    id: window.ichantool?.S.id, name: window.ichantool?.S.name, section: window.ichantool?.S.cur,
    save: document.getElementById('saveState')?.dataset.state, busy: document.getElementById('busy')?.hidden,
    validation: document.getElementById('projectValidation')?.hidden,
    first: window.ichantool?.S.sections[0] && { pixels: !!window.ichantool.S.sections[0].enh, objects: window.ichantool.S.sections[0].objects.size, warnings: window.ichantool.S.sections[0].loadWarnings },
    notices: document.querySelector('.toast')?.textContent,
  }))));
  throw error;
} finally { await browser.close(); }

async function painted(page) {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - window.__imageBenchmarkStart;
  });
}
async function imageHashes(page) {
  return page.evaluate(async () => {
    const s = window.ichantool.S.sections[0], digest = async (array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', array))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { original: await digest(s.orig), enhanced: await digest(s.enh) };
  });
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const { S, analyze } = window.ichantool;
    const { depthAtRow, rowAtDepth } = await import('./js/app.js');
    const packed = [];
    for (const s of S.sections) {
      analyze(s);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const row = s.roi.y0 + fraction * (s.roi.y1 - s.roi.y0);
        if (Math.abs(rowAtDepth(s, depthAtRow(s, row)) - row) > 1e-9) throw new Error('Depth/row mapping changed');
      }
      packed.push({ index: packed.length, labels: s._mk.labels.rle(), exclude: s._mk.exclude.rle(), stacks: s.stacks,
        objects: [...s.objects.values()].sort((a, b) => a.id - b.id).map((o) => [o.id, o.cls, o.pred, o.conf]), bins: s.bins });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(packed));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  });
}
async function verifyEdit(page) {
  return page.evaluate(async () => {
    const I = window.ichantool, s = I.S.sections[0], id = Math.min(...s.objects.keys());
    I.S.selected = id;
    const originalBins = structuredClone(s.bins), bbox = s.objects.get(id).bbox;
    const state = () => JSON.stringify({ labels: s._mk.labels.rle(), objects: [...s.objects.keys()].sort((a, b) => a - b), bins: s.bins });
    const before = state();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    if (s.objects.has(id)) throw new Error('Delete failed');
    I.analyze(s);
    for (let i = 0; i < originalBins.length; i++) if (originalBins[i].r1 <= bbox[1] || originalBins[i].r0 > bbox[3]) {
      if (JSON.stringify(originalBins[i]) !== JSON.stringify(s.bins[i])) throw new Error('Deletion changed an unaffected interval');
    }
    const deleted = state();
    document.getElementById('undoBtn').click(); I.analyze(s);
    if (state() !== before) throw new Error('Undo changed masks/results');
    document.getElementById('redoBtn').click(); I.analyze(s);
    if (state() !== deleted) throw new Error('Redo changed masks/results');
    return { id, remaining: s.objects.size, undo_redo_verified: true };
  });
}
async function verifyMaskPNG(page) {
  await page.evaluate(() => {
    window.__maskExport = null; const original = URL.createObjectURL;
    URL.createObjectURL = (blob) => { if (blob.type === 'image/png') window.__maskExport = blob; return original(blob); };
    document.addEventListener('click', (event) => { if (event.target.closest?.('a[download]')) event.preventDefault(); }, true);
    document.getElementById('expMask').click();
  });
  await page.waitForFunction(() => window.__maskExport && document.getElementById('busy').hidden);
  return page.evaluate(async () => {
    const { S } = window.ichantool, s = S.sections[0];
    const { effClassArray } = await import('./js/app.js'), { topAt } = await import('./js/core.js');
    const { hex } = await import('./js/state.js'), eff = effClassArray(s), colors = S.classes.map((c) => hex(c.color));
    const image = await createImageBitmap(window.__maskExport), canvas = document.createElement('canvas');
    if (image.width !== s.w || image.height !== s.h) throw new Error('Mask export dimensions changed');
    canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, s.w, s.h).data;
    for (let i = 0; i < s.w * s.h; i++) {
      const cls = s.labels[i] && !s.exclude[i] ? eff[topAt(s.labels[i], s.stacks)] : -1, color = cls >= 0 ? colors[cls] : [0, 0, 0], j = i * 4;
      if (data[j] !== color[0] || data[j + 1] !== color[1] || data[j + 2] !== color[2] || data[j + 3] !== 255) throw new Error('Exported mask pixel mismatch at ' + i);
    }
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { width: s.w, height: s.h, rgba_sha256: hash, exact_pixels_verified: s.w * s.h };
  });
}
function sites(profile) {
  const weights = new Map(), result = [];
  for (let i = 0; i < (profile.samples || []).length; i++) weights.set(profile.samples[i], (weights.get(profile.samples[i]) || 0) + profile.timeDeltas[i]);
  for (const node of profile.nodes) if (weights.has(node.id)) result.push({ function: node.callFrame.functionName || '(anonymous)',
    source: node.callFrame.url.startsWith('pptr:') ? '(benchmark)' : node.callFrame.url.split('/').slice(-2).join('/') || '(runtime)',
    line: node.callFrame.lineNumber + 1, sampled_self_ms: weights.get(node.id) / 1000 });
  return result.sort((a, b) => b.sampled_self_ms - a.sampled_self_ms).slice(0, 30);
}
