import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { taxonFigureFixture } from './taxon-figures.mjs';

export function eventShadingFixture() {
  const fixture = taxonFigureFixture(), core = fixture.cores[0];
  core.age.text = '0, 0\n5, 10\n10, 30';
  core.imp = { depth: [0, 5, 10], proxies: { Ca: [2, 8, 4] } };
  core.records = [{ id: 'shade-record', name: 'Synthetic Ca', axis: 'depth',
    series: [{ name: 'Ca', x: [0, 5, 10], y: [2, 8, 4], show: true, color: '#663399' }] }];
  fixture.cores.push({ id: 'shade-other', name: 'Other numeric core', units: 'm', sections: [],
    age: { text: '1, 100\n2, 200', units: 'ka' }, imp: { depth: [1, 1.5, 2], proxies: { Ca: [3, 9, 5] } } });
  fixture.geo = { settings: { axis: 'depth', step: 1, features: ['Ca'], target: 'climate' }, layers: [
    { id: 'climate', name: 'Climate', cats: [{ id: 'cold', name: 'Cold', color: '#3399cc' }, { id: 'warm', name: 'Warm', color: '#dd6633' }] },
    { id: 'beds', name: 'Event beds', cats: [{ id: 'turbidite', name: 'Turbidite', color: '#aa7733' }] },
    { id: 'oxygen', name: 'Oxygen', cats: [{ id: 'low', name: 'Low oxygen', color: '#559944' }] },
  ], intervals: [
    ['climate', 'cold', 1, 4], ['climate', 'warm', 6, 9], ['beds', 'turbidite', 3, 6], ['oxygen', 'low', 2, 8],
  ].map(([layer, cat, from, to], index) => ({ id: 'shade-' + index, core: core.id, layer, cat, from, to, axis: 'depth' })),
  classifiers: [{ id: 'shade-model', name: 'Climate model', method: 'knn', targets: ['climate'], features: ['Ca'], layers: [], minProb: 0, params: { knn: { k: 1 } } }] };
  fixture.geo.intervals.push({ id: 'other-cold', core: 'shade-other', layer: 'climate', cat: 'cold', from: 1.2, to: 1.6, axis: 'depth' });
  return fixture;
}

/** Verify real source/style controls, nonlinear axes, isolated figures and export/persistence in either build. */
export async function verifyEventShading(browser, url, { screenshots = false } = {}) {
  const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(20000); page.on('pageerror', (error) => errors.push(error.message));
  const change = (selector, value) => page.evaluate((selector, value) => {
    const control = document.querySelector(selector);
    if (!control) throw new Error('Missing event control: ' + selector);
    if (control.type === 'checkbox') control.checked = value; else control.value = String(value);
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
  const click = (selector) => page.evaluate((selector) => document.querySelector(selector).click(), selector);
  const snapshot = () => page.evaluate(() => {
    const I = window.ichantool;
    return JSON.stringify({ cores: I.serialize().cores, geo: I.S.geo, log: I.S.logView,
      samples: I.geoRT.samples, predictions: [...I.geoRT.runs].map(([key, run]) => [key, [...run.byTarget].map(([target, result]) => [target, result.preds])]) });
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async (fixture) => {
      const I = window.ichantool; await I.ready;
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 100;
      const context = canvas.getContext('2d'); context.fillStyle = '#bbbbbb'; context.fillRect(0, 0, 8, 100);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      fixture.cores[0].sections[0].file = { name: 'synthetic.png', type: 'image/png', blob };
      await I.loadProject(fixture);
      I.analyze(I.S.sections[0]); await I.geoTrain(true, 'shade-model');
      document.getElementById('home').hidden = true; I.S.fig.type = 'geolog'; I.setMode('fig');
    }, eventShadingFixture());
    await page.waitForSelector('[data-event-source="auto:shade-model:climate"]');
    const before = await snapshot(), firstTab = await page.evaluate(() => window.ichantool.S.figTab);
    assert.equal(await page.$('#figOut [data-role="event-shading"]'), null);
    const originalCurve = await page.$$eval('#figOut polyline', (curves) => curves.map((curve) => curve.outerHTML));
    await change('[data-event-option="on"]', true);
    for (const source of ['fam:climate', 'fam:beds', 'fam:oxygen', 'auto:shade-model:climate']) await change(`[data-event-source="${source}"]`, true);
    await change('[data-event-opacity="fam:climate"]', 40);
    await change('[data-event-color="fam:climate"][data-event-class="cold"]', '#0055aa');
    await change('[data-event-opacity="fam:beds"]', 25); await change('[data-event-opacity="fam:oxygen"]', 15);
    await page.waitForSelector('#figOut [data-event-source="fam:climate"][fill="#0055aa"][fill-opacity="0.4"]');
    assert.deepEqual(await page.$$eval('#figOut [data-role="event-shading"] rect', (rectangles) => [...new Set(rectangles.map((rect) => rect.dataset.eventSource))]),
      ['fam:climate', 'fam:beds', 'fam:oxygen', 'auto:shade-model:climate']);
    assert.deepEqual(await page.$$eval('#figOut polyline', (curves) => curves.map((curve) => curve.outerHTML)), originalCurve);
    assert.equal(await snapshot(), before);
    await change('[data-fview="axis"]', 'age');
    await page.waitForFunction(() => document.querySelector('#figOut svg')?.textContent.includes('(ka)'));
    const endpoints = await page.$eval('#figOut [data-event-source="fam:climate"][fill="#0055aa"]', (rect) => {
      const clip = document.querySelector('#figOut clipPath[id$="plot"] rect');
      return [(+rect.getAttribute('y') - +clip.getAttribute('y')) / +clip.getAttribute('height'), +rect.getAttribute('height') / +clip.getAttribute('height')];
    });
    assert.ok(Math.abs(endpoints[0] - 2 / 30) < 0.0001 && Math.abs(endpoints[1] - 6 / 30) < 0.0001, 'both event endpoints follow the nonlinear age model');
    await change('[data-event-option="area"]', 'curve');
    await page.waitForSelector('#figOut [data-role="event-shading"][clip-path]');
    assert.equal(await page.$eval('[data-event-panel]', (panel) => panel.scrollWidth <= panel.clientWidth + 1), true, 'controls fit the sidebar');
    await change('[data-event-option="mode"]', 'split');
    await page.waitForFunction(() => new Set([...document.querySelectorAll('#figOut [data-role="event-shading"] rect')].map((rect) => rect.getAttribute('x'))).size === 4);
    await change('[data-event-option="mode"]', 'mix');
    await click('#figTabs [data-ftabadd]');
    const secondTab = await page.evaluate(() => window.ichantool.S.figTab);
    await change('[data-event-opacity="fam:climate"]', 10);
    await page.waitForSelector('#figOut [data-event-source="fam:climate"][fill-opacity="0.1"]');
    await click(`[data-ftab="${firstTab}"] .ftl`);
    await page.waitForSelector('#figOut [data-event-source="fam:climate"][fill-opacity="0.4"]');
    await page.evaluate(async () => { await window.ichantool.saveToDB(); });
    await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async () => { const I = window.ichantool; await I.ready; document.getElementById('home').hidden = true; I.setMode('fig'); });
    await page.waitForSelector('#figOut [data-role="event-shading"][clip-path] [data-event-source="fam:climate"][fill="#0055aa"][fill-opacity="0.4"]');
    assert.equal(await page.$eval('[data-event-option="area"]', (input) => input.value), 'curve');
    await page.evaluate(() => {
      window.__eventExports = []; const createURL = URL.createObjectURL;
      URL.createObjectURL = (blob) => { if (['image/svg+xml', 'image/png'].includes(blob.type)) window.__eventExports.push(blob); return createURL(blob); };
      document.addEventListener('click', (event) => { if (event.target.closest?.('a[download]')) event.preventDefault(); }, true);
    });
    await click('#figSvg'); await click('#figPng');
    await page.waitForFunction(() => window.__eventExports.some((blob) => blob.type === 'image/png'));
    const exported = await page.evaluate(async () => {
      const svg = await window.__eventExports.find((blob) => blob.type === 'image/svg+xml').text();
      const png = window.__eventExports.find((blob) => blob.type === 'image/png'), bitmap = await createImageBitmap(png);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
      const rect = document.querySelector('#figOut [data-event-source="fam:climate"][fill="#0055aa"]');
      const sampleX = 2 * (+rect.getAttribute('x') + 3), sampleY = 2 * (+rect.getAttribute('y') + +rect.getAttribute('height') / 2);
      return { svg, signature: [...new Uint8Array(await png.arrayBuffer()).slice(0, 8)], pixel: [...context.getImageData(sampleX, sampleY, 1, 1).data] };
    });
    assert.match(exported.svg, /fill="#0055aa" fill-opacity="0.4"/);
    assert.match(exported.svg, /Climate · Cold/);
    assert.deepEqual(exported.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.notDeepEqual(exported.pixel, [255, 255, 255, 255], 'the PNG paints the selected event beneath the curve');
    if (screenshots) {
      await writeFile('dist/event-shading-figure.svg', exported.svg);
      const preview = await context.newPage(); await preview.setContent(`<body style="margin:0">${exported.svg}</body>`);
      await (await preview.$('svg')).screenshot({ path: 'dist/event-shading-figure.png' });
      await page.$eval('[data-event-panel]', (panel) => { panel.open = true; });
      const controls = await page.evaluate(() => ({ css: [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n'), html: document.querySelector('[data-event-panel]').outerHTML }));
      await preview.setContent(`<style>${controls.css} aside.side {position:static;width:380px;height:auto;overflow:visible}</style><aside class="side"><div class="body">${controls.html}</div></aside>`);
      await (await preview.$('[data-event-panel]')).screenshot({ path: 'dist/event-shading-controls.png' }); await preview.close();
    }
    await change('#figGeoCore', 'shade-other');
    await page.waitForFunction(() => document.querySelector('#figOut svg')?.textContent.includes('Other numeric core'));
    const otherExtent = await page.$eval('#figOut [data-event-source="fam:climate"][fill="#0055aa"]', (rect) => {
      const clip = document.querySelector('#figOut clipPath[id$="plot"] rect');
      return [(+rect.getAttribute('y') - +clip.getAttribute('y')) / +clip.getAttribute('height'), +rect.getAttribute('height') / +clip.getAttribute('height')];
    });
    assert.ok(Math.abs(otherExtent[0] - 0.2) < 0.0001 && Math.abs(otherExtent[1] - 0.4) < 0.0001, 'numeric-only selected core uses its own intervals, units and age model');
    await change('#figGeoCore', 'taxon-core');
    for (const type of ['core', 'log']) {
      await change('#figType', type);
      await page.waitForFunction(() => !document.querySelector('#figOut [data-role="event-shading"]'));
      await change('[data-event-option="on"]', true); await change('[data-event-source="fam:beds"]', true);
      await page.waitForSelector('#figOut [data-event-source="fam:beds"]');
      await change('[data-event-opacity="fam:beds"]', 65);
      await page.waitForSelector('#figOut [data-event-source="fam:beds"][fill-opacity="0.65"]');
      await click('#figCompositionReset');
      await page.waitForFunction(() => !document.querySelector('#figOut [data-role="event-shading"]'));
    }
    await change('#figType', 'geolog');
    await page.waitForSelector('#figOut [data-event-source="fam:climate"][fill="#0055aa"][fill-opacity="0.4"]');
    await click('[data-event-reset="fam:climate"]');
    await page.waitForSelector('#figOut [data-event-source="fam:climate"][fill="#3399cc"]');
    await change('[data-event-option="on"]', false);
    await page.waitForFunction(() => !document.querySelector('#figOut [data-role="event-shading"]'));
    await click(`[data-ftab="${secondTab}"] .ftl`);
    await page.waitForSelector('#figOut [data-event-source="fam:climate"][fill-opacity="0.1"]');
    await click('#figGeoCompositionReset');
    await page.waitForFunction(() => !document.querySelector('#figOut [data-role="event-shading"]'));
    await page.evaluate(() => {
      const I = window.ichantool;
      I.S.geo.view.shade = true; I.S.geo.view.shadeBy = ['climate', 'beds']; I.S.geo.view.shadeMode = 'split';
      I.setMode('fig');
    });
    await page.waitForSelector('#figOut [data-role="event-shading"] rect[fill-opacity="0.3"]');
    assert.equal(await page.$eval('[data-event-option="on"]', (control) => control.checked), true, 'legacy inherited shading remains enabled');
    await change('[data-event-option="on"]', false);
    await page.waitForFunction(() => !document.querySelector('#figOut [data-role="event-shading"]'));
    assert.equal(await page.evaluate(() => window.ichantool.S.geo.view.shade), true, 'figure changes leave the legacy analysis view unchanged');
    assert.deepEqual(errors, []);
    console.log(`Event shading: four sources, local colours/opacity, nonlinear age, curve clip, split, independent types/tabs, save/reload, reset and SVG/PNG verified (${url}).`);
  } finally { await context.close(); }
}
