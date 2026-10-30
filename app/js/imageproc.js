// IchAnTool web — image processing (no DOM): enhancement, detection, selection tools, shape features.

export function lumaOf(rgba, n) {
  const L = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return L;
}

/** Separable box blur with edge normalisation, window (2r+1)². */
export function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = 0, c = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) { s += src[o + x]; c++; }
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / c;
      const a = x + r + 1, d = x - r;
      if (a < w) { s += src[o + a]; c++; }
      if (d >= 0) { s -= src[o + d]; c--; }
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) { s += tmp[y * w + x]; c++; }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / c;
      const a = y + r + 1, d = y - r;
      if (a < h) { s += tmp[a * w + x]; c++; }
      if (d >= 0) { s -= tmp[d * w + x]; c--; }
    }
  }
  return out;
}

export const DEFAULT_FILTERS = {
  channel: 'rgb', blackPoint: 0, whitePoint: 255, gamma: 1, brightness: 0, contrast: 0,
  saturation: 100, equalize: false, localAmount: 0, localRadius: 30, invert: false,
};

export const FILTER_PRESETS = {
  none: { ...DEFAULT_FILTERS },
  // Levels + contrast + saturation, after Dorador & Rodríguez-Tovar (2014) image treatment.
  levels: { ...DEFAULT_FILTERS, blackPoint: 40, whitePoint: 215, contrast: 25, saturation: 140 },
  local: { ...DEFAULT_FILTERS, localAmount: 60, localRadius: 25, contrast: 15 },
  strong: { ...DEFAULT_FILTERS, equalize: true, localAmount: 40, localRadius: 20, channel: 'gray' },
};

export function applyFilters(src, w, h, p) {
  const n = w * h, dst = new Uint8ClampedArray(n * 4);
  const bp = p.blackPoint, wp = Math.max(p.whitePoint, bp + 1);
  const c = p.contrast * 2.55, cf = (259 * (c + 255)) / (255 * (259 - c));
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let x = Math.min(1, Math.max(0, (v - bp) / (wp - bp)));
    x = Math.pow(x, 1 / p.gamma) * 255;
    lut[v] = (x - 128) * cf + 128 + p.brightness * 2.55;
  }
  const sat = p.saturation / 100, ch = p.channel;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    let r = src[j], g = src[j + 1], b = src[j + 2];
    if (ch === 'r') g = b = r; else if (ch === 'g') r = b = g; else if (ch === 'b') r = g = b;
    else if (ch === 'gray') r = g = b = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    r = lut[r]; g = lut[g]; b = lut[b];
    if (sat !== 1) { const l = 0.299 * r + 0.587 * g + 0.114 * b; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
    dst[j] = r; dst[j + 1] = g; dst[j + 2] = b; dst[j + 3] = 255;
  }
  if (p.equalize || p.localAmount > 0) {
    const L = lumaOf(dst, n);
    let T = L;
    if (p.equalize) {
      const hist = new Uint32Array(256);
      for (let i = 0; i < n; i++) hist[L[i] | 0]++;
      const map = new Float32Array(256); let cum = 0, cmin = -1;
      for (let v = 0; v < 256; v++) { cum += hist[v]; if (cmin < 0 && cum) cmin = cum; map[v] = cum; }
      const den = Math.max(1, n - cmin);
      T = new Float32Array(n);
      for (let i = 0; i < n; i++) T[i] = ((map[L[i] | 0] - cmin) / den) * 255;
    }
    if (p.localAmount > 0) {
      const bl = boxBlur(T, w, h, p.localRadius), a = p.localAmount / 25, U = new Float32Array(n);
      for (let i = 0; i < n; i++) U[i] = T[i] + a * (T[i] - bl[i]);
      T = U;
    }
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const d = T[i] - L[i];
      dst[j] += d; dst[j + 1] += d; dst[j + 2] += d;
    }
  }
  if (p.invert) for (let j = 0; j < n * 4; j += 4) { dst[j] = 255 - dst[j]; dst[j + 1] = 255 - dst[j + 1]; dst[j + 2] = 255 - dst[j + 2]; }
  return dst;
}

function morph(m, w, h, dilate) {
  const t = new Uint8Array(m.length), o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const i = r + x, a = x > 0 ? m[i - 1] : m[i], b = x < w - 1 ? m[i + 1] : m[i];
      t[i] = dilate ? (m[i] | a | b) : (m[i] & a & b);
    }
  }
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const i = r + x, a = y > 0 ? t[i - w] : t[i], b = y < h - 1 ? t[i + w] : t[i];
      o[i] = dilate ? (t[i] | a | b) : (t[i] & a & b);
    }
  }
  return o;
}

export const DEFAULT_DETECT = { method: 'adaptive', polarity: 'dark', offset: 12, radius: 40, threshold: 80, minArea: 40, smooth: 1 };

/** Binary candidate mask from the enhanced image, restricted to the ROI and non-excluded pixels. */
export function detectMask(rgba, w, h, roi, exclude, p) {
  const n = w * h, L = lumaOf(rgba, n);
  let m = new Uint8Array(n);
  const mean = p.method === 'adaptive' ? boxBlur(L, w, h, p.radius) : null;
  const off = p.offset, t = p.threshold, pol = p.polarity;
  for (let y = roi.y0; y < roi.y1; y++) {
    for (let x = roi.x0; x < roi.x1; x++) {
      const i = y * w + x;
      if (exclude && exclude[i]) continue;
      let on;
      if (mean) {
        const d = L[i] - mean[i];
        on = pol === 'dark' ? d < -off : pol === 'light' ? d > off : Math.abs(d) > off;
      } else on = pol === 'light' ? L[i] > t : L[i] < t;
      m[i] = on ? 1 : 0;
    }
  }
  for (let k = 0; k < p.smooth; k++) m = morph(morph(m, w, h, false), w, h, true); // opening
  for (let k = 0; k < p.smooth; k++) m = morph(morph(m, w, h, true), w, h, false); // closing
  return m;
}

/** 8-connected components; components smaller than minArea are dropped. */
export function components(mask, w, h, minArea = 1) {
  const n = w * h, lab = new Int32Array(n), q = new Int32Array(n), areas = [0];
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || lab[s]) continue;
    next++; let head = 0, tail = 0; q[tail++] = s; lab[s] = next;
    while (head < tail) {
      const p = q[head++], x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] && !lab[j]) { lab[j] = next; q[tail++] = j; }
        }
      }
    }
    areas.push(tail);
  }
  const map = new Int32Array(next + 1); let count = 0;
  for (let k = 1; k <= next; k++) if (areas[k] >= minArea) map[k] = ++count;
  for (let i = 0; i < n; i++) if (lab[i]) lab[i] = map[lab[i]];
  return { labels: lab, count };
}

/** Magic wand: 4-connected flood fill by RGB distance to the seed colour. */
export function regionGrow(rgba, w, h, seed, tol, roi, exclude, maxPx = 4e6) {
  const n = w * h, seen = new Uint8Array(n), out = [];
  const sr = rgba[seed * 4], sg = rgba[seed * 4 + 1], sb = rgba[seed * 4 + 2], t2 = tol * tol;
  const stack = [seed]; seen[seed] = 1;
  while (stack.length && out.length < maxPx) {
    const p = stack.pop();
    const j = p * 4, dr = rgba[j] - sr, dg = rgba[j + 1] - sg, db = rgba[j + 2] - sb;
    if (dr * dr + dg * dg + db * db > t2) continue;
    out.push(p);
    const x = p % w, y = (p - x) / w;
    const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [xx, yy] of nb) {
      if (xx < roi.x0 || xx >= roi.x1 || yy < roi.y0 || yy >= roi.y1) continue;
      const k = yy * w + xx;
      if (seen[k] || (exclude && exclude[k])) continue;
      seen[k] = 1; stack.push(k);
    }
  }
  return out;
}

/** Pixels inside a polygon (even-odd rule, pixel centres), clipped to the ROI. */
export function polygonPixels(pts, w, roi) {
  if (pts.length < 3) return [];
  let ymin = Infinity, ymax = -Infinity;
  for (const [, y] of pts) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  const out = [];
  const y0 = Math.max(roi.y0, Math.floor(ymin)), y1 = Math.min(roi.y1 - 1, Math.ceil(ymax));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xs = [];
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(roi.x0, Math.ceil(xs[k] - 0.5)), xb = Math.min(roi.x1 - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) out.push(y * w + x);
    }
  }
  return out;
}

/**
 * Accumulate per-object statistics over a region. ids: Set of ids to include, or null for all.
 * Colour statistics use the original (unfiltered) image so learning is independent of the display filters.
 */
export function objectStats(labels, w, h, rgba, ids = null, region = null) {
  const R = region || { x0: 0, y0: 0, x1: w, y1: h };
  const acc = new Map();
  const lum = (i) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  for (let y = R.y0; y < R.y1; y++) {
    for (let x = R.x0; x < R.x1; x++) {
      const i = y * w + x, id = labels[i];
      if (!id || (ids && !ids.has(id))) continue;
      let a = acc.get(id);
      if (!a) {
        a = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, x0: x, x1: x, y0: y, y1: y, per: 0, sL: 0, sLL: 0, sA: 0, sB: 0, rL: 0, rN: 0 };
        acc.set(id, a);
      }
      const j = i * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2], L = 0.299 * r + 0.587 * g + 0.114 * b;
      a.n++; a.sx += x; a.sy += y; a.sxx += x * x; a.syy += y * y; a.sxy += x * y;
      if (x < a.x0) a.x0 = x; if (x > a.x1) a.x1 = x; if (y < a.y0) a.y0 = y; if (y > a.y1) a.y1 = y;
      a.sL += L; a.sLL += L * L; a.sA += r - g; a.sB += (r + g) / 2 - b;
      const edge = x === 0 || labels[i - 1] !== id || x === w - 1 || labels[i + 1] !== id ||
        y === 0 || labels[i - w] !== id || y === h - 1 || labels[i + w] !== id;
      if (edge) {
        a.per++;
        for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          if (labels[k] !== id) { a.rL += lum(k); a.rN++; }
        }
      }
    }
  }
  return acc;
}

/** Shape and colour descriptors from accumulated statistics. ppu = pixels per cm. */
export function features(a, ppu) {
  const n = a.n, mx = a.sx / n, my = a.sy / n;
  const cxx = a.sxx / n - mx * mx + 1 / 12, cyy = a.syy / n - my * my + 1 / 12, cxy = a.sxy / n - mx * my;
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(tr / 2 - disc, 1 / 12);
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const meanL = a.sL / n;
  const majorCm = (4 * Math.sqrt(l1)) / ppu, minorCm = (4 * Math.sqrt(l2)) / ppu, areaCm2 = n / (ppu * ppu);
  return {
    areaCm2, majorCm, minorCm,
    logArea: Math.log10(areaCm2 + 1e-6),
    logMajor: Math.log10(majorCm + 1e-6),
    logMinor: Math.log10(minorCm + 1e-6),
    elong: Math.sqrt(l1 / l2),
    vert: Math.abs(Math.sin(theta)),
    compact: Math.min(1, (4 * Math.PI * n) / Math.max(1, a.per * a.per)),
    fill: n / ((a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1)),
    meanL,
    stdL: Math.sqrt(Math.max(0, a.sLL / n - meanL * meanL)),
    meanA: a.sA / n,
    meanB: a.sB / n,
    contrast: meanL - (a.rN ? a.rL / a.rN : meanL),
    cx: mx, cy: my,
  };
}

/** Rotate a w×h raster with `ch` channels by 90° (dir = 1 clockwise, -1 counter-clockwise). */
export function rotate90(src, w, h, ch, dir) {
  const out = new src.constructor(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = dir > 0 ? h - 1 - y : y, ny = dir > 0 ? x : w - 1 - x;
      const s = (y * w + x) * ch, d = (ny * h + nx) * ch;
      for (let c = 0; c < ch; c++) out[d + c] = src[s + c];
    }
  }
  return out;
}
