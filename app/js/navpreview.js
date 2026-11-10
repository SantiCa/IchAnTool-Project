/* Navigation-only image preparation and bounded preview ownership (no DOM). */
import { topAt } from './core.js';

/** Build the same photo/mask layers as the legacy reducer, visiting each source pixel only once. */
export function buildNavigationLayers({ width, height, rgba, labels, exclude, classIndices = /** @type {ArrayLike<number>} */ ([]), colors = [], stacks = [null], overlay = true, hideExcluded = false, alpha = 128 }) {
  const pixels = width * height, mask = overlay || hideExcluded;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !Number.isSafeInteger(pixels * 4)
    || !(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length !== pixels * 4) throw new RangeError('Invalid navigation image dimensions');
  if ((mask && exclude?.length !== pixels) || (overlay && labels?.length !== pixels)) throw new RangeError('Invalid navigation mask dimensions');
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) throw new RangeError('Invalid navigation overlay alpha');
  const scale = Math.min(1, 512 / width), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const photo = new Uint8ClampedArray(w * h * 4), trace = mask ? new Uint8ClampedArray(photo.length) : null;
  const boundaries = new Int32Array(w + 1);
  for (let x = 0; x <= w; x++) boundaries[x] = Math.ceil(x * width / w);
  const byteColors = colors.every((color) => color.length >= 3 && color.slice(0, 3).every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
  let destination = 0;
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.ceil(oy * height / h), y1 = Math.ceil((oy + 1) * height / h);
    for (let ox = 0; ox < w; ox++, destination += 4) {
      const x0 = boundaries[ox], x1 = boundaries[ox + 1], count = (x1 - x0) * (y1 - y0);
      // Integer sums up to 258 * 255 * 255 fit exactly in Float32. Wider groups need legacy rounding per addition.
      const round = count > 258 || !byteColors;
      let r = 0, g = 0, b = 0, a = 0, mr = 0, mg = 0, mb = 0, ma = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * width + x, j = i * 4;
        r += rgba[j] * 255; g += rgba[j + 1] * 255; b += rgba[j + 2] * 255; a += 255;
        if (round) { r = Math.fround(r); g = Math.fround(g); b = Math.fround(b); a = Math.fround(a); }
        if (!mask) continue;
        if (exclude[i]) {
          if (hideExcluded) { mr += 65025; mg += 65025; mb += 65025; ma += 255; }
        } else if (overlay) {
          const id = topAt(labels[i], stacks), cls = id ? classIndices[id] : -1;
          if (cls >= 0) { const color = colors[cls]; mr += color[0] * alpha; mg += color[1] * alpha; mb += color[2] * alpha; ma += alpha; }
        }
        if (round) { mr = Math.fround(mr); mg = Math.fround(mg); mb = Math.fround(mb); ma = Math.fround(ma); }
      }
      photo[destination] = r / a; photo[destination + 1] = g / a; photo[destination + 2] = b / a; photo[destination + 3] = a / count;
      if (trace && ma) { trace[destination] = mr / ma; trace[destination + 1] = mg / ma; trace[destination + 2] = mb / ma; trace[destination + 3] = ma / count; }
    }
  }
  return { width: w, height: h, photo, trace };
}

/** LRU entries hold previews, never their section owners; a weak lookup cannot retain closed projects. */
export class NavigationPreviewCache {
  constructor(limit = 8 * 1024 * 1024, dispose = (_value) => {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Invalid navigation cache budget');
    this.limit = limit; this.dispose = dispose; this.bytes = 0; this.owners = new WeakMap(); this.entries = new Set();
  }
  /** A successful lookup refreshes LRU order. */
  get(section, key) {
    const entry = this.owners.get(section);
    if (!entry?.value || entry.key !== key) return null;
    this.entries.delete(entry); this.entries.add(entry); return entry.value;
  }
  set(section, key, value, bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 1) throw new RangeError('Invalid navigation cache entry size');
    const previous = this.owners.get(section); if (previous?.value) this.remove(previous);
    if (bytes > this.limit) return false;
    while (this.bytes + bytes > this.limit) this.remove(this.entries.values().next().value);
    const entry = { key, value, bytes }; this.owners.set(section, entry); this.entries.add(entry); this.bytes += bytes; return true;
  }
  remove(entry) {
    this.entries.delete(entry); this.bytes -= entry.bytes; this.dispose(entry.value); entry.value = null;
  }
  clear() {
    for (const entry of this.entries) { this.dispose(entry.value); entry.value = null; }
    this.entries.clear(); this.owners = new WeakMap(); this.bytes = 0;
  }
}
