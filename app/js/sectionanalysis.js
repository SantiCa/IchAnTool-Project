// @ts-check
// Analysis of one section without the DOM: effective class of each object, row counts, interval bins, no-data
// padding, ages and manual indices. Moved unchanged from app.js (M8.3.1); the interface passes its state in.
import { BI, II, UNIT_TO_CM, rowCounts, binRows, interpAge, interpAgeRange } from './core.js';
import { pxPerCm } from './sectiondepth.js';

/**
 * @typedef {{cls?: string | null, pred?: string | null, conf?: number, id: number}} AnalysisObject
 * @typedef {{includePred?: boolean, predThr?: number, countCandidates?: boolean, binCm?: number, minValid?: number,
 *   noDataPad?: number}} AnalysisSettings
 * @typedef {{id: string, name?: string, counts?: boolean}} AnalysisClass
 * @typedef {{from: number, to: number, BI?: number | null, ii?: number | null}} ManualRange
 * @typedef {{key: string, counts: import('./core.js').RowCounts}} RowCache
 * @typedef {{classes: readonly AnalysisClass[], settings: AnalysisSettings,
 *   ageModel: import('./core.js').AgeModel | null, ageUnits?: string | null}} AnalysisProject
 * @typedef {import('./core.js').Bin & {age: number | null, ageMin: number | null, ageMax: number | null,
 *   BIm: number | null | undefined, iim: number | null | undefined}} SectionBin
 * @typedef {'u8' | 'i32le' | 'u32le' | 'u64le' | 'f64le'} EngineDtype
 * @typedef {{dtype: EngineDtype, shape: number[], data: ArrayLike<number>}} EngineBuffer
 * @typedef {{dtype: EngineDtype, shape: number[], data: number[], valid?: number[]}} ReferenceColumn
 */

/**
 * Class counted for an object: its assigned class, else its prediction when predictions are included and the
 * confidence reaches the threshold, else 'undet' when candidates count, else none.
 * @param {AnalysisObject} o
 * @param {AnalysisSettings} settings
 * @returns {string | null}
 */
export function effectiveClassId(o, settings) {
  if (o.cls) return o.cls;
  if (settings.includePred && o.pred && /** @type {number} */ (o.conf) >= /** @type {number} */ (settings.predThr)) return o.pred;
  return settings.countCandidates ? 'undet' : null;
}

/**
 * Class index counted by each object ID (-1 when not counted); indices follow the order of `classes`.
 * @param {{nextId: number, objects: Map<number, AnalysisObject>}} section
 * @param {readonly AnalysisClass[]} classes
 * @param {AnalysisSettings} settings
 */
export function effectiveClassIndex(section, classes, settings) {
  const eff = new Int16Array(section.nextId).fill(-1), idx = new Map(classes.map((c, k) => [c.id, k]));
  for (const o of section.objects.values()) {
    const c = effectiveClassId(o, settings); if (c == null) continue;
    const k = idx.get(c); if (k != null && classes[k].counts) eff[o.id] = k;
  }
  return eff;
}

/**
 * V0.1: the analysis interval is set in cm; rows per interval in this section (may be fractional, at least 1).
 * Divide rows by span in pxPerCm before multiplying; keep this order in pipeline.py too.
 * @param {Parameters<typeof pxPerCm>[0]} section
 * @param {AnalysisSettings} settings
 */
export function binRowsOfSection(section, settings) { return Math.max(1, (settings.binCm || 1) * pxPerCm(section)); }

/**
 * Last matching half-open manual range wins.
 * @param {{manual: readonly ManualRange[]}} section
 * @param {number} d
 */
export function manualRangeAt(section, d) { let hit = null; for (const m of section.manual) if (d >= m.from && d < m.to) hit = m; return hit; }

/**
 * Interval bins of a section. Row counts are cached on the section (`_rc`) against its mask revision, geometry
 * and effective-class signature; the new cache is returned, not assigned. A section with load warnings has no bins.
 * @param {any} s section as kept by the interface (labels, stacks, exclude, roi, top/bottom/units, manual, _mv, _rc)
 * @param {AnalysisProject} project
 * @returns {{bins: SectionBin[], rowCache: RowCache | undefined}}
 */
export function computeSectionBins(s, project) {
  const { classes, settings, ageModel } = project;
  if (s.loadWarnings) return { bins: [], rowCache: s._rc };
  const eff = effectiveClassIndex(s, classes, settings);
  let h = 2166136261; for (let i = 0; i < eff.length; i++) h = Math.imul(h ^ (eff[i] + 2), 16777619);   // signature of the class of each object
  const key = `${s._mv || 0}|${s.w}x${s.h}|${s.roi.x0},${s.roi.y0},${s.roi.x1},${s.roi.y1}|${classes.length}|${eff.length}|${h}`;
  const rowCache = s._rc?.key !== key ? { key, counts: rowCounts({ labels: s.labels, width: s.w, roi: s.roi, exclude: s.exclude, effClass: eff, nClasses: classes.length, stacks: s.stacks }) } : s._rc;   // V0.2: cached
  const bins = /** @type {any[]} */ (binRows(rowCache.counts, { top: s.top, bottom: s.bottom, binPx: binRowsOfSection(s, settings), minValid: (settings.minValid ?? 20) / 100 }));
  const pad = (settings.noDataPad || 0) / UNIT_TO_CM[/** @type {import('./core.js').DepthUnit} */ (s.units)];   // V0.3: widen the no-data zones by this length (cm) on each side
  if (pad > 0) {
    const gaps = bins.filter((b) => b.noData).map((b) => [b.dTop - pad, b.dBottom + pad]);
    for (const b of bins) if (!b.noData && gaps.some(([a, z]) => b.dBottom > a + 1e-9 && b.dTop < z - 1e-9)) Object.assign(b, { noData: true, pct: null, classPct: b.classPct.map(() => null) });
  }
  for (const b of bins) if (b.noData) { b.BI = null; b.ii = null; }
  for (const b of bins) {
    b.age = interpAge(ageModel, b.depth);
    const ar = interpAgeRange(ageModel, b.depth); b.ageMin = ar?.min ?? null; b.ageMax = ar?.max ?? null;   // V0.28
    const m = manualRangeAt(s, b.depth); b.BIm = m?.BI ?? null; b.iim = m?.ii ?? null;
  }
  return { bins, rowCache };
}

/** @param {string} name @param {unknown} value @returns {number} */
function finiteNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
  return value;
}

/** @param {EngineDtype} dtype @param {number[]} shape @param {ArrayLike<number>} data @returns {EngineBuffer} */
const engineBuffer = (dtype, shape, data) => ({ dtype, shape, data });

/**
 * The scientific inputs of engine method `section.intervals/1` (docs/roadmap-engine-contract.md §4) taken from a
 * section as the interface keeps it. Data is copied; nothing is computed about classes or counts here. Missing or
 * non-finite required numbers are rejected rather than replaced. `stack_members` is null when no overlap exists
 * (an empty buffer cannot be transferred). The schemes are the two fixed ones of this program, with the
 * first-match tier rule that `core.js::classify` uses.
 * @param {any} s section as kept by the interface
 * @param {AnalysisProject} project
 */
export function buildIntervalSnapshot(s, project) {
  const { classes, settings, ageModel } = project;
  const pixels = s.w * s.h;
  const stacks = /** @type {(number[] | null)[]} */ (s.stacks || [null]);
  const offsets = new Uint32Array(stacks.length + 1);
  let total = 0;
  for (let k = 0; k < stacks.length; k++) { offsets[k] = total; total += stacks[k]?.length ?? 0; }
  offsets[stacks.length] = total;
  const members = new Uint32Array(total);
  let at = 0;
  for (const row of stacks) for (const id of row ?? []) members[at++] = id;
  const exclude = new Uint8Array(pixels);
  if (s.exclude) for (let i = 0; i < pixels; i++) exclude[i] = s.exclude[i] ? 1 : 0;
  const ranged = !!(ageModel && ageModel.min && ageModel.max);
  return {
    labels: engineBuffer('i32le', [s.h, s.w], Int32Array.from(s.labels)),
    exclude: engineBuffer('u8', [s.h, s.w], exclude),
    objects: [...s.objects.values()].map((/** @type {AnalysisObject} */ o) => ({
      id: o.id, class_id: o.cls || null, predicted_class_id: o.pred || null, confidence: Number.isFinite(o.conf) ? o.conf : 0 })),
    classes: classes.map((c) => ({ id: c.id, name: c.name ?? c.id, counts: !!c.counts })),
    stack_offsets: engineBuffer('u32le', [offsets.length], offsets),
    stack_members: total ? engineBuffer('u32le', [total], members) : null,
    settings: {
      width: s.w, height: s.h, roi: { x0: s.roi.x0, y0: s.roi.y0, x1: s.roi.x1, y1: s.roi.y1 },
      top: finiteNumber('top', s.top), bottom: finiteNumber('bottom', s.bottom), units: s.units,
      bin_cm: finiteNumber('bin_cm', settings.binCm || 1), min_valid: finiteNumber('min_valid', (settings.minValid ?? 20) / 100),
      no_data_pad_cm: finiteNumber('no_data_pad_cm', settings.noDataPad || 0),
      include_predictions: !!settings.includePred, prediction_threshold: finiteNumber('prediction_threshold', settings.predThr),
      count_candidates: !!settings.countCandidates,
      schemes: [BI, II].map((scheme) => ({ name: scheme.name, precedence: 'first', tiers: scheme.tiers.map(([lower, upper, value]) => ({ lower, upper, value })) })),
      age_units: project.ageUnits ?? null,
    },
    age_model: ageModel ? ageModel.depth.map((depth, i) => ({
      depth, age: ageModel.age[i], min: ranged ? /** @type {number[]} */ (ageModel.min)[i] : null, max: ranged ? /** @type {number[]} */ (ageModel.max)[i] : null })) : [],
    manual_indices: (s.manual || []).map((/** @type {ManualRange} */ m) => ({ from: m.from, to: m.to, BI: m.BI ?? null, ii: m.ii ?? null })),
  };
}

/**
 * The result of `section.intervals/1` (contract §5) as the current JavaScript calculation produces it: the columns
 * with their dtype and shape, a `valid` 0/1 array for every nullable column (invalid slots hold 0), and the
 * dimensions. Raw counts are summed from the cached row counts, so they include intervals whose percentage is
 * suppressed. `valid_pct` is the contract's 100 * valid / (rows * ROI columns), which the interface does not show.
 * @param {any} s
 * @param {AnalysisProject} project
 */
export function referenceColumns(s, project) {
  const { bins, rowCache } = computeSectionBins(s, project);
  if (!rowCache || !bins.length) throw new Error('A section without bins has no reference columns');
  const { counts } = rowCache, B = bins.length, C = project.classes.length;
  /** @type {Record<string, ReferenceColumn>} */
  const columns = {};
  /** @param {string} name @param {EngineDtype} dtype @param {number[]} shape @param {number[]} values */
  const plain = (name, dtype, shape, values) => { columns[name] = { dtype, shape, data: values }; };
  /** @param {string} name @param {EngineDtype} dtype @param {number[]} shape @param {(number | null | undefined)[]} values */
  const nullable = (name, dtype, shape, values) => {
    columns[name] = { dtype, shape, data: values.map((v) => v ?? 0), valid: values.map((v) => (v == null ? 0 : 1)) };
  };
  const sumRows = (/** @type {{r0: number, r1: number}} */ b, /** @type {ArrayLike<number>} */ source, stride = 1, offset = 0) => {
    let sum = 0; for (let r = b.r0; r < b.r1; r++) sum += source[r * stride + offset]; return sum;
  };
  plain('row_start', 'u32le', [B], bins.map((b) => b.r0));
  plain('row_end', 'u32le', [B], bins.map((b) => b.r1));
  plain('valid_count', 'u64le', [B], bins.map((b) => sumRows(b, counts.valid)));
  plain('bio_count', 'u64le', [B], bins.map((b) => sumRows(b, counts.bio)));
  plain('class_count', 'u64le', [B, C], bins.flatMap((b) => Array.from({ length: C }, (_, k) => sumRows(b, counts.cls, C, k))));
  plain('depth_top', 'f64le', [B], bins.map((b) => b.dTop));
  plain('depth_bottom', 'f64le', [B], bins.map((b) => b.dBottom));
  plain('depth', 'f64le', [B], bins.map((b) => b.depth));
  plain('valid_pct', 'f64le', [B], bins.map((b) => (100 * sumRows(b, counts.valid)) / ((b.r1 - b.r0) * /** @type {number} */ (counts.nCols))));
  nullable('bioturbation_pct', 'f64le', [B], bins.map((b) => b.pct));
  nullable('class_pct', 'f64le', [B, C], bins.flatMap((b) => b.classPct));
  plain('no_data', 'u8', [B], bins.map((b) => (b.noData ? 1 : 0)));
  nullable('age', 'f64le', [B], bins.map((b) => b.age));
  nullable('age_min', 'f64le', [B], bins.map((b) => b.ageMin));
  nullable('age_max', 'f64le', [B], bins.map((b) => b.ageMax));
  nullable('manual_BI', 'i32le', [B], bins.map((b) => b.BIm));
  nullable('manual_ii', 'i32le', [B], bins.map((b) => b.iim));
  nullable('indices', 'i32le', [B, 2], bins.flatMap((b) => [b.BI, b.ii]));
  return { dimensions: { bins: B, classes: C, schemes: 2 }, columns };
}
