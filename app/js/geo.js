// IchAnTool web — multi-proxy geochemical interpretation (no DOM).
// Cores → resampled samples → labels (intervals + rules) → machine learning → classes per sample → maps.
import { parseAgeModel, interpAge } from './core.js';
import { niceTicks } from './log.js';

/* ───────── utilities ───────── */

/** Seeded pseudo-random generator (mulberry32): every training run is reproducible from its seed. */
export function seededRandom(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a, m = mean(a)) => Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || 1;
const lerp = (xs, ys, x) => interpAge({ depth: xs, age: ys }, x);

/* ───────── import ───────── */

/**
 * Cores from a long table. roles = {core, lat, lon, depth, age, proxies:[col]} (column indices; -1 = none).
 * tab = parseTable output, but with the core column kept as text (rowsText).
 */
export function coresFromLongTable(tab, roles) {
  const by = new Map();
  tab.rows.forEach((r, i) => {
    const name = String(tab.text[i][roles.core] ?? '').trim(); if (!name) return;
    if (!by.has(name)) by.set(name, { name, lat: null, lon: null, rows: [] });
    const c = by.get(name);
    if (roles.lat >= 0 && c.lat == null && r[roles.lat] != null) c.lat = r[roles.lat];
    if (roles.lon >= 0 && c.lon == null && r[roles.lon] != null) c.lon = r[roles.lon];
    c.rows.push(r);
  });
  return [...by.values()].map((c) => coreFromRows(c.name, c.rows, tab.headers, roles, c.lat, c.lon));
}

/** One core from a table (rows of numbers). */
export function coreFromRows(name, rows, headers, roles, lat = null, lon = null) {
  const key = roles.depth >= 0 ? roles.depth : roles.age;
  const sorted = rows.filter((r) => r[key] != null).sort((a, b) => a[key] - b[key]);
  const proxies = {};
  for (const c of roles.proxies) proxies[headers[c]] = sorted.map((r) => r[c]);
  return {
    name, lat, lon,
    depth: roles.depth >= 0 ? sorted.map((r) => r[roles.depth]) : null,
    age: roles.age >= 0 ? sorted.map((r) => r[roles.age]) : null,
    proxies,
  };
}

/** Assign coordinates (and water depth) from a catalogue table, matching core names case-insensitively. */
export function applyCatalogue(cores, tab, roles) {
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  let n = 0;
  tab.text.forEach((row, i) => {
    const c = cores.find((k) => norm(k.name) === norm(row[roles.core])); if (!c) return;
    const r = tab.rows[i];
    if (roles.lat >= 0 && r[roles.lat] != null) c.lat = r[roles.lat];
    if (roles.lon >= 0 && r[roles.lon] != null) c.lon = r[roles.lon];
    if (roles.wd >= 0 && r[roles.wd] != null) c.waterDepth = r[roles.wd];
    n++;
  });
  return n;
}

/** Age of each row: the age column if present, else the core's age model applied to depth. */
export function coreAges(core) {
  if (core.age) return core.age;
  const m = parseAgeModel(core.ageText || '');
  return core.depth && m ? core.depth.map((d) => interpAge(m, d)) : null;
}

/** Convert a value between depth and age within one core (linear interpolation between its rows). */
export function coreConvert(core, v, from, to) {
  if (from === to || v == null) return v;
  const ages = coreAges(core); if (!ages || !core.depth) return null;
  const pairs = core.depth.map((d, i) => [d, ages[i]]).filter((p) => p[0] != null && p[1] != null);
  const src = from === 'depth' ? 0 : 1, dst = 1 - src;
  pairs.sort((a, b) => a[src] - b[src]);
  return lerp(pairs.map((p) => p[src]), pairs.map((p) => p[dst]), v);
}

/* ───────── samples ───────── */

/** Raw (untransformed) value series of one feature in a core; ratios "A/B" are computed row by row. */
export function featureSeries(core, name, ratios = []) {
  if (core.proxies[name]) return core.proxies[name];
  const r = ratios.find((q) => `${q.a}/${q.b}` === name);
  if (r && core.proxies[r.a] && core.proxies[r.b]) return core.proxies[r.a].map((v, i) => { const d = core.proxies[r.b][i]; return v != null && d ? v / d : null; });
  return null;
}

/** Linear resampling onto a grid; null outside the data range or across gaps wider than maxGap. */
export function resample(xs, ys, grid, maxGap = Infinity) {
  const p = xs.map((x, i) => [x, ys[i]]).filter((q) => q[0] != null && q[1] != null).sort((a, b) => a[0] - b[0]);
  const X = p.map((q) => q[0]), Y = p.map((q) => q[1]);
  return grid.map((g) => {
    if (!X.length || g < X[0] || g > X[X.length - 1]) return null;
    let lo = 0, hi = X.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= g) lo = m; else hi = m; }
    if (X[hi] - X[lo] > maxGap) return null;
    return X[hi] === X[lo] ? Y[lo] : Y[lo] + ((g - X[lo]) / (X[hi] - X[lo])) * (Y[hi] - Y[lo]);
  });
}

/**
 * Build samples on a regular grid of the chosen axis.
 * cfg = {axis, step, features, ratios, logs (array of names), scaling: 'global'|'core'|'none', maxGap}
 * Each sample: {core, x, depth, age, raw[], zc[] (per-core z), f[] (model features)}.
 */
export function buildSamples(cores, cfg) {
  const F = cfg.features, LF = cfg.layers || [], out = [];
  for (const core of cores) {
    const ages = coreAges(core);
    const xs = cfg.axis === 'age' ? ages : core.depth;
    if (!xs) continue;
    const valid = xs.filter((v) => v != null); if (valid.length < 2) continue;
    const lo = Math.ceil(Math.min(...valid) / cfg.step) * cfg.step, hi = Math.max(...valid);
    const grid = []; for (let g = lo; g <= hi + 1e-9; g += cfg.step) grid.push(+g.toFixed(10));
    const cols = F.map((name) => {
      const s = featureSeries(core, name, cfg.ratios); if (!s) return grid.map(() => null);
      return resample(xs, s, grid, cfg.maxGap ?? Infinity);
    });
    const tr = cols.map((col, j) => (cfg.logs?.includes(F[j]) ? col.map((v) => (v != null && v > 0 ? Math.log10(v) : null)) : col));
    const rows = [];
    grid.forEach((g, i) => {
      const raw = cols.map((c) => c[i]), tv = tr.map((c) => c[i]);
      if (tv.some((v) => v == null)) return;
      rows.push({ core: core.id ?? core.name, x: g, raw, t: tv,
        depth: cfg.axis === 'depth' ? g : coreConvert(core, g, 'age', 'depth'),
        age: cfg.axis === 'age' ? g : coreConvert(core, g, 'depth', 'age') });
    });
    if (rows.length) {
      const mu = F.map((_, j) => mean(rows.map((r) => r.t[j]))), sd = F.map((_, j) => std(rows.map((r) => r.t[j]), mu[j]));
      for (const r of rows) r.zc = r.t.map((v, j) => (v - mu[j]) / sd[j]);
    }
    if (LF.length) {
      const ivs = intervalsOnAxis((cfg.intervals || []).filter((q) => q.core === (core.id ?? core.name) && !q.auto), cfg.axis, core);
      for (const r of rows) r.cat = LF.flatMap((l) => l.cats.map((c) => (ivs.some((q) => q.layer === l.id && (q.cat ?? q.label) === c.id && r.x >= q.from && r.x < q.to) ? 1 : 0)));
    }
    out.push(...rows);
  }
  if (cfg.scaling === 'core') for (const r of out) r.f = r.zc.slice();
  else if (cfg.scaling === 'none') for (const r of out) r.f = r.t.slice();
  else if (out.length) {
    const mu = F.map((_, j) => mean(out.map((r) => r.t[j]))), sd = F.map((_, j) => std(out.map((r) => r.t[j]), mu[j]));
    for (const r of out) r.f = r.t.map((v, j) => (v - mu[j]) / sd[j]);
  }
  // Interval layers: one 0/1 column per category, appended unscaled after the numeric variables.
  for (const r of out) if (r.cat) { r.raw.push(...r.cat); r.t.push(...r.cat); r.zc.push(...r.cat); r.f.push(...r.cat); delete r.cat; }
  return out;
}

/** Names of the 0/1 columns created from interval layers ("Layer: category"). */
export function layerFeatureNames(layers) { return layers.flatMap((l) => l.cats.map((c) => `${l.name}: ${c.name}`)); }

/** Intervals expressed on one axis of one core (converted with the core's depth–age relation when needed). */
export function intervalsOnAxis(list, axis, core) {
  return list.map((q) => {
    if (q.axis === axis) return q;
    if (!core) return null;
    const a = coreConvert(core, q.from, q.axis, axis), b = coreConvert(core, q.to, q.axis, axis);
    return a == null || b == null ? null : { ...q, from: Math.min(a, b), to: Math.max(a, b) };
  }).filter(Boolean);
}

/** Ids of intervals of a child layer that are not inside any interval of its parent layer (same core). */
export function orphanIntervals(intervals, layers, cores) {
  const parent = new Map(layers.map((l) => [l.id, l.parent])), byCore = new Map(cores.map((c) => [c.id ?? c.name, c]));
  return intervals.filter((q) => {
    const p = parent.get(q.layer); if (!p) return false;
    const ps = intervalsOnAxis(intervals.filter((x) => x.layer === p && x.core === q.core), q.axis, byCore.get(q.core));
    return !ps.some((x) => x.from <= q.from + 1e-9 && x.to >= q.to - 1e-9);
  }).map((q) => q.id);
}

/**
 * Intervals from a table. roles = {core (-1 = use defaultCore), from, to, layer (-1 = each value column is a layer), values:[col]}.
 * Returns [{core, layer, value, from, to}] with names (text), skipping empty values.
 */
export function intervalsFromTable(tab, roles, defaultCore = '') {
  const out = [];
  tab.rows.forEach((r, i) => {
    const a = r[roles.from], b = r[roles.to]; if (a == null || b == null || a === b) return;
    const txt = tab.text[i], core = roles.core >= 0 ? String(txt[roles.core] ?? '').trim() : defaultCore; if (!core) return;
    const from = Math.min(a, b), to = Math.max(a, b);
    if (roles.layer >= 0) {
      const layer = String(txt[roles.layer] ?? '').trim(), value = String(txt[roles.values[0]] ?? '').trim();
      if (layer && value) out.push({ core, layer, value, from, to });
    } else for (const c of roles.values) { const value = String(txt[c] ?? '').trim(); if (value) out.push({ core, layer: tab.headers[c], value, from, to }); }
  });
  return out;
}

/* ───────── labels ───────── */

/** Rule condition: {feature, op: 'z>'|'z<'|'>'|'<', value}. 'z' uses the per-core z-score. */
export function ruleMatches(rule, sample, features) {
  return rule.conds.length > 0 && rule.conds.every((c) => {
    const j = features.indexOf(c.feature); if (j < 0) return false;
    const v = c.op.startsWith('z') ? sample.zc[j] : sample.raw[j];
    return c.op.endsWith('>') ? v > c.value : v < c.value;
  });
}

/**
 * Label of every sample: manual intervals first; then the first enabled rule that matches (if useRules).
 * intervals: [{core, layer, axis, from, to, cat}] (axis in which they were drawn; converted when needed).
 * With `layer`, only intervals and rules of that layer (the classification target) are used.
 * Intervals with `auto` (accepted predictions) never become training labels.
 */
export function labelSamples(samples, { intervals = [], rules = [], useRules = true, features, axis, cores, layer = null }) {
  const byCore = new Map(cores.map((c) => [c.id ?? c.name, c]));
  const mine = intervals.filter((q) => !q.auto && (layer == null || q.layer === layer));
  const iv = mine.flatMap((q) => intervalsOnAxis([q], axis, byCore.get(q.core)));
  const rl = rules.filter((r) => layer == null || r.layer === layer);
  return samples.map((s) => {
    const hit = iv.find((q) => q.core === s.core && s.x >= q.from && s.x < q.to);
    if (hit) return { label: hit.cat ?? hit.label, source: 'interval' };
    if (useRules) for (const r of rl) if (r.enabled !== false && ruleMatches(r, s, features)) return { label: r.cat ?? r.label, source: 'rule' };
    return { label: null, source: null };
  });
}

/* ───────── classifiers ───────── */

export const METHODS = {
  rf: { defaults: { trees: 100, maxDepth: 12, minLeaf: 3, mtry: 'sqrt', bins: 32, bootstrap: true, balanced: true } },
  knn: { defaults: { k: 7, weights: 'distance' } },
  nb: { defaults: { smoothing: 1e-6, priors: 'uniform' } },
  kmeans: { defaults: { k: 4, restarts: 5, maxIter: 100 } },
};

function knnFit(X, y, p) { return { kind: 'knn', X, y, k: p.k, weights: p.weights, classes: [...new Set(y)] }; }
function knnProba(m, x) {
  const d = m.X.map((xi, i) => [Math.hypot(...xi.map((v, j) => v - x[j])), m.y[i]]).sort((a, b) => a[0] - b[0]).slice(0, m.k);
  const out = {}; let tot = 0;
  for (const [dist, c] of d) { const w = m.weights === 'distance' ? 1 / (dist + 1e-9) : 1; out[c] = (out[c] || 0) + w; tot += w; }
  for (const c in out) out[c] /= tot;
  return out;
}

function nbFit(X, y, p) {
  const classes = [...new Set(y)], d = X[0].length, model = { kind: 'nb', classes, stats: {} };
  const maxVar = Math.max(...Array.from({ length: d }, (_, j) => std(X.map((r) => r[j])) ** 2));
  for (const c of classes) {
    const rows = X.filter((_, i) => y[i] === c);
    const mu = Array.from({ length: d }, (_, j) => mean(rows.map((r) => r[j])));
    const va = mu.map((m, j) => std(rows.map((r) => r[j]), m) ** 2 + p.smoothing * maxVar);
    model.stats[c] = { mu, va, prior: p.priors === 'uniform' ? 1 / classes.length : rows.length / X.length };
  }
  return model;
}
function nbProba(m, x) {
  const ll = {};
  for (const c of m.classes) {
    const { mu, va, prior } = m.stats[c];
    ll[c] = Math.log(prior) + x.reduce((s, v, j) => s - 0.5 * Math.log(2 * Math.PI * va[j]) - ((v - mu[j]) ** 2) / (2 * va[j]), 0);
  }
  const mx = Math.max(...Object.values(ll)); let tot = 0; const out = {};
  for (const c in ll) { out[c] = Math.exp(ll[c] - mx); tot += out[c]; }
  for (const c in out) out[c] /= tot;
  return out;
}

/** Random forest of CART trees (Gini), candidate thresholds at feature quantiles (`bins`). */
function rfFit(X, y, p, seed) {
  const rnd = seededRandom(seed), n = X.length, d = X[0].length, classes = [...new Set(y)], K = classes.length;
  const yi = y.map((c) => classes.indexOf(c));
  const counts = classes.map((_, k) => yi.filter((v) => v === k).length);
  const cw = classes.map((_, k) => (p.balanced ? n / (K * counts[k]) : 1));
  const thr = Array.from({ length: d }, (_, j) => {
    const v = X.map((r) => r[j]).sort((a, b) => a - b), t = new Set();
    for (let b = 1; b < p.bins; b++) t.add(v[Math.floor((b / p.bins) * (n - 1))]);
    return [...t];
  });
  const mtry = p.mtry === 'all' ? d : p.mtry === 'log2' ? Math.max(1, Math.round(Math.log2(d))) : p.mtry === 'sqrt' ? Math.max(1, Math.round(Math.sqrt(d))) : Math.min(d, Math.max(1, +p.mtry));
  const importance = new Array(d).fill(0);
  const gini = (h, w) => { if (!w) return 0; let s = 1; for (const v of h) s -= (v / w) ** 2; return s; };
  const hist = (idx) => { const h = new Array(K).fill(0); for (const i of idx) h[yi[i]] += cw[yi[i]]; return h; };
  function grow(idx, depth) {
    const h = hist(idx), w = h.reduce((a, b) => a + b, 0);
    const leaf = () => ({ p: h.map((v) => v / w) });
    if (depth >= p.maxDepth || idx.length < 2 * p.minLeaf || h.filter((v) => v > 0).length < 2) return leaf();
    const feats = []; const pool = [...Array(d).keys()];
    while (feats.length < mtry) feats.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const g0 = gini(h, w); let best = null;
    for (const j of feats) {
      for (const t of thr[j]) {
        const hl = new Array(K).fill(0); let nl = 0;
        for (const i of idx) if (X[i][j] <= t) { hl[yi[i]] += cw[yi[i]]; nl++; }
        const nr = idx.length - nl; if (nl < p.minLeaf || nr < p.minLeaf) continue;
        const wl = hl.reduce((a, b) => a + b, 0), hr = h.map((v, k) => v - hl[k]), wr = w - wl;
        const gain = g0 - (wl / w) * gini(hl, wl) - (wr / w) * gini(hr, wr);
        if (!best || gain > best.gain) best = { j, t, gain };
      }
    }
    if (!best || best.gain <= 1e-12) return leaf();
    importance[best.j] += best.gain * w;
    const L = [], R = []; for (const i of idx) (X[i][best.j] <= best.t ? L : R).push(i);
    return { j: best.j, t: best.t, l: grow(L, depth + 1), r: grow(R, depth + 1) };
  }
  const trees = [];
  for (let b = 0; b < p.trees; b++) {
    const idx = p.bootstrap ? Array.from({ length: n }, () => Math.floor(rnd() * n)) : [...Array(n).keys()];
    trees.push(grow(idx, 0));
  }
  const tot = importance.reduce((a, b) => a + b, 0) || 1;
  return { kind: 'rf', classes, trees, importance: importance.map((v) => v / tot) };
}
function rfProba(m, x) {
  const acc = new Array(m.classes.length).fill(0);
  for (const tree of m.trees) { let nd = tree; while (!nd.p) nd = x[nd.j] <= nd.t ? nd.l : nd.r; nd.p.forEach((v, k) => (acc[k] += v)); }
  const out = {}; m.classes.forEach((c, k) => (out[c] = acc[k] / m.trees.length));
  return out;
}

/** k-means (k-means++ initialisation, several restarts; best inertia kept). Unsupervised: classes are groups. */
export function kmeansFit(X, p, seed) {
  const rnd = seededRandom(seed); let best = null;
  const d2 = (a, b) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);
  for (let rs = 0; rs < p.restarts; rs++) {
    const C = [X[Math.floor(rnd() * X.length)].slice()];
    while (C.length < p.k) {
      const dist = X.map((x) => Math.min(...C.map((c) => d2(x, c)))), tot = dist.reduce((a, b) => a + b, 0);
      let r = rnd() * tot, i = 0; while (i < X.length - 1 && (r -= dist[i]) > 0) i++;
      C.push(X[i].slice());
    }
    let assign = new Array(X.length).fill(-1);
    for (let it = 0; it < p.maxIter; it++) {
      const next = X.map((x) => { let bi = 0, bd = Infinity; C.forEach((c, k) => { const dd = d2(x, c); if (dd < bd) { bd = dd; bi = k; } }); return bi; });
      const changed = next.some((v, i) => v !== assign[i]); assign = next;
      for (let k = 0; k < p.k; k++) { const rows = X.filter((_, i) => assign[i] === k); if (rows.length) C[k] = rows[0].map((_, j) => mean(rows.map((r) => r[j]))); }
      if (!changed) break;
    }
    const inertia = X.reduce((s, x, i) => s + d2(x, C[assign[i]]), 0);
    if (!best || inertia < best.inertia) best = { centers: C, inertia };
  }
  return { kind: 'kmeans', classes: best.centers.map((_, k) => `G${k + 1}`), centers: best.centers, inertia: best.inertia };
}
function kmeansProba(m, x) {
  const d = m.centers.map((c) => Math.sqrt(c.reduce((s, v, j) => s + (v - x[j]) ** 2, 0)));
  const k = d.indexOf(Math.min(...d)), out = {}; m.classes.forEach((c, i) => (out[c] = i === k ? 1 : 0));
  return out;
}

export function fitModel(method, X, y, params, seed = 42) {
  const p = { ...METHODS[method].defaults, ...params };
  if (method === 'rf') return rfFit(X, y, p, seed);
  if (method === 'knn') return knnFit(X, y, p);
  if (method === 'nb') return nbFit(X, y, p);
  if (method === 'kmeans') return kmeansFit(X, p, seed);
  throw new Error('unknown method ' + method);
}
export function predictProba(model, x) {
  return model.kind === 'rf' ? rfProba(model, x) : model.kind === 'knn' ? knnProba(model, x) : model.kind === 'nb' ? nbProba(model, x) : kmeansProba(model, x);
}
export function predictLabel(model, x, minProb = 0) {
  const pr = predictProba(model, x); let best = null, bp = -1;
  for (const [c, v] of Object.entries(pr)) if (v > bp) { best = c; bp = v; }
  return { label: bp >= minProb ? best : null, prob: bp };
}

/* ───────── validation ───────── */

/**
 * Cross-validation. With ≥2 labelled cores: leave-one-core-out (no core is both trained and tested).
 * Otherwise: 5 folds of contiguous blocks along the axis within each core (limits autocorrelation leakage).
 */
export function crossValidate(samples, labels, method, params, seed = 42) {
  const idx = samples.map((_, i) => i).filter((i) => labels[i] != null);
  const cores = [...new Set(idx.map((i) => samples[i].core))];
  let folds;
  if (cores.length >= 2) folds = cores.map((c) => idx.filter((i) => samples[i].core === c));
  else {
    const sorted = [...idx].sort((a, b) => samples[a].x - samples[b].x), k = Math.min(5, sorted.length);
    folds = Array.from({ length: k }, (_, f) => sorted.slice(Math.floor((f * sorted.length) / k), Math.floor(((f + 1) * sorted.length) / k)));
  }
  const classes = [...new Set(idx.map((i) => labels[i]))].sort(), cm = classes.map(() => classes.map(() => 0));
  for (const test of folds) {
    const tset = new Set(test), train = idx.filter((i) => !tset.has(i));
    if (new Set(train.map((i) => labels[i])).size < 2 || !test.length) continue;
    const m = fitModel(method, train.map((i) => samples[i].f), train.map((i) => labels[i]), params, seed);
    for (const i of test) { const pl = predictLabel(m, samples[i].f).label; const a = classes.indexOf(labels[i]), b = classes.indexOf(pl); if (a >= 0 && b >= 0) cm[a][b]++; }
  }
  const total = cm.flat().reduce((a, b) => a + b, 0), correct = classes.reduce((s, _, k) => s + cm[k][k], 0);
  const perClass = classes.map((c, k) => {
    const tp = cm[k][k], fn = cm[k].reduce((a, b) => a + b, 0) - tp, fp = cm.reduce((s, r) => s + r[k], 0) - tp;
    const precision = tp + fp ? tp / (tp + fp) : null, recall = tp + fn ? tp / (tp + fn) : null;
    return { label: c, precision, recall, f1: precision && recall ? (2 * precision * recall) / (precision + recall) : 0, n: tp + fn };
  });
  const rec = perClass.filter((q) => q.recall != null);
  return { scheme: cores.length >= 2 ? 'leave-one-core-out' : 'blocked-5-fold', folds: folds.length, classes, cm, total,
    accuracy: total ? correct / total : null, balancedAccuracy: rec.length ? mean(rec.map((q) => q.recall)) : null, perClass };
}

/* ───────── maps ───────── */

/**
 * Per-core summary inside an age window [a0, a1).
 * mode 'class': fraction of samples per predicted class (dominant class reported);
 * mode 'value': mean of feature j (z-scored per core), optionally minus the mean in a reference window.
 */
export function mapSummary(samples, preds, cores, { a0, a1, mode, feature = 0, ref = null }) {
  return cores.filter((c) => c.lat != null && c.lon != null).map((c) => {
    const id = c.id ?? c.name;
    const sel = samples.map((s, i) => [s, i]).filter(([s]) => s.core === id && s.age != null && s.age >= a0 && s.age < a1);
    if (!sel.length) return { core: id, name: c.name, lat: c.lat, lon: c.lon, n: 0 };
    if (mode === 'class') {
      const cnt = {}; for (const [, i] of sel) { const l = preds[i]?.label; if (l != null) cnt[l] = (cnt[l] || 0) + 1; }
      const [dom, k] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      return { core: id, name: c.name, lat: c.lat, lon: c.lon, n: sel.length, dominant: dom, fraction: k / sel.length, counts: cnt };
    }
    let v = mean(sel.map(([s]) => s.zc[feature]));
    if (ref) {
      const r = samples.filter((s) => s.core === id && s.age != null && s.age >= ref[0] && s.age < ref[1]);
      if (!r.length) return { core: id, name: c.name, lat: c.lat, lon: c.lon, n: 0 };
      v -= mean(r.map((s) => s.zc[feature]));
    }
    return { core: id, name: c.name, lat: c.lat, lon: c.lon, n: sel.length, value: v };
  });
}

/** Inverse-distance-weighted grid (exploratory). Distances in degrees with longitude scaled by cos(lat). */
export function idwGrid(points, bbox, nx, ny, power = 2, maxDist = Infinity) {
  const pts = points.filter((p) => p.value != null), cosl = Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180), out = [];
  for (let iy = 0; iy < ny; iy++) {
    const lat = bbox[3] - ((iy + 0.5) / ny) * (bbox[3] - bbox[1]);
    for (let ix = 0; ix < nx; ix++) {
      const lon = bbox[0] + ((ix + 0.5) / nx) * (bbox[2] - bbox[0]);
      let sw = 0, sv = 0, hit = null;
      for (const p of pts) {
        const d = Math.hypot((p.lon - lon) * cosl, p.lat - lat);
        if (d < 1e-9) { hit = p.value; break; }
        if (d > maxDist) continue;
        const w = 1 / d ** power; sw += w; sv += w * p.value;
      }
      out.push(hit ?? (sw ? sv / sw : null));
    }
  }
  return out;
}

const esc2 = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);

/** Diverging colour (blue–cream–red) for z values clipped at ±2. */
export function divColor(v) {
  const t = Math.max(-1, Math.min(1, v / 2));
  const a = [242, 236, 219], b = t < 0 ? [38, 110, 150] : [196, 80, 46], f = Math.abs(t);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * f)).join(',')})`;
}

/**
 * Map SVG: equirectangular projection (longitude scaled by cos of the central latitude), land rings,
 * optional IDW grid, cores as circles. o = {land, bbox, points, mode, colors, grid, nx, ny, title, subtitle, note, legend}
 */
export function buildMapSVG(o) {
  const [x0, y0, x1, y1] = o.bbox, cosl = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const W = 900, H = Math.round((W * (y1 - y0)) / ((x1 - x0) * cosl)), top = 44, bottom = 70;
  const px = (lon) => ((lon - x0) / (x1 - x0)) * W, py = (lat) => top + ((y1 - lat) / (y1 - y0)) * H;
  const s = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + top + bottom}" viewBox="0 0 ${W} ${H + top + bottom}" font-family="IBM Plex Sans, Arial, sans-serif" font-size="11">`,
    `<rect width="${W}" height="${H + top + bottom}" fill="#ffffff"/><rect x="0" y="${top}" width="${W}" height="${H}" fill="#f4f8f9"/>`,
    `<text x="8" y="18" font-size="14" font-weight="600" fill="#1c2422">${esc2(o.title || '')}</text>`,
    `<text x="8" y="34" fill="#5b6763">${esc2(o.subtitle || '')}</text>`,
    `<defs><clipPath id="mapclip"><rect x="0" y="${top}" width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#mapclip)">`];
  if (o.grid) {
    const cw = W / o.nx, ch = H / o.ny;
    o.grid.forEach((v, i) => { if (v == null) return; const ix = i % o.nx, iy = Math.floor(i / o.nx); s.push(`<rect x="${(ix * cw).toFixed(1)}" y="${(top + iy * ch).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${divColor(v)}" fill-opacity="0.75"/>`); });
  }
  for (const r of o.land || []) {
    let d = '', inBox = false;
    for (let k = 0; k < r.length; k += 2) { if (r[k] >= x0 - 5 && r[k] <= x1 + 5 && r[k + 1] >= y0 - 5 && r[k + 1] <= y1 + 5) inBox = true; d += `${k ? 'L' : 'M'}${px(r[k]).toFixed(1)} ${py(r[k + 1]).toFixed(1)}`; }
    if (inBox) s.push(`<path d="${d}Z" fill="#e6e6dc" stroke="#b9b9a8" stroke-width="0.6"/>`);
  }
  for (const v of niceTicks(x0, x1, 6)) s.push(`<line x1="${px(v)}" y1="${top}" x2="${px(v)}" y2="${top + H}" stroke="#c9d3d6" stroke-width="0.4" stroke-dasharray="2 3"/><text x="${px(v) + 2}" y="${top + H - 4}" fill="#7a8682" font-size="9">${v}°</text>`);
  for (const v of niceTicks(y0, y1, 4)) s.push(`<line x1="0" y1="${py(v)}" x2="${W}" y2="${py(v)}" stroke="#c9d3d6" stroke-width="0.4" stroke-dasharray="2 3"/><text x="3" y="${py(v) - 2}" fill="#7a8682" font-size="9">${v}°</text>`);
  for (const p of o.points) {
    const cx = px(p.lon).toFixed(1), cy = py(p.lat).toFixed(1);
    let fill = '#ffffff', r = 6, label = p.name;
    if (!p.n) { fill = '#ffffff'; r = 4; }
    else if (o.mode === 'class') { fill = (p.dominant && o.colors[p.dominant]) || '#9aa5a1'; r = 5 + 5 * (p.fraction || 0); label += p.dominant ? ` ${Math.round(p.fraction * 100)}%` : ''; }
    else { fill = divColor(p.value); label += ` ${(+p.value).toFixed(2)}`; }
    s.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${fill}" stroke="#1c2422" stroke-width="${p.n ? 1 : 0.6}" ${p.n ? '' : 'stroke-dasharray="2 2"'}/>`);
    s.push(`<text x="${(+cx + r + 3).toFixed(1)}" y="${(+cy + 4).toFixed(1)}" fill="#1c2422">${esc2(label)}</text>`);
  }
  s.push('</g>');
  let lx = 8; const ly = top + H + 20;
  for (const [name, color] of o.legend || []) { s.push(`<rect x="${lx}" y="${ly - 9}" width="11" height="11" fill="${color}" stroke="#1c2422" stroke-width="0.5"/><text x="${lx + 15}" y="${ly}" fill="#1c2422">${esc2(name)}</text>`); lx += 30 + name.length * 6.2; }
  if (o.note) s.push(`<text x="8" y="${top + H + 46}" fill="#5b6763" font-size="10">${esc2(o.note)}</text>`);
  s.push('</svg>');
  return s.join('');
}

/** Map extent around the cores with a margin (degrees). */
export function mapBBox(points, margin = 3) {
  const p = points.filter((q) => q.lat != null && q.lon != null);
  if (!p.length) return [-10, 30, 40, 48];
  const lon = p.map((q) => q.lon), lat = p.map((q) => q.lat);
  return [Math.min(...lon) - margin, Math.min(...lat) - margin, Math.max(...lon) + margin, Math.max(...lat) + margin];
}

