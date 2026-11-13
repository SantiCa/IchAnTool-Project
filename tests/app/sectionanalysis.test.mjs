import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveClassId, effectiveClassIndex, computeSectionBins, binRowsOfSection, manualRangeAt } from '../../app/js/sectionanalysis.js';
import { rowCounts, binRows, interpAge, interpAgeRange, UNIT_TO_CM } from '../../app/js/core.js';
import { pxPerCm } from '../../app/js/sectiondepth.js';

const CLASSES = [{ id: 'a', counts: true }, { id: 'b', counts: true }, { id: 'n', counts: false }, { id: 'undet', counts: true }];
const SETTINGS = { includePred: false, predThr: 0.5, countCandidates: false, binCm: 5, minValid: 20, noDataPad: 0 };
const project = (over = {}) => ({ classes: CLASSES, settings: { ...SETTINGS, ...over.settings }, ageModel: over.ageModel ?? null });

/** Section as the interface keeps it: label image, exclusion mask, objects by id, overlap stacks, depth geometry. */
function makeSection({ w, h, roi = { x0: 0, y0: 0, x1: w, y1: h }, top = 0, bottom = h, units = 'cm', objects = [], stacks = [null], manual = [] }) {
  const map = new Map(objects.map((o) => [o.id, o]));
  return { w, h, roi, top, bottom, units, labels: new Int32Array(w * h), exclude: new Uint8Array(w * h), stacks, objects: map,
    nextId: Math.max(0, ...objects.map((o) => o.id)) + 1, manual, _mv: 0 };
}
/** Sets labels[row, col] = value over rows [r0, r1) and columns [c0, c1). */
function paint(s, field, [r0, r1], [c0, c1], value) {
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) s[field][r * s.w + c] = value;
}

test('effective class: assigned beats predicted, predictions need the setting and the confidence, candidates need their flag', () => {
  const on = { includePred: true, predThr: 0.5, countCandidates: false };
  assert.equal(effectiveClassId({ id: 1, cls: 'a', pred: 'b', conf: 0.99 }, on), 'a');          // an assigned class always wins
  assert.equal(effectiveClassId({ id: 1, pred: 'b', conf: 0.5 }, on), 'b');                      // confidence equal to the threshold counts
  assert.equal(effectiveClassId({ id: 1, pred: 'b', conf: 0.4999 }, on), null);                  // below the threshold: a candidate, not counted
  assert.equal(effectiveClassId({ id: 1, pred: 'b', conf: 0.4999 }, { ...on, countCandidates: true }), 'undet');
  assert.equal(effectiveClassId({ id: 1, pred: 'b', conf: 0.99 }, { ...on, includePred: false }), null);   // predictions excluded
  assert.equal(effectiveClassId({ id: 1 }, { ...on, countCandidates: true }), 'undet');          // no class and no prediction
  assert.equal(effectiveClassId({ id: 1 }, on), null);
});

test('effective class index follows the class order, skips classes that do not count and keeps unused ids at -1', () => {
  const s = makeSection({ w: 1, h: 1, objects: [
    { id: 1, cls: 'a' }, { id: 2, cls: 'b' }, { id: 3, cls: 'n' },      // "n" is listed but does not count
    { id: 4, pred: 'a', conf: 0.9 }, { id: 6, cls: 'unknown' },          // id 5 does not exist; "unknown" is not in the list
  ] });
  const eff = effectiveClassIndex(s, CLASSES, { ...SETTINGS, includePred: true, countCandidates: true });
  assert.ok(eff instanceof Int16Array);
  assert.deepEqual([...eff], [-1, 0, 1, -1, 0, -1, -1]);   // index 0 unused; id 4 predicted "a"; ids 5, 6 not counted
  const off = effectiveClassIndex(s, CLASSES, { ...SETTINGS, includePred: false });
  assert.equal(off[4], -1);                                    // prediction ignored when predictions are not included
});

test('interval bins: percentages, classes, exclusions, the minimum valid fraction and the index schemes', () => {
  // 10 x 20 pixels, 1 pixel per cm, interval 5 cm => 4 intervals of 5 rows x 10 columns = 50 pixels each.
  const s = makeSection({ w: 10, h: 20, objects: [{ id: 1, cls: 'a' }, { id: 2, cls: 'b' }, { id: 3, cls: 'n' }] });
  paint(s, 'labels', [0, 5], [0, 5], 1);                   // interval 0: object 1 on 5 rows x 5 columns = 25 of 50
  paint(s, 'labels', [5, 7], [0, 10], 2);                  // interval 1: object 2 on 2 rows x 10 columns = 20 of 50
  paint(s, 'labels', [10, 15], [0, 10], 3);                // interval 2: object 3 does not count
  paint(s, 'exclude', [10, 15], [0, 5], 1);                //   and 25 of its 50 pixels are excluded => 25 valid
  paint(s, 'exclude', [15, 20], [0, 10], 1);               // interval 3: everything excluded ...
  paint(s, 'exclude', [19, 20], [0, 5], 0);                //   ... except 5 pixels, below the 20 % (10 pixels) minimum
  const { bins } = computeSectionBins(s, project());
  assert.equal(bins.length, 4);
  assert.deepEqual(bins.map((b) => [b.r0, b.r1]), [[0, 5], [5, 10], [10, 15], [15, 20]]);
  assert.deepEqual(bins.map((b) => [b.dTop, b.dBottom, b.depth]), [[0, 5, 2.5], [5, 10, 7.5], [10, 15, 12.5], [15, 20, 17.5]]);
  assert.deepEqual(bins.map((b) => b.valid), [50, 50, 25, 5]);
  assert.deepEqual(bins.map((b) => b.pct), [50, 40, 0, null]);              // 25/50, 20/50, 0/25, no data
  assert.deepEqual(bins.map((b) => b.classPct), [[50, 0, 0, 0], [0, 40, 0, 0], [0, 0, 0, 0], [null, null, null, null]]);
  assert.deepEqual(bins.map((b) => b.BI), [3, 3, 0, null]);                  // BI tiers: [31,61) -> 3, [0,1) -> 0
  assert.deepEqual(bins.map((b) => b.ii), [4, 4, 1, null]);                  // ii tiers: [40,60) -> 4 (40 belongs to it), [0,1) -> 1
  assert.equal(bins[3].noData, true);
});

test('minimum valid fraction: exactly the limit is data, one pixel less is not; the default is 20 %', () => {
  const build = (excluded) => {
    const s = makeSection({ w: 10, h: 4, objects: [{ id: 1, cls: 'a' }] });   // one interval of 40 pixels; 20 % = 8 pixels
    paint(s, 'labels', [0, 4], [0, 10], 1);
    for (let i = 0; i < excluded; i++) s.exclude[i] = 1;
    return computeSectionBins(s, project({ settings: { binCm: 4, minValid: undefined } })).bins[0];
  };
  assert.equal(build(32).valid, 8);
  assert.equal(build(32).pct, 100);        // 8 valid pixels = exactly 20 %
  assert.equal(build(33).valid, 7);
  assert.equal(build(33).pct, null);       // 7 valid pixels < 8
});

test('overlap stacks count the pixel once in the total and once per distinct counted class', () => {
  const s = makeSection({ w: 4, h: 4, objects: [{ id: 1, cls: 'a' }, { id: 2, cls: 'b' }, { id: 4, cls: 'a' }],
    stacks: [null, [1, 2], [1, 4]] });
  paint(s, 'labels', [0, 1], [0, 4], -1);    // row 0: objects of different classes (a, b) overlap on every pixel
  paint(s, 'labels', [1, 2], [0, 4], -2);    // row 1: two objects of the same class (a, a) overlap
  const [bin] = computeSectionBins(s, project({ settings: { binCm: 4 } })).bins;
  assert.equal(bin.valid, 16);
  assert.equal(bin.pct, 50);                  // 8 of 16 pixels are bioturbated
  assert.deepEqual(bin.classPct.slice(0, 2), [50, 25]);   // a: rows 0 and 1 (8 pixels); b: row 0 only (4 pixels); 75 > 50 is expected
});

test('a region of interest that does not start at the origin only counts inside itself', () => {
  const s = makeSection({ w: 6, h: 10, roi: { x0: 2, y0: 3, x1: 6, y1: 9 }, top: 0, bottom: 6, objects: [{ id: 1, cls: 'a' }] });
  paint(s, 'labels', [0, 3], [0, 6], 1);       // above the ROI: ignored
  paint(s, 'labels', [3, 10], [0, 2], 1);      // left of the ROI: ignored
  paint(s, 'labels', [3, 6], [2, 4], 1);       // inside: 3 rows x 2 columns of the first interval (3 rows x 4 columns = 12)
  const { bins } = computeSectionBins(s, project({ settings: { binCm: 3 } }));
  assert.equal(bins.length, 2);                // 6 ROI rows over 6 cm => 1 row per cm; 3 cm intervals
  assert.deepEqual(bins.map((b) => b.pct), [50, 0]);
  assert.deepEqual(bins.map((b) => b.depth), [1.5, 4.5]);
});

test('no-data padding widens a gap with strict comparisons and leaves untouched intervals alone', () => {
  const s = makeSection({ w: 2, h: 10, objects: [{ id: 1, cls: 'a' }] });   // five intervals of 2 cm
  paint(s, 'labels', [0, 10], [0, 2], 1);                                    // everything is bioturbated ...
  paint(s, 'exclude', [4, 6], [0, 2], 1);                                    // ... except interval 2, which is excluded (no data)
  const none = computeSectionBins(s, project({ settings: { binCm: 2, noDataPad: 0 } })).bins;
  assert.deepEqual(none.map((b) => b.pct), [100, 100, null, 100, 100]);
  const padded = computeSectionBins(s, project({ settings: { binCm: 2, noDataPad: 2 } })).bins;
  // The gap [4, 6] widens to [2, 8]. Intervals 0 ([0, 2]) and 4 ([8, 10]) only touch it, so they stay.
  assert.deepEqual(padded.map((b) => b.pct), [100, null, null, null, 100]);
  assert.deepEqual(padded.map((b) => b.BI), [6, null, null, null, 6]);       // 100 % => BI tier [100,101) = 6
  assert.deepEqual(padded[1].classPct, [null, null, null, null]);
  assert.equal(padded[1].noData, true);
  const meters = makeSection({ w: 2, h: 10, units: 'm', top: 0, bottom: 0.1, objects: [{ id: 1, cls: 'a' }] });
  paint(meters, 'labels', [0, 10], [0, 2], 1); paint(meters, 'exclude', [4, 6], [0, 2], 1);
  const inMeters = computeSectionBins(meters, project({ settings: { binCm: 2, noDataPad: 2 } })).bins;
  assert.deepEqual(inMeters.map((b) => b.pct), [100, null, null, null, 100]);   // the pad is given in cm whatever the section unit
});

test('ages come from the age model, with a range only when the model has one; manual ranges attach with the last match winning', () => {
  const s = makeSection({ w: 10, h: 20, objects: [{ id: 1, cls: 'a' }],
    manual: [{ from: 0, to: 10, BI: 1, ii: 2 }, { from: 5, to: 15, BI: 4, ii: null }] });
  paint(s, 'labels', [0, 20], [0, 10], 1);
  const model = { depth: [0, 10], age: [0, 100], min: [0, 80], max: [0, 120] };
  const withRange = computeSectionBins(s, project({ ageModel: model })).bins;
  assert.deepEqual(withRange.map((b) => b.age), [25, 75, null, null]);        // depths 2.5, 7.5; 12.5 and 17.5 are outside the model
  assert.deepEqual(withRange.map((b) => b.ageMin), [20, 60, null, null]);
  assert.deepEqual(withRange.map((b) => b.ageMax), [30, 90, null, null]);
  assert.deepEqual(withRange.map((b) => b.BIm), [1, 4, 4, null]);             // depth 7.5 is in both ranges: the last one wins
  assert.deepEqual(withRange.map((b) => b.iim), [2, null, null, null]);
  const noRange = computeSectionBins(s, project({ ageModel: { depth: [0, 10], age: [0, 100] } })).bins;
  assert.deepEqual(noRange.map((b) => b.age), [25, 75, null, null]);
  assert.deepEqual(noRange.map((b) => b.ageMin), [null, null, null, null]);
  assert.deepEqual(computeSectionBins(s, project()).bins.map((b) => b.age), [null, null, null, null]);
});

test('manual ranges are half-open and the interval length is never below one row', () => {
  const s = { manual: [{ from: 0, to: 10, BI: 1 }] };
  assert.equal(manualRangeAt(s, 0)?.BI, 1);
  assert.equal(manualRangeAt(s, 9.999999)?.BI, 1);
  assert.equal(manualRangeAt(s, 10), null);
  assert.equal(manualRangeAt(s, -0.1), null);
  const g = { top: 0, bottom: 10, units: 'cm', roi: { y0: 0, y1: 20 } };           // 2 rows per cm
  assert.equal(binRowsOfSection(g, { binCm: 2.5 }), 5);
  assert.equal(binRowsOfSection(g, { binCm: 0.1 }), 1);                            // 0.2 rows is raised to 1
  assert.equal(binRowsOfSection(g, {}), 2);                                        // no interval set: 1 cm
});

test('row counts are reused until the mask revision, geometry or counted classes change', () => {
  const s = makeSection({ w: 4, h: 4, objects: [{ id: 1, cls: 'a' }, { id: 2, pred: 'b', conf: 0.9 }] });
  paint(s, 'labels', [0, 4], [0, 2], 1); paint(s, 'labels', [0, 4], [2, 4], 2);
  const p = project({ settings: { binCm: 4 } });
  const first = computeSectionBins(s, p);
  s._rc = first.rowCache;
  assert.equal(computeSectionBins(s, p).rowCache, first.rowCache);                 // same object: nothing was recounted
  s._mv = 1;
  const edited = computeSectionBins(s, p);
  assert.notEqual(edited.rowCache, first.rowCache);                                // the mask revision changed
  s._rc = edited.rowCache;
  const withPredictions = computeSectionBins(s, project({ settings: { binCm: 4, includePred: true } }));
  assert.notEqual(withPredictions.rowCache, edited.rowCache);                      // object 2 now counts as class b
  assert.deepEqual(withPredictions.bins[0].classPct.slice(0, 2), [50, 50]);
  assert.deepEqual(computeSectionBins(s, p).bins[0].classPct.slice(0, 2), [50, 0]);
});

test('a section with load warnings has no bins and keeps its cache untouched', () => {
  const s = makeSection({ w: 2, h: 2 });
  s.loadWarnings = ['broken mask reference'];
  s._rc = { key: 'old', counts: null };
  const result = computeSectionBins(s, project());
  assert.deepEqual(result.bins, []);
  assert.equal(result.rowCache, s._rc);
});

/** The calculation exactly as app.js::analyze performed it before M8.3.1, kept here as the reference. */
function referenceAnalyze(s, S) {
  const eff = new Int16Array(s.nextId).fill(-1), idx = new Map(S.classes.map((c, k) => [c.id, k]));
  const effClassId = (o) => (o.cls ? o.cls : (S.settings.includePred && o.pred && o.conf >= S.settings.predThr ? o.pred : (S.settings.countCandidates ? 'undet' : null)));
  for (const o of s.objects.values()) { const c = effClassId(o); if (c == null) continue; const k = idx.get(c); if (k != null && S.classes[k].counts) eff[o.id] = k; }
  const counts = rowCounts({ labels: s.labels, width: s.w, roi: s.roi, exclude: s.exclude, effClass: eff, nClasses: S.classes.length, stacks: s.stacks });
  const binRowsOf = Math.max(1, (S.settings.binCm || 1) * pxPerCm(s));
  const bins = binRows(counts, { top: s.top, bottom: s.bottom, binPx: binRowsOf, minValid: (S.settings.minValid ?? 20) / 100 });
  const pad = (S.settings.noDataPad || 0) / UNIT_TO_CM[s.units];
  if (pad > 0) {
    const gaps = bins.filter((b) => b.noData).map((b) => [b.dTop - pad, b.dBottom + pad]);
    for (const b of bins) if (!b.noData && gaps.some(([a, z]) => b.dBottom > a + 1e-9 && b.dTop < z - 1e-9)) Object.assign(b, { noData: true, pct: null, classPct: b.classPct.map(() => null) });
  }
  for (const b of bins) if (b.noData) { b.BI = null; b.ii = null; }
  for (const b of bins) {
    b.age = interpAge(S.age.model, b.depth);
    const ar = interpAgeRange(S.age.model, b.depth); b.ageMin = ar?.min ?? null; b.ageMax = ar?.max ?? null;
    let hit = null; for (const m of s.manual) if (b.depth >= m.from && b.depth < m.to) hit = m;
    b.BIm = hit?.BI ?? null; b.iim = hit?.ii ?? null;
  }
  return bins;
}

test('generated sections give exactly the bins of the calculation as it was in app.js', () => {
  let seed = 138501;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let round = 0; round < 40; round++) {
    const w = 8 + Math.floor(next() * 24), h = 40 + Math.floor(next() * 160);
    const objects = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, cls: ['a', 'b', 'n', undefined, undefined, 'a'][i], pred: i === 3 ? 'b' : i === 4 ? 'a' : undefined, conf: next() }));
    const stacks = [null, [1, 2], [2, 6], [1, 3, 5]];
    const s = makeSection({ w, h, objects, stacks, units: ['mm', 'cm', 'm'][round % 3], top: next() * 10, bottom: 11 + next() * 90,
      manual: [{ from: 0, to: 40, BI: 2, ii: 3 }, { from: 20, to: 60, BI: null, ii: 5 }],
      roi: { x0: Math.floor(next() * 4), y0: Math.floor(next() * 10), x1: w - Math.floor(next() * 4), y1: h - Math.floor(next() * 10) } });
    for (let i = 0; i < s.labels.length; i++) { const r = next(); s.labels[i] = r < 0.55 ? 0 : r < 0.85 ? 1 + Math.floor(next() * 6) : -(1 + Math.floor(next() * 3)); s.exclude[i] = next() < 0.1 ? 1 : 0; }
    const S = { classes: CLASSES, age: { model: { depth: [0, 50, 100], age: [0, 40, 130], min: [0, 30, 110], max: [0, 50, 150] } },
      settings: { includePred: round % 2 === 0, predThr: 0.5, countCandidates: round % 3 === 0, binCm: [0.7, 1, 2.5, 5][round % 4], minValid: round % 5 === 0 ? undefined : 30, noDataPad: round % 4 === 0 ? 3 : 0 } };
    const expected = referenceAnalyze(s, S);
    const { bins } = computeSectionBins(s, { classes: S.classes, settings: S.settings, ageModel: S.age.model });
    assert.deepEqual(bins, expected, `round ${round}`);
  }
});
