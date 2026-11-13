// M8.2.3 measurement tool: lifecycle timings and cleanup of the bundled engine runtime.
//
// Measures, per run and with the same code the desktop program uses (desktop/engine-runtime.js, desktop/engine.js):
//   verify_ms   loadRuntime(): manifest + every runtime/source file hash
//   ready_ms    spawn -> validated protocol hello (EngineClient.start)
//   stop_ms     orderly shutdown until the process has exited and scratch is removed
//   kill_ms     forced process-tree termination of a ready engine until exit
// and checks after each stop/kill that no process started from the runtime directory is left and that the
// private scratch directory is gone. Optional --load N starts N busy Node processes to reproduce loaded conditions.
//
// Usage (from the repository root, after `npm run prepare-runtime` for the current version):
//   node tools/measure_engine_lifecycle.mjs [--runs 6] [--load 0] [--out report.json]
//        [--runtime-dir desktop/runtime] [--source-dir desktop/python]
// It reads only prepared build resources, uses no network and never touches projects. Results are samples on one
// machine: they are not a clean-machine, installer or portable acceptance result.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadRuntime } = require(path.join(root, 'desktop/engine-runtime.js'));
const { EngineClient } = require(path.join(root, 'desktop/engine.js'));

function options(argv) {
  const values = { runs: '6', load: '0', out: '', 'runtime-dir': path.join(root, 'desktop/runtime'), 'source-dir': path.join(root, 'desktop/python') };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    if (!(key in values) || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[index]}`);
    values[key] = argv[index + 1];
  }
  const runs = Number(values.runs), load = Number(values.load);
  if (!Number.isInteger(runs) || runs < 1 || runs > 100 || !Number.isInteger(load) || load < 0 || load > 256) throw new Error('--runs must be 1..100 and --load 0..256');
  return { runs, load, out: values.out, runtimeDirectory: path.resolve(values['runtime-dir']), sourceDirectory: path.resolve(values['source-dir']) };
}

/** Processes whose executable lives under `directory`, with working set in bytes (Windows) or RSS (POSIX). */
function runtimeProcesses(directory) {
  const prefix = path.resolve(directory).toLowerCase();
  if (process.platform === 'win32') {
    const script = 'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { "$($_.ProcessId)|$($_.WorkingSetSize)|$($_.ExecutablePath)" }';
    const text = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
    return text.split(/\r?\n/).filter(Boolean).map((line) => line.split('|')).filter(([, , file]) => file.toLowerCase().startsWith(prefix))
      .map(([pid, bytes, file]) => ({ pid: Number(pid), bytes: Number(bytes), file }));
  }
  const text = execFileSync('ps', ['-axo', 'pid=,rss=,comm='], { encoding: 'utf8' });
  return text.split('\n').map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .filter((match) => match[3].toLowerCase().startsWith(prefix)).map((match) => ({ pid: Number(match[1]), bytes: Number(match[2]) * 1024, file: match[3] }));
}

const scratchDirectories = () => fs.readdirSync(os.tmpdir()).filter((name) => /^sedcoretool-engine-[a-zA-Z0-9]+$/.test(name));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait up to `limitMs` for leftovers to vanish; report what remains so a slow reaper is distinguishable from a leak. */
async function leftovers(directory, before, limitMs = 5000) {
  const started = performance.now();
  for (;;) {
    const processes = runtimeProcesses(directory), scratch = scratchDirectories().filter((name) => !before.has(name));
    if ((!processes.length && !scratch.length) || performance.now() - started >= limitMs) {
      return { processes: processes.length, scratch: scratch.length, settle_ms: round(performance.now() - started) };
    }
    await sleep(50);
  }
}

const round = (value) => Math.round(value * 100) / 100;
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, min: round(sorted[0]), median: round(median), p95_nearest_rank: round(sorted[Math.ceil(0.95 * n) - 1]), max: round(sorted[n - 1]) };
}

function startLoad(count) {
  const workers = Array.from({ length: count }, () => spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore', windowsHide: true }));
  return () => workers.forEach((worker) => worker.kill());
}

async function oneRun(config, lock, index) {
  const before = new Set(scratchDirectories()), record = { run: index + 1 };
  let t = performance.now();
  const runtime = await loadRuntime({ runtimeDirectory: config.runtimeDirectory, sourceDirectory: path.join(config.sourceDirectory, 'src'), lockPath: lock.path, version: lock.version });
  record.verify_ms = round(performance.now() - t);
  for (const mode of ['stop', 'kill']) {
    const client = new EngineClient({ executable: runtime.executable, script: runtime.script, version: lock.version, runtimeId: runtime.runtimeId });
    t = performance.now();
    try { await client.start(); } catch (error) {
      // A failed start is a result (for example the 5 s handshake deadline under load), not a tool error.
      record[`${mode}_start_failed`] = { code: error?.code || 'ERROR', after_ms: round(performance.now() - t) };
      await client.exited; record[`${mode}_leftovers`] = await leftovers(config.runtimeDirectory, before); continue;
    }
    if (mode === 'stop') record.ready_ms = round(performance.now() - t);
    else record.ready_kill_case_ms = round(performance.now() - t);
    if (mode === 'stop') record.idle_engine_bytes = runtimeProcesses(config.runtimeDirectory).reduce((sum, item) => sum + item.bytes, 0);
    const exited = client.exited;
    t = performance.now();
    if (mode === 'stop') { await client.stop(); record.stop_ms = round(performance.now() - t); }
    else { client.fail(client.child); await exited; record.kill_ms = round(performance.now() - t); }
    record[`${mode}_leftovers`] = await leftovers(config.runtimeDirectory, before);
  }
  return record;
}

const config = options(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8'));
const lock = { path: path.join(root, 'desktop/runtime-lock.json'), version: pkg.version };
const target = `${process.platform}-${process.arch}`;
const manifestBytes = fs.readFileSync(path.join(config.runtimeDirectory, target, 'manifest.json'));
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;

const stopLoad = config.load ? startLoad(config.load) : () => {};
const runs = [];
try {
  if (config.load) await sleep(1000);
  const warmup = await oneRun(config, lock, -1); // one unrecorded warm-up, as in the M0.1 method
  for (let index = 0; index < config.runs; index += 1) runs.push(await oneRun(config, lock, index));
  void warmup;
} finally { stopLoad(); }

const column = (name) => runs.map((run) => run[name]).filter((value) => value !== undefined);
const failedStarts = runs.filter((run) => run.stop_start_failed || run.kill_start_failed).length;
const report = {
  schema: 1, tool: 'tools/measure_engine_lifecycle.mjs', date: new Date().toISOString().slice(0, 10),
  source: { commit, working_tree_dirty: dirty, application_version: pkg.version },
  environment: { platform: `${process.platform}-${process.arch}`, os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, logical_cpus: os.cpus().length,
    total_memory_bytes: os.totalmem(), node: process.versions.node },
  runtime_manifest_sha256: createHash('sha256').update(manifestBytes).digest('hex'),
  conditions: { busy_processes: config.load, warmup_runs: 1, measured_runs: config.runs, note: 'File-system cache is warm after the warm-up; cold-cache and clean-machine timings are not measured here.' },
  failed_start_runs: failedStarts,
  summary: Object.fromEntries(['verify_ms', 'ready_ms', 'stop_ms', 'kill_ms'].filter((name) => column(name).length).map((name) => [name, summary(column(name))])),
  idle_engine_bytes: column('idle_engine_bytes').length ? summary(column('idle_engine_bytes')) : null,
  leftover_runs: runs.filter((run) => ['stop_leftovers', 'kill_leftovers'].some((key) => run[key]?.processes || run[key]?.scratch)).length,
  runs,
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (config.out) fs.writeFileSync(path.resolve(config.out), text);
process.stdout.write(text);
