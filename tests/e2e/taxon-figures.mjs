import assert from 'node:assert/strict';
import { objectStats, DEFAULT_FILTERS, DEFAULT_DETECT } from '../../app/js/imageproc.js';
import { rleEncode } from '../../app/js/core.js';

function taxonFigureFixture() {
  const width = 8, height = 100, labels = new Int32Array(width * height), rgba = new Uint8ClampedArray(width * height * 4).fill(180);
  for (let y = 10; y < 30; y++) for (let x = 0; x < 4; x++) labels[y * width + x] = 1;
  for (let y = 40; y < 60; y++) for (let x = 4; x < 8; x++) labels[y * width + x] = 2;
  const stats = objectStats(labels, width, height, rgba);
  return { app: 'SedCoreTool', kind: 'project', version: 5, id: 'taxon-figures', name: 'Synthetic ichnotaxa',
    classes: [{ id: 'ch', name: 'Chondrites', color: '#126682', counts: true, symbol: 'circle' },
      { id: 'pl', name: 'Planolites', color: '#d46b28', counts: true, symbol: 'diamond' },
      { id: 'zo', name: 'Zoophycos', color: '#386a39', counts: true, symbol: 'tri' }],
    settings: { binCm: 1, minValid: 20, tips: false, idMode: false },
    cores: [{ id: 'taxon-core', name: 'Synthetic core', units: 'cm', age: { text: '0, 0\n10, 20', units: 'ka' },
      logView: { height: 500, tracks: { image: false, total: true, species: true, BI: false, ii: false, manual: false, marks: false } },
      sections: [{ id: 'taxon-section', name: 'Synthetic section', w: width, h: height, ds: 1, top: 0, bottom: 10, units: 'cm',
        roi: { x0: 0, x1: width, y0: 0, y1: height }, filters: DEFAULT_FILTERS, detect: DEFAULT_DETECT, nextId: 3,
        labels: rleEncode(labels), exclude: [0, width * height],
        objects: [1, 2].map((id) => ({ id, cls: id === 1 ? 'ch' : 'pl', src: 'draw', st: stats.get(id) })),
        marks: [{ id: 1, x: 4, y: 75, cls: 'ch' }, { id: 2, x: 4, y: 85, cls: 'zo' }],
      }] }] };
}

/** Runs against the served app or the standalone file; browser-side helpers use no module imports. */
export async function verifyTaxonFigures(browser, url, { screenshots = false } = {}) {
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  const history = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const setOption = async (scope, key, value) => {
    const selector = `[data-taxa-scope="${scope}"] [data-taxa="${key}"]`;
    history.push(await page.evaluate((selector, next) => {
      const element = document.querySelector(selector);
      if (element.type === 'checkbox') element.checked = next;
      else element.value = String(next);
      const input = { field: element.dataset.taxa, type: element.type, value: element.value, connected: element.isConnected, panel: !!element.closest('#figPanel') };
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { ...input, settings: window.ichantool.S.fig.taxaStyles, column: window.ichantool.S.logView.style?.taxa };
    }, selector, value));
  };
  const snapshot = () => page.evaluate(() => {
    const I = window.ichantool;
    return JSON.stringify(I.S.sections.map((section) => {
      I.analyze(section);
      return { labels: [...section.labels], exclude: [...section.exclude], marks: section.marks,
        assignments: [...section.objects.values()].map((object) => [object.id, object.cls]), bins: section.bins };
    }));
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async (fixture) => {
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 100;
      const context = canvas.getContext('2d'); context.fillStyle = '#b4b4b4'; context.fillRect(0, 0, 8, 100);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      fixture.cores[0].sections[0].file = { name: 'synthetic.png', type: 'image/png', blob };
      const I = window.ichantool; await I.loadProject(fixture);
      document.getElementById('home').hidden = true;
      I.S.fig.type = 'core'; I.S.fig.coreH = 500; I.setMode('fig');
    }, taxonFigureFixture());
    await page.waitForSelector('#figOut svg');
    const original = await snapshot();
    assert.equal(await page.evaluate(() => window.ichantool.S.fig.taxaStyles == null), true);
    const coreTab = await page.evaluate(() => window.ichantool.S.figTab);
    await setOption('figure', 'abundance', 'kite');
    await setOption('figure', 'opacity', 40);
    await setOption('figure', 'occurrence', 'names');
    await setOption('figure', 'source', 'marks');
    await setOption('figure', 'scale', 'percent');
    await setOption('figure', 'values', true);
    await page.waitForFunction(() => document.querySelector('#figOut [data-role="abundance"] polygon')
      && document.querySelector('#figOut [data-role="percentage"]')
      && document.querySelectorAll('#figOut [data-role="occurrence"]').length === 2);
    assert.equal(await page.$eval('#figOut [data-role="abundance"]', (group) => group.getAttribute('opacity')), '0.4');
    assert.equal(await page.$$eval('#figOut [data-role="occurrence"]', (groups) => groups.every((group) => group.dataset.kind === 'mark' && !group.querySelector('path'))), true);
    assert.equal(await page.$eval('#figOut [data-taxon="Zoophycos"][data-role="abundance"]', (group) => group.children.length), 0);
    if (screenshots) await page.screenshot({ path: 'dist/taxon-core.png' });
    await page.click('#figTabs [data-ftabadd]');
    assert.equal(await page.evaluate(() => window.ichantool.S.figTabs.length), 2);
    await page.select('#figType', 'range');
    assert.equal(await page.evaluate(() => window.ichantool.S.fig.taxaStyles?.range == null), true);
    await setOption('figure', 'abundance', 'bars');
    await setOption('figure', 'occurrence', 'symbols');
    await setOption('figure', 'source', 'all');
    await setOption('figure', 'scale', 'percent');
    await setOption('figure', 'values', true);
    await page.waitForFunction(() => document.querySelector('#figOut [data-role="abundance"] rect')
      && document.querySelectorAll('#figOut [data-role="occurrence"]').length === 4);
    assert.equal(await page.$eval('#figOut [data-role="abundance"]', (group) => group.getAttribute('opacity')), '1');
    assert.equal(await page.$$eval('#figOut [data-role="percentage"]', (labels) => labels.some((label) => label.textContent === '50%')), true);
    await page.evaluate(() => document.querySelector('[data-taxa-scope="figure"] [data-taxa-all="0"]').click());
    await page.waitForFunction(() => !document.querySelector('#figOut [data-role="abundance"]'));
    await page.evaluate(() => document.querySelector('[data-taxa-scope="figure"] [data-taxa-all="1"]').click());
    await page.waitForFunction(() => document.querySelectorAll('#figOut [data-role="occurrence"]').length === 4);
    if (screenshots) await page.screenshot({ path: 'dist/taxon-distribution.png' });
    const rangeTab = await page.evaluate(() => window.ichantool.S.figTab);
    await page.click(`[data-ftab="${coreTab}"] .ftl`);
    await page.waitForFunction(() => document.querySelector('#figOut [data-role="abundance"][opacity="0.4"] polygon'));
    await page.click('#modeLog'); await page.select('#logAxis', 'age');
    await setOption('column', 'abundance', 'none'); await setOption('column', 'occurrence', 'names'); await setOption('column', 'source', 'marks');
    await page.waitForFunction(() => document.querySelector('#logSvg [data-role="occurrence"] title')?.textContent === 'Chondrites: 15');
    await page.click('#modeFig');
    await page.waitForFunction(() => document.querySelector('#figOut [data-role="occurrence"] title')?.textContent === 'Chondrites: 15');
    assert.equal(await page.evaluate(() => window.ichantool.S.fig.taxaStyles.core.opacity), 0.4);
    await page.evaluate(() => {
      window.__taxonExports = [];
      const createURL = URL.createObjectURL;
      URL.createObjectURL = (blob) => { if (['image/svg+xml', 'image/png'].includes(blob.type)) window.__taxonExports.push(blob); return createURL(blob); };
      document.addEventListener('click', (event) => { if (event.target.closest?.('a[download]')) event.preventDefault(); }, true);
    });
    await page.click('#figSvg'); await page.click('#figPng');
    await page.waitForFunction(() => window.__taxonExports.some((blob) => blob.type === 'image/png'));
    const exported = await page.evaluate(async () => {
      const svg = await window.__taxonExports.find((blob) => blob.type === 'image/svg+xml').text();
      const png = window.__taxonExports.find((blob) => blob.type === 'image/png'), image = await createImageBitmap(png);
      return { svg, bytes: [...new Uint8Array(await png.arrayBuffer()).slice(0, 8)], width: image.width, height: image.height };
    });
    assert.match(exported.svg, /data-role="abundance" opacity="0.4"/);
    assert.deepEqual(exported.bytes, [137, 80, 78, 71, 13, 10, 26, 10]); assert.ok(exported.width > 0 && exported.height > 0);
    assert.equal(await snapshot(), original);
    const saved = await page.evaluate(async () => { await window.ichantool.saveToDB(); return window.ichantool.serialize(); });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(async (project) => {
      await window.ichantool.loadProject(project); document.getElementById('home').hidden = true; window.ichantool.setMode('fig');
    }, saved);
    await page.waitForFunction(() => document.querySelector('#figOut [data-role="abundance"][opacity="0.4"] polygon'));
    assert.equal(await snapshot(), original);
    await page.evaluate((id) => document.querySelector(`[data-ftab="${id}"] .ftl`).click(), rangeTab);
    await page.waitForFunction(() => document.querySelector('#figOut [data-role="abundance"][opacity="1"] rect'));
    await page.click('[data-taxa-scope="figure"] [data-taxa-reset]');
    assert.equal(await page.evaluate(() => window.ichantool.S.fig.taxaStyles.range == null), true);
    assert.deepEqual(errors, []);
    console.log('Ichnotaxon figures: shapes, manual names, percentages, independent tabs, depth/age, exact analysis, save/reload and SVG/PNG verified.');
  } catch (error) {
    console.error('Ichnotaxon page errors:', errors);
    console.error('Ichnotaxon control history:', JSON.stringify(history));
    console.error('Ichnotaxon figure state:', JSON.stringify(await page.evaluate(() => ({
      active: window.ichantool.S.figTab, tabs: window.ichantool.S.figTabs.map((tab) => ({ id: tab.id, type: tab.fig.type, taxa: tab.fig.taxaStyles })),
      output: document.getElementById('figOut').innerHTML.slice(0, 500),
      occurrences: document.querySelectorAll('#figOut [data-role="occurrence"]').length,
      polygons: document.querySelectorAll('#figOut [data-role="abundance"] polygon').length,
      percentages: document.querySelectorAll('#figOut [data-role="percentage"]').length,
    }))));
    throw error;
  } finally { await page.close(); }
}
