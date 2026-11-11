import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const canary = 'PRIVATE_DIAGNOSTIC_CANARY';
const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

async function diagnosticText(profile) {
  return (await Promise.all(['previous.jsonl', 'current.jsonl'].map((name) => readFile(path.join(profile, 'diagnostics', name), 'utf8').catch(() => '')))).join('');
}

async function waitForEvent(profile, type) {
  for (let i = 0; i < 120; i++) { if ((await diagnosticText(profile)).includes(`"type":"${type}"`)) return; await pause(); }
  throw new Error('Diagnostic event missing: ' + type);
}

export async function startDesktopDiagnosticCheck(page, profile) {
  await page.waitForSelector('#diagBox:not([hidden])');
  assert.equal(await page.$eval('#diagEnabled', (element) => element.checked), false);
  assert.equal((await page.evaluate(() => window.corantoolDesktop.diagnostics.status())).bytes, 0);
  await page.evaluate(() => { document.getElementById('diagBox').open = true; });
  await page.click('#diagEnabled');
  await page.waitForFunction(() => !document.getElementById('diagIndicator').hidden);
  await page.click('#newProjOpen'); await page.type('#newProjName', canary); await page.click('#newProjBtn');
  await page.waitForFunction(() => window.ichantool.S.id && document.getElementById('saveState').dataset.state === 'saved');
  await page.evaluate(async (canary) => {
    window.ichantool.S.notes = canary;
    const { markDirty } = await import('./js/app.js'); markDirty(); await window.ichantool.saveToDB();
    const error = new TypeError(canary + ' C:\\Private\\core.png');
    error.stack = `TypeError: ${canary}\n at save (app://corantool/app/js/app.js:3016:2)`;
    window.dispatchEvent(new ErrorEvent('error', { error }));
    await window.ichantool.showHome();
  }, canary);
  await waitForEvent(profile, 'renderer.error');
  assert.doesNotMatch(await diagnosticText(profile), /PRIVATE_DIAGNOSTIC_CANARY|Private|core\.png|app:\/\//);

  await page.goto('data:text/html,<html>Diagnostic origin check</html>');
  const rejected = await page.evaluate(async () => {
    if (!window.corantoolDesktop?.diagnostics) return true;
    try { await window.corantoolDesktop.diagnostics.setEnabled(false); return false; }
    catch (error) { return error.message.includes('forbidden'); }
  });
  assert.equal(rejected, true, 'foreign navigation cannot control diagnostics through the preload');
  await page.goto('app://corantool/app/index.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.ichantool && !document.getElementById('diagIndicator').hidden);

}

export async function crashDesktopDiagnosticCheck(page, profile) {
  page.once('error', () => {}); // This renderer failure is deliberately injected.
  const connection = await page.createCDPSession();
  await Promise.race([connection.send('Page.crash').catch(() => {}), pause()]);
  await waitForEvent(profile, 'renderer.gone');
}

export async function finishDesktopDiagnosticCheck(page, profile) {
  await page.waitForSelector('#diagBox:not([hidden])');
  assert.equal((await page.evaluate(() => window.corantoolDesktop.diagnostics.status())).enabled, true, 'opt-in survives a full restart');
  await page.evaluate(async () => {
    await window.ichantool.showHome(); document.getElementById('diagBox').open = true;
    document.getElementById('diagExport').click();
  });
  const destination = path.join(profile, 'diagnostic-export.jsonl');
  for (let i = 0; i < 120; i++) { if (await stat(destination).then(() => true).catch(() => false)) break; await pause(); }
  const text = await readFile(destination, 'utf8'), rows = text.trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].format, 'sedcoretool-diagnostics');
  for (const type of ['ui.click', 'operation.start', 'operation.end', 'renderer.error', 'renderer.gone', 'renderer.heartbeat']) assert.ok(rows.some((row) => row.type === type), type);
  assert.ok(new Set(rows.filter((row) => row.session).map((row) => row.session)).size >= 2, 'events from both process sessions survive');
  assert.doesNotMatch(text, /PRIVATE_DIAGNOSTIC_CANARY|Private|core\.png|app:\/\//);
  await page.waitForFunction(() => !document.getElementById('diagEnabled').disabled);
  await page.click('#diagEnabled');
  await page.waitForFunction(() => document.getElementById('diagIndicator').hidden && !document.getElementById('diagEnabled').disabled);
  const before = (await page.evaluate(() => window.corantoolDesktop.diagnostics.status())).bytes;
  await page.click('#newProjOpen'); await pause();
  assert.equal((await page.evaluate(() => window.corantoolDesktop.diagnostics.status())).bytes, before, 'stopped diagnostics record no further actions');
  await page.click('#diagClear');
  await page.waitForFunction(() => document.getElementById('diagClear').disabled && !document.getElementById('diagEnabled').disabled);
  assert.equal((await page.evaluate(() => window.corantoolDesktop.diagnostics.status())).bytes, 0);
  console.log('Desktop diagnostics: opt-in, redaction, origin checks, actual renderer crash, restart, export, stop and clear verified.');
}
