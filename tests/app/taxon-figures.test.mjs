import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLogSVG, buildRangeSVG, taxaOptions, windowCSV } from '../../app/js/log.js';

const classes = [{ name: 'Chondrites', index: 0, color: '#123456' }, { name: 'Planolites', index: 1, color: '#654321' }];
const rows = [{ a0: 0, a1: 1, pct: 50, classPct: [20, 30] }, { a0: 1, a1: 2, pct: 40, classPct: [10, 30] }];
const base = { from: 0, to: 2, height: 200, rows, classes, records: [], tracks: { species: true },
  colWidths: { species: 100, 'sp:Chondrites': 100, 'sp:Planolites': 100 } };
const abundanceGroups = (svg) => [...svg.matchAll(/<g data-taxon="[^"]*" data-role="abundance"[^>]*>(.*?)<\/g>/gs)].map((match) => match[1]);

test('stacked and overlaid abundances retain exact percentage widths and change only the baseline', () => {
  for (const layout of ['stack', 'overlay']) {
    const result = buildLogSVG({ ...base, taxa: { layout, scale: 'percent', opacity: 0.4 } });
    const column = result.layout.find((item) => item.key === 'species');
    const groups = abundanceGroups(result.svg);
    const rectangles = groups.map((group) => [...group.matchAll(/<rect x="([^"]+)"[^>]*width="([^"]+)"/g)].map((match) => [+match[1], +match[2]]));
    assert.deepEqual(rectangles[0], [[column.x, 20], [column.x, 10]]);
    assert.deepEqual(rectangles[1], [[column.x + (layout === 'stack' ? 20 : 0), 30], [column.x + (layout === 'stack' ? 10 : 0), 30]]);
    assert.match(result.svg, /data-role="abundance" opacity="0.4"/);
    assert.match(result.svg, />100%<\/text>/);
  }
});

test('symmetric abundance curves use half the magnitude on each side and split at missing intervals and gaps', () => {
  const input = [...rows, { a0: 3, a1: 4, pct: 20, classPct: [20, 0] },
    { a0: 4, a1: 5, pct: null, classPct: [null, null] }, { a0: 5, a1: 6, pct: 40, classPct: [40, 0] }];
  const result = buildLogSVG({ ...base, rows: input, to: 6, taxa: { layout: 'separate', abundance: 'kite', scale: 'percent' } });
  const center = result.layout.find((column) => column.id === 'sp:Chondrites').x + 50;
  const polygons = [...abundanceGroups(result.svg)[0].matchAll(/<polygon points="([^"]*)"/g)].map((match) => match[1].split(' ').map((pair) => pair.split(',').map(Number)));
  assert.equal(polygons.length, 3);
  assert.equal(Math.max(...polygons[2].map(([x]) => x)) - center, 20);
  for (const polygon of polygons) for (const [x, y] of polygon) {
    assert.ok(polygon.some(([otherX, otherY]) => Math.abs(otherX + x - 2 * center) <= 0.01 && otherY === y));
  }
  assert.doesNotMatch(result.svg, /NaN|Infinity/);
});

test('manual names retain their exact depth and never fabricate percentage data', () => {
  const result = buildLogSVG({ ...base, rows: [], taxonPoints: [{ a: 0.25, index: 0, kind: 'mark' }, { a: 0.75, index: 1, kind: 'obj' }],
    taxa: { abundance: 'none', occurrence: 'names', source: 'marks', layout: 'separate' } });
  assert.equal(result.layout.filter((column) => column.key === 'sp1').length, 1);
  const occurrence = /<g data-taxon="Chondrites" data-role="occurrence"[^>]*>(.*?)<\/g>/s.exec(result.svg)[1];
  assert.match(occurrence, /y="112"/); // top 84 + 0.25 / 2 * 200 + text baseline 3.
  assert.match(occurrence, />Chondrites<\/text>/);
  assert.doesNotMatch(occurrence, /<path/);
  assert.ok(abundanceGroups(result.svg).every((group) => group === ''));
  assert.doesNotMatch(result.svg, />100%<\/text>|Planolites/);
});

test('distribution supports the same shapes, opacity, percentages and manual-only occurrence filtering', () => {
  const points = [{ index: 0, a: 0.4, kind: 'obj' }, { index: 0, a: 0.6, kind: 'mark' }];
  for (const abundance of ['bars', 'line', 'area', 'kite']) {
    const svg = buildRangeSVG({ ...base, points, colW: 100, taxa: { layout: 'separate', abundance, opacity: 1, occurrence: 'both', source: 'marks', values: true, scale: 'percent' } }).svg;
    assert.equal((svg.match(/data-role="occurrence"/g) || []).length, 1);
    assert.match(svg, /data-kind="mark"/);
    assert.match(svg, /data-role="percentage"[^>]*>20%<\/text>/);
    assert.match(svg, /opacity="1"/);
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
  const overlay = buildRangeSVG({ ...base, points, taxa: { layout: 'overlay', abundance: 'area', occurrence: 'symbols' } });
  assert.equal(overlay.layout.filter((column) => column.key === 'species').length, 1);
});

test('rendering leaves rows, classes and exported measurements exactly unchanged', () => {
  const input = structuredClone(base);
  const snapshot = structuredClone(input);
  const csvOptions = { rows: input.rows, classes: input.classes, records: [], from: 0, to: 2, units: 'cm', ageUnits: 'ka' };
  const csv = windowCSV(csvOptions);
  for (const abundance of ['none', 'bars', 'line', 'area', 'kite']) {
    for (const layout of ['stack', 'overlay', 'separate']) {
      const taxa = { abundance, layout, occurrence: 'symbols', opacity: 0.5, values: true };
      buildLogSVG({ ...input, taxa }); buildRangeSVG({ ...input, taxa });
      assert.deepEqual(input, snapshot);
      assert.equal(windowCSV(csvOptions), csv);
    }
  }
});

test('legacy defaults remain available and new options validate untrusted display settings', () => {
  assert.equal(buildLogSVG(base).svg, buildLogSVG({ ...base, taxa: null }).svg);
  const q = taxaOptions({ layout: 'invalid', opacity: Infinity, hidden: [null, 'Chondrites'], abundance: 'kite' });
  assert.equal(q.layout, 'separate'); assert.equal(q.opacity, 1); assert.deepEqual(q.hidden, ['Chondrites']);
  const svg = buildRangeSVG({ ...base, classes: [{ name: '<taxon>', index: 0, color: '\"/><script>' }], taxa: { abundance: 'bars' } }).svg;
  assert.match(svg, /&lt;taxon&gt;/); assert.doesNotMatch(svg, /<script>/);
  assert.throws(() => buildLogSVG({ ...base, taxa: { abundance: 'bars' }, style: { axes: { species: { min: 20, max: 10 } } } }), /Invalid horizontal axis/);
});

test('curve and area geometry remain visible for a single measured interval and never join a gap', () => {
  for (const abundance of ['line', 'area']) {
    const svg = buildLogSVG({ ...base, rows: [{ a0: 0, a1: 1, pct: 20, classPct: [20, 0] }, { a0: 2, a1: 3, pct: 30, classPct: [30, 0] }],
      to: 3, taxa: { abundance, layout: 'separate' } }).svg;
    assert.equal((abundanceGroups(svg)[0].match(abundance === 'line' ? /<polyline/g : /<polygon/g) || []).length, 2);
  }
});

test('percentage labels can accompany presence without a filled abundance shape and remain opaque', () => {
  const result = buildLogSVG({ ...base, taxonPoints: [{ a: 0.25, index: 0, kind: 'mark' }],
    taxa: { abundance: 'none', occurrence: 'symbols', source: 'marks', values: true, opacity: 0 } });
  assert.ok(abundanceGroups(result.svg).every((group) => group === ''));
  assert.match(result.svg, /data-role="percentage"[^>]*>20%<\/text>/);
  assert.equal((result.svg.match(/data-role="occurrence"/g) || []).length, 1);
});

test('fixed percentage scales override inherited bounds while names at the window endpoints stay inside', () => {
  const result = buildLogSVG({ ...base, taxonPoints: [{ a: 0, index: 0, kind: 'mark' }, { a: 2, index: 0, kind: 'mark' }],
    taxa: { layout: 'separate', abundance: 'kite', occurrence: 'names', scale: 'percent' },
    style: { axes: { 'sp:Chondrites': { min: 5, max: 25, log: true } } } });
  assert.match(result.svg, />100%<\/text>/);
  const names = [...result.svg.matchAll(/data-role="occurrence"[^>]*>.*?<text[^>]*y="([^"]+)"/gs)].map((match) => +match[1]);
  assert.ok(names.every((y) => y > result.plotTop && y < result.plotTop + result.plotHeight));
});
