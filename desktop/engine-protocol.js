// Private engine framing. No Electron dependency, filesystem access or scientific calculation.
const { TextDecoder } = require('node:util');
const MAX_JSON = 65536, MAX_CHUNK = 1048576;
const decoder = new TextDecoder('utf-8', { fatal: true });

function parseControl(bytes) {
  const text = decoder.decode(bytes), stack = [];
  // JSON.parse supplies syntax validation; this pass rejects excessive depth and duplicate keys first.
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      if (i === text.length) throw new Error('Invalid control string');
      let following = i + 1;
      while (/\s/.test(text[following] || '') && following < text.length) following++;
      if (text[following] === ':') {
        const keys = stack.at(-1);
        if (!(keys instanceof Set)) throw new Error('Invalid control key');
        const key = JSON.parse(text.slice(start, i + 1));
        if (keys.has(key)) throw new Error('Duplicate control key');
        keys.add(key);
      }
    } else if (char === '{' || char === '[') {
      stack.push(char === '{' ? new Set() : null);
      if (stack.length > 16) throw new Error('Control nesting limit');
    } else if (char === '}' || char === ']') stack.pop();
  }
  return JSON.parse(text, (_key, value) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('Invalid control number');
    return value;
  });
}

function frame(kind, bytes) {
  const limit = kind === 1 ? MAX_JSON : MAX_CHUNK;
  if (![1, 2].includes(kind) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limit) throw new Error('Frame limit');
  const header = Buffer.alloc(12);
  header.write('SCE1'); header[4] = kind; header.writeUInt32LE(bytes.length, 8);
  return [header, bytes];
}

function controlFrame(value) { return frame(1, Buffer.from(JSON.stringify(value))); }

class ControlReader {
  constructor(onControl) { this.onControl = onControl; this.header = Buffer.alloc(12); this.used = 0; this.payload = null; }
  push(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      const target = this.payload || this.header;
      const length = Math.min(target.length - this.used, chunk.length - offset);
      chunk.copy(target, this.used, offset); this.used += length; offset += length;
      if (this.used !== target.length) continue;
      this.used = 0;
      if (!this.payload) {
        const size = this.header.readUInt32LE(8);
        if (!this.header.subarray(0, 4).equals(Buffer.from('SCE1')) || this.header[4] !== 1 || this.header[5] || this.header.readUInt16LE(6) || !size || size > MAX_JSON) throw new Error('Invalid response header');
        this.payload = Buffer.alloc(size);
      } else {
        const value = parseControl(this.payload); this.payload = null;
        this.onControl(value);
      }
    }
  }
  end() { if (this.used || this.payload) throw new Error('Truncated response'); }
}

module.exports = { MAX_JSON, MAX_CHUNK, parseControl, frame, controlFrame, ControlReader };
