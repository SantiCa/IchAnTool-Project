// M8.2.3: start-up of a packaged desktop program (portable, installed or unpacked) with the engine experiment on.
//
// Per launch, from process spawn: devtools_ms (browser process listening), window_ms (application page loaded),
// engine_ready_ms (engine.status() reports ready, i.e. self-extraction already done, runtime verified, hello
// validated). Then the program is closed and the tool checks that no process from the package or the engine
// runtime remains. Requires puppeteer-core (`npm i --no-save puppeteer-core@23`). Uses a fresh throwaway profile
// per launch, so no project is read or written. Cold-cache and clean-machine timings are NOT measured: the first
// launch after a build or reboot is reported separately only if you run it that way.
//
// Usage: node tools/measure_packaged_startup.mjs <executable> [--runs 5] [--keep-profile] [--out report.json]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE || 'puppeteer-core');

const argv = process.argv.slice(2), executable = path.resolve(argv[0] || '');
if (!argv[0] || !fs.existsSync(executable)) throw new Error('Usage: node tools/measure_packaged_startup.mjs <executable> [--runs N] [--out file]');
const option = (name, fallback) => { const index = argv.indexOf(`--${name}`); return index > 0 ? argv[index + 1] : fallback; };
const runs = Number(option('runs', '5')), out = option('out', ''), keepProfile = argv.includes('--keep-profile');
if (!Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error('--runs must be 1..50');

const round = (value) => Math.round(value * 100) / 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Windows: processes whose executable name matches the launched file, or whose path is under an engine-runtime folder. */
function related(name) {
  if (process.platform !== 'win32') return [];
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${name}' -or ($_.ExecutablePath -like '*engine-runtime*') } | ForEach-Object { "$($_.ProcessId)|$($_.Name)" }`;
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter(Boolean);
}

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

const extractionFolders =() => fs.readdirSync(os.tmpdir(), { withFileTypes: true })
  .filter((item) => item.isDirectory() && /^[A-Za-z0-9]{27}$/.test(item.name) && fs.existsSync(path.join(os.tmpdir(), item.name, 'resources', 'app.asar'))).map((item) => item.name);

async function launch(index) {
  const extractedBefore = new Set(extractionFolders());
  const profile = sharedProfile || fs.mkdtempSync(path.join(os.tmpdir(), 'sedcoretool-packaged-test-'));
  const env = { ...process.env, SEDCORETOOL_ENGINE_EXPERIMENT: '1', SEDCORETOOL_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.SEDCORETOOL_ENGINE_PYTHON;
  const started = performance.now(), record = { run: index + 1 };
  const port = await freePort();
  const child = spawn(executable, [`--user-data-dir=${path.join(profile, 'data')}`, `--remote-debugging-port=${port}`, '--no-sandbox'], { env, windowsHide: true, stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let stage = 'devtools', browser = null;
  try {
    // A portable launcher extracts and delegates, so its own stdio is not the application's: poll the debugging port.
    const endpoint = await (async () => {
      const deadline = performance.now() + 120000;
      while (performance.now() < deadline) {
        try { return (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(50); }
      }
      throw new Error('No devtools endpoint within 120 s');
    })();
    record.devtools_ms = round(performance.now() - started);
    stage = 'connect';
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
    stage = 'page-target';
    const target = await browser.waitForTarget((t) => t.url().startsWith('app://corantool/app/index.html'), { timeout: 120000 });
    const page = await target.page();
    stage = 'app-loaded';
    await page.waitForFunction(() => !!window.ichantool, { timeout: 120000 });
    record.window_ms = round(performance.now() - started);
    stage = 'engine-ready';
    await page.waitForFunction(async () => ['ready', 'unavailable'].includes((await window.corantoolDesktop.engine.status()).state), { timeout: 120000, polling: 100 });
    record.engine_ready_ms = round(performance.now() - started);
    const status = await page.evaluate(() => window.corantoolDesktop.engine.status());
    record.engine_state = status.state; record.engine_runtime = status.runtime;
    const closing = performance.now();
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await page.close({ runBeforeUnload: true }).catch(() => {});
    const code = await Promise.race([exited, sleep(30000).then(() => 'timeout')]);
    record.exit_code = code; record.close_ms = round(performance.now() - closing);
    browser.disconnect();
  } catch (error) {
    record.error = String(error.message || error).slice(0, 300); record.failed_stage = stage;
    if (browser) {
      // Which pages existed when waiting failed: tells a missing window from a page that never finished loading.
      record.targets_at_failure = browser.targets().map((t) => `${t.type()} ${t.url().slice(0, 80)}`).slice(0, 8);
      browser.disconnect();
    }
    try { child.kill(); } catch { /* already gone */ }
  }
  const name = path.basename(executable);
  const settle = performance.now();
  let left = related(name);
  while (left.length && performance.now() - settle < 10000) { await sleep(250); left = related(name); }
  record.leftover_processes = left.length; record.leftover_settle_ms = round(performance.now() - settle);
  if (left.length) {
    // A program that does not exit is a result. Record it, then remove it so later runs start from a clean state.
    record.leftover_list = left.slice(0, 10);
    if (process.platform === 'win32' && child.pid) { try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* already gone */ } }
    await sleep(1500);
  }
  if (!sharedProfile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { record.profile_not_removed = true; } }
  // A portable executable self-extracts into a temporary folder; report whether it was removed after exit.
  const extracted = extractionFolders().filter((name) => !extractedBefore.has(name));
  record.extraction_folders_left = extracted.length;
  for (const name of extracted) { try { fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* reported above */ } }
  return record;
}

// With --keep-profile every launch reuses one user-data folder, so the runtime-verification record written by the
// first launch is present from the second one on; without it each launch verifies the whole runtime.
const sharedProfile = keepProfile ? fs.mkdtempSync(path.join(os.tmpdir(), 'sedcoretool-packaged-test-')) : null;
const results = [];
for (let index = 0; index < runs; index += 1) results.push(await launch(index));
if (sharedProfile) { try { fs.rmSync(sharedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* temp folder */ } }
const values = (name) => results.map((r) => r[name]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
const stat = (name) => { const v = values(name); return v.length ? { n: v.length, min: v[0], median: v.length % 2 ? v[(v.length - 1) / 2] : round((v[v.length / 2 - 1] + v[v.length / 2]) / 2), max: v[v.length - 1] } : null; };
const report = {
  schema: 1, tool: 'tools/measure_packaged_startup.mjs', date: new Date().toISOString().slice(0, 10),
  executable: { name: path.basename(executable), bytes: fs.statSync(executable).size },
  environment: { platform: `${process.platform}-${process.arch}`, os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, logical_cpus: os.cpus().length, node: process.versions.node },
  profile: keepProfile ? 'one profile kept across launches (verification record reused after launch 1)' : 'fresh profile per launch (full verification every time)',
  runs: results.length, failed_runs: results.filter((r) => r.error || r.engine_state !== 'ready' || r.exit_code !== 0 || r.leftover_processes).length,
  summary: { devtools_ms: stat('devtools_ms'), window_ms: stat('window_ms'), engine_ready_ms: stat('engine_ready_ms'), close_ms: stat('close_ms') },
  first_run: results[0], results, root_commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (out) fs.writeFileSync(path.resolve(out), text);
process.stdout.write(text);
