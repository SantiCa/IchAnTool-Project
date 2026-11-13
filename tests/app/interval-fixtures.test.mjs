import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { buildFixtures, FIXTURE_DIR } from '../../tools/make_interval_fixtures.mjs';
import { buildIntervalSnapshot } from '../../app/js/sectionanalysis.js';

const committed = (file) => readFileSync(path.join(FIXTURE_DIR, file), 'utf8').replace(/\r\n/g, '\n');
const load = (file) => JSON.parse(committed(file));
const expand = (buffer) => (buffer.runs ? buffer.runs.flatMap(([value, count]) => Array(count).fill(value)) : buffer.data);
const FILES = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();

test('committed fixtures are exactly what the current JavaScript calculation regenerates', () => {
  const regenerated = buildFixtures();
  assert.deepEqual(FILES, [...regenerated.keys()].sort(), 'same set of files');
  for (const [file, text] of regenerated) assert.equal(committed(file), text, `${file} differs; run node tools/make_interval_fixtures.mjs only if the change is intended and reviewed`);
});

test('every fixture is internally consistent with the input and result contracts', () => {
  for (const file of FILES) {
    const { inputs, expected, name } = load(file);
    const { width, height, roi } = inputs.settings, where = `${name}: `;
    assert.equal(file, `${name}.json`);
    // Inputs (contract section 4).
    assert.deepEqual(inputs.labels.shape, [height, width], where + 'label shape');
    assert.equal(expand(inputs.labels).length, width * height, where + 'label length');
    assert.equal(expand(inputs.exclude).length, width * height);
    assert.ok(expand(inputs.exclude).every((v) => v === 0 || v === 1), where + 'exclusion is 0 or 1');
    assert.ok(roi.x0 >= 0 && roi.y0 >= 0 && roi.x1 <= width && roi.y1 <= height && roi.x1 > roi.x0 && roi.y1 > roi.y0, where + 'roi');
    const offsets = expand(inputs.stack_offsets), members = inputs.stack_members ? expand(inputs.stack_members) : [];
    assert.equal(offsets[0], 0); assert.equal(offsets.at(-1), members.length);
    assert.ok(offsets.every((v, i) => i === 0 || v >= offsets[i - 1]), where + 'offsets are monotonic');
    const ids = new Set(inputs.objects.map((o) => o.id));
    assert.equal(ids.size, inputs.objects.length, where + 'unique object ids');
    assert.ok(members.every((id) => ids.has(id)), where + 'stack members exist');
    const classIds = new Set(inputs.classes.map((c) => c.id));
    assert.ok(inputs.objects.every((o) => (o.class_id == null || classIds.has(o.class_id)) && (o.predicted_class_id == null || classIds.has(o.predicted_class_id))), where + 'class references');
    assert.ok(inputs.objects.every((o) => o.confidence >= 0 && o.confidence <= 1), where + 'confidence');
    assert.deepEqual(inputs.settings.schemes.map((s) => [s.name, s.precedence]), [['BI', 'first'], ['ii', 'first']]);
    // Result (contract section 5).
    const { dimensions: { bins: B, classes: C, schemes: S }, columns } = expected, roiRows = roi.y1 - roi.y0, roiCols = roi.x1 - roi.x0;
    assert.equal(C, inputs.classes.length); assert.equal(S, 2);
    const shapes = { class_count: [B, C], class_pct: [B, C], indices: [B, S] };
    for (const [column, c] of Object.entries(columns)) {
      assert.deepEqual(c.shape, shapes[column] ?? [B], `${name}: shape of ${column}`);
      assert.equal(c.data.length, c.shape.reduce((a, b) => a * b, 1));
      if (c.valid) {
        assert.equal(c.valid.length, c.data.length);
        assert.ok(c.valid.every((v) => v === 0 || v === 1));
        assert.ok(c.data.every((v, i) => c.valid[i] === 1 || v === 0), `${name}: invalid slots of ${column} hold 0`);
      }
    }
    assert.deepEqual(Object.keys(columns).sort(), ['age', 'age_max', 'age_min', 'bio_count', 'bioturbation_pct', 'class_count', 'class_pct', 'depth', 'depth_bottom', 'depth_top',
      'indices', 'manual_BI', 'manual_ii', 'no_data', 'row_start', 'row_end', 'valid_count', 'valid_pct'].sort());
    const start = columns.row_start.data, end = columns.row_end.data;
    assert.equal(start[0], 0); assert.equal(end[B - 1], roiRows, where + 'intervals end at the last ROI row');
    for (let i = 1; i < B; i++) assert.equal(start[i], end[i - 1], where + 'intervals are contiguous');
    for (let i = 0; i < B; i++) {
      const rows = end[i] - start[i], valid = columns.valid_count.data[i], bio = columns.bio_count.data[i];
      assert.ok(rows >= 1 && valid <= rows * roiCols && bio <= valid, where + `counts of interval ${i}`);
      for (let k = 0; k < C; k++) assert.ok(columns.class_count.data[i * C + k] <= valid);
      assert.ok(Math.abs(columns.valid_pct.data[i] - (100 * valid) / (rows * roiCols)) <= 1e-9);
      const noData = columns.no_data.data[i] === 1, pct = columns.bioturbation_pct;
      if (noData) assert.ok(pct.valid[i] === 0 && columns.indices.valid[i * S] === 0 && columns.indices.valid[i * S + 1] === 0, where + 'no-data intervals have no percentage or index');
      else assert.ok(pct.valid[i] === 1 && Math.abs(pct.data[i] - (100 * bio) / valid) <= 1e-9, where + `percentage of interval ${i} follows from its counts`);
    }
  }
});

test('basic fixture holds the values worked out by hand', () => {
  const { expected: { columns: c, dimensions } } = load('basic-four-intervals.json');
  assert.deepEqual(dimensions, { bins: 4, classes: 4, schemes: 2 });
  assert.deepEqual(c.row_start.data, [0, 5, 10, 15]);
  assert.deepEqual(c.row_end.data, [5, 10, 15, 20]);
  assert.deepEqual(c.valid_count.data, [50, 50, 25, 5]);        // interval 2 loses 25 excluded pixels, interval 3 keeps only 5
  assert.deepEqual(c.bio_count.data, [25, 20, 0, 0]);
  assert.deepEqual(c.class_count.data, [25, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);   // object 3 belongs to a class that does not count
  assert.deepEqual(c.valid_pct.data, [100, 100, 50, 10]);
  assert.deepEqual(c.bioturbation_pct.data, [50, 40, 0, 0]);
  assert.deepEqual(c.bioturbation_pct.valid, [1, 1, 1, 0]);      // 5 valid pixels < 20 % of 50
  assert.deepEqual(c.no_data.data, [0, 0, 0, 1]);
  assert.deepEqual(c.depth.data, [2.5, 7.5, 12.5, 17.5]);
  assert.deepEqual(c.indices.data, [3, 4, 3, 4, 0, 1, 0, 0]);    // BI tiers [31,61)->3 and [0,1)->0; ii tiers [40,60)->4 and [0,1)->1
  assert.deepEqual(c.indices.valid, [1, 1, 1, 1, 1, 1, 0, 0]);
});

test('other fixtures keep the properties they were made to show', () => {
  const overlap = load('overlap-same-and-different-class.json');
  assert.deepEqual(expand(overlap.inputs.stack_offsets), [0, 0, 2, 4]);   // row 0 is empty; stack 1 = [1,2]; stack 2 = [1,4]
  assert.deepEqual(expand(overlap.inputs.stack_members), [1, 2, 1, 4]);
  assert.deepEqual(overlap.expected.columns.class_count.data.slice(0, 2), [8, 4]);   // a: rows 0 and 1; b: row 0 only
  assert.equal(overlap.expected.columns.bio_count.data[0], 8);
  assert.equal(load('basic-four-intervals.json').inputs.stack_members, null);        // no overlap: members omitted
  assert.deepEqual(load('no-valid-pixels.json').expected.columns.no_data.data, [1, 1]);
  assert.deepEqual(load('min-valid-exactly-at-limit.json').expected.columns.bioturbation_pct.valid, [1]);
  assert.deepEqual(load('min-valid-one-pixel-below.json').expected.columns.bioturbation_pct.valid, [0]);
  const padded = load('no-data-padding-2-cm.json').expected.columns;
  assert.deepEqual(padded.no_data.data, [0, 1, 1, 1, 0]);
  assert.deepEqual(padded.valid_count.data.slice(1, 4), [4, 0, 4]);        // counts stay even where the percentage is suppressed
  const manual = load('manual-ranges.json').expected.columns;
  assert.deepEqual([manual.manual_BI.data, manual.manual_BI.valid], [[3, 0, 5, 0], [1, 0, 1, 0]]);
  assert.deepEqual([manual.manual_ii.data, manual.manual_ii.valid], [[4, 2, 0, 0], [1, 1, 0, 0]]);
  const ends = load('ages-at-model-ends.json').expected.columns;
  assert.deepEqual([ends.age.data, ends.age.valid], [[10, 20, 30, 40], [1, 1, 1, 1]]);   // centres 2.5 and 17.5 sit exactly at the model ends
  assert.deepEqual(load('ages-without-range.json').expected.columns.age_min.valid, [0, 0, 0, 0]);
  assert.deepEqual(load('ages-no-model.json').expected.columns.age.valid, [0, 0, 0, 0]);
  assert.equal(load('large-mixed.json').inputs.labels.runs.length > 1000, true);
});

test('the 20 shared fractional-boundary cases give the interval edges recorded for both languages', () => {
  const shared = JSON.parse(readFileSync(new URL('../fixtures/fractional-boundaries.json', import.meta.url), 'utf8'));
  shared.forEach((c, index) => {
    const { expected: { columns } } = load(`fractional-${String(index).padStart(2, '0')}.json`);
    // The shared file lists every edge including the last one (the number of rows); the fixture lists starts and ends.
    assert.deepEqual([...columns.row_start.data, columns.row_end.data.at(-1)], c.edges, `case ${index}`);
    assert.equal(c.edges.at(-1), c.rows);
  });
});

test('the snapshot builder rejects missing numbers instead of repairing them and does not alter the section', () => {
  const s = { w: 2, h: 2, roi: { x0: 0, y0: 0, x1: 2, y1: 2 }, top: 0, bottom: 2, units: 'cm', labels: new Int32Array(4), exclude: null,
    stacks: [null], objects: new Map(), manual: [], nextId: 1 };
  const project = { classes: [{ id: 'a', counts: true }], settings: { binCm: 1, predThr: 0.5 }, ageModel: null };
  const snapshot = buildIntervalSnapshot(s, project);
  assert.deepEqual(Array.from(snapshot.exclude.data), [0, 0, 0, 0]);       // a missing exclusion mask becomes all zeros
  assert.deepEqual(snapshot.classes, [{ id: 'a', name: 'a', counts: true }]);
  assert.throws(() => buildIntervalSnapshot(s, { ...project, settings: { binCm: 1 } }), /prediction_threshold/);
  assert.throws(() => buildIntervalSnapshot({ ...s, top: NaN }, project), /top/);
  assert.deepEqual(Array.from(s.labels), [0, 0, 0, 0]);
});
