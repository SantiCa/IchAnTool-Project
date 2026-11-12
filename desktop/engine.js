// Main-process-only client. Renderer code cannot choose commands, paths or arbitrary engine operations.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { controlFrame, frame, ControlReader } = require('./engine-protocol');

const OPERATIONS = new Set(['hello', 'buffer.begin', 'buffer.chunk', 'buffer.commit', 'buffer.release', 'buffer.digest', 'job.cancel', 'shutdown']);

function unavailable() { return Object.assign(new Error('ENGINE_UNAVAILABLE'), { code: 'ENGINE_UNAVAILABLE' }); }

function terminateTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !Number.isInteger(child.pid)) return;
  if (process.platform === 'win32') {
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

class EngineClient {
  constructor({ executable, script, version, runtimeId, timeoutMs = 5000, captureDiagnostics = false }) {
    if (!path.isAbsolute(executable || '') || !path.isAbsolute(script || '') || !/^[0-9a-f]{64}$/.test(runtimeId || '')) throw unavailable();
    this.options = { executable, script, version, runtimeId, timeoutMs, captureDiagnostics };
    this.child = null; this.state = 'stopped'; this.pending = new Map(); this.queue = []; this.writing = false;
    this.stderr = Buffer.alloc(0); this.handshake = null; this.session = null;
  }
  status() { return { state: this.state, protocol: this.handshake?.protocol || null, methods: this.handshake?.methods || [] }; }
  async start() {
    if (this.state === 'ready') return this.handshake;
    if (this.state === 'starting') return this.starting;
    if (this.child) { terminateTree(this.child); await this.exited; }
    this.state = 'starting'; this.session = randomUUID(); this.stderr = Buffer.alloc(0); this.handshake = null;
    const { executable, script, version, runtimeId } = this.options;
    let scratch;
    try { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sedcoretool-engine-')); }
    catch { this.state = 'unavailable'; throw unavailable(); }
    this.scratchDirectory = scratch;
    const env = { ...process.env }; delete env.PYTHONPATH; delete env.PYTHONHOME;
    const child = spawn(executable, ['-I', '-u', script, '--version', version, '--runtime-id', runtimeId, '--scratch-dir', scratch], {
      env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.exited = new Promise((resolve) => child.once('close', async () => {
      // Only the uniquely created direct child of the temporary root may be removed recursively.
      const absolute = path.resolve(scratch);
      if (path.dirname(absolute) === path.resolve(os.tmpdir()) && /^sedcoretool-engine-[a-zA-Z0-9]+$/.test(path.basename(absolute))) {
        try { await fs.promises.rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
        catch { /* A failed cleanup must not resurrect a failed session. */ }
      }
      resolve();
    }));
    const reader = new ControlReader((value) => this.receive(value));
    child.stdout.on('data', (bytes) => { if (child !== this.child) return; try { reader.push(bytes); } catch { this.fail(child); } });
    child.stdout.on('end', () => { try { reader.end(); } catch { this.fail(child); } });
    child.stderr.on('data', (bytes) => {
      if (this.options.captureDiagnostics && child === this.child) this.stderr = Buffer.concat([this.stderr, bytes]).subarray(-65536);
    });
    child.on('error', () => this.fail(child)); child.stdin.on('error', () => this.fail(child));
    child.on('close', () => {
      if (child !== this.child) return;
      if (this.state !== 'stopping') this.fail(child);
      else this.state = 'stopped';
      this.rejectPending();
      this.child = null;
    });
    this.starting = this.request('hello', { protocol: 1 }).then((result) => {
      if (result.protocol !== 1 || result.engine_version !== version || result.runtime_id !== runtimeId || !Array.isArray(result.methods) || result.methods.some((method) => method !== 'buffer.digest/1')) throw unavailable();
      this.handshake = result; this.state = 'ready'; return result;
    }).catch((error) => { this.fail(child); throw error; });
    return this.starting;
  }
  request(op, payload, binary = null, { timeoutMs = this.options.timeoutMs } = {}) {
    if (!OPERATIONS.has(op) || !this.child || !['starting', 'ready', 'stopping'].includes(this.state)) return Promise.reject(unavailable());
    if (this.pending.size >= 32) return Promise.reject(Object.assign(new Error('BUSY'), { code: 'BUSY' }));
    if (op === 'buffer.chunk' && [...this.pending.values()].filter((item) => item.op === op).length >= 2) return Promise.reject(Object.assign(new Error('BUSY'), { code: 'BUSY' }));
    const id = randomUUID(), request = { v: 1, kind: 'request', session: this.session, id, op, payload };
    let parts;
    try {
      parts = controlFrame(request);
      if (op === 'buffer.chunk') parts.push(...frame(2, binary));
      else if (binary !== null) throw unavailable();
    } catch { return Promise.reject(Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST' })); }
    const promise = new Promise((resolve, reject) => {
      const child = this.child;
      const timer = setTimeout(() => this.fail(child), timeoutMs);
      this.pending.set(id, { resolve, reject, timer, op });
    });
    // Expose only to trusted callers so they can send cancellation for an in-flight diagnostic.
    promise.requestId = id;
    const item = { id, parts };
    if (op === 'job.cancel') {
      const target = this.queue.findIndex((queued) => queued.id === payload.request_id);
      this.queue.splice(target + 1, 0, item);
    } else if (op === 'shutdown') this.queue.unshift(item);
    else this.queue.push(item);
    void this.flush();
    return promise;
  }
  async flush() {
    if (this.writing) return;
    this.writing = true;
    const child = this.child;
    try {
      while (this.queue.length && child === this.child) {
        const { parts } = this.queue.shift();
        for (const part of parts) await new Promise((resolve, reject) => child.stdin.write(part, (error) => error ? reject(error) : resolve()));
      }
    } catch { this.fail(child); }
    finally { this.writing = false; if (this.queue.length && this.child) void this.flush(); }
  }
  receive(value) {
    const pending = this.pending.get(value?.id);
    if (!value || value.v !== 1 || value.kind !== 'response' || value.session !== this.session || !pending || value.op !== pending.op) throw unavailable();
    const fields = ['v', 'kind', 'session', 'id', 'op', 'status', ...(value.status === 'ok' ? ['result'] : value.status === 'error' ? ['error'] : [])];
    if (Object.keys(value).sort().join() !== fields.sort().join() || !['ok', 'error', 'cancelled'].includes(value.status)) throw unavailable();
    if (value.status === 'error' && (!value.error || !['INVALID_REQUEST', 'UNSUPPORTED_METHOD', 'UNSUPPORTED_INPUT', 'INVALID_BUFFER', 'LIMIT_EXCEEDED', 'BUSY', 'INTERNAL'].includes(value.error.code))) throw unavailable();
    clearTimeout(pending.timer); this.pending.delete(value.id);
    if (value.status === 'ok') pending.resolve(value.result);
    else if (value.status === 'cancelled') pending.resolve({ cancelled: true });
    else pending.reject(Object.assign(new Error(value.error.code), { code: value.error.code }));
  }
  fail(child) {
    if (!child || child !== this.child) return;
    this.state = 'unavailable'; this.handshake = null;
    this.rejectPending(); terminateTree(child);
  }
  rejectPending() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable()); }
    this.pending.clear(); this.queue.length = 0;
  }
  async stop() {
    if (!this.child) { this.state = 'stopped'; return; }
    if (this.state === 'ready') {
      this.state = 'stopping';
      try { await this.request('shutdown', {}, null, { timeoutMs: 1500 }); } catch { /* Failure still reaps the process tree. */ }
    }
    const child = this.child;
    let timer;
    try {
      timer = setTimeout(() => terminateTree(child), 1500);
      await this.exited;
    } finally { clearTimeout(timer); this.state = 'stopped'; }
  }
}

function createEngineService({ enabled, packaged, executable, sourceDirectory, version }) {
  let client;
  if (enabled && !packaged && path.isAbsolute(executable || '')) {
    client = new EngineClient({ executable, script: path.join(sourceDirectory, 'src', 'sedcoretool', 'engine', 'server.py'), version,
      runtimeId: require('node:crypto').createHash('sha256').update('unverified-development-runtime').digest('hex') });
  }
  return {
    status: () => ({ enabled, runtime: enabled ? 'unverified-development' : null,
      ...(client ? client.status() : { state: enabled ? 'unavailable' : 'disabled', protocol: null, methods: [] }) }),
    start: async () => { if (client) { try { await client.start(); } catch { /* Status reports the failure; current projects remain owned by the renderer. */ } } },
    stop: async () => { if (client) await client.stop(); },
  };
}

module.exports = { EngineClient, terminateTree, createEngineService };
