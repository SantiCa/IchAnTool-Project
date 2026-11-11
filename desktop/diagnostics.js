// Temporary, opt-in diagnostics. Only allowlisted technical fields can reach disk.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DIAGNOSTIC_LIFETIME_MS = 7 * 86400000;
const DIAGNOSTIC_FILE_BYTES = 2 * 1024 * 1024;
const EVENT_TYPES = new Set(['session.start', 'session.stop', 'ui.click', 'ui.change', 'ui.pointer', 'ui.shortcut',
  'operation.start', 'operation.end', 'operation.error', 'renderer.error', 'renderer.rejection', 'renderer.heartbeat',
  'renderer.unresponsive', 'renderer.responsive', 'renderer.gone', 'renderer.loadFailed', 'process.sample', 'process.error', 'process.gone',
  'window.open', 'window.closed', 'log.dropped']);
const OPERATIONS = new Set(['work', 'detect', 'save', 'backup', 'backup.image', 'backup.manifest', 'backup.history',
  'backup.settings', 'backup.choose', 'backup.reactivate', 'project.load']);
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'DOMException',
  'NotAllowedError', 'NotFoundError', 'NotReadableError', 'QuotaExceededError', 'AbortError', 'DataCloneError',
  'InvalidStateError', 'SecurityError', 'TransactionInactiveError', 'UnknownError', 'NetworkError', 'TimeoutError']);
const CODE_FILES = new Set(['app.js', 'state.js', 'storage.js', 'diagnostics.js', 'core.js', 'columns.js', 'figures.js',
  'geo.js', 'locmap.js', 'multiproxy.js', 'datatab.js', 'imageproc.js', 'edit.js', 'learn.js', 'log.js', 'zip.js',
  'unet.js', 'unetmodel.js', 'vision.js', 'tiff.js', 'tableview.js', 'figview.js', 'navpreview.js', 'exportio.js',
  'sheet.js', 'interp.js', 'plot.js', 'sectiondepth.js', 'panels.js', 'main.js', 'trainer.js', 'model-store.js']);
const REASONS = new Set(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction']);
const NUMBER_FIELDS = ['windowId', 'opId', 'durationMs', 'lagMs', 'silenceMs', 'cores', 'sections', 'width', 'height',
  'objects', 'mainRssBytes', 'workingSetKb', 'rendererWorkingSetKb', 'cpuPercent', 'dropped'];

function diagnosticError(error) {
  const result = { errorName: ERROR_NAMES.has(error?.name) ? error.name : 'Error', frames: [] };
  if (typeof error?.stack !== 'string') return result;
  for (const hit of error.stack.slice(0, 8192).matchAll(/[\\/]([a-zA-Z0-9-]+\.js):(\d+):(\d+)/g)) {
    if (CODE_FILES.has(hit[1])) result.frames.push({ file: hit[1], line: Number(hit[2]), column: Number(hit[3]) });
    if (result.frames.length === 8) break;
  }
  return result;
}

function safeDiagnosticEvent(input) {
  try {
    if (!input || !EVENT_TYPES.has(input.type)) return null;
    const result = { type: input.type };
    if (typeof input.controlId === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(input.controlId)) result.controlId = input.controlId;
    if (OPERATIONS.has(input.operation)) result.operation = input.operation;
    for (const key of NUMBER_FIELDS) if (typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key] >= 0) result[key] = Math.min(input[key], 1e15);
    if (['section', 'log', 'data', 'geo', 'fig', 'home'].includes(input.mode)) result.mode = input.mode;
    if (['select', 'brush', 'erase', 'wand', 'lasso', 'exclude', 'restore', 'scissors', 'mark', 'pan'].includes(input.tool)) result.tool = input.tool;
    if (['off', 'dirty', 'saving', 'saved', 'error'].includes(input.saveState)) result.saveState = input.saveState;
    if (['none', 'ok', 'needs', 'error'].includes(input.backupState)) result.backupState = input.backupState;
    for (const key of ['visible', 'backupPending']) if (typeof input[key] === 'boolean') result[key] = input[key];
    if (['undo', 'redo', 'delete', 'escape'].includes(input.shortcut)) result.shortcut = input.shortcut;
    if (REASONS.has(input.reason)) result.reason = input.reason;
    if (['Browser', 'Tab', 'Utility', 'GPU', 'Zygote', 'Sandbox helper', 'Unknown'].includes(input.processType)) result.processType = input.processType;
    if (Number.isInteger(input.exitCode)) result.exitCode = Math.max(-2147483648, Math.min(2147483647, input.exitCode));
    if (ERROR_NAMES.has(input.errorName)) result.errorName = input.errorName;
    if (Array.isArray(input.frames)) result.frames = input.frames.slice(0, 8).filter((frame) => frame && CODE_FILES.has(frame.file)
      && Number.isInteger(frame.line) && frame.line > 0 && frame.line < 1e7 && Number.isInteger(frame.column) && frame.column >= 0 && frame.column < 1e7)
      .map(({ file, line, column }) => ({ file, line, column }));
    return result;
  } catch { return null; }
}

/** No messages, URLs, user text, project identifiers or paths are accepted as event fields. */
class DiagnosticsLog {
  constructor({ directory, version, runtime = {}, now = Date.now, maxBytes = DIAGNOSTIC_FILE_BYTES, io = fs }) {
    this.directory = directory; this.now = now; this.maxBytes = maxBytes; this.io = io;
    this.current = path.join(directory, 'current.jsonl'); this.previous = path.join(directory, 'previous.jsonl');
    this.config = path.join(directory, 'state.json');
    this.header = { format: 'sedcoretool-diagnostics', schema: 1, version: typeof version === 'string' && version.length <= 32 && /^\d+\.\d+\.\d+$/.test(version) ? version : 'unknown' };
    for (const key of ['node', 'electron', 'chrome']) if (typeof runtime[key] === 'string' && runtime[key].length <= 32 && /^\d+(?:\.\d+){1,3}$/.test(runtime[key])) this.header[key] = runtime[key];
    this.session = randomUUID(); this.sequence = 0; this.until = 0; this.failure = false;
    this.queue = []; this.dropped = 0; this.flushPromise = null; this.paused = false; this.mutation = Promise.resolve();
    this.ready = this.loadState();
  }

  async loadState() {
    try {
      const handle = await this.io.open(this.config, 'r');
      let data;
      try {
        const buffer = Buffer.alloc(4097), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > 4096) return;
        data = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      } finally { await handle.close(); }
      if (data.schema === 1 && Number.isFinite(data.until) && data.until > this.now()
        && data.until <= this.now() + DIAGNOSTIC_LIFETIME_MS) this.until = data.until;
    } catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) this.failure = true; }
  }

  isEnabled() { return !this.failure && this.until > this.now(); }

  async status() {
    await this.ready;
    const sizes = await Promise.all([this.current, this.previous].map((file) => this.io.stat(file).then((s) => Math.min(s.size, this.maxBytes)).catch(() => 0)));
    return { enabled: this.isEnabled(), expiresAt: this.until, bytes: sizes[0] + sizes[1], failed: this.failure };
  }

  mutate(work) {
    const result = this.mutation.then(work, work);
    this.mutation = result.catch(() => {});
    return result;
  }

  async atomicWrite(file, contents) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await this.io.writeFile(temporary, contents, { flag: 'wx', mode: 0o600 }); await this.io.rename(temporary, file); }
    finally { await this.io.unlink(temporary).catch(() => {}); }
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('Expected a boolean'));
    return this.mutate(async () => {
      await this.ready;
      if (!enabled) { this.record({ type: 'session.stop' }); this.until = 0; await this.flush(); }
      this.failure = false;
      try {
        await this.io.mkdir(this.directory, { recursive: true });
        const until = enabled ? this.now() + DIAGNOSTIC_LIFETIME_MS : 0;
        await this.atomicWrite(this.config, JSON.stringify({ schema: 1, until }));
        this.until = until;
        if (enabled) { this.record({ type: 'session.start' }); await this.flush(); }
      } catch { this.failure = true; this.until = 0; }
      return this.status();
    });
  }

  record(input) {
    if (!this.isEnabled()) return;
    const event = safeDiagnosticEvent(input); if (!event) return;
    if (this.queue.length >= 256) { this.dropped++; return; }
    this.queue.push(JSON.stringify({ ...event, at: new Date(this.now()).toISOString(), version: this.header.version,
      ...(event.type === 'session.start' ? { runtime: this.header } : {}), session: this.session, seq: ++this.sequence }) + '\n');
    if (!this.paused) void this.flush();
  }

  async append(line) {
    const bytes = Buffer.byteLength(line); if (bytes > this.maxBytes) return;
    const size = await this.io.stat(this.current).then((s) => s.size).catch((error) => { if (error?.code === 'ENOENT') return 0; throw error; });
    if (size > this.maxBytes) throw new Error('Oversized diagnostic file');
    if (size + bytes > this.maxBytes) await this.io.rename(this.current, this.previous);
    await this.io.appendFile(this.current, line, { mode: 0o600 });
  }

  flush() {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = (async () => {
      while (this.queue.length) await this.append(this.queue.shift());
      if (this.dropped) {
        const dropped = this.dropped; this.dropped = 0;
        await this.append(JSON.stringify({ type: 'log.dropped', dropped, at: new Date(this.now()).toISOString(), session: this.session, seq: ++this.sequence }) + '\n');
      }
    })().catch(() => { this.failure = true; this.queue.length = 0; this.dropped = 0; }).finally(() => {
      this.flushPromise = null;
      if (this.queue.length && !this.paused && !this.failure) void this.flush();
    });
    return this.flushPromise;
  }

  async snapshot() {
    this.paused = true;
    try {
      await this.flush();
      const contents = [];
      for (const file of [this.previous, this.current]) {
        const handle = await this.io.open(file, 'r').catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
        if (!handle) continue;
        try {
          const buffer = Buffer.alloc(this.maxBytes + 1), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          if (bytesRead > this.maxBytes) throw new Error('Oversized diagnostic file');
          contents.push(buffer.subarray(0, bytesRead).toString('utf8'));
        } finally { await handle.close(); }
      }
      return JSON.stringify(this.header) + '\n' + contents.join('');
    } finally { this.paused = false; if (this.queue.length) void this.flush(); }
  }

  async exportTo(file) { await this.atomicWrite(file, await this.snapshot()); }

  clear() {
    return this.mutate(async () => {
      await this.ready; this.until = 0; await this.flush();
      try {
        for (const file of [this.current, this.previous, this.config]) await this.io.unlink(file).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
        this.failure = false;
      } catch { this.failure = true; }
      return this.status();
    });
  }
}

module.exports = { DiagnosticsLog, safeDiagnosticEvent, diagnosticError, DIAGNOSTIC_LIFETIME_MS, DIAGNOSTIC_FILE_BYTES };
