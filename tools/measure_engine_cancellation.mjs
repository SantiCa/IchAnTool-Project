// M8.2.3: transfer, job latency, cancellation and engine-tree memory with the bundled runtime.
//
// The only advertised method is the diagnostic buffer.digest/1, so "real job" here means hashing a large committed
// buffer in the isolated worker. Measured: upload time and throughput, full digest time, control-request latency
// while a digest runs, cancel acknowledgement and terminal-response latency at several points in the job's life
// (running, queued), the state of the session afterwards, and the peak working set of the engine process tree
// (coordinator + worker, sampled every 100 ms; Windows only). Electron's own memory is not part of this tool.
//
// Usage (after `npm run prepare-runtime` for the current version):
//   node tools/measure_engine_cancellation.mjs [--mib 128] [--runs 5] [--out report.json]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadRuntime } = require(path.join(root, 'desktop/engine-runtime.js'));
const { EngineClient } = require(path.join(root, 'desktop/engine.js'));

const argv = process.argv.slice(2);
const option = (name, fallback) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : fallback; };
const mib = Number(option('mib', '128')), runs = Number(option('runs', '5')), out = option('out', '');
if (!Number.isInteger(mib) || mib < 1 || mib > 250 || !Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error('--mib must be 1..250 and --runs 1..50');

const round = (value) => Math.round(value * 100) / 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_CHUNK = 1024 * 1024;
const runtimeDirectory = path.join(root, 'desktop/runtime');

/** Peak working set of processes started from the runtime directory, sampled by a persistent PowerShell loop. */
function startSampler() {
  const prefix = path.resolve(runtimeDirectory).replace(/'/g, "''");
  if (process.platform !== 'win32') return { peak: () => null, stop: () => {}, count: () => 0 };
  const script = `$p='${prefix}'; while($true){ $b=0; Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($p,[StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $b += $_.WorkingSet64 }; "$b"; Start-Sleep -Milliseconds 100 }`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let peak = 0, buffer = '', samples = 0;
  child.stdout.on('data', (bytes) => { buffer += bytes; const lines = buffer.split(/\r?\n/); buffer = lines.pop(); for (const line of lines) { peak = Math.max(peak, Number(line) || 0); samples += 1; } });
  // PowerShell takes about a second to start; measurements must not begin before the first sample arrives.
  const ready = async () => { const deadline = performance.now() + 15000; while (!samples && performance.now() < deadline) await sleep(50); return samples > 0; };
  return { peak: () => peak, reset: () => { peak = 0; }, stop: () => child.kill(), ready, count: () => samples };
}

async function upload(client, data, sha256) {
  const { handle } = await client.request('buffer.begin', { dtype: 'u8', shape: [data.length], byte_length: data.length, sha256 }, null, { timeoutMs: 30000 });
  for (let offset = 0; offset < data.length; offset += MAX_CHUNK) {
    const chunk = data.subarray(offset, offset + MAX_CHUNK);
    await client.request('buffer.chunk', { handle, offset, byte_length: chunk.length }, chunk, { timeoutMs: 30000 });
  }
  await client.request('buffer.commit', { handle }, null, { timeoutMs: 60000 });
  return handle;
}

async function oneRun(client, handle, sampler) {
  const record = {};
  let t = performance.now();
  const digest = await client.request('buffer.digest', { handle }, null, { timeoutMs: 60000 });
  record.digest_ms = round(performance.now() - t);
  record.digest_ok = typeof digest.sha256 === 'string';

  // Control latency while a digest runs: an empty release is a cheap control request.
  const running = client.request('buffer.digest', { handle }, null, { timeoutMs: 60000 });
  await sleep(30);
  t = performance.now(); await client.request('buffer.release', { handles: [] }); record.control_during_job_ms = round(performance.now() - t);
  await running;

  // Cancel a running job shortly after it starts.
  const job = client.request('buffer.digest', { handle }, null, { timeoutMs: 60000 });
  await sleep(50);
  t = performance.now();
  const ack = await client.request('job.cancel', { request_id: job.requestId });
  record.cancel_ack_ms = round(performance.now() - t);
  const outcome = await job;
  record.cancel_terminal_ms = round(performance.now() - t);
  record.cancel_outcome = outcome.cancelled ? 'cancelled' : 'completed_before_cancel';
  record.cancel_state = ack.state;

  // Cancel a queued job behind a running one.
  const first = client.request('buffer.digest', { handle }, null, { timeoutMs: 60000 });
  const second = client.request('buffer.digest', { handle }, null, { timeoutMs: 60000 });
  await sleep(50);
  t = performance.now();
  await client.request('job.cancel', { request_id: second.requestId });
  const queued = await second;
  record.queued_cancel_terminal_ms = round(performance.now() - t);
  record.queued_cancel_outcome = queued.cancelled ? 'cancelled' : 'completed_before_cancel';
  await first;

  record.state_after = client.status().state;
  record.digest_after_cancel_ok = (await client.request('buffer.digest', { handle }, null, { timeoutMs: 60000 })).sha256 === digest.sha256;
  void sampler;
  return record;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8'));
const runtime = await loadRuntime({ runtimeDirectory, sourceDirectory: path.join(root, 'desktop/python/src'), lockPath: path.join(root, 'desktop/runtime-lock.json'), version: pkg.version });
const client = new EngineClient({ executable: runtime.executable, script: runtime.script, version: pkg.version, runtimeId: runtime.runtimeId, timeoutMs: 15000 });
const sampler = startSampler();
const data = randomBytes(mib * 1024 * 1024), sha256 = createHash('sha256').update(data).digest('hex');
const results = []; let upload_ms, upload_peak_bytes, idle_bytes;
try {
  await client.start();
  if (sampler.ready && !(await sampler.ready())) throw new Error('Memory sampler produced no samples');
  await sleep(400); sampler.reset?.(); await sleep(400);
  idle_bytes = sampler.peak();
  sampler.reset?.();
  const t0 = performance.now();
  const handle = await upload(client, data, sha256);
  upload_ms = round(performance.now() - t0); upload_peak_bytes = sampler.peak();
  await oneRun(client, handle, sampler); // unrecorded warm-up
  sampler.reset?.();
  for (let index = 0; index < runs; index += 1) results.push(await oneRun(client, handle, sampler));
} finally { const peak = sampler.peak(); sampler.stop(); await client.stop(); results.peak_bytes = peak; }

const column = (name) => results.map((r) => r[name]).sort((a, b) => a - b);
const stat = (name) => { const v = column(name), n = v.length; return { n, min: v[0], median: n % 2 ? v[(n - 1) / 2] : round((v[n / 2 - 1] + v[n / 2]) / 2), p95_nearest_rank: v[Math.ceil(0.95 * n) - 1], max: v[n - 1] }; };
const report = {
  schema: 1, tool: 'tools/measure_engine_cancellation.mjs', date: new Date().toISOString().slice(0, 10),
  environment: { platform: `${process.platform}-${process.arch}`, os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, logical_cpus: os.cpus().length, node: process.versions.node },
  application_version: pkg.version, buffer_mib: mib, measured_runs: runs,
  upload: { ms: upload_ms, mib_per_second: round(mib / (upload_ms / 1000)), peak_engine_tree_bytes: upload_peak_bytes },
  idle_engine_tree_bytes: idle_bytes, peak_engine_tree_bytes_during_jobs: results.peak_bytes, memory_samples: sampler.count(), memory_sampling: 'sum of working sets of processes under desktop/runtime, every 100 ms, Windows only',
  summary: Object.fromEntries(['digest_ms', 'control_during_job_ms', 'cancel_ack_ms', 'cancel_terminal_ms', 'queued_cancel_terminal_ms'].map((name) => [name, stat(name)])),
  cancel_outcomes: results.map((r) => r.cancel_outcome), queued_cancel_outcomes: results.map((r) => r.queued_cancel_outcome),
  session_ready_after_all: results.every((r) => r.state_after === 'ready'), digest_correct_after_cancel: results.every((r) => r.digest_after_cancel_ok),
  runs: results.map((r) => ({ ...r })),
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (out) fs.writeFileSync(path.resolve(out), text);
process.stdout.write(text);
