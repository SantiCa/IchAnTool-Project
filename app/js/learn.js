// CorAnTool web — incremental learning of trace-fossil classes from labelled objects.
// Distance-weighted k-nearest neighbours on standardised shape/colour descriptors:
// it learns from the first few examples, needs no training step, and refuses to
// label objects that look unlike anything seen so far (novelty gate).

export const FEATURES = ['logArea', 'logMajor', 'logMinor', 'elong', 'vert', 'compact', 'fill', 'meanL', 'stdL', 'meanA', 'meanB', 'contrast'];

/** Leave-one-out uses at most this many examples (evenly spaced). */
export const LOO_MAX = 1500;

export const vec = (f) => FEATURES.map((k) => (Number.isFinite(f?.[k]) ? f[k] : 0));

export class Classifier {
  constructor({ k = 5, novelty = 3 } = {}) { this.k = k; this.novelty = novelty; this.n = 0; }

  fit(examples) {
    this.n = examples.length;
    this.X = examples.map((e) => e.x);
    this.y = examples.map((e) => e.y);
    this.counts = {};
    for (const y of this.y) this.counts[y] = (this.counts[y] || 0) + 1;
    if (this.n < 2) { this.accuracy = null; return this; }
    const d = FEATURES.length;
    this.mu = new Array(d).fill(0); this.sd = new Array(d).fill(0);
    for (const e of examples) e.x.forEach((v, j) => (this.mu[j] += v / this.n));
    for (const e of examples) e.x.forEach((v, j) => (this.sd[j] += (v - this.mu[j]) ** 2 / this.n));
    this.sd = this.sd.map((s) => Math.sqrt(s) || 1);
    this.Z = examples.map((e) => this.z(e.x));
    // Leave-one-out: typical nearest-neighbour distance (novelty scale) and accuracy estimate.
    // (at most LOO_MAX evenly spaced examples, so that very large libraries stay fast)
    const nn = [], ok = [], step = Math.max(1, this.n / LOO_MAX);
    for (let f = 0; f < this.n; f += step) {
      const i = Math.floor(f);
      const r = this.vote(this.Z[i], i);
      nn.push(r.dmin);
      if (Object.keys(this.counts).length > 1) ok.push(r.y === this.y[i] ? 1 : 0);
    }
    nn.sort((a, b) => a - b);
    this.scale = nn[nn.length >> 1] || 1;
    this.accuracy = ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
    return this;
  }

  z(x) { return x.map((v, j) => (v - this.mu[j]) / this.sd[j]); }

  vote(z, skip = -1) {
    const best = [];
    for (let i = 0; i < this.n; i++) {
      if (i === skip) continue;
      const zi = this.Z[i]; let s = 0;
      for (let j = 0; j < zi.length; j++) { const t = zi[j] - z[j]; s += t * t; }
      const d = Math.sqrt(s);
      if (best.length < this.k) { best.push([d, i]); best.sort((a, b) => a[0] - b[0]); }
      else if (d < best[best.length - 1][0]) { best[best.length - 1] = [d, i]; best.sort((a, b) => a[0] - b[0]); }
    }
    const votes = {}; let tot = 0;
    for (const [d, i] of best) { const wgt = 1 / (d + 0.05); votes[this.y[i]] = (votes[this.y[i]] || 0) + wgt; tot += wgt; }
    let y = null, v = -1;
    for (const [k, s] of Object.entries(votes)) if (s > v) { y = k; v = s; }
    const probs = {};
    for (const [k, s] of Object.entries(votes)) probs[k] = tot ? s / tot : 0;
    return { y, conf: tot ? v / tot : 0, probs, dmin: best.length ? best[0][0] : Infinity };
  }

  /**
   * Returns {y, conf, probs} (probs = share of the distance-weighted vote of each class among the k neighbours),
   * {y: null, novel: true, probs} for an object unlike any example, or null with fewer than 2 examples.
   */
  predict(x) {
    if (this.n < 2) return null;
    const r = this.vote(this.z(x));
    if (r.dmin > this.novelty * this.scale) return { y: null, conf: 0, novel: true, probs: r.probs };
    return r;
  }

  /** Stored model ("weights" of a k-NN model: standardisation, novelty scale and the examples). */
  toJSON() {
    const r5 = (v) => +v.toFixed(5);
    return { kind: 'knn', version: 1, k: this.k, novelty: this.novelty, n: this.n, features: FEATURES, mu: this.mu?.map(r5) || null, sd: this.sd?.map(r5) || null,
      scale: this.scale ?? null, accuracy: this.accuracy ?? null, counts: this.counts || {}, y: this.y || [], X: (this.X || []).map((x) => x.map(r5)) };
  }

  /** Model rebuilt from toJSON() without refitting (same standardisation, scale and examples). */
  static fromJSON(m) {
    const c = new Classifier({ k: m.k, novelty: m.novelty });
    if (!m || !Array.isArray(m.X) || JSON.stringify(m.features) !== JSON.stringify(FEATURES)) return c;
    Object.assign(c, { n: m.n, y: m.y, X: m.X, counts: m.counts, scale: m.scale, accuracy: m.accuracy, mu: m.mu, sd: m.sd });
    if (c.n >= 2 && c.mu) c.Z = c.X.map((x) => c.z(x));
    return c;
  }
}
