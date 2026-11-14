// @ts-check
// Renderer side of the engine bridge (window.corantoolDesktop.engine, see desktop/engine-ipc.js): uploads the inputs of
// one section analysis in bounded chunks, requests it, downloads the result columns and always releases every token.
// Pure: the bridge is passed in, so Node can test it with a fake. No DOM.

const CHUNK_BYTES = 1048576;
const OUTPUT_TYPES = /** @type {const} */ ({ u8: Uint8Array, i32le: Int32Array, u32le: Uint32Array, u64le: BigUint64Array, f64le: Float64Array });
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** A failure reported by the engine or its bridge: a stable `code` and, for a rejected input, the `field` at fault. */
export class EngineError extends Error {
  /** @param {string} code @param {string | null} [field] */
  constructor(code, field = null) { super(field ? `${code}: ${field}` : code); this.name = 'EngineError'; this.code = code; this.field = field; }
}

/** @param {unknown} value @returns {value is {error: {code: string, field?: string}}} */
const isFailure = (value) => !!value && typeof value === 'object' && 'error' in value && !!/** @type {any} */ (value).error;
/** @template T @param {T} value @returns {T} */
function unwrap(value) {
  if (isFailure(value)) throw new EngineError(String(value.error.code), value.error.field ?? null);
  return value;
}

/** @param {Uint8Array} bytes @returns {Promise<string>} */
async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {Uint8Array<ArrayBuffer>} */ (bytes)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** @param {ArrayLike<number> & {buffer: ArrayBufferLike, byteOffset: number, byteLength: number}} typed @returns {Uint8Array} */
const bytesOf = (typed) => new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
const abortError = () => Object.assign(new Error('Analysis cancelled'), { name: 'AbortError' });

/**
 * @param {{status: () => Promise<any>, beginBuffer: Function, appendBuffer: Function, commitBuffer: Function,
 *   analyzeSection: Function, cancel: Function, readBuffer: Function, release: Function}} bridge
 * @param {{readyTimeoutMs?: number}} [options]
 */
export function createEngineClient(bridge, { readyTimeoutMs = 60000 } = {}) {
  if (!LITTLE_ENDIAN) throw new Error('The engine transport requires a little-endian computer');

  /** Waits until the engine process has started or failed; a failed engine is an error, never a fallback. */
  async function ready() {
    const deadline = Date.now() + readyTimeoutMs;
    for (;;) {
      const status = await bridge.status();
      if (status.state === 'ready') return status;
      if (status.state !== 'starting' && status.state !== 'stopped') throw new EngineError('ENGINE_UNAVAILABLE');
      if (Date.now() > deadline) throw new EngineError('ENGINE_UNAVAILABLE');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * @param {Uint8Array} bytes @param {string} dtype @param {number[]} shape @param {AbortSignal | undefined} signal
   * @param {string[]} tokens receives the token as soon as it exists so a later failure still releases it
   */
  async function put(bytes, dtype, shape, signal, tokens) {
    if (signal?.aborted) throw abortError();
    const { token } = unwrap(await bridge.beginBuffer({ dtype, shape, byte_length: bytes.length, sha256: await sha256(bytes) }));
    tokens.push(token);
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      if (signal?.aborted) throw abortError();
      unwrap(await bridge.appendBuffer(token, offset, bytes.slice(offset, offset + CHUNK_BYTES)));
    }
    unwrap(await bridge.commitBuffer(token));
    return token;
  }

  /** @param {{token: string, dtype: keyof typeof OUTPUT_TYPES, byte_length: number, sha256: string}} output @returns {Promise<number[]>} */
  async function download(output) {
    const bytes = new Uint8Array(output.byte_length);
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      const read = unwrap(await bridge.readBuffer(output.token, offset, Math.min(CHUNK_BYTES, bytes.length - offset)));
      if (read.offset !== offset || !(read.bytes instanceof Uint8Array) || read.bytes.length !== Math.min(CHUNK_BYTES, bytes.length - offset)) throw new EngineError('INTERNAL', 'result');
      bytes.set(read.bytes, offset);
    }
    if ((await sha256(bytes)) !== output.sha256) throw new EngineError('INTERNAL', 'result');
    const Type = OUTPUT_TYPES[output.dtype];
    if (!Type) throw new EngineError('INTERNAL', 'result');
    return Array.from(new Type(bytes.buffer, 0, output.byte_length / Type.BYTES_PER_ELEMENT), Number);
  }

  /**
   * Runs `section.intervals/1` on a snapshot of `buildIntervalSnapshot` and returns the decoded result columns.
   * Rejects with an `EngineError` (code and field), or with an `AbortError` when the signal fires first.
   * @param {any} snapshot
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<{dimensions: {bins: number, classes: number, schemes: number}, columns: Record<string, {data: number[], valid?: number[]}>, provenance: any}>}
   */
  async function analyze(snapshot, { signal } = {}) {
    await ready();
    /** @type {string[]} */
    const tokens = [], requestKey = crypto.randomUUID();
    const onAbort = () => { void bridge.cancel(requestKey); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      /** @type {Record<string, string>} */
      const inputs = {};
      for (const name of /** @type {const} */ (['labels', 'exclude', 'stack_offsets'])) {
        const { dtype, shape, data } = snapshot[name];
        inputs[name] = await put(bytesOf(data), dtype, shape, signal, tokens);
      }
      if (snapshot.stack_members) inputs.stack_members = await put(bytesOf(snapshot.stack_members.data), snapshot.stack_members.dtype, snapshot.stack_members.shape, signal, tokens);
      let settingsHash = '';
      for (const name of /** @type {const} */ (['objects', 'classes', 'settings', 'age_model', 'manual_indices'])) {
        const bytes = new TextEncoder().encode(JSON.stringify(snapshot[name]));
        inputs[name] = await put(bytes, 'utf8json', [bytes.length], signal, tokens);
        if (name === 'settings') settingsHash = await sha256(bytes);
      }
      if (signal?.aborted) throw abortError();
      const result = unwrap(await bridge.analyzeSection({ requestKey, method: 'section.intervals/1', project: crypto.randomUUID(), section: crypto.randomUUID(),
        revision: 0, settings_hash: settingsHash, inputs }));
      if (result.cancelled) throw abortError();
      tokens.push(...Object.values(result.outputs).map((/** @type {any} */ output) => output.token));
      /** @type {Record<string, {data: number[], valid?: number[]}>} */
      const columns = {};
      for (const [name, output] of Object.entries(result.outputs)) {
        if (name.endsWith('_valid')) continue;
        const valid = result.outputs[`${name}_valid`];
        columns[name] = { data: await download(/** @type {any} */ (output)), ...(valid ? { valid: await download(valid) } : {}) };
        if (signal?.aborted) throw abortError();
      }
      return { dimensions: result.dimensions, columns, provenance: result.provenance };
    } finally {
      signal?.removeEventListener('abort', onAbort);
      for (let i = 0; i < tokens.length; i += 64) await bridge.release(tokens.slice(i, i + 64)).catch(() => {});
    }
  }

  return { analyze, ready };
}
