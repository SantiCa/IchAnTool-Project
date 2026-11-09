// SedCoreTool — minimal ZIP writer and reader (V0.8), no external libraries.
// Used for the shareable project package (.sedcoretool; before V0.52 .corantool): project.json + images/… at full resolution.
// Writer: method 0 (stored, images are already compressed). Reader: stored and deflate (DecompressionStream).
// Works on Blobs, so large images are not copied into one big string. Limit: 4 GB per package (no ZIP64).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
const enc = new TextEncoder();
const ZIP_CRC_BLOCK_SIZE = 4 * 1024 ** 2;

async function storedZipCRC(blob) {
  let crc = 0;
  for (let start = 0; start < blob.size; start += ZIP_CRC_BLOCK_SIZE) {
    const bytes = new Uint8Array(await blob.slice(start, start + ZIP_CRC_BLOCK_SIZE).arrayBuffer());
    crc = crc32(bytes, crc);
  }
  return crc;
}

/** files: [{ name, data: Blob | Uint8Array | string }] → Blob (application/zip). */
export async function zipFiles(files) {
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? new Blob([enc.encode(f.data)]) : f.data instanceof Blob ? f.data : new Blob([f.data]);
    const name = enc.encode(f.name), size = data.size;
    if (offset + size + 30 + name.length > 0xffffffff) throw new Error('ZIP > 4 GB');
    const crc = await storedZipCRC(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(c.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0), e = new DataView(new ArrayBuffer(22));
  if (files.length > 65535 || offset + cdSize + 22 > 0xffffffff) throw new Error('ZIP > 4 GB or too many entries');
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}


const ZIP_DIRECTORY_LIMIT = 16 * 1024**2;
const ZIP_JSON_LIMIT = 128 * 1024**2;
const ZIP_INFLATE_ENTRY_LIMIT = 256 * 1024**2;
const ZIP_INFLATE_TOTAL_LIMIT = 1024**3;

function inflateZipMember(raw, size, expectedCRC) {
  let offset = 0, produced = 0, crc = 0;
  const input = new ReadableStream({
    async pull(controller) {
      if (offset === raw.size) { controller.close(); return; }
      const end = Math.min(raw.size, offset + 16 * 1024);
      controller.enqueue(new Uint8Array(await raw.slice(offset, end).arrayBuffer()));
      offset = end;
    },
  });
  const verify = new TransformStream({
    transform(chunk, controller) {
      produced += chunk.byteLength;
      if (produced > size) throw new Error('ZIP inflated size exceeds declared size');
      crc = crc32(chunk, crc);
      controller.enqueue(chunk);
    },
    flush() {
      if (produced !== size || crc !== expectedCRC) throw new Error('ZIP size or CRC mismatch');
    },
  });
  return new Response(input.pipeThrough(new DecompressionStream('deflate-raw')).pipeThrough(verify)).blob();
}

/** Validate a classic ZIP before exposing lazy, bounded readers for its members. */
export async function unzipBlob(blob) {
  if (blob.size > 0xffffffff) throw new Error('ZIP exceeds the supported size');
  const tailLen = Math.min(blob.size, 65557), tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50 && i + 22 + tail.getUint16(i + 20, true) === tailLen) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file');
  const n = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  if (tail.getUint16(eocd + 4, true) || tail.getUint16(eocd + 6, true) || tail.getUint16(eocd + 8, true) !== n ||
      cdSize > ZIP_DIRECTORY_LIMIT || cdSize < 46 * n || cdOff + cdSize !== blob.size - tailLen + eocd) {
    throw new Error('Invalid or oversized ZIP directory');
  }
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder(), entries = [], out = new Map();
  let p = 0, expanded = 0, inflated = 0, bytesRead = 0, bytesInflated = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > cdSize || cd.getUint32(p, true) !== 0x02014b50) throw new Error('Invalid ZIP directory entry');
    const flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true), crc = cd.getUint32(p + 16, true);
    const csize = cd.getUint32(p + 20, true), size = cd.getUint32(p + 24, true), lo = cd.getUint32(p + 42, true);
    const nl = cd.getUint16(p + 28, true), next = p + 46 + nl + cd.getUint16(p + 30, true) + cd.getUint16(p + 32, true);
    if (!nl || next > cdSize || flags & 0x41 || cd.getUint16(p + 34, true) || ![0, 8].includes(method)) {
      throw new Error('Invalid or unsupported ZIP member');
    }
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nl));
    if (/[\\\u0000]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name) ||
        name.replace(/\/$/, '').split('/').some((part) => !part || part === '..' || part === '.') || out.has(name)) {
      throw new Error('Invalid or duplicate ZIP member name');
    }
    expanded += size;
    if (method === 8) inflated += size;
    if (expanded > 0xffffffff || inflated > ZIP_INFLATE_TOTAL_LIMIT ||
        (method === 8 && size > ZIP_INFLATE_ENTRY_LIMIT) ||
        ((name.endsWith('project.json') || name === 'settings.json') && size > ZIP_JSON_LIMIT)) {
      throw new Error('ZIP uncompressed size exceeds the import limit');
    }
    if ((method === 0 && size !== csize) || lo + 30 + csize > cdOff) throw new Error('Invalid ZIP member size or offset');
    const entry = { lo, csize, end: cdOff };
    entries.push(entry);
    out.set(name, {
      async get() {
        bytesRead += size;
        if (method === 8) bytesInflated += size;
        if (bytesRead > 0xffffffff || bytesInflated > ZIP_INFLATE_TOTAL_LIMIT) throw new Error('ZIP read exceeds the import limit');
        const lh = new DataView(await blob.slice(lo, lo + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50 || lh.getUint16(6, true) !== flags || lh.getUint16(8, true) !== method ||
            (!(flags & 8) && (lh.getUint32(14, true) !== crc || lh.getUint32(18, true) !== csize || lh.getUint32(22, true) !== size))) {
          throw new Error('ZIP local header does not match directory');
        }
        const localNameSize = lh.getUint16(26, true), start = lo + 30 + localNameSize + lh.getUint16(28, true);
        if (localNameSize !== nl || start + csize > entry.end ||
            dec.decode(await blob.slice(lo + 30, lo + 30 + localNameSize).arrayBuffer()) !== name) {
          throw new Error('Invalid or overlapping ZIP member');
        }
        const raw = blob.slice(start, start + csize);
        if (method === 8) return inflateZipMember(raw, size, crc);
        if (await storedZipCRC(raw) !== crc) throw new Error(`ZIP CRC mismatch for ${name}`);
        return raw;
      },
    });
    p = next;
  }
  if (p !== cdSize) throw new Error('Invalid ZIP directory length');
  entries.sort((a, b) => a.lo - b.lo);
  for (let i = 0; i + 1 < entries.length; i++) {
    const current = entries[i];
    current.end = entries[i + 1].lo;
    if (current.lo + 30 + current.csize > current.end) throw new Error('Overlapping ZIP members');
  }
  return out;
}
