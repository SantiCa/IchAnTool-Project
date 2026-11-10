import assert from 'node:assert/strict';
import { objectStats } from '../../app/js/imageproc.js';
import { rleDecode, rleEncode } from '../../app/js/core.js';
import { taxonFigureFixture } from './taxon-figures.mjs';

/** Reference preparation is confined to a separate correctness trial, never to a timed/RSS trial. */
export async function compareNavigationPreview(page) {
  return page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready;
    const checkbox = document.getElementById('navPreview'), view = document.getElementById('view');
    const context = view.getContext('2d'), before = checkbox.checked;
    const select = async (enabled) => { checkbox.checked = enabled; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await frame(); await frame(); };
    await select(false);
    const reference = context.getImageData(0, 0, 66, view.height).data;
    await select(true);
    const actual = context.getImageData(0, 0, 66, view.height).data;
    if (reference.length !== actual.length) throw new Error('Navigation geometry changed');
    for (let i = 0; i < actual.length; i++) if (actual[i] !== reference[i]) throw new Error(`Navigation pixel ${i}: expected ${reference[i]}, received ${actual[i]}`);
    await select(before);
    return { width: 66, height: view.height, exact_pixels: reference.length / 4 };
  });
}

export async function verifyNavigationPreview(browser, url, { screenshots = false } = {}) {
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(20000); page.on('pageerror', (error) => errors.push(error.message)); page.on('dialog', (dialog) => dialog.accept());
  const change = (selector, value, event = 'change') => page.evaluate((selector, value, event) => {
    const field = document.querySelector(selector); if (field.type === 'checkbox') field.checked = value; else field.value = String(value);
    field.dispatchEvent(new Event(event, { bubbles: true }));
  }, selector, value, event);
  const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const science = () => page.evaluate(() => {
    const I = window.ichantool;
    return JSON.stringify(I.S.sections.map((s) => { I.analyze(s); return { labels: s._mk.labels.rle(), exclude: s._mk.exclude.rle(),
      objects: [...s.objects.values()].sort((a, b) => a.id - b.id).map((o) => [o.id, o.cls]), marks: s.marks, bins: s.bins }; }));
  });
  try {
    const fixture = taxonFigureFixture(), section = fixture.cores[0].sections[0], originalLabels = rleDecode(section.labels, section.w * section.h, Int32Array);
    const labels = new Int32Array(80 * section.h), rgba = new Uint8ClampedArray(labels.length * 4);
    for (let y = 0; y < section.h; y++) for (let x = 0; x < 80; x++) {
      const i = y * 80 + x; labels[i] = originalLabels[y * 8 + Math.floor(x / 10)]; rgba.set([y + 60, y + 90, 200 - y, 255], i * 4);
    }
    section.w = 80; section.roi.x1 = 80; section.labels = rleEncode(labels);
    const statistics = objectStats(labels, section.w, section.h, rgba);
    for (const object of section.objects) object.st = statistics.get(object.id);
    for (const mark of section.marks) mark.x *= 10;
    const exclude = new Uint8Array(section.w * section.h);
    exclude.fill(1, 30 * section.w, 33 * section.w); exclude[55 * section.w + 3] = 1; section.exclude = rleEncode(exclude);
    await page.goto(url, { waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async (fixture) => {
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 100;
      const context = canvas.getContext('2d');
      for (let y = 0; y < 100; y++) { context.fillStyle = `rgb(${y + 60},${y + 90},${200 - y})`; context.fillRect(0, y, 80, 1); }
      fixture.cores[0].sections[0].file = { name: 'synthetic.png', type: 'image/png', blob: await new Promise((resolve) => canvas.toBlob(resolve)) };
      const I = window.ichantool; await I.loadProject(fixture); document.getElementById('home').hidden = true; I.setMode('section');
      await I.saveToDB();
    }, fixture);
    await page.waitForFunction(() => window.ichantool.S.sections[0]?.enh);
    await frame(); const original = await science();
    assert.equal(await page.$eval('#navPreview', (checkbox) => checkbox.checked), false);
    await compareNavigationPreview(page);
    assert.equal(await science(), original);
    assert.equal(await page.$eval('#saveState', (status) => status.dataset.state), 'saved');
    for (const source of ['orig', 'enh']) for (const overlay of [false, true]) for (const hidden of [false, true]) {
      await change('#logImgMode', source); await change('#logOverlay', overlay); await change('#logHideExcl', hidden);
      for (const opacity of [35, 65, 100]) { await change('#ovAlpha', opacity, 'input'); await compareNavigationPreview(page); }
    }
    assert.equal(await science(), original);
    await change('#navPreview', true);
    await page.evaluate(() => {
      const I = window.ichantool; I.S.selected = 1; I.assignClass('pl');
      I.S.classes[0].color = '#b32d8a'; const s = I.S.sections[0]; s.roi = { x0: 1, x1: 7, y0: 5, y1: 95 }; s.logVer++;
      I.setMode('section');
    });
    await compareNavigationPreview(page);
    await page.setViewport({ width: 1280, height: 800 }); await compareNavigationPreview(page);
    await page.setViewport({ width: 1440, height: 900 }); await compareNavigationPreview(page);
    await page.evaluate(() => {
      const I = window.ichantool; I.S.view.zoom = 8; I.setMode('section');
      document.addEventListener('pointerdown', (event) => { if (event.target.id === 'view') window.__navPoint = event.clientY; }, true);
      document.addEventListener('pointermove', (event) => { if (event.target.id === 'view') window.__navPoint = event.clientY; }, true);
    });
    await frame(); const beforePointer = await science(), bounds = await page.$eval('#view', (canvas) => {
      const rect = canvas.getBoundingClientRect(); return { x: rect.left, y: rect.top, height: canvas.height };
    });
    const checkPosition = async () => assert.ok(await page.evaluate(() => {
      const { S } = window.ichantool, view = document.getElementById('view'), section = S.sections[0], top = view.getBoundingClientRect().top;
      const fraction = Math.min(1, Math.max(0, (window.__navPoint - top - 14) / (view.height - 30)));
      const expected = section.roi.y0 + fraction * (section.roi.y1 - section.roi.y0);
      return Math.abs(S.view.y + view.height / (2 * S.view.zoom) - expected) <= 1e-9;
    }), 'Navigation click/drag must preserve depth mapping');
    const x = Math.round(bounds.x + 16), start = Math.round(bounds.y + 14 + (bounds.height - 30) * 0.4), end = Math.round(bounds.y + 14 + (bounds.height - 30) * 0.7);
    await page.mouse.click(x, start); await checkPosition();
    await page.mouse.move(x, start); await page.mouse.down(); await page.mouse.move(x, end, { steps: 3 }); await page.mouse.up(); await checkPosition();
    assert.equal(await science(), beforePointer);
    await page.select('#secRes', '2');
    await page.waitForFunction(() => window.ichantool.S.sections[0].ds === 2 && !window.ichantool.S.sections[0]._loading && document.getElementById('busy').hidden);
    await compareNavigationPreview(page);
    if (screenshots) await page.screenshot({ path: 'dist/navigation-preview.png' });
    const saved = await page.evaluate(async () => { await window.ichantool.saveToDB(); return window.ichantool.serialize(); });
    assert.equal(JSON.stringify(saved).includes('navPreview'), false);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool?.S.sections[0]?.enh);
    assert.equal(await page.$eval('#navPreview', (checkbox) => checkbox.checked), false);
    await compareNavigationPreview(page);
    assert.deepEqual(errors, []);
    console.log('Navigation preview: exact display pixels, source/overlay/exclusion/opacity, edits, ROI, resize, resolution, pointer depth, rollback and session-only state verified.');
  } finally { await page.close(); }
}
