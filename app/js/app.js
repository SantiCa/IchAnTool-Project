// IchAnTool web — application (UI, state, tools, rendering, files).
import { BI, II, UNIT_TO_CM, rowCounts, binRows, parseAgeModel, interpAge, toCSV, rleEncode, rleDecode } from './core.js';
import { DEFAULT_FILTERS, FILTER_PRESETS, DEFAULT_DETECT, applyFilters, detectMask, components, regionGrow, polygonPixels, objectStats, features, rotate90 } from './imageproc.js';
import { Classifier, vec, FEATURES } from './learn.js';
import { t, lang, setLang, applyI18n } from './i18n.js';

const $ = (id) => document.getElementById(id);
const VERSION = '3.0.0-dev';
const EXAMPLE_URLS = ['example.jpg', '../examples/data/idealized_core_0-500cm.jpg'];

function defaultClasses() {
  return [
    { id: 'undet', name: t('cls.undet'), color: '#d9a441', counts: true, fixed: true, plain: true },
    { id: 'chondrites', name: 'Chondrites', color: '#4c8dff', counts: true },
    { id: 'planolites', name: 'Planolites', color: '#ef5b3b', counts: true },
    { id: 'thalassinoides', name: 'Thalassinoides', color: '#a26bf0', counts: true },
    { id: 'zoophycos', name: 'Zoophycos', color: '#1fb58f', counts: true },
    { id: 'palaeophycus', name: 'Palaeophycus', color: '#f062b0', counts: true },
    { id: 'teichichnus', name: 'Teichichnus', color: '#22b8e6', counts: true },
    { id: 'scolicia', name: 'Scolicia', color: '#8cc63f', counts: true },
    { id: 'mottled', name: t('cls.mottled'), color: '#b49a7a', counts: true, plain: true },
    { id: 'trichichnus', name: 'Trichichnus', color: '#f2d23c', counts: true },
    { id: 'phycosiphon', name: 'Phycosiphon', color: '#ff9b4a', counts: true },
    { id: 'artifact', name: t('cls.artifact'), color: '#8c8c8c', counts: false, fixed: true, plain: true },
  ];
}

const S = {
  name: 'ichantool-project',
  classes: defaultClasses(), active: 'undet',
  sections: [], cur: -1,
  settings: { binPx: 50, includePred: true, predThr: 0.7, countCandidates: true, novelty: 3 },
  age: { text: '', units: 'ka', model: null },
  library: [],
  tool: 'select', prevTool: 'select', brushSize: 10, wandTol: 30,
  selected: 0, view: { x: 0, y: 0, zoom: 1 }, showOrig: false, ovAlpha: 0.5,
  undo: [],
};
const clf = new Classifier();
const sec = () => S.sections[S.cur];
const uid = () => Math.random().toString(36).slice(2, 9);
const clsById = (id) => S.classes.find((c) => c.id === id);
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (+v.toFixed(d)).toString());
const keyOf = (c) => { const k = S.classes.indexOf(c); return c.id === 'artifact' ? '0' : k < 9 ? String(k + 1) : ''; };

/* ───────────── sections ───────────── */

function newSection({ name, file, w, h, orig }) {
  const s = {
    id: uid(), name, file, rot: 0, w, h, orig, enh: null,
    labels: new Int32Array(w * h), exclude: new Uint8Array(w * h), objects: new Map(), nextId: 1,
    top: 0, bottom: 100, units: 'cm', roi: { x0: 0, y0: 0, x1: w, y1: h },
    filters: { ...DEFAULT_FILTERS }, preset: 'none', detect: { ...DEFAULT_DETECT }, manual: [], bins: [], view: null,
  };
  s.enh = applyFilters(s.orig, w, h, s.filters);
  return s;
}

function pxPerCm(s) {
  const span = (s.bottom - s.top) * UNIT_TO_CM[s.units];
  return span > 0 ? (s.roi.y1 - s.roi.y0) / span : 1;
}
const depthAtRow = (s, row) => s.top + ((row - s.roi.y0) / (s.roi.y1 - s.roi.y0)) * (s.bottom - s.top);
const rowAtDepth = (s, d) => s.roi.y0 + ((d - s.top) / (s.bottom - s.top)) * (s.roi.y1 - s.roi.y0);

/* ───────────── image files ───────────── */

function loadScript(src) {
  return new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src; el.onload = res;
    el.onerror = () => rej(new Error('library unavailable: ' + src)); document.head.appendChild(el);
  });
}

async function decodeBytes(bytes, name, type) {
  if (/\.tiff?$/i.test(name) || /tiff/.test(type || '')) {
    if (!window.UTIF) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js').catch(() => {});
      await loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js');
    }
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const ifds = window.UTIF.decode(buf);
    window.UTIF.decodeImage(buf, ifds[0], ifds);
    const rgba = window.UTIF.toRGBA8(ifds[0]);
    return { w: ifds[0].width, h: ifds[0].height, rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length) };
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: type || 'image/jpeg' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, out = new Uint8ClampedArray(w * h * 4);
    const stripH = Math.max(1, Math.min(h, Math.floor(4e6 / w)));
    const c = document.createElement('canvas'); c.width = w; c.height = stripH;
    const x = c.getContext('2d', { willReadFrequently: true });
    for (let y = 0; y < h; y += stripH) {
      const sh = Math.min(stripH, h - y);
      x.clearRect(0, 0, w, stripH); x.drawImage(img, 0, y, w, sh, 0, 0, w, sh);
      out.set(x.getImageData(0, 0, w, sh).data, y * w * 4);
    }
    return { w, h, rgba: out };
  } finally { URL.revokeObjectURL(url); }
}

function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(str) { const s = atob(str), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

async function addFiles(files) {
  for (const file of files) {
    await busy(async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { w, h, rgba } = await decodeBytes(bytes, file.name, file.type);
        const s = newSection({ name: file.name.replace(/\.[^.]+$/, ''), file: { name: file.name, type: file.type, bytes }, w, h, orig: rgba });
        const prev = sec();
        if (prev) { s.units = prev.units; s.top = prev.bottom; s.bottom = prev.bottom + (prev.bottom - prev.top); s.filters = { ...prev.filters }; s.preset = prev.preset; s.detect = { ...prev.detect }; s.enh = applyFilters(s.orig, w, h, s.filters); }
        S.sections.push(s);
        selectSection(S.sections.length - 1, true);
      } catch (e) { toast(t('err.image', { m: e.message || e })); }
    });
  }
}

async function loadExample() {
  for (const url of EXAMPLE_URLS) {
    try {
      const r = await fetch(url); if (!r.ok) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      const { w, h, rgba } = await decodeBytes(bytes, url, 'image/jpeg');
      const s = newSection({ name: t('example.name'), file: { name: 'idealized_core_0-500cm.jpg', type: 'image/jpeg', bytes }, w, h, orig: rgba });
      s.top = 0; s.bottom = 500; s.units = 'cm';
      s.detect = { ...DEFAULT_DETECT, method: 'global', polarity: 'dark', threshold: 6, minArea: 1, smooth: 0 };
      S.settings.binPx = 150;
      S.sections.push(s); selectSection(S.sections.length - 1, true);
      runDetection();
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/* ───────────── objects, undo ───────────── */

function newObject(s, cls, src) {
  const o = { id: s.nextId++, cls: cls || null, pred: null, conf: 0, src, area: 0, bbox: null, stats: null, feat: null };
  s.objects.set(o.id, o);
  return o;
}

function status(o) {
  if (o.cls) return 'labeled';
  if (o.pred && o.conf >= S.settings.predThr) return 'predicted';
  return 'candidate';
}

function effClassId(o) {
  if (o.cls) return o.cls;
  if (S.settings.includePred && o.pred && o.conf >= S.settings.predThr) return o.pred;
  return S.settings.countCandidates ? 'undet' : null;
}

function refreshObjects(s, ids, region) {
  const R = region ? { x0: Math.max(0, region.x0), y0: Math.max(0, region.y0), x1: Math.min(s.w, region.x1), y1: Math.min(s.h, region.y1) } : null;
  const acc = objectStats(s.labels, s.w, s.h, s.orig, ids, R), ppu = pxPerCm(s);
  for (const id of ids) {
    const a = acc.get(id), o = s.objects.get(id);
    if (!o) continue;
    if (!a) { s.objects.delete(id); if (S.selected === id) S.selected = 0; continue; }
    o.area = a.n; o.bbox = [a.x0, a.y0, a.x1, a.y1]; o.stats = a; o.feat = features(a, ppu);
  }
}

function recomputeFeatures(s) { const ppu = pxPerCm(s); for (const o of s.objects.values()) if (o.stats) o.feat = features(o.stats, ppu); }

function beginOp(s) {
  return { s, lm: [], ex: [], objs: [...s.objects.values()].map((o) => ({ ...o })), nextId: s.nextId, sel: S.selected, ext: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, touched: new Set() };
}
function setLabel(op, i, v) { const L = op.s.labels; if (L[i] !== v) { if (L[i]) op.touched.add(L[i]); op.lm.push(i, L[i]); L[i] = v; } }
function setEx(op, i, v) { const E = op.s.exclude; if (E[i] !== v) { op.ex.push(i, E[i]); E[i] = v; } }
function grow(op, x, y) { const e = op.ext; if (x < e.x0) e.x0 = x; if (y < e.y0) e.y0 = y; if (x > e.x1) e.x1 = x; if (y > e.y1) e.y1 = y; }

function finishPixelOp(op, target = 0) {
  const s = op.s;
  if (target) op.touched.add(target);
  if (op.touched.size) {
    const R = { ...op.ext };
    for (const o of op.objs) if (op.touched.has(o.id) && o.bbox) { R.x0 = Math.min(R.x0, o.bbox[0]); R.y0 = Math.min(R.y0, o.bbox[1]); R.x1 = Math.max(R.x1, o.bbox[2]); R.y1 = Math.max(R.y1, o.bbox[3]); }
    refreshObjects(s, op.touched, { x0: R.x0, y0: R.y0, x1: R.x1 + 1, y1: R.y1 + 1 });
  }
  for (const o of [...s.objects.values()]) if (!o.area) s.objects.delete(o.id); // created but empty
  commitOp(op);
  afterChange(s);
}

function commitOp(op, force = false) {
  if (!force && !op.lm.length && !op.ex.length) return;
  S.undo.push(op); if (S.undo.length > 30) S.undo.shift();
  $('undoBtn').disabled = false;
}

function undo() {
  const op = S.undo.pop(); if (!op) return;
  const s = op.s;
  for (let k = op.lm.length - 2; k >= 0; k -= 2) s.labels[op.lm[k]] = op.lm[k + 1];
  for (let k = op.ex.length - 2; k >= 0; k -= 2) s.exclude[op.ex[k]] = op.ex[k + 1];
  s.objects = new Map(op.objs.map((o) => [o.id, o])); s.nextId = op.nextId; S.selected = op.sel;
  $('undoBtn').disabled = !S.undo.length;
  if (s !== sec()) selectSection(S.sections.indexOf(s));
  afterChange(s);
}

function afterChange(s) { rebuildLUT(s); scheduleLearn(); scheduleAnalysis(); renderClasses(); renderObject(); requestRender(); }

/* pixel-set edits from wand and lasso */
function applyPixels(pixels, mode) {
  const s = sec(); if (!pixels.length) return;
  const op = beginOp(s);
  let target = 0;
  if (mode === 'sub') target = 0;
  else if (mode === 'add' && S.selected && s.objects.has(S.selected)) target = S.selected;
  else target = newObject(s, S.active, S.tool).id;
  for (const i of pixels) {
    grow(op, i % s.w, (i / s.w) | 0);
    const old = s.labels[i];
    if (mode === 'sub') { if (old && (!S.selected || old === S.selected)) setLabel(op, i, 0); }
    else setLabel(op, i, target);
  }
  finishPixelOp(op, target);
  if (target && s.objects.has(target)) select(target);
}

function deleteObject(id) {
  const s = sec(), o = s?.objects.get(id); if (!o) return;
  const op = beginOp(s), [x0, y0, x1, y1] = o.bbox;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * s.w + x; if (s.labels[i] === id) setLabel(op, i, 0); }
  s.objects.delete(id); S.selected = 0;
  commitOp(op, true); afterChange(s);
}

function assignClass(id, clsId) {
  const s = sec(), o = s?.objects.get(id); if (!o) return;
  const op = beginOp(s);
  o.cls = clsId; o.pred = null; o.conf = 0;
  commitOp(op, true); afterChange(s);
  if ($('autoNext').checked) nextReview();
}

/* ───────────── detection ───────────── */

function runDetection() {
  const s = sec(); if (!s) return;
  busy(() => {
    const op = beginOp(s), p = s.detect, L = s.labels;
    const cand = new Set();
    for (const o of s.objects.values()) if (!o.cls && o.src === 'auto') cand.add(o.id);
    if (cand.size) {
      for (let i = 0; i < L.length; i++) { const id = L[i]; if (id && cand.has(id)) { op.lm.push(i, id); L[i] = 0; } }
      for (const id of cand) s.objects.delete(id);
      if (cand.has(S.selected)) S.selected = 0;
    }
    const m = detectMask(s.enh, s.w, s.h, s.roi, s.exclude, p);
    const { labels: cl, count } = components(m, s.w, s.h, p.minArea);
    const base = s.nextId;
    for (let i = 0; i < L.length; i++) { const k = cl[i]; if (k && !L[i]) { op.lm.push(i, 0); L[i] = base + k - 1; } }
    const ids = new Set();
    for (let k = 0; k < count; k++) { const o = newObject(s, null, 'auto'); ids.add(o.id); }
    const acc = objectStats(L, s.w, s.h, s.orig, ids, null), ppu = pxPerCm(s);
    let kept = 0;
    for (const id of ids) {
      const a = acc.get(id), o = s.objects.get(id);
      if (!a || a.n < p.minArea) {
        if (a) for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) { const i = y * s.w + x; if (L[i] === id) { op.lm.push(i, id); L[i] = 0; } }
        s.objects.delete(id); continue;
      }
      o.area = a.n; o.bbox = [a.x0, a.y0, a.x1, a.y1]; o.stats = a; o.feat = features(a, ppu); kept++;
    }
    commitOp(op, true);
    $('detectStatus').textContent = t('d.result', { n: kept });
    afterChange(s);
  });
}

function clearCandidates() {
  const s = sec(); if (!s) return;
  const op = beginOp(s), cand = new Set([...s.objects.values()].filter((o) => !o.cls).map((o) => o.id));
  for (let i = 0; i < s.labels.length; i++) if (cand.has(s.labels[i])) setLabel(op, i, 0);
  for (const id of cand) s.objects.delete(id);
  if (cand.has(S.selected)) S.selected = 0;
  commitOp(op, true); $('detectStatus').textContent = ''; afterChange(s);
}

/* ───────────── learning ───────────── */

let learnTimer = 0;
function scheduleLearn() { clearTimeout(learnTimer); learnTimer = setTimeout(learnNow, 60); }
function learnNow() {
  const ex = [];
  for (const s of S.sections) for (const o of s.objects.values()) if (o.cls && o.feat) ex.push({ y: o.cls, x: vec(o.feat) });
  for (const e of S.library) { const c = S.classes.find((k) => k.name === e.name); if (c) ex.push({ y: c.id, x: e.x }); }
  clf.novelty = S.settings.novelty; clf.fit(ex);
  for (const s of S.sections) {
    for (const o of s.objects.values()) {
      if (o.cls || !o.feat) { o.pred = null; o.conf = 0; o.novel = false; continue; }
      const p = clf.predict(vec(o.feat));
      o.pred = p?.y || null; o.conf = p?.conf || 0; o.novel = !!p?.novel;
    }
    rebuildLUT(s);
  }
  renderLearn(); renderClasses(); renderObject(); scheduleAnalysis(); requestRender();
}

/* ───────────── analysis ───────────── */

let anaTimer = 0;
function scheduleAnalysis() { clearTimeout(anaTimer); anaTimer = setTimeout(() => { analyze(sec()); renderResults(); requestRender(); }, 100); }

function effClassArray(s) {
  const eff = new Int16Array(s.nextId).fill(-1), idx = new Map(S.classes.map((c, k) => [c.id, k]));
  for (const o of s.objects.values()) {
    const c = effClassId(o); if (c == null) continue;
    const k = idx.get(c); if (k != null && S.classes[k].counts) eff[o.id] = k;
  }
  return eff;
}

function analyze(s) {
  if (!s) return;
  const counts = rowCounts({ labels: s.labels, width: s.w, roi: s.roi, exclude: s.exclude, effClass: effClassArray(s), nClasses: S.classes.length });
  s.bins = binRows(counts, { top: s.top, bottom: s.bottom, binPx: Math.max(1, S.settings.binPx) });
  for (const b of s.bins) {
    b.age = interpAge(S.age.model, b.depth);
    const m = manualAt(s, b.depth); b.BIm = m?.BI ?? null; b.iim = m?.ii ?? null;
  }
}

function manualAt(s, d) { let hit = null; for (const m of s.manual) if (d >= m.from && d < m.to) hit = m; return hit; }
function setManual(s, b, key, val) {
  let m = s.manual.find((e) => Math.abs(e.from - b.dTop) < 1e-9 && Math.abs(e.to - b.dBottom) < 1e-9);
  if (!m) { m = { from: b.dTop, to: b.dBottom, BI: null, ii: null }; s.manual.push(m); }
  m[key] = val;
  if (m.BI == null && m.ii == null) s.manual.splice(s.manual.indexOf(m), 1);
}

/* ───────────── rendering ───────────── */

const view = $('view'), vctx = view.getContext('2d');
const prof = $('profile'), pctx = prof.getContext('2d');
let imgData = null, rq = false, cursor = null, lassoPts = null, roiDrag = null;

function rebuildLUT(s) {
  const n = s.nextId, fill = new Uint8ClampedArray(n * 4), line = new Uint8ClampedArray(n * 4), sty = new Uint8Array(n);
  for (const o of s.objects.values()) {
    const st = status(o), k = o.id * 4;
    let col, a;
    if (st === 'labeled') { col = hex(clsById(o.cls)?.color || '#ffffff'); a = S.ovAlpha; sty[o.id] = 0; }
    else if (st === 'predicted') { col = hex(clsById(o.pred)?.color || '#ffffff'); a = S.ovAlpha * 0.45; sty[o.id] = 1; }
    else { col = [255, 236, 150]; a = S.ovAlpha * 0.18; sty[o.id] = 2; }
    fill[k] = col[0]; fill[k + 1] = col[1]; fill[k + 2] = col[2]; fill[k + 3] = a * 255;
    line[k] = col[0]; line[k + 1] = col[1]; line[k + 2] = col[2]; line[k + 3] = 255;
  }
  s.lutFill = fill; s.lutLine = line; s.lutStyle = sty;
}

function requestRender() { if (!rq) { rq = true; requestAnimationFrame(() => { rq = false; render(); renderProfile(); }); } }

function resizeCanvases() {
  for (const c of [view, prof]) {
    const w = Math.max(1, Math.round(c.clientWidth)), h = Math.max(1, Math.round(c.clientHeight));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  requestRender();
}

function render() {
  const s = sec(), cw = view.width, ch = view.height;
  $('empty').hidden = !!s;
  if (!s) { vctx.fillStyle = '#161a19'; vctx.fillRect(0, 0, cw, ch); return; }
  if (!s.lutFill || s.lutFill.length < s.nextId * 4) rebuildLUT(s);
  if (!imgData || imgData.width !== cw || imgData.height !== ch) imgData = vctx.createImageData(cw, ch);
  const d = imgData.data, src = S.showOrig ? s.orig : s.enh, lab = s.labels, ex = s.exclude;
  const W = s.w, H = s.h, { x: vx, y: vy, zoom: z } = S.view, roi = s.roi;
  const fill = s.lutFill, line = s.lutLine, sty = s.lutStyle, sel = S.selected, step = Math.max(1, Math.round(1 / z));
  const ixs = new Int32Array(cw);
  for (let sx = 0; sx < cw; sx++) ixs[sx] = Math.floor(vx + (sx + 0.5) / z);
  let o = 0;
  for (let sy = 0; sy < ch; sy++) {
    const iy = Math.floor(vy + (sy + 0.5) / z), rowIn = iy >= 0 && iy < H, base = iy * W, inY = iy >= roi.y0 && iy < roi.y1;
    for (let sx = 0; sx < cw; sx++, o += 4) {
      const ix = ixs[sx];
      if (!rowIn || ix < 0 || ix >= W) { d[o] = 22; d[o + 1] = 26; d[o + 2] = 25; d[o + 3] = 255; continue; }
      const i = base + ix, j = i * 4;
      let r = src[j], g = src[j + 1], b = src[j + 2];
      const id = lab[i];
      if (id) {
        const k = id * 4, a = fill[k + 3] / 255;
        if (a) { r += (fill[k] - r) * a; g += (fill[k + 1] - g) * a; b += (fill[k + 2] - b) * a; }
        const edge = (ix < step || lab[i - step] !== id) || (ix + step >= W || lab[i + step] !== id) ||
          (iy < step || lab[i - step * W] !== id) || (iy + step >= H || lab[i + step * W] !== id);
        if (edge) {
          if (id === sel) { r = 255; g = 255; b = 255; }
          else if (sty[id] !== 1 || ((sx + sy) & 4)) { r = line[k]; g = line[k + 1]; b = line[k + 2]; }
        }
      }
      if (ex[i]) { if (((sx + sy) & 7) < 2) { r = r * 0.3 + 70; g = g * 0.3 + 70; b = b * 0.3 + 80; } else { r *= 0.55; g *= 0.55; b *= 0.55; } }
      if (!inY || ix < roi.x0 || ix >= roi.x1) { r *= 0.42; g *= 0.42; b *= 0.42; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  vctx.putImageData(imgData, 0, 0);
  const toS = (x, y) => [(x - vx) * z, (y - vy) * z];
  // analysis area
  vctx.save();
  vctx.strokeStyle = '#e0995a'; vctx.lineWidth = 1; vctx.setLineDash([6, 4]);
  const [rx0, ry0] = toS(roi.x0, roi.y0), [rx1, ry1] = toS(roi.x1, roi.y1);
  vctx.strokeRect(rx0 + 0.5, ry0 + 0.5, rx1 - rx0 - 1, ry1 - ry0 - 1);
  vctx.setLineDash([]);
  if (roiDrag) { const [a, b2] = toS(roiDrag.x0, roiDrag.y0), [c, e] = toS(roiDrag.x1, roiDrag.y1); vctx.strokeStyle = '#fff'; vctx.strokeRect(a, b2, c - a, e - b2); }
  if (lassoPts && lassoPts.length > 1) {
    vctx.strokeStyle = '#fff'; vctx.lineWidth = 1.5; vctx.beginPath();
    lassoPts.forEach(([x, y], k) => { const [a, b2] = toS(x, y); k ? vctx.lineTo(a, b2) : vctx.moveTo(a, b2); });
    vctx.stroke();
  }
  if (cursor && ['brush', 'erase', 'exclude', 'include'].includes(S.tool)) {
    const [a, b2] = toS(cursor.x, cursor.y);
    vctx.strokeStyle = S.tool === 'brush' ? clsById(S.active)?.color || '#fff' : '#fff'; vctx.lineWidth = 1.5;
    vctx.beginPath(); vctx.arc(a, b2, Math.max(2, S.brushSize * z), 0, Math.PI * 2); vctx.stroke();
  }
  drawRuler(s, ch);
  vctx.restore();
  $('zoomLbl').textContent = Math.round(z * 100) + '%';
}

function niceStep(pxPerUnit, minPx) {
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  return steps.find((v) => v * pxPerUnit >= minPx) || 10000;
}

function drawRuler(s, ch) {
  const span = s.bottom - s.top; if (!(span > 0)) return;
  const z = S.view.zoom, pxu = ((s.roi.y1 - s.roi.y0) / span) * z, st = niceStep(pxu, 56);
  const d0 = Math.max(s.top, depthAtRow(s, S.view.y)), d1 = Math.min(s.bottom, depthAtRow(s, S.view.y + ch / z));
  vctx.fillStyle = 'rgba(14,17,16,.78)'; vctx.fillRect(0, 0, 54, ch);
  vctx.strokeStyle = '#8f8a80'; vctx.fillStyle = '#e6e1d6'; vctx.font = '11px "IBM Plex Mono", monospace'; vctx.textBaseline = 'middle';
  const minor = st / 5;
  for (let v = Math.ceil(d0 / minor) * minor; v <= d1 + 1e-9; v += minor) {
    const y = Math.round((rowAtDepth(s, v) - S.view.y) * z) + 0.5, major = Math.abs(v / st - Math.round(v / st)) < 1e-6;
    vctx.beginPath(); vctx.moveTo(major ? 40 : 47, y); vctx.lineTo(54, y); vctx.stroke();
    if (major) vctx.fillText(fmt(v, 3), 4, y);
  }
  vctx.fillStyle = '#e0995a'; vctx.fillText(s.units, 4, ch - 10);
}

function renderProfile() {
  const s = sec(), W = prof.width, H = prof.height;
  pctx.fillStyle = '#121615'; pctx.fillRect(0, 0, W, H);
  if (!s || !s.bins?.length) return;
  const colW = Math.max(18, Math.min(30, W * 0.13)), gap = 6, x0 = 8, pw = W - x0 - 2 * colW - 3 * gap, bx = x0 + pw + gap, ix = bx + colW + gap;
  const z = S.view.zoom, vy = S.view.y, yOf = (r) => (s.roi.y0 + r - vy) * z;
  pctx.strokeStyle = '#2c3331'; pctx.lineWidth = 1;
  for (const p of [0, 25, 50, 75, 100]) { const x = Math.round(x0 + (p / 100) * pw) + 0.5; pctx.beginPath(); pctx.moveTo(x, 22); pctx.lineTo(x, H); pctx.stroke(); }
  const cols = S.classes.map((c) => hex(c.color));
  const pts = [];
  for (const b of s.bins) {
    const y0 = yOf(b.r0), y1 = yOf(b.r1);
    if (y1 < 22 || y0 > H) continue;
    const hgt = Math.max(1, y1 - y0);
    let acc = 0;
    b.classPct.forEach((v, k) => {
      if (!v) return;
      const [r, g, bl] = cols[k]; pctx.fillStyle = `rgba(${r},${g},${bl},.75)`;
      pctx.fillRect(x0 + (acc / 100) * pw, y0, (v / 100) * pw, hgt); acc += v;
    });
    for (const [x, val, max, man] of [[bx, b.BI, 6, b.BIm], [ix, b.ii, 6, b.iim]]) {
      if (val != null) { pctx.fillStyle = '#e0995a'; pctx.fillRect(x, y0, (val / max) * colW, Math.max(1, hgt - (hgt > 3 ? 1 : 0))); }
      if (man != null) { pctx.strokeStyle = '#ffffff'; pctx.strokeRect(x + (man / max) * colW - 1.5, y0 + 0.5, 3, Math.max(1, hgt - 1)); }
    }
    if (b.pct != null) pts.push([x0 + (b.pct / 100) * pw, (y0 + y1) / 2]);
  }
  pctx.strokeStyle = '#f3ece0'; pctx.lineWidth = 1.5; pctx.beginPath();
  pts.forEach(([x, y], k) => (k ? pctx.lineTo(x, y) : pctx.moveTo(x, y))); pctx.stroke();
  pctx.fillStyle = '#121615'; pctx.fillRect(0, 0, W, 22);
  pctx.fillStyle = '#b5aea2'; pctx.font = '600 10.5px "IBM Plex Sans Condensed", sans-serif'; pctx.textBaseline = 'middle';
  pctx.fillText(t('p.pct'), x0, 11); pctx.fillText('BI', bx, 11); pctx.fillText('ii', ix, 11);
}

/* ───────────── view ───────────── */

function clampView() {
  const s = sec(); if (!s) return;
  const z = S.view.zoom, cw = view.width / z, ch = view.height / z;
  S.view.x = Math.min(Math.max(S.view.x, -cw + 40 / z), s.w - 40 / z);
  S.view.y = Math.min(Math.max(S.view.y, -ch + 40 / z), s.h - 40 / z);
}
function fitView() {
  const s = sec(); if (!s) return;
  const rw = s.roi.x1 - s.roi.x0, z = Math.min(8, Math.max(0.02, (view.width - 76) / rw));
  S.view = { zoom: z, x: s.roi.x0 - 62 / z, y: s.roi.y0 - 12 / z };
  requestRender();
}
function zoomAt(sx, sy, f) {
  const z0 = S.view.zoom, z = Math.min(40, Math.max(0.02, z0 * f));
  S.view.x += sx / z0 - sx / z; S.view.y += sy / z0 - sy / z; S.view.zoom = z;
  clampView(); requestRender();
}
function centerOn(o) {
  const [x0, y0, x1, y1] = o.bbox, size = Math.max(x1 - x0, y1 - y0) + 1;
  if (size * S.view.zoom < 40) S.view.zoom = Math.min(8, 160 / size);
  const z = S.view.zoom;
  S.view.x = (x0 + x1) / 2 - view.width / (2 * z); S.view.y = (y0 + y1) / 2 - view.height / (2 * z);
  clampView(); requestRender();
}

/* ───────────── pointer tools ───────────── */

let drag = null, spaceDown = false;
function toImg(e) { const r = view.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx, sy, x: S.view.x + sx / S.view.zoom, y: S.view.y + sy / S.view.zoom }; }
const inImg = (s, p) => p.x >= 0 && p.y >= 0 && p.x < s.w && p.y < s.h;

function paintAt(op, cx, cy) {
  const s = op.s, r = S.brushSize, r2 = r * r;
  const xa = Math.max(0, Math.floor(cx - r)), xb = Math.min(s.w - 1, Math.ceil(cx + r)), ya = Math.max(0, Math.floor(cy - r)), yb = Math.min(s.h - 1, Math.ceil(cy + r));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r2) continue;
    const i = y * s.w + x; grow(op, x, y);
    if (op.mode === 'brush') setLabel(op, i, op.target);
    else if (op.mode === 'erase') setLabel(op, i, 0);
    else setEx(op, i, op.mode === 'exclude' ? 1 : 0);
  }
}
function paintSeg(op, a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(dist / Math.max(1, S.brushSize / 3)));
  for (let k = 1; k <= n; k++) paintAt(op, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
}

view.addEventListener('pointerdown', (e) => {
  const s = sec(); if (!s) return;
  view.setPointerCapture(e.pointerId);
  const p = toImg(e);
  if (e.button === 1 || S.tool === 'pan' || spaceDown) { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; return; }
  if (e.button !== 0) return;
  const tool = S.tool;
  if (tool === 'select') drag = { type: 'select', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, moved: false, p };
  else if (tool === 'roi') { roiDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag = { type: 'roi' }; }
  else if (tool === 'lasso') { lassoPts = [[p.x, p.y]]; drag = { type: 'lasso', mode: e.altKey ? 'sub' : e.shiftKey ? 'add' : 'new' }; }
  else if (tool === 'wand') {
    if (!inImg(s, p)) return;
    const seed = Math.floor(p.y) * s.w + Math.floor(p.x);
    applyPixels(regionGrow(S.showOrig ? s.orig : s.enh, s.w, s.h, seed, S.wandTol, s.roi, s.exclude), e.altKey ? 'sub' : e.shiftKey ? 'add' : 'new');
  } else {
    const op = beginOp(s); op.mode = tool;
    if (tool === 'brush') {
      const under = inImg(s, p) ? s.labels[Math.floor(p.y) * s.w + Math.floor(p.x)] : 0;
      op.target = e.shiftKey && S.selected ? S.selected : under || newObject(s, S.active, 'brush').id;
      rebuildLUT(s);
    }
    paintAt(op, p.x, p.y);
    drag = { type: 'paint', op, last: p };
    requestRender();
  }
});

view.addEventListener('pointermove', (e) => {
  const s = sec(); if (!s) return;
  const p = toImg(e); cursor = p;
  updateStatus(s, p);
  if (!drag) { if (['brush', 'erase', 'exclude', 'include'].includes(S.tool)) requestRender(); return; }
  if (drag.type === 'pan' || drag.type === 'select') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.type === 'select' && !drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    S.view.x = drag.vx - dx / S.view.zoom; S.view.y = drag.vy - dy / S.view.zoom; clampView(); requestRender();
  } else if (drag.type === 'paint') { paintSeg(drag.op, drag.last, p); drag.last = p; requestRender(); }
  else if (drag.type === 'lasso') { lassoPts.push([p.x, p.y]); requestRender(); }
  else if (drag.type === 'roi') { roiDrag.x1 = p.x; roiDrag.y1 = p.y; requestRender(); }
});

function endDrag() {
  const s = sec(); const d = drag; drag = null; if (!d || !s) return;
  if (d.type === 'select' && !d.moved) {
    const p = d.p, id = inImg(s, p) ? s.labels[Math.floor(p.y) * s.w + Math.floor(p.x)] : 0;
    select(id);
  } else if (d.type === 'paint') finishPixelOp(d.op, d.op.mode === 'brush' ? d.op.target : 0);
  else if (d.type === 'lasso') {
    const pts = lassoPts; lassoPts = null;
    applyPixels(polygonPixels(pts, s.w, s.roi), d.mode); requestRender();
  } else if (d.type === 'roi') {
    const r = roiDrag; roiDrag = null;
    const x0 = Math.max(0, Math.round(Math.min(r.x0, r.x1))), x1 = Math.min(s.w, Math.round(Math.max(r.x0, r.x1)));
    const y0 = Math.max(0, Math.round(Math.min(r.y0, r.y1))), y1 = Math.min(s.h, Math.round(Math.max(r.y0, r.y1)));
    if (x1 - x0 > 4 && y1 - y0 > 4) setRoi(s, { x0, y0, x1, y1 });
    setTool(S.prevTool);
  }
}
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);
view.addEventListener('pointerleave', () => { cursor = null; requestRender(); });
view.addEventListener('wheel', (e) => {
  if (!sec()) return;
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : 1;
  if (e.ctrlKey || e.metaKey) { const p = toImg(e); zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * k * 0.0025)); }
  else { S.view.x += (e.shiftKey ? e.deltaY : e.deltaX) * k / S.view.zoom; if (!e.shiftKey) S.view.y += e.deltaY * k / S.view.zoom; clampView(); requestRender(); }
}, { passive: false });

function updateStatus(s, p) {
  const inside = inImg(s, p);
  $('stDepth').textContent = inside ? t('status.depth', { d: fmt(depthAtRow(s, p.y), 3), u: s.units }) : '';
  $('stPx').textContent = inside ? `x ${Math.floor(p.x)} · y ${Math.floor(p.y)}` : '';
  const id = inside ? s.labels[Math.floor(p.y) * s.w + Math.floor(p.x)] : 0, o = id && s.objects.get(id);
  $('stObj').textContent = o ? `#${o.id} ${clsById(o.cls || o.pred)?.name || t('obj.unassigned')} · ${t('obj.' + status(o))}` : '';
}

function setRoi(s, roi) {
  s.roi = roi; recomputeFeatures(s); scheduleLearn(); scheduleAnalysis(); renderSectionForm(); requestRender();
}

/* ───────────── keyboard ───────────── */

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  const k = e.key, s = sec();
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (k === ' ') { spaceDown = true; view.classList.add('pan'); e.preventDefault(); return; }
  const tools = { v: 'select', w: 'wand', b: 'brush', l: 'lasso', e: 'erase', x: 'exclude', h: 'pan' };
  if (tools[k.toLowerCase()] && !e.ctrlKey && !e.metaKey) { setTool(tools[k.toLowerCase()]); return; }
  if (!s) return;
  if (/^[0-9]$/.test(k)) {
    const c = k === '0' ? clsById('artifact') : S.classes[+k - 1];
    if (!c) return;
    if (S.selected && s.objects.has(S.selected)) assignClass(S.selected, c.id); else setActive(c.id);
    return;
  }
  switch (k) {
    case 'Escape': select(0); break;
    case 'Delete': case 'Backspace': if (S.selected) { e.preventDefault(); deleteObject(S.selected); } break;
    case 'Enter': { const o = s.objects.get(S.selected); if (o?.pred) assignClass(o.id, o.pred); break; }
    case 'n': case 'N': e.preventDefault(); nextReview(e.shiftKey); break;
    case 'o': case 'O': $('showOrig').checked = S.showOrig = !S.showOrig; requestRender(); break;
    case 'f': case 'F': fitView(); break;
    case '+': case '=': zoomAt(view.width / 2, view.height / 2, 1.25); break;
    case '-': zoomAt(view.width / 2, view.height / 2, 0.8); break;
    case '[': setBrush(S.brushSize - Math.max(1, Math.round(S.brushSize * 0.15))); break;
    case ']': setBrush(S.brushSize + Math.max(1, Math.round(S.brushSize * 0.15))); break;
  }
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; view.classList.toggle('pan', S.tool === 'pan'); } });

function nextReview(back = false) {
  const s = sec(); if (!s) return;
  const list = [...s.objects.values()].filter((o) => !o.cls && o.bbox).sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  if (!list.length) { select(0); return; }
  const cur = s.objects.get(S.selected);
  let o;
  if (!cur?.bbox) o = list[0];
  else {
    const key = (q) => q.bbox[1] * 1e6 + q.bbox[0] + q.id * 1e-6, kc = key(cur);
    o = back ? [...list].reverse().find((q) => key(q) < kc) || list[list.length - 1] : list.find((q) => key(q) > kc) || list[0];
  }
  select(o.id); centerOn(o); showTab('object');
}

/* ───────────── UI: panels ───────────── */

function setTool(tool) {
  if (tool === 'roi') S.prevTool = S.tool === 'roi' ? S.prevTool : S.tool;
  S.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  $('optSize').hidden = !['brush', 'erase', 'exclude', 'include'].includes(tool);
  $('optTol').hidden = tool !== 'wand';
  view.classList.toggle('pan', tool === 'pan');
  requestRender();
}
function setBrush(v) { S.brushSize = Math.max(1, Math.min(120, v)); $('brushSize').value = S.brushSize; $('brushOut').textContent = S.brushSize; requestRender(); }
function setActive(id) { S.active = id; renderClasses(); }
function select(id) { S.selected = id || 0; renderObject(); requestRender(); if (id) showTab('object', true); }

function showTab(name, soft = false) {
  if (soft && document.querySelector('.tabs [aria-selected="true"]')?.dataset.tab === 'results') return;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
}

function renderClasses() {
  const s = sec(), nObj = {}, nEx = {};
  if (s) for (const o of s.objects.values()) { const c = effClassId(o); if (c) nObj[c] = (nObj[c] || 0) + 1; }
  for (const x of S.sections) for (const o of x.objects.values()) if (o.cls) nEx[o.cls] = (nEx[o.cls] || 0) + 1;
  $('classList').innerHTML = S.classes.map((c) => `
    <li data-id="${c.id}" class="${c.id === S.active ? 'active' : ''} ${c.plain ? 'plain' : ''}">
      <kbd>${keyOf(c)}</kbd>
      <input type="color" value="${c.color}" aria-label="color">
      <input class="name" type="text" value="${esc(c.name)}" aria-label="name">
      <span class="cnt">${t('cls.counts', { n: nObj[c.id] || 0, e: nEx[c.id] || 0 })}</span>
      ${c.fixed ? '<span></span>' : '<button class="del" aria-label="delete">×</button>'}
    </li>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);

$('classList').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  if (e.target.classList.contains('del')) {
    const id = li.dataset.id;
    for (const s of S.sections) for (const o of s.objects.values()) { if (o.cls === id) o.cls = null; if (o.pred === id) o.pred = null; }
    S.classes = S.classes.filter((c) => c.id !== id);
    if (S.active === id) S.active = 'undet';
    for (const s of S.sections) rebuildLUT(s);
    scheduleLearn(); renderClasses(); requestRender(); return;
  }
  if (e.target.tagName !== 'INPUT') setActive(li.dataset.id);
});
$('classList').addEventListener('input', (e) => {
  const li = e.target.closest('li'), c = clsById(li?.dataset.id); if (!c) return;
  if (e.target.type === 'color') { c.color = e.target.value; for (const s of S.sections) rebuildLUT(s); requestRender(); }
  else c.name = e.target.value;
});
$('classList').addEventListener('change', () => { renderObject(); renderLearn(); renderResults(); });
$('addClass').addEventListener('click', () => {
  const palette = ['#5ec2b7', '#c77dff', '#ffb703', '#e76f51', '#90be6d', '#4ea8de', '#f4978e', '#9a8c98'];
  const c = { id: 'c' + uid(), name: t('cls.new'), color: palette[S.classes.length % palette.length], counts: true };
  S.classes.splice(S.classes.length - 1, 0, c); setActive(c.id);
  const inp = document.querySelector(`#classList li[data-id="${c.id}"] input.name`); inp?.focus(); inp?.select();
});

function renderObject() {
  const s = sec(), o = s?.objects.get(S.selected), box = $('objInfo');
  if (!o) { box.innerHTML = `<p class="note">${t('obj.none')}</p>`; return; }
  const st = status(o), ppu = pxPerCm(s), f = o.feat || {}, [, y0, , y1] = o.bbox;
  const opts = [`<option value="">${t('obj.unassigned')}</option>`].concat(S.classes.map((c) => `<option value="${c.id}" ${c.id === o.cls ? 'selected' : ''}>${keyOf(c) ? keyOf(c) + ' · ' : ''}${esc(c.name)}</option>`)).join('');
  const sugg = o.pred ? `<span class="swatch" style="background:${clsById(o.pred)?.color}"></span>${esc(clsById(o.pred)?.name || '')} · ${Math.round(o.conf * 100)}%` : o.novel ? t('obj.novel') : '—';
  const u = s.units, toU = (cm) => cm / UNIT_TO_CM[u];
  box.innerHTML = `
    <dl class="kv">
      <dt>${t('obj.class')}</dt><dd><select id="objCls">${opts}</select></dd>
      <dt>${t('obj.status')}</dt><dd><span class="pill ${st}">${t('obj.' + st)}</span></dd>
      ${o.cls ? '' : `<dt>${t('obj.suggest')}</dt><dd>${sugg}</dd>`}
      <dt>${t('obj.depth')}</dt><dd>${fmt(depthAtRow(s, y0), 3)}–${fmt(depthAtRow(s, y1 + 1), 3)} ${u}</dd>
      <dt>${t('obj.size')}</dt><dd>${fmt(toU(f.majorCm), 3)} × ${fmt(toU(f.minorCm), 3)} ${u}</dd>
      <dt>${t('obj.area')}</dt><dd>${fmt(o.area / (ppu * ppu) / UNIT_TO_CM[u] ** 2, 4)} ${u}² · ${o.area} px</dd>
      <dt>${t('obj.shape')}</dt><dd>${t('obj.elong')} ${fmt(f.elong, 1)} · ${t('obj.vert')} ${fmt(f.vert, 2)}</dd>
    </dl>
    <div class="row">${o.pred && !o.cls ? `<button class="btn small primary" id="objAccept">${t('obj.accept')}</button>` : ''}<button class="btn small" id="objDel">${t('obj.delete')}</button></div>`;
  $('objCls').onchange = (e) => { const v = e.target.value || null; if (v) assignClass(o.id, v); else { const op = beginOp(s); o.cls = null; commitOp(op, true); afterChange(s); } };
  $('objDel').onclick = () => deleteObject(o.id);
  if ($('objAccept')) $('objAccept').onclick = () => assignClass(o.id, o.pred);
}

function renderLearn() {
  const counts = clf.counts || {}, total = clf.n || 0, s = sec();
  const pending = s ? [...s.objects.values()].filter((o) => status(o) === 'predicted').length : 0;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const c = clsById(id); return c ? `<div><span><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</span><em>${n}</em></div>` : '';
  }).join('');
  $('learnStats').innerHTML = total ? `
    <div class="stat"><div><b>${total}</b><span>${t('l.examples')}</span></div>
      <div><b>${clf.accuracy == null ? '—' : Math.round(clf.accuracy * 100) + '%'}</b><span>${clf.accuracy == null ? t('l.accNA') : t('l.accuracy')}</span></div>
      <div><b>${pending}</b><span>${t('l.pending', { n: '' }).trim()}</span></div></div>
    <div class="bars">${rows}</div>
    ${S.library.length ? `<p class="note">${t('l.library')}: ${S.library.length}</p>` : ''}` : `<p class="note">${t('l.none')}</p>`;
  $('acceptPred').disabled = !pending;
}

function renderResults() {
  const s = sec(), sum = $('resSummary'), tab = $('resTable');
  if (!s || !s.bins?.length) { sum.innerHTML = `<p class="note">${t('r.empty')}</p>`; tab.innerHTML = ''; return; }
  let v = 0, b = 0; const cls = new Array(S.classes.length).fill(0);
  for (const x of s.bins) { if (!x.valid) continue; v += x.valid; b += (x.pct / 100) * x.valid; x.classPct.forEach((p, k) => (cls[k] += ((p || 0) / 100) * x.valid)); }
  const eff = effClassArray(s); let nObj = 0; for (const o of s.objects.values()) if (eff[o.id] >= 0) nObj++;
  const ppu = pxPerCm(s), area = v / (ppu * ppu) / UNIT_TO_CM[s.units] ** 2;
  const bars = S.classes.map((c, k) => ({ c, p: v ? (cls[k] / v) * 100 : 0 })).filter((x) => x.p > 0).sort((a, c) => c.p - a.p)
    .map(({ c, p }) => `<div><span>${esc(c.name)}<i style="width:${Math.max(2, p)}%;background:${c.color}"></i></span><em>${fmt(p, 2)}%</em></div>`).join('');
  sum.innerHTML = `
    <div class="stat"><div><b>${fmt(v ? (b / v) * 100 : null, 1)}%</b><span>${t('r.mean')}</span></div>
      <div><b>${fmt(area, area < 10 ? 2 : 0)}</b><span>${t('r.area')} (${s.units}²)</span></div>
      <div><b>${nObj}</b><span>${t('r.objects')}</span></div></div>
    ${bars ? `<div class="lbl">${t('r.byClass')}</div><div class="bars">${bars}</div>` : ''}`;
  const MAX = 600, hasAge = !!S.age.model;
  const opt = (lo, val) => `<option value=""></option>` + Array.from({ length: 7 - lo }, (_, k) => k + lo).map((n) => `<option ${val === n ? 'selected' : ''}>${n}</option>`).join('');
  const rows = s.bins.slice(0, MAX).map((x) => `<tr data-i="${x.index}"><td>${fmt(x.depth, 3)}</td>${hasAge ? `<td>${fmt(x.age, 3)}</td>` : ''}<td>${fmt(x.pct, 2)}</td>
    <td>${x.BI ?? '—'}</td><td><select data-k="BI" aria-label="BI ${t('r.manual')}">${opt(0, x.BIm)}</select></td>
    <td>${x.ii ?? '—'}</td><td><select data-k="ii" aria-label="ii ${t('r.manual')}">${opt(1, x.iim)}</select></td></tr>`).join('');
  tab.innerHTML = `<div class="tablewrap"><table><thead><tr><th>${t('r.depth')} (${s.units})</th>${hasAge ? `<th>${t('r.age')} (${esc(S.age.units)})</th>` : ''}<th>%</th><th>BI</th><th>BI ${t('r.manual')}</th><th>ii</th><th>ii ${t('r.manual')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${s.bins.length > MAX ? `<p class="note">${t('r.tooMany', { n: MAX })}</p>` : ''}`;
}
$('resTable').addEventListener('change', (e) => {
  const sel = e.target.closest('select'), tr = e.target.closest('tr'), s = sec(); if (!sel || !tr || !s) return;
  const b = s.bins[+tr.dataset.i]; setManual(s, b, sel.dataset.k, sel.value === '' ? null : +sel.value);
  analyze(s); requestRender();
});

/* section form */
function renderSectionForm() {
  const s = sec();
  $('secSel').innerHTML = S.sections.map((x, k) => `<option value="${k}" ${k === S.cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  for (const id of ['secName', 'secTop', 'secBottom', 'secUnits', 'secDel', 'roiBtn', 'roiReset', 'rotL', 'rotR', 'detectBtn', 'clearCand']) $(id).disabled = !s;
  if (!s) return;
  $('secName').value = s.name; $('secTop').value = s.top; $('secBottom').value = s.bottom; $('secUnits').value = s.units;
  const ppu = pxPerCm(s);
  $('roiInfo').textContent = `x ${s.roi.x0}–${s.roi.x1} · y ${s.roi.y0}–${s.roi.y1} px · ${fmt(ppu * UNIT_TO_CM[s.units], 2)} px/${s.units}`;
  renderFilterForm(); renderDetectForm(); renderBinNote();
}

function selectSection(k, fresh = false) {
  const prev = sec(); if (prev) prev.view = { ...S.view };
  S.cur = k; S.selected = 0;
  const s = sec();
  renderSectionForm();
  if (s) { rebuildLUT(s); if (s.view && !fresh) { S.view = { ...s.view }; requestRender(); } else requestAnimationFrame(fitView); }
  $('binPx').max = s ? Math.max(10, Math.min(2000, s.roi.y1 - s.roi.y0)) : 500;
  analyze(s); renderResults(); renderClasses(); renderObject(); renderLearn(); requestRender();
}

const FILTER_SLIDERS = [['blackPoint', 0, 254, 1], ['whitePoint', 1, 255, 1], ['gamma', 0.2, 3, 0.05], ['brightness', -100, 100, 1], ['contrast', -100, 100, 1], ['saturation', 0, 300, 5], ['localAmount', 0, 100, 1], ['localRadius', 2, 150, 1]];
const DETECT_SLIDERS = [['offset', 1, 80, 1, 'adaptive'], ['radius', 3, 200, 1, 'adaptive'], ['threshold', 0, 255, 1, 'global'], ['minArea', 1, 2000, 1], ['smooth', 0, 4, 1]];
const slider = (prefix, [k, min, max, step]) => `<div class="slider" data-only="${''}"><span data-i18n="${prefix}.${k}">${t(prefix + '.' + k)}</span><output id="${prefix}o-${k}"></output><input type="range" id="${prefix}-${k}" data-k="${k}" min="${min}" max="${max}" step="${step}"></div>`;

function buildForms() {
  $('filterCtl').innerHTML = FILTER_SLIDERS.map((d) => slider('f', d)).join('');
  $('detectCtl').innerHTML = DETECT_SLIDERS.map((d) => slider('d', d).replace('data-only=""', `data-only="${d[4] || ''}"`)).join('');
  $('fPreset').innerHTML = ['none', 'levels', 'local', 'strong', 'custom'].map((p) => `<option value="${p}">${t('f.p.' + p)}</option>`).join('');
  $('fChannel').innerHTML = ['rgb', 'gray', 'r', 'g', 'b'].map((c) => `<option value="${c}">${t('ch.' + c)}</option>`).join('');
}

function renderFilterForm() {
  const s = sec(); if (!s) return; const f = s.filters;
  for (const [k] of FILTER_SLIDERS) { $('f-' + k).value = f[k]; $('fo-' + k).textContent = f[k]; }
  $('fPreset').value = s.preset || 'custom'; $('fChannel').value = f.channel; $('fEqualize').checked = f.equalize; $('fInvert').checked = f.invert;
}
function renderDetectForm() {
  const s = sec(); if (!s) return; const p = s.detect;
  for (const [k] of DETECT_SLIDERS) { $('d-' + k).value = p[k]; $('do-' + k).textContent = p[k]; }
  $('dMethod').value = p.method; $('dPol').value = p.polarity;
  document.querySelectorAll('#detectCtl [data-only]').forEach((el) => (el.hidden = !!el.dataset.only && el.dataset.only !== p.method));
}
function renderBinNote() {
  const s = sec(); $('binPx').value = S.settings.binPx; $('binOut').textContent = S.settings.binPx + ' px';
  $('binNote').textContent = s ? t('a.binNote', { v: fmt(S.settings.binPx / (pxPerCm(s) * UNIT_TO_CM[s.units]), 3), u: s.units }) : '';
}

let filterTimer = 0;
function refilter() {
  const s = sec(); if (!s) return;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => { s.enh = applyFilters(s.orig, s.w, s.h, s.filters); requestRender(); }, 90);
}
$('filterCtl').addEventListener('input', (e) => {
  const s = sec(), k = e.target.dataset.k; if (!s || !k) return;
  s.filters[k] = +e.target.value; $('fo-' + k).textContent = e.target.value; s.preset = 'custom'; $('fPreset').value = 'custom'; refilter();
});
$('fPreset').addEventListener('change', (e) => { const s = sec(); if (!s || e.target.value === 'custom') return; s.preset = e.target.value; s.filters = { ...FILTER_PRESETS[s.preset] }; renderFilterForm(); refilter(); });
$('fChannel').addEventListener('change', (e) => { const s = sec(); if (!s) return; s.filters.channel = e.target.value; s.preset = 'custom'; $('fPreset').value = 'custom'; refilter(); });
for (const [id, key] of [['fEqualize', 'equalize'], ['fInvert', 'invert']]) $(id).addEventListener('change', (e) => { const s = sec(); if (!s) return; s.filters[key] = e.target.checked; s.preset = 'custom'; $('fPreset').value = 'custom'; refilter(); });

$('detectCtl').addEventListener('input', (e) => { const s = sec(), k = e.target.dataset.k; if (!s || !k) return; s.detect[k] = +e.target.value; $('do-' + k).textContent = e.target.value; });
$('dMethod').addEventListener('change', (e) => { const s = sec(); if (s) { s.detect.method = e.target.value; renderDetectForm(); } });
$('dPol').addEventListener('change', (e) => { const s = sec(); if (s) s.detect.polarity = e.target.value; });
$('detectBtn').addEventListener('click', runDetection);
$('clearCand').addEventListener('click', clearCandidates);

$('binPx').addEventListener('input', (e) => { S.settings.binPx = +e.target.value; renderBinNote(); scheduleAnalysis(); });
$('inclPred').addEventListener('change', (e) => { S.settings.includePred = e.target.checked; scheduleAnalysis(); renderClasses(); });
$('countCand').addEventListener('change', (e) => { S.settings.countCandidates = e.target.checked; scheduleAnalysis(); renderClasses(); });
$('predThr').addEventListener('input', (e) => { S.settings.predThr = +e.target.value; $('thrOut').textContent = Math.round(S.settings.predThr * 100) + '%'; for (const s of S.sections) rebuildLUT(s); renderLearn(); renderClasses(); scheduleAnalysis(); requestRender(); });
$('novelty').addEventListener('input', (e) => { S.settings.novelty = +e.target.value; $('novOut').textContent = '×' + S.settings.novelty; scheduleLearn(); });
$('acceptPred').addEventListener('click', () => {
  const s = sec(); if (!s) return; const op = beginOp(s);
  for (const o of s.objects.values()) if (status(o) === 'predicted') { o.cls = o.pred; o.pred = null; o.conf = 0; }
  commitOp(op, true); afterChange(s);
});

$('secSel').addEventListener('change', (e) => selectSection(+e.target.value));
$('secName').addEventListener('input', (e) => { const s = sec(); if (!s) return; s.name = e.target.value; $('secSel').options[S.cur].textContent = s.name; });
for (const id of ['secTop', 'secBottom', 'secUnits']) $(id).addEventListener('change', () => {
  const s = sec(); if (!s) return;
  const top = parseFloat($('secTop').value), bottom = parseFloat($('secBottom').value);
  if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) { s.top = top; s.bottom = bottom; }
  s.units = $('secUnits').value;
  recomputeFeatures(s); renderSectionForm(); scheduleLearn(); scheduleAnalysis(); requestRender();
});
$('secDel').addEventListener('click', () => {
  if (!sec()) return;
  S.sections.splice(S.cur, 1); S.undo = S.undo.filter((op) => S.sections.includes(op.s)); $('undoBtn').disabled = !S.undo.length;
  selectSection(Math.min(S.cur, S.sections.length - 1)); scheduleLearn();
});
$('roiBtn').addEventListener('click', () => setTool('roi'));
$('roiReset').addEventListener('click', () => { const s = sec(); if (s) setRoi(s, { x0: 0, y0: 0, x1: s.w, y1: s.h }); });
for (const [id, dir] of [['rotL', -1], ['rotR', 1]]) $(id).addEventListener('click', () => {
  const s = sec(); if (!s) return;
  busy(() => {
    s.orig = rotate90(s.orig, s.w, s.h, 4, dir); s.labels = rotate90(s.labels, s.w, s.h, 1, dir); s.exclude = rotate90(s.exclude, s.w, s.h, 1, dir);
    [s.w, s.h] = [s.h, s.w]; s.rot += dir; s.roi = { x0: 0, y0: 0, x1: s.w, y1: s.h };
    s.enh = applyFilters(s.orig, s.w, s.h, s.filters);
    refreshObjects(s, new Set(s.objects.keys()), null);
    S.undo = S.undo.filter((op) => op.s !== s); $('undoBtn').disabled = !S.undo.length;
    selectSection(S.cur, true); afterChange(s);
  });
});

function setAge() {
  S.age.text = $('ageText').value; S.age.units = $('ageUnits').value; S.age.model = parseAgeModel(S.age.text);
  const m = S.age.model;
  $('ageStatus').textContent = m ? t('age.ok', { n: m.depth.length, a: fmt(Math.min(...m.age), 3), b: fmt(Math.max(...m.age), 3), u: S.age.units }) : t('age.none');
  scheduleAnalysis();
}
$('ageText').addEventListener('input', setAge);
$('ageUnits').addEventListener('change', setAge);
$('ageFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; $('ageText').value = await f.text(); setAge(); e.target.value = ''; });

/* toolbar */
document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('brushSize').addEventListener('input', (e) => setBrush(+e.target.value));
$('wandTol').addEventListener('input', (e) => { S.wandTol = +e.target.value; $('tolOut').textContent = S.wandTol; });
$('showOrig').addEventListener('change', (e) => { S.showOrig = e.target.checked; requestRender(); });
$('ovAlpha').addEventListener('input', (e) => { S.ovAlpha = +e.target.value / 100; for (const s of S.sections) rebuildLUT(s); requestRender(); });
$('zoomIn').addEventListener('click', () => zoomAt(view.width / 2, view.height / 2, 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(view.width / 2, view.height / 2, 0.8));
$('zoomFit').addEventListener('click', fitView);
$('undoBtn').addEventListener('click', undo);
$('nextReview').addEventListener('click', () => nextReview());
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

for (const id of ['addImg', 'addImg2']) $(id).addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
$('loadExample').addEventListener('click', loadExample);
const vp = $('viewport');
vp.addEventListener('dragover', (e) => { e.preventDefault(); vp.classList.add('drop'); });
vp.addEventListener('dragleave', () => vp.classList.remove('drop'));
vp.addEventListener('drop', (e) => { e.preventDefault(); vp.classList.remove('drop'); const f = [...e.dataTransfer.files]; if (f.length) addFiles(f); });

/* ───────────── files out ───────────── */

async function saveFile(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); toast(t('saved')); }
    catch (e) { if (e?.code !== 'declined') toast(e?.message || String(e)); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const safe = (s) => String(s).replace(/[^\w.-]+/g, '_').slice(0, 80) || 'section';

$('expCSV').addEventListener('click', () => {
  const counted = S.classes.map((c, k) => [c, k]).filter(([c]) => c.counts);
  const head = ['section', 'depth_top', 'depth_bottom', 'depth', 'units', 'age', 'age_units', 'valid_pixels', 'bioturbation_pct', ...counted.map(([c]) => c.name + '_pct'), 'BI', 'ii', 'BI_manual', 'ii_manual'];
  const rows = [head];
  for (const s of S.sections) {
    analyze(s);
    for (const b of s.bins) rows.push([s.name, b.dTop, b.dBottom, b.depth, s.units, b.age, S.age.model ? S.age.units : null, b.valid, b.pct, ...counted.map(([, k]) => b.classPct[k]), b.BI, b.ii, b.BIm, b.iim]);
  }
  analyze(sec());
  saveFile(`${safe(S.name)}_bioturbation.csv`, toCSV(rows), 'text/csv');
});

$('expObjects').addEventListener('click', () => {
  const rows = [['section', 'object_id', 'class', 'status', 'suggested_class', 'confidence', 'depth_top', 'depth_bottom', 'depth_center', 'units', 'area_cm2', 'length_cm', 'width_cm', 'elongation', 'verticality', 'compactness', 'mean_luminance', 'contrast', 'counted']];
  for (const s of S.sections) {
    const eff = effClassArray(s);
    for (const o of s.objects.values()) {
      if (!o.bbox) continue; const f = o.feat || {};
      rows.push([s.name, o.id, clsById(o.cls)?.name ?? '', status(o), clsById(o.pred)?.name ?? '', o.cls ? 1 : o.conf, depthAtRow(s, o.bbox[1]), depthAtRow(s, o.bbox[3] + 1), depthAtRow(s, f.cy + 0.5), s.units,
        f.areaCm2, f.majorCm, f.minorCm, f.elong, f.vert, f.compact, f.meanL, f.contrast, eff[o.id] >= 0 ? 1 : 0]);
    }
  }
  saveFile(`${safe(S.name)}_objects.csv`, toCSV(rows), 'text/csv');
});

$('expMask').addEventListener('click', () => {
  const s = sec(); if (!s) return;
  busy(async () => {
    const eff = effClassArray(s), cols = S.classes.map((c) => hex(c.color));
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const x = c.getContext('2d'), im = x.createImageData(s.w, s.h), d = im.data;
    for (let i = 0, j = 0; i < s.labels.length; i++, j += 4) {
      const k = s.labels[i] ? eff[s.labels[i]] : -1;
      if (k >= 0 && !s.exclude[i]) { d[j] = cols[k][0]; d[j + 1] = cols[k][1]; d[j + 2] = cols[k][2]; }
      d[j + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await saveFile(`${safe(s.name)}_mask.png`, blob, 'image/png');
  });
});

$('expPalette').addEventListener('click', () => {
  const pal = Object.fromEntries(S.classes.filter((c) => c.counts).map((c) => [c.name, c.color]));
  saveFile(`${safe(S.name)}_palette.json`, JSON.stringify(pal, null, 2), 'application/json');
});

function modelExamples() {
  const ex = [];
  for (const s of S.sections) for (const o of s.objects.values()) if (o.cls && o.feat) ex.push({ name: clsById(o.cls).name, x: vec(o.feat).map((v) => +v.toFixed(5)) });
  return ex.concat(S.library);
}
$('exportModel').addEventListener('click', () => {
  const used = new Set(modelExamples().map((e) => e.name));
  const model = { app: 'IchAnTool', kind: 'model', version: 1, features: FEATURES, classes: S.classes.filter((c) => used.has(c.name)).map(({ name, color, counts }) => ({ name, color, counts })), examples: modelExamples() };
  saveFile('ichantool_model.json', JSON.stringify(model), 'application/json');
});
$('importModel').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const m = JSON.parse(await f.text());
    if (m.kind !== 'model' || JSON.stringify(m.features) !== JSON.stringify(FEATURES)) throw new Error();
    for (const c of m.classes) if (!S.classes.some((k) => k.name === c.name)) S.classes.splice(S.classes.length - 1, 0, { id: 'c' + uid(), name: c.name, color: c.color, counts: c.counts !== false });
    S.library = S.library.concat(m.examples.filter((x) => Array.isArray(x.x) && x.x.length === FEATURES.length));
    scheduleLearn(); renderClasses();
  } catch { toast(t('err.project')); }
});
$('clearLib').addEventListener('click', () => { S.library = []; scheduleLearn(); });

/* ───────────── project ───────────── */

$('saveProj').addEventListener('click', () => busy(async () => {
  const proj = {
    app: 'IchAnTool', kind: 'project', version: 1, appVersion: VERSION, saved: new Date().toISOString(), name: S.name,
    classes: S.classes, active: S.active, settings: S.settings, age: { text: S.age.text, units: S.age.units }, library: S.library,
    sections: S.sections.map((s) => ({
      id: s.id, name: s.name, file: { name: s.file.name, type: s.file.type, b64: b64encode(s.file.bytes) }, rot: s.rot, w: s.w, h: s.h,
      top: s.top, bottom: s.bottom, units: s.units, roi: s.roi, filters: s.filters, preset: s.preset, detect: s.detect, manual: s.manual,
      nextId: s.nextId, objects: [...s.objects.values()].map((o) => ({ id: o.id, cls: o.cls, src: o.src })),
      labels: rleEncode(s.labels), exclude: rleEncode(s.exclude),
    })),
  };
  await saveFile(`${safe(S.name)}.ichantool.json`, JSON.stringify(proj), 'application/json');
}));

$('openProj').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  await busy(async () => {
    let p;
    try { p = JSON.parse(await f.text()); if (p.app !== 'IchAnTool' || p.kind !== 'project') throw new Error(); }
    catch { toast(t('err.project')); return; }
    resetState();
    S.name = p.name || f.name.replace(/\.ichantool\.json$|\.json$/i, '');
    S.classes = p.classes; S.active = p.active || 'undet'; Object.assign(S.settings, p.settings); S.library = p.library || [];
    $('ageText').value = p.age?.text || ''; $('ageUnits').value = p.age?.units || 'ka';
    for (const q of p.sections) {
      const bytes = b64decode(q.file.b64);
      let { w, h, rgba } = await decodeBytes(bytes, q.file.name, q.file.type);
      const turns = ((q.rot % 4) + 4) % 4;
      for (let k = 0; k < turns; k++) { rgba = rotate90(rgba, w, h, 4, 1); [w, h] = [h, w]; }
      const s = newSection({ name: q.name, file: { name: q.file.name, type: q.file.type, bytes }, w, h, orig: rgba });
      Object.assign(s, { id: q.id, rot: q.rot, top: q.top, bottom: q.bottom, units: q.units, roi: q.roi, filters: q.filters, preset: q.preset, detect: q.detect, manual: q.manual || [], nextId: q.nextId });
      s.enh = applyFilters(s.orig, w, h, s.filters);
      s.labels = rleDecode(q.labels, w * h, Int32Array); s.exclude = rleDecode(q.exclude, w * h, Uint8Array);
      for (const o of q.objects) s.objects.set(o.id, { id: o.id, cls: o.cls, src: o.src, pred: null, conf: 0, area: 0, bbox: null, stats: null, feat: null });
      refreshObjects(s, new Set(s.objects.keys()), null);
      S.sections.push(s);
    }
    syncSettingsForm(); setAge(); selectSection(0, true); learnNow(); toast(t('loaded'));
  });
});

function resetState() {
  S.sections = []; S.cur = -1; S.undo = []; S.selected = 0; S.library = []; S.classes = defaultClasses(); S.active = 'undet';
  S.settings = { binPx: 50, includePred: true, predThr: 0.7, countCandidates: true, novelty: 3 };
  $('undoBtn').disabled = true; $('detectStatus').textContent = '';
}
$('newProj').addEventListener('click', () => $('confirmNew').showModal());
$('cnNo').addEventListener('click', () => $('confirmNew').close());
$('cnYes').addEventListener('click', () => {
  $('confirmNew').close(); resetState(); $('ageText').value = ''; setAge(); syncSettingsForm(); selectSection(-1); learnNow();
});

/* ───────────── misc ───────────── */

let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 3200); }

async function busy(fn) {
  $('busy').hidden = false;
  await new Promise((r) => setTimeout(r, 30));
  try { await fn(); } finally { $('busy').hidden = true; }
}

function syncSettingsForm() {
  const st = S.settings;
  $('inclPred').checked = st.includePred; $('countCand').checked = st.countCandidates;
  $('predThr').value = st.predThr; $('thrOut').textContent = Math.round(st.predThr * 100) + '%';
  $('novelty').value = st.novelty; $('novOut').textContent = '×' + st.novelty;
  renderBinNote();
}

function applyLanguage() {
  applyI18n(); buildForms(); renderSectionForm(); renderClasses(); renderObject(); renderLearn(); renderResults(); setAge();
  $('langBtn').textContent = lang() === 'es' ? 'EN' : 'ES';
  requestRender();
}
$('langBtn').addEventListener('click', () => { setLang(lang() === 'es' ? 'en' : 'es'); applyLanguage(); });
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('helpClose').addEventListener('click', () => $('help').close());

/* ───────────── start ───────────── */

new ResizeObserver(resizeCanvases).observe(vp);
buildForms(); applyLanguage(); syncSettingsForm();
setTool('select'); setBrush(10); $('wandTol').value = S.wandTol; $('tolOut').textContent = S.wandTol; $('ovAlpha').value = S.ovAlpha * 100;
resizeCanvases();
loadExample();

// Exposed for automated tests.
window.ichantool = { S, runDetection, analyze, assignClass, learnNow, setTool, nextReview, BI, II };
