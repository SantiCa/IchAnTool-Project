import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import diagnostics from '../../desktop/diagnostics.js';

const { DiagnosticsLog, safeDiagnosticEvent, diagnosticError, DIAGNOSTIC_LIFETIME_MS } = diagnostics;

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'sedcoretool-diagnostics-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const log = new DiagnosticsLog({ directory, version: '0.134.0', ...options });
  await log.ready;
  return { log, directory };
}

test('diagnostic recording starts disabled, persists an opt-in and expires after seven days', async (t) => {
  let now = Date.UTC(2026, 10, 11);
  const { log, directory } = await fixture(t, { now: () => now });
  log.record({ type: 'ui.click', controlId: 'openTest' }); await log.flush();
  assert.equal((await log.status()).bytes, 0);
  await log.setEnabled(true);
  log.record({ type: 'operation.start', operation: 'save', opId: 1 }); await log.flush();
  const restarted = new DiagnosticsLog({ directory, version: '0.134.0', now: () => now });
  await restarted.ready;
  assert.equal(restarted.isEnabled(), true);
  assert.match(await restarted.snapshot(), /operation.start/);
  now += DIAGNOSTIC_LIFETIME_MS + 1;
  const before = (await log.status()).bytes;
  log.record({ type: 'ui.click', controlId: 'openTest' }); await log.flush();
  assert.equal((await log.status()).bytes, before);
  assert.equal(log.isEnabled(), false);
});

test('diagnostic payloads discard project data, paths, text, raw errors and unknown frames', async (t) => {
  const { log } = await fixture(t);
  await log.setEnabled(true);
  log.record({ type: 'renderer.error', controlId: 'saveRetry', errorName: 'NotAllowedError',
    name: 'Private project', value: 'Private typed value', url: 'C:\\Private\\core.png', message: 'Private error text',
    project: { notes: 'Private notes' }, frames: [{ file: 'app.js', line: 3000, column: 2, path: 'C:\\Private' },
      { file: 'Private.js', line: 1, column: 1 }], width: Infinity });
  await log.flush();
  const text = await log.snapshot();
  assert.doesNotMatch(text, /Private|Infinity|core\.png/);
  assert.match(text, /NotAllowedError/); assert.match(text, /app\.js/);
  assert.deepEqual(safeDiagnosticEvent({ type: 'unknown', text: 'never stored' }), null);
  assert.deepEqual(diagnosticError({ name: 'Custom private error', message: 'secret', stack: 'secret\n at x (C:\\private\\app.js:8:9)' }),
    { errorName: 'Error', frames: [{ file: 'app.js', line: 8, column: 9 }] });
});

test('rotating diagnostics keep two bounded files and export a readable versioned log', async (t) => {
  const { log, directory } = await fixture(t, { maxBytes: 640 });
  await log.setEnabled(true);
  for (let i = 0; i < 30; i++) { log.record({ type: 'ui.click', controlId: 'saveRetry', opId: i }); await log.flush(); }
  for (const name of ['current.jsonl', 'previous.jsonl']) assert.ok((await fs.stat(path.join(directory, name))).size <= 640);
  const destination = path.join(directory, 'export.jsonl');
  await log.exportTo(destination);
  const rows = (await fs.readFile(destination, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].format, 'sedcoretool-diagnostics');
  assert.equal(rows[0].version, '0.134.0');
  assert.equal(rows.at(-1).opId, 29);
  assert.ok(rows.length < 31);
});

test('diagnostic event storms have a bounded queue and report dropped events', async (t) => {
  const { log } = await fixture(t);
  await log.setEnabled(true); log.paused = true;
  for (let i = 0; i < 2000; i++) log.record({ type: 'ui.click', controlId: 'saveRetry' });
  assert.equal(log.queue.length, 256);
  log.paused = false; await log.flush();
  const rows = (await log.snapshot()).trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).type, 'log.dropped');
  assert.equal(rows.at(-1).dropped, 1744);
});

test('stopping and clearing diagnostics preserve unrelated files and disable recording after restart', async (t) => {
  const { log, directory } = await fixture(t);
  const project = path.join(directory, 'project.json'); await fs.writeFile(project, 'untouched');
  await log.setEnabled(true); await log.setEnabled(false);
  const size = (await log.status()).bytes;
  log.record({ type: 'ui.click', controlId: 'saveRetry' }); await log.flush();
  assert.equal((await log.status()).bytes, size);
  const restarted = new DiagnosticsLog({ directory, version: '0.134.0' }); await restarted.ready;
  assert.equal(restarted.isEnabled(), false);
  await log.clear();
  assert.deepEqual(await fs.readdir(directory), ['project.json']);
  assert.equal(await fs.readFile(project, 'utf8'), 'untouched');
});

test('diagnostic write failures disable recording without rejecting application events', async (t) => {
  const io = { ...fs, appendFile: async () => { throw Object.assign(new Error('private path'), { code: 'ENOSPC' }); } };
  const { log } = await fixture(t, { io });
  const status = await log.setEnabled(true);
  assert.equal(status.failed, true); assert.equal(status.enabled, false);
  assert.doesNotThrow(() => log.record({ type: 'operation.start', operation: 'save' }));
  assert.doesNotMatch(await log.snapshot(), /private path/);
});

test('oversized or corrupt activation state cannot enable diagnostics', async (t) => {
  const { directory } = await fixture(t);
  for (const text of ['{broken', 'x'.repeat(5000), JSON.stringify({ schema: 1, until: Date.now() + 100 * DIAGNOSTIC_LIFETIME_MS })]) {
    await fs.writeFile(path.join(directory, 'state.json'), text);
    const log = new DiagnosticsLog({ directory, version: '0.134.0' }); await log.ready;
    assert.equal(log.isEnabled(), false);
  }
});

test('a failed diagnostic export preserves the previous destination and cleans its temporary file', async (t) => {
  const { log, directory } = await fixture(t);
  await log.setEnabled(true);
  const destination = path.join(directory, 'export.jsonl'); await fs.writeFile(destination, 'previous export');
  log.io = { ...fs, rename: async () => { throw new Error('Controlled replacement failure'); } };
  await assert.rejects(log.exportTo(destination), /Controlled replacement failure/);
  assert.equal(await fs.readFile(destination, 'utf8'), 'previous export');
  assert.equal((await fs.readdir(directory)).some((name) => name.endsWith('.tmp')), false);
});

test('an oversized diagnostic file is rejected without replacing the export destination', async (t) => {
  const { log, directory } = await fixture(t, { maxBytes: 640 });
  await fs.writeFile(log.current, 'x'.repeat(641));
  const destination = path.join(directory, 'export.jsonl'); await fs.writeFile(destination, 'previous export');
  await assert.rejects(log.exportTo(destination), /Oversized diagnostic file/);
  assert.equal(await fs.readFile(destination, 'utf8'), 'previous export');
});
