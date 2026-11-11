import assert from 'node:assert/strict';

/** Check each completed drawing and its exported SVG, including the offline build with inline scripts. */
export async function verifyFigureStyleSafety(page) {
  const measurements = () => page.evaluate(() => JSON.stringify(window.ichantool.S.cores.map((core) =>
    core.sections.map((section) => ({ labels: [...section.labels], exclude: [...section.exclude], bins: section.bins,
      marks: section.marks, classes: [...section.objects.values()].map((object) => [object.id, object.cls]) })))));
  const before = await measurements();
  await page.evaluate(() => {
    const S = window.ichantool.S, F = S.fig;
    const payload = '"><svg data-style-injected="true" onload="window.__xss=1"></svg><g data-value="';
    const style = { ndColor: payload, ndLine: payload, markStroke: payload, bgColor: payload };
    S.logView.style = { ...S.logView.style, ...style };
    for (const view of Object.values(F.views || {})) view.style = { ...view.style, ...style };
    if (F.geoView) F.geoView.style = { ...F.geoView.style, ...style };
    F.markStroke = payload; F.labelColor = payload;
    F.loc = { base: 'vector', gridColor: payload, land: 123, sea: 'red', pointColor: null,
      labelSize: payload, gridWidth: payload, coreLabelSize: payload };
    S.cores.forEach((core, index) => { core.lat = 36 + index; core.lon = -8 + index; });
    Object.assign(S.geo.map, { mode: 'sites', style: { bg: 'vector', labelSize: payload, bgOpacity: payload } });
    window.__styleSafetyExports = [];
    const createURL = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      if (blob.type === 'image/svg+xml') window.__styleSafetyExports.push(blob);
      return createURL(blob);
    };
    document.getElementById('logSvg').innerHTML = '<span data-render-pending></span>';
    window.ichantool.setMode('log');
  });
  const inspect = () => page.evaluate(() => {
    const roots = [...document.querySelectorAll('#logStyle, #figOpts, #logSvg, #figOut')];
    const elements = roots.flatMap((root) => [root, ...root.querySelectorAll('*')]);
    return {
      injected: elements.filter((element) => element.matches('script, iframe, object, embed, [data-style-injected]')
        || [...element.attributes].some((attribute) => /^on/i.test(attribute.name))).length,
      xss: window.__xss ?? null,
    };
  });
  await page.waitForFunction(() => document.getElementById('busy').hidden
    && !document.querySelector('#logSvg [data-render-pending]') && document.querySelector('#logSvg svg'));
  assert.equal(await page.$eval('#logStyle [data-st="ndColor"]', (input) => input.value), '#f2f2f0');
  assert.equal(await page.$eval('#logStyle [data-st="ndLine"]', (input) => input.value), '#b9bdbb');
  assert.deepEqual(await inspect(), { injected: 0, xss: null }, 'completed core column');

  for (const type of ['core', 'log', 'range', 'sections', 'locmap', 'traces', 'geolog', 'map']) {
    await page.evaluate((type) => {
      window.ichantool.S.fig.type = type;
      document.getElementById('figOut').innerHTML = '<span data-render-pending></span>';
      window.ichantool.setMode('fig');
    }, type);
    // busy() yields before drawing. Require replacement of this sentinel so an old SVG cannot satisfy the check.
    await page.waitForFunction((type) => document.getElementById('busy').hidden
      && document.getElementById('figType').value === type && !document.querySelector('#figOut [data-render-pending]'), {}, type);
    if (type === 'traces') await page.click('#figAuto');
    assert.ok(await page.$('#figOut svg'), `${type}: a completed SVG is required`);
    assert.deepEqual(await inspect(), { injected: 0, xss: null }, `${type}: controls and drawing`);
    const count = await page.evaluate(() => window.__styleSafetyExports.length);
    await page.click('#figSvg');
    await page.waitForFunction((count) => window.__styleSafetyExports.length > count, {}, count);
    const exported = await page.evaluate(async () => {
      const svg = await window.__styleSafetyExports.at(-1).text();
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const elements = [doc.documentElement, ...doc.querySelectorAll('*')];
      return { parseErrors: doc.querySelectorAll('parsererror').length,
        injected: elements.filter((element) => element.matches('script, iframe, object, embed, [data-style-injected]')
          || [...element.attributes].some((attribute) => /^on/i.test(attribute.name))).length };
    });
    assert.deepEqual(exported, { parseErrors: 0, injected: 0 }, `${type}: exported SVG`);
  }
  assert.equal(await measurements(), before, 'presentation validation preserves exact scientific arrays');
}
