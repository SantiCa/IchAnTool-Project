// Compare complete public-core scientific state across two application versions, excluding random section IDs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const [legacyURL, previewURL, executablePath = process.env.CHROME] = process.argv.slice(2);
if (!legacyURL || !previewURL || !executablePath) throw new Error('Usage: node tools/verify_navigation_equivalence.mjs LEGACY_URL PREVIEW_URL CHROME');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
try {
  const legacy = await verify(legacyURL, false), preview = await verify(previewURL, true);
  assert.deepEqual(preview.hashes, legacy.hashes, 'Public-core masks, assignments, intervals or source images differ');
  console.log(JSON.stringify({ kind: 'author correctness verification, separate from performance trials',
    tool_sha256: createHash('sha256').update((await readFile(new URL(import.meta.url), 'utf8')).replaceAll('\r\n', '\n')).digest('hex'),
    excluded_field: 'random section ID only; all sections remain in source order',
    exact_scientific_hashes_equal: true, legacy, preview }, null, 2));
} finally { await browser.close(); }

async function verify(url, preview) {
  const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(120000); page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool);
    if (preview) await page.$eval('#navPreview', (checkbox) => checkbox.click());
    await page.$eval('#openTest', (button) => button.click());
    const ready = () => page.waitForFunction(() => window.ichantool.S.sections.length === 6 && window.ichantool.S.sections[0].enh
      && document.getElementById('busy').hidden && document.getElementById('saveState').dataset.state === 'saved');
    await ready();
    await page.$eval('#binCm', (input) => { input.value = '2'; input.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => window.ichantool.saveToDB()); await ready();
    const initial = await snapshot(page), sectionIDs = await page.evaluate(() => window.ichantool.S.sections.map((s) => s.id));
    await page.evaluate(() => {
      const I = window.ichantool; I.S.selected = Math.min(...I.S.sections[0].objects.keys());
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    const deleted = await snapshot(page);
    assert.notEqual(deleted.science, initial.science, 'Deletion must change the scientific state');
    await page.click('#undoBtn'); assert.deepEqual(await snapshot(page), initial, 'Undo must restore every mask/result');
    await page.click('#redoBtn'); assert.deepEqual(await snapshot(page), deleted, 'Redo must restore the deletion');
    await page.evaluate(() => window.ichantool.saveToDB());
    await page.reload({ waitUntil: 'networkidle0' }); await ready();
    const reloaded = await snapshot(page); assert.deepEqual(reloaded, deleted, 'Reload must preserve the edited state');
    assert.deepEqual(errors, []);
    return { title: await page.title(), section_ids: sectionIDs, hashes: { initial, deleted, reloaded } };
  } finally { await context.close(); }
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const I = window.ichantool, digest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const sections = I.S.sections.map((s) => {
      I.analyze(s);
      return { w: s.w, h: s.h, ds: s.ds, top: s.top, bottom: s.bottom, units: s.units, roi: s.roi,
        labels: s._mk.labels.rle(), exclude: s._mk.exclude.rle(), stacks: s.stacks,
        objects: [...s.objects.values()].sort((a, b) => a.id - b.id).map((o) => [o.id, o.cls, o.pred, o.conf]), bins: s.bins };
    });
    const state = { settings: I.S.settings, sections }, first = I.S.sections[0];
    return { science: await digest(new TextEncoder().encode(JSON.stringify(state))),
      original: await digest(first.orig), enhanced: await digest(first.enh) };
  });
}
