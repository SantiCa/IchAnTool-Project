// Browser half of benchmark.py. Each invocation owns a disposable Chromium profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const [action, url, profile, executablePath, caseId, fixture] = process.argv.slice(2);
const projectId = caseId === 'u1385' ? 'test-u1385' : 'benchmark-synthetic';
const launcher = 'Benchmark launcher';
const timeout = 120_000;
const browser = await puppeteer.launch({
  executablePath, userDataDir: profile, headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});
const errors = [];

try {
  const [page] = await browser.pages();
  page.setDefaultTimeout(timeout);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.goto(url, { waitUntil: 'networkidle0', timeout });
  let result;
  if (action === 'prepare') {
    await prepare(page);
    result = {
      chrome: await browser.version(), node: process.version,
      puppeteer: createRequire(import.meta.url)('puppeteer-core/package.json').version,
    };
  } else {
    assert.equal(action, 'measure');
    result = await measure(page);
  }
  assert.deepEqual(errors, [], 'Application errors');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}

async function prepare(page) {
  await page.waitForFunction(() => document.querySelector('#projList .pempty'));
  if (caseId === 'u1385') {
    await page.click('details:has(#openTest) > summary');
    await page.waitForSelector('#openTest', { visible: true });
    await page.click('#openTest');
  } else {
    const input = await page.$('#impProj');
    await input.uploadFile(fixture);
  }
  await waitForProject(page, projectId);
  // Set the same shared analysis settings through the ordinary form before making the seed profile.
  await page.evaluate(() => {
    const input = document.querySelector('#binCm');
    input.value = '2';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitForProject(page, projectId);
  await page.$eval('#projBtn', (button) => button.click());
  await page.waitForSelector('#newProjOpen', { visible: true });
  await page.evaluate((name) => {
    document.querySelector('#newProjOpen').click();
    document.querySelector('#newProjName').value = name;
    // Run the app's click handler without a second, native form submission.
    document.querySelector('#newProjBtn').dispatchEvent(new Event('click'));
  }, launcher);
  await page.waitForFunction((name) => window.ichantool.S.name === name &&
    document.querySelector('#saveState').dataset.state === 'saved' && document.querySelector('#home').hidden, {}, launcher);
}

async function waitForProject(page, id, timed = false) {
  const ready = await page.waitForFunction((expected, measure) => {
    const S = window.ichantool?.S, section = S?.sections[0];
    const open = S?.id === expected && section?.enh && section.objects.size > 0 &&
      document.querySelector('#busy').hidden && document.querySelector('#saveState').dataset.state === 'saved';
    return open && (measure ? performance.now() - window.benchmarkOpenStart : true);
  }, {}, id, timed);
  const result = await ready.jsonValue();
  await ready.dispose();
  return result;
}

async function measure(page) {
  const button = `#projList [data-id="${projectId}"] [data-act="open"]`;
  await page.waitForSelector(button, { visible: true });
  await page.waitForFunction((name) => window.ichantool.S.name === name &&
    document.querySelector('#busy').hidden, {}, launcher);
  await page.evaluate((selector) => {
    window.benchmarkOpenStart = performance.now();
    document.querySelector(selector).click();
  }, button);
  const openMs = await waitForProject(page, projectId, true);

  const edit = await page.evaluate((sectionCount) => {
    const { S } = window.ichantool, s = S.sections[0];
    if (S.sections.length !== sectionCount || S.sections.some((section) => !section.objects.size)) {
      throw new Error('Prepared project is missing sections or trace masks');
    }
    const id = Math.min(...s.objects.keys()), bbox = s.objects.get(id).bbox;
    if (!bbox || S.cur !== 0) throw new Error('The fixture must open on an editable first section');
    S.selected = id;
    const status = document.querySelector('#saveState');
    const start = performance.now();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    if (s.objects.has(id) || status.dataset.state !== 'dirty') throw new Error('Delete did not dirty the project');
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (status.dataset.state === 'saved' || status.dataset.state === 'error') {
          observer.disconnect();
          clearTimeout(timer);
          if (status.dataset.state === 'error') reject(new Error('Autosave failed'));
          else resolve({ id, bbox, count: s.objects.size, saveMs: performance.now() - start });
        }
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Autosave did not complete'));
      }, 120_000);
      observer.observe(status, { attributes: true, attributeFilter: ['data-state'] });
    });
  }, caseId === 'u1385' ? 6 : 8);

  const analysis = await page.evaluate(() => {
    const { S, analyze } = window.ichantool;
    if (S.settings.noDataPad !== 0 || S.settings.binCm !== 2 || S.settings.minValid !== 20) {
      throw new Error('Unexpected analysis settings');
    }
    // Match the Python boundary: resident masks, then full interval computation with cold row counts.
    for (const s of S.sections) {
      if (s.labels.length !== s.w * s.h || s.exclude.length !== s.w * s.h) throw new Error('Invalid masks');
      delete s._rc;
    }
    if (S.sections.some((s) => !s._mk.labels.loaded() || !s._mk.exclude.loaded())) {
      throw new Error('Fixture exceeds the resident mask budget');
    }
    const start = performance.now();
    for (const s of S.sections) analyze(s);
    const analysisMs = performance.now() - start;
    return {
      analysisMs,
      bins: S.sections.map((s) => s.bins.map((b) => [
        b.dTop, b.dBottom, b.depth, (100 * b.valid) / ((b.r1 - b.r0) * (s.roi.x1 - s.roi.x0)),
        b.pct, ...b.classPct, b.BI, b.ii,
      ])),
    };
  });

  await page.reload({ waitUntil: 'domcontentloaded', timeout });
  await waitForProject(page, projectId);
  const snapshot = await page.evaluate(async ({ id, bbox, count, includeMasks }) => {
    const { hasId } = await import('./js/core.js');
    const { effClassArray } = await import('./js/app.js');
    const { S, serialize } = window.ichantool, s = S.sections[0];
    if (s.objects.size !== count || s.objects.has(id)) throw new Error('Deleted trace returned after reload');
    const [x0, y0, x1, y1] = bbox;
    const labels = s.labels;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (hasId(labels[y * s.w + x], id, s.stacks)) throw new Error('Deleted trace pixels returned after reload');
    }
    if (!includeMasks) return null;
    const packed = serialize().cores[0].sections;
    return {
      classes: S.classes.map((c) => c.id),
      settings: { binCm: S.settings.binCm, minValid: S.settings.minValid / 100, noDataPad: S.settings.noDataPad },
      sections: packed.map(({ name, w, h, top, bottom, units, roi, filters, detect, labels, exclude, stacks, objects }, i) => ({
        name, w, h, top, bottom, units, roi, filters, detect, labels, exclude, stacks, objectCount: objects.length,
        eff: Array.from(effClassArray(S.sections[i])),
      })),
    };
  }, { ...edit, includeMasks: fixture === 'snapshot' });
  return { openMs, ...edit, ...analysis, snapshot };
}
