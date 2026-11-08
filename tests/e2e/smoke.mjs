// V0.42: end-to-end check in a headless Chrome. Needs the repository served (python3 -m http.server 8765) and
// puppeteer-core (npm i --no-save puppeteer-core@23). CHROME = path of Chrome (default /usr/bin/google-chrome).
// Opens the IODP test core, detects, undoes, saves, reloads and compares; fails on any page error.
// V0.49: also compares the web analysis of the idealized core (browser JPEG decoder) with the V2.1 reference CSV.
import puppeteer from 'puppeteer-core';

const URL = process.env.APP_URL || 'http://localhost:8765/app/index.html';
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage(), errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource|simulated quota exceeded/.test(m.text())) errs.push(m.text()); });
p.on('dialog', (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return; await W(500); } throw new Error('timeout: ' + fn); };
const fail = (m) => { console.error('E2E FAIL:', m); process.exitCode = 1; };
try {
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.getElementById('openTest').click());
  await until(() => window.ichantool?.S.sections.length === 6 && window.ichantool.S.sections.every((s) => s.objects.size > 0));
  await until(() => document.getElementById('saveState').dataset.state === 'saved');
  // The column controls change only the drawing and can restore their defaults.
  const ui = await p.evaluate(async () => {
    const I = window.ichantool; I.setMode('log');
    const mark = document.querySelector('#logTracks [data-track="marks"]');
    const initial = mark.checked; mark.checked = false; mark.dispatchEvent(new Event('change', { bubbles: true }));
    const hidden = I.S.logView.tracks.marks === false;
    const color = document.querySelector('#logStyle [data-st="biColor"]');
    color.value = '#123456'; color.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const applied = document.querySelector('#logSvg svg')?.outerHTML.includes('#123456');
    document.querySelector('#logStyle [data-colreset="log"]').click();
    const reset = I.S.logView.style.biColor == null;
    document.querySelector('#logTracks [data-track="marks"]').click(); I.setMode('section');
    return { initial, hidden, applied, reset };
  });
  if (!Object.values(ui).every(Boolean)) fail(`column controls: ${JSON.stringify(ui)}`);
  // A drawing failure must invalidate the previously exportable figure.
  const figureFailure = await p.evaluate(async () => {
    const I = window.ichantool, figures = await import('./js/figures.js');
    I.setMode('log'); I.setMode('fig'); I.S.fig.type = 'log'; figures.renderFigure();
    const hadFigure = !!document.querySelector('#figOut svg');
    const fig = I.S.fig, previous = fig.type, logError = console.error, createURL = URL.createObjectURL;
    let exports = 0; URL.createObjectURL = (...args) => { exports++; return createURL(...args); };
    console.error = () => {};
    try {
      Object.defineProperty(fig, 'type', { configurable: true, get() { throw new Error('simulated drawing failure'); } });
      figures.renderFigure();
      document.getElementById('figSvg').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { hadFigure, errorShown: document.getElementById('figOut').textContent.includes('simulated drawing failure'), exports };
    } finally {
      Object.defineProperty(fig, 'type', { configurable: true, writable: true, enumerable: true, value: previous });
      URL.createObjectURL = createURL; console.error = logError; I.setMode('section');
    }
  });
  if (!figureFailure.hadFigure || !figureFailure.errorShown || figureFailure.exports) fail(`stale figure export: ${JSON.stringify(figureFailure)}`);
  const first = await p.evaluate(() => window.ichantool.S.sections[window.ichantool.S.cur].objects.size);
  await p.evaluate(() => window.ichantool.runDetection()); await W(3000);
  const again = await p.evaluate(() => window.ichantool.S.sections[window.ichantool.S.cur].objects.size);
  if (again !== first) fail(`detection is not repeatable: ${first} → ${again}`);
  // one undoable edit: delete a trace, then undo
  const del = await p.evaluate(() => { const I = window.ichantool, s = I.S.sections[I.S.cur], id = [...s.objects.keys()][0]; I.S.selected = id; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); return [s.objects.size, s.objects.has(id), id]; });
  if (del[1]) fail('delete did not remove the trace');
  await p.evaluate(() => document.getElementById('undoBtn').click()); await W(500);
  const undone = await p.evaluate((id) => window.ichantool.S.sections[window.ichantool.S.cur].objects.has(id), del[2]);
  if (!undone) fail('undo did not restore the trace');
  await p.evaluate(() => window.ichantool.saveToDB()); await W(1500);
  const sig = () => window.ichantool.S.sections.map((s) => `${s.objects.size}:${s.labels.reduce((a, v) => a + (v ? 1 : 0), 0)}`).join(',');
  const before = await p.evaluate(sig);
  await p.reload({ waitUntil: 'networkidle0' });
  await until(() => window.ichantool?.S.sections.length === 6);
  await p.evaluate(async () => { for (const s of window.ichantool.S.sections) void s.labels; });
  const after = await p.evaluate(sig);
  if (before !== after) fail(`saved and reloaded project differs:\n${before}\n${after}`);
  // V0.49: web–V2 comparison with the browser's own JPEG decoder (L < 6, rowCounts, binRows of 150 px). The decoder
  // differs from Pillow's at the edges of the painted traces, so percentages may differ slightly; BI and ii must not.
  const v2 = await p.evaluate(async () => {
    const { rowCounts, binRows } = await import('./js/core.js'), { parseTable } = await import('./js/log.js');
    const img = new Image(); img.src = '../examples/data/idealized_core_0-500cm.jpg'; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, labels = new Int32Array(c.width * c.height);
    for (let i = 0; i < labels.length; i++) labels[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2] < 6 ? 1 : 0;
    const bins = binRows(rowCounts({ labels, width: c.width, roi: { x0: 0, x1: c.width, y0: 0, y1: c.height }, exclude: null, effClass: [-1, 0], nClasses: 1 }), { top: 0, bottom: 500, binPx: 150 });
    const t = parseTable(await (await fetch('../legacy/v2.1_console/example_output.csv')).text()), k = (n) => t.headers.indexOf(n);
    const dp = t.rows.map((r, i) => Math.abs(bins[i].pct - r[k('Bioturbation Percentage')]));
    return { n: t.rows.length, bi: t.rows.filter((r, i) => bins[i].BI === r[k('BI')]).length, ii: t.rows.filter((r, i) => bins[i].ii === r[k('II')]).length,
      depth: Math.max(...t.rows.map((r, i) => Math.abs(bins[i].depth - r[k('Depth')]))), max: Math.max(...dp), mean: dp.reduce((a, v) => a + v, 0) / dp.length };
  });
  if (v2.bi !== v2.n || v2.ii !== v2.n || v2.depth > 1e-9 || v2.max > 0.6) fail(`web–V2 in the browser: BI ${v2.bi}/${v2.n}, ii ${v2.ii}/${v2.n}, depth ${v2.depth}, max Δ% ${v2.max}`);
  console.log(`web–V2 in the browser: ${v2.n} intervals, BI and ii identical, max Δ ${v2.max.toFixed(2)} points, mean ${v2.mean.toFixed(2)}`);
  // Simulate a failed desktop save: the page must remain open with its changes pending.
  const failure = await p.evaluate(async () => {
    const I = window.ichantool; document.getElementById('projClose').click(); I.setMode('section');
    const s = I.S.sections[I.S.cur], id = s.objects.keys().next().value;
    I.S.selected = id; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    if (s.objects.has(id)) throw new Error('failed to create an unsaved edit');
    const tx = IDBDatabase.prototype.transaction, close = window.close, desktop = window.corantoolDesktop, logError = console.error;
    console.error = (error) => { if (error?.message !== 'simulated quota exceeded') logError(error); };
    let closed = false; window.close = () => { closed = true; }; window.corantoolDesktop = {};
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      if (mode === 'readwrite') throw new DOMException('simulated quota exceeded', 'QuotaExceededError');
      return tx.call(this, stores, mode, ...args);
    };
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const dlg = document.querySelector('dialog.saveFail'), result = { closed, state: document.getElementById('saveState').dataset.state, dialog: !!dlg?.open }; dlg?.remove();
    IDBDatabase.prototype.transaction = tx; window.close = close; window.corantoolDesktop = desktop; console.error = logError;
    return result;
  });
  if (failure.closed || failure.state !== 'error' || !failure.dialog) fail(`failed save did not keep the window open and ask: ${JSON.stringify(failure)}`);
  const multiproxy = await p.evaluate(async () => {
    const I = window.ichantool, { normalizeGeo, buildGeoLog } = await import('./js/multiproxy.js');
    const { renderFigPanel, renderFigure, figTabsData, loadFigTabs } = await import('./js/figures.js');
    I.S.geo = normalizeGeo({ classifiers: [{ id: 'smoke-nb', name: 'Smoke classifier', method: 'nb', targets: ['events'] }] });
    I.setMode('geo');
    await I.loadGeoDemo();
    const ready = () => document.querySelector('#geoColumnsForm [data-colshow^="band:auto:"]');
    for (let i = 0; i < 200 && !ready(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    const auto = ready();
    if (!auto) throw new Error('The demo did not draw the automatic classification column');
    const core = I.S.cores.find((c) => c.id === I.S.geo.view.core), id = auto.dataset.colshow;
    const layout = () => buildGeoLog(core).res.layout.map((c) => c.id);
    const original = layout().indexOf(id);
    auto.closest('li').querySelector('[data-colmv="-1"]').click();
    const reordered = layout().indexOf(id) === original - 1;
    auto.click();
    const hidden = !layout().includes(id);
    auto.click();
    const restored = layout().includes(id);
    const feats = document.querySelector('#geoFeats'), numeric = feats.closest('details');
    const expandedHeight = numeric.offsetHeight;
    numeric.querySelector('summary').click();
    const collapsed = !numeric.open && numeric.offsetHeight < expandedHeight;
    numeric.querySelector('summary').click();
    const field = document.querySelector('#geoLabels .name');
    const readableName = field.getBoundingClientRect().width > 100 && field.title === field.value;
    const [a, b] = I.S.geo.settings.features;
    I.S.geo.settings.features = [a];
    I.renderGeo();
    I.setMode('fig'); I.S.fig.type = 'geolog'; renderFigPanel();
    const proxy = (name) => [...document.querySelectorAll('[data-fgeo]')].find((el) => el.dataset.fgeo === name);
    proxy(a).click(); proxy(b).click();
    loadFigTabs(JSON.parse(JSON.stringify(figTabsData())));
    renderFigPanel(); renderFigure();
    const independent = proxy(b).checked && !proxy(a).checked &&
      I.S.geo.settings.features.join() === a && !layout().includes('rec:' + b) &&
      document.querySelector('#figOut svg')?.textContent.includes(b);
    document.getElementById('figGeoReset').click(); renderFigure();
    const follows = proxy(a).checked && !proxy(b).checked;
    return { reordered, hidden, restored, collapsed, readableName, independent, follows };
  });
  if (!Object.values(multiproxy).every(Boolean)) fail(`multiproxy controls: ${JSON.stringify(multiproxy)}`);
  const nameHandle = '#geoLabels .geo-name-handle';
  await p.evaluate(() => window.ichantool.setMode('geo'));
  await until(() => document.getElementById('busy').hidden);
  const beforeDrag = await p.$eval(nameHandle, (handle) => {
    handle.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = handle.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: handle.previousElementSibling.offsetWidth,
      panel: document.getElementById('geoPanel').offsetWidth };
  });
  await p.mouse.move(beforeDrag.x, beforeDrag.y);
  await p.mouse.down();
  await p.mouse.move(beforeDrag.x + 180, beforeDrag.y, { steps: 6 });
  await p.mouse.up();
  const afterDrag = await p.$eval(nameHandle, (handle) => {
    const scroll = handle.closest('.geo-label-scroll');
    return { width: handle.previousElementSibling.offsetWidth, panel: document.getElementById('geoPanel').offsetWidth,
      overflow: scroll.scrollWidth > scroll.clientWidth,
      saved: JSON.parse(localStorage.getItem('ichantool.panels') || '{}').geo?.classNameW };
  });
  if (Math.abs(afterDrag.width - beforeDrag.width - 180) > 1 || afterDrag.panel !== beforeDrag.panel ||
      !afterDrag.overflow || afterDrag.saved !== afterDrag.width) fail(`name column drag: ${JSON.stringify({ beforeDrag, afterDrag })}`);
  await p.click(nameHandle, { clickCount: 2 });
  const resetWidth = await p.$eval(nameHandle, (handle) => handle.previousElementSibling.offsetWidth);
  if (resetWidth !== beforeDrag.width) fail(`name column reset: ${resetWidth} instead of ${beforeDrag.width}`);
  const across = await p.evaluate(async () => {
    const { putLite } = await import('./js/storage.js');
    const id = 'smoke-marker-project';
    await putLite(id, { name: 'Marker smoke test', cores: [
      { id: 'a', name: 'Marker Alpha', lat: 40, lon: -6 }, { id: 'b', name: 'Marker Beta', lat: 41, lon: -5 },
    ] });
    await window.ichantool.showHome();
    document.querySelector('[data-htab="all"]').click();
    const project = document.querySelector(`[data-mp-project="${id}"]`);
    const cores = [...document.querySelectorAll(`[data-p="${id}"] .mpchk`)];
    project.click();
    const selected = cores.length === 2 && cores.every((c) => c.checked);
    cores[0].click();
    const partial = project.indeterminate;
    const change = (id, value) => {
      const el = document.getElementById(id); el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    change('amMode', 'sites');
    for (let i = 0; i < 100 && document.getElementById('amMarkers').hidden; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    change('amMarkerFor', 'project:' + id);
    change('amMarkerColor', '#123456'); change('amMarkerSymbol', 'square');
    change('amMarkerFor', 'ck:markeralpha');
    change('amMarkerColor', '#654321'); change('amMarkerSymbol', 'diamond');
    const shape = (name) => [...document.querySelectorAll('#allMap g[data-tip]')]
      .find((g) => g.dataset.tip.includes(name))?.firstElementChild;
    const styled = shape('Marker Alpha')?.matches('polygon[fill="#654321"]') &&
      shape('Marker Beta')?.matches('rect[fill="#123456"]');
    document.getElementById('amMarkerReset').click();
    const inherited = shape('Marker Alpha')?.matches('rect[fill="#123456"]');
    return { selected, partial, styled, inherited };
  });
  if (!Object.values(across).every(Boolean)) fail(`across-project controls: ${JSON.stringify(across)}`);
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  console.log(process.exitCode ? 'E2E finished with failures' : `E2E ok (${first} traces in the first section; reload identical)`);
} catch (e) { fail(e.message); } finally { await b.close(); }
