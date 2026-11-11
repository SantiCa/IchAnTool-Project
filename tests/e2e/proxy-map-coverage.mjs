import assert from 'node:assert/strict';

export function proxyMapFixture() {
  return { app: 'SedCoreTool', kind: 'project', version: 5, id: 'proxy-map-coverage', name: 'Synthetic proxy map',
    cores: [[34, 13], [34, 17], [37, 15]].map(([lat, lon], index) => ({ id: 'map-core-' + index, name: 'Map core ' + index,
      lat, lon, units: 'cm', sections: [], age: { text: '0, 0\n10, 10', units: 'ka' },
      imp: { depth: [0, 5, 10], proxies: { Ca: [[0, 1, 2], [0, 2, 1], [2, 0, 1]][index] } } })),
    geo: { settings: { axis: 'age', step: 1, features: ['Ca'] }, view: { tab: 'map' },
      map: { mode: 'value', feature: 'Ca', a0: 0, a1: 4, idw: false, view: [5, 30, 20, 42], style: { bg: 'vector' },
        interp: { on: false, method: 'tin', radius: 50, hull: true, mask: 'both', res: 30, scale: 'auto' } } },
  };
}

/** Shared control wiring, persistence and exports; no browser-side imports, so it also runs from disk. */
export async function verifyProxyMapCoverage(browser, url, { screenshots = false } = {}) {
  const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(20000); page.on('pageerror', (error) => errors.push(error.message));
  const scientificState = () => page.evaluate(() => JSON.stringify({ cores: window.ichantool.serialize().cores,
    settings: window.ichantool.S.geo.settings, samples: window.ichantool.geoRT.samples }));
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async (fixture) => {
      await window.ichantool.ready;
      await window.ichantool.loadProject(fixture); await window.ichantool.saveToDB();
      document.getElementById('home').hidden = true;
      window.ichantool.setMode('geo');
    }, proxyMapFixture());
    await page.waitForSelector('#gmInterp [data-ip-preset="sea"]');
    await page.waitForFunction(() => document.getElementById('busy').hidden);
    const before = await scientificState();
    await page.evaluate(() => { document.querySelector('#gmInterp details').open = true; });
    await page.click('#gmInterp [data-ip-preset="sea"]');
    await page.waitForFunction(() => window.ichantool.S.geo.map.interp.hull === false && document.querySelectorAll('#geoMapSvg .grid rect').length > 50);
    assert.deepEqual(await page.evaluate(() => {
      const options = window.ichantool.S.geo.map.interp;
      return { on: options.on, method: options.method, radius: options.radius, hull: options.hull, mask: options.mask };
    }), { on: true, method: 'idw', radius: 0, hull: false, mask: 'sea' });
    assert.equal(await scientificState(), before);
    assert.match(await page.$eval('#geoMapSvg svg', (svg) => svg.textContent), /extrapolat|extrapolad/i);
    const extendedCells = await page.$$eval('#geoMapSvg .grid rect', (cells) => cells.length);
    if (screenshots) {
      await (await page.$('#gmInterp')).screenshot({ path: 'dist/proxy-map-controls.png' });
    }
    await page.evaluate(() => {
      window.__mapExports = []; const create = URL.createObjectURL;
      URL.createObjectURL = (blob) => { if (['image/svg+xml', 'image/png'].includes(blob.type)) window.__mapExports.push(blob); return create(blob); };
      document.addEventListener('click', (event) => { if (event.target.closest?.('a[download]')) event.preventDefault(); }, true);
      document.getElementById('gmPngW').value = '1800';
      document.getElementById('gmSvg').click(); document.getElementById('gmPng').click();
    });
    await page.waitForFunction(() => window.__mapExports.some((blob) => blob.type === 'image/png'));
    const exported = await page.evaluate(async () => ({ svg: await window.__mapExports.find((blob) => blob.type === 'image/svg+xml').text(),
      png: [...new Uint8Array(await window.__mapExports.find((blob) => blob.type === 'image/png').arrayBuffer()).slice(0, 8)] }));
    assert.match(exported.svg, /extrapolat|extrapolad/i);
    assert.deepEqual(exported.png, [137, 80, 78, 71, 13, 10, 26, 10]);
    if (screenshots) {
      const preview = await context.newPage();
      await preview.setContent(`<body style="margin:0">${exported.svg}</body>`);
      await (await preview.$('svg')).screenshot({ path: 'dist/proxy-map-coverage.png' });
      await preview.close();
    }
    await page.evaluate(async () => { await window.ichantool.saveToDB(); });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async () => { await window.ichantool.ready; document.getElementById('home').hidden = true; window.ichantool.setMode('geo'); });
    await page.waitForFunction(() => document.querySelectorAll('#geoMapSvg .grid rect').length > 50);
    assert.equal(await page.evaluate(() => window.ichantool.S.geo.map.interp.hull), false);
    assert.equal(await scientificState(), before);
    await page.evaluate(() => {
      document.querySelector('#gmInterp details').open = true;
      const control = document.querySelector('#gmInterp [data-ip="hull"]'); control.checked = true; control.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction((count) => document.querySelectorAll('#geoMapSvg .grid rect').length < count
      && !/extrapolat|extrapolad/i.test(document.getElementById('geoMapSvg').textContent), {}, extendedCells);
    assert.equal(await scientificState(), before);
    await page.evaluate(async () => {
      await window.ichantool.showHome(); document.querySelector('[data-htab="all"]').click();
      const mode = document.getElementById('amMode'); mode.value = 'value'; mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('#amInterp [data-ip-preset="sea"]');
    await page.evaluate(() => { document.querySelector('#amInterp details').open = true; });
    await page.click('#amInterp [data-ip-preset="sea"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ichantool.allInterp') || '{}').hull === false
      && /extrapolat|extrapolad/i.test(document.getElementById('allMap').textContent));
    assert.deepEqual(errors, []);
    console.log(`Proxy map coverage: visible sea, saved options, unchanged data, rollback, both map panels and SVG/PNG verified (${url}).`);
  } finally { await context.close(); }
}
