// @ts-check
// Analysis of one section without the DOM: effective class of each object, row counts, interval bins, no-data
// padding, ages and manual indices. Moved unchanged from app.js (M8.3.1); the interface passes its state in.
import { UNIT_TO_CM, rowCounts, binRows, interpAge, interpAgeRange } from './core.js';
import { pxPerCm } from './sectiondepth.js';

/**
 * @typedef {{cls?: string | null, pred?: string | null, conf?: number, id: number}} AnalysisObject
 * @typedef {{includePred?: boolean, predThr?: number, countCandidates?: boolean, binCm?: number, minValid?: number,
 *   noDataPad?: number}} AnalysisSettings
 * @typedef {{id: string, counts?: boolean}} AnalysisClass
 * @typedef {{from: number, to: number, BI?: number | null, ii?: number | null}} ManualRange
 * @typedef {{key: string, counts: import('./core.js').RowCounts}} RowCache
 * @typedef {{classes: readonly AnalysisClass[], settings: AnalysisSettings,
 *   ageModel: import('./core.js').AgeModel | null}} AnalysisProject
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
 * @returns {{bins: import('./core.js').Bin[] & Record<string, any>[], rowCache: RowCache | undefined}}
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
