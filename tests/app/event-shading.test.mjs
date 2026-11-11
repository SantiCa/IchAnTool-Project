import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLogSVG, eventShadeOptions, eventShading } from '../../app/js/log.js';

const bands = [
  { key: 'fam:climate', title: 'Climate', segs: [{ a0: 1, a1: 4, label: 'cold', name: 'Cold', color: '#123456' }] },
  { key: 'fam:beds', title: 'Beds', segs: [{ a0: 2, a1: 6, label: 'turbidite', name: 'Turbidite', color: '#789abc' }] },
  { key: 'auto:model:oxygen', title: 'Oxygen model', segs: [{ a0: 3, a1: 7, label: 'low', name: 'Low oxygen', color: '#abcdef', opacity: 0.9 }] },
];
const settings = { on: true, sources: bands.map((band) => band.key), mode: 'mix', area: 'panel',
  styles: { 'fam:climate': { opacity: 0.35, colors: { cold: '#112233' } }, 'fam:beds': { opacity: 0.6 } } };

const draw = (options = {}) => buildLogSVG({ from: 0, to: 10, height: 200, rows: [], classes: [], tracks: {},
  records: [{ name: 'Ca', color: '#102030', pts: [[0, 2], [5, 8], [10, 4]] }],
  style: { axes: { 'rec:Ca': { min: 0, max: 10 } } }, ...options });

test('malformed saved event presentation falls back safely and normalisation owns its nested styles', () => {
  for (const invalid of [null, false, 'bad', [], { sources: 42, styles: null }]) {
    assert.deepEqual(eventShadeOptions(invalid), { on: false, sources: [], mode: 'mix', area: 'panel', styles: {} });
  }
  const original = structuredClone(settings), normal = eventShadeOptions(settings);
  normal.styles['fam:climate'].colors.cold = '#ffffff';
  assert.deepEqual(settings, original);
  const clean = eventShadeOptions({ on: true, sources: ['a', null, 'a', 42], styles: { a: { opacity: '0.3', colors: { valid: '#abc', invalid: '<script>' } } } });
  assert.deepEqual(clean.sources, ['a']);
  assert.deepEqual(clean.styles.a, { opacity: 0.22, colors: { valid: '#abc' } });
});

test('three independent event sources overlay in selection order with figure-local colours and opacity', () => {
  const original = structuredClone({ bands, settings }), result = eventShading(bands, settings);
  assert.deepEqual(result.shade.map((segment) => segment.source), settings.sources);
  assert.deepEqual(result.shade.map((segment) => [segment.a0, segment.a1, segment.fo, segment.lane]), [[1, 4, 0.35, 0], [2, 6, 0.6, 0], [3, 7, 0.22, 0]]);
  assert.deepEqual(result.shadeLegend, [{ name: 'Climate · Cold', color: '#112233' }, { name: 'Beds · Turbidite', color: '#789abc' }, { name: 'Oxygen model · Low oxygen', color: '#abcdef' }]);
  assert.equal(result.shadeLanes, 1);
  assert.deepEqual({ bands, settings }, original);
});

test('split event lanes ignore unavailable and duplicate sources and clamp invalid presentation', () => {
  const result = eventShading(bands, { ...settings, mode: 'split', sources: ['missing', ...settings.sources, 'fam:beds'],
    styles: { 'fam:climate': { opacity: -1, colors: { cold: '"><script>' } }, 'fam:beds': { opacity: 2 }, 'auto:model:oxygen': { opacity: NaN } } });
  assert.equal(result.shadeLanes, 3);
  assert.deepEqual(result.shade.map((segment) => [segment.lane, segment.fo]), [[0, 0], [1, 1], [2, 0.22]]);
  assert.equal(result.shade[0].color, '#123456');
  assert.deepEqual(eventShading(bands, { ...settings, on: false }), {});
  assert.deepEqual(eventShading(bands, { ...settings, sources: [] }).shade, []);
});

test('event backgrounds sit behind unchanged proxy curves and remain inside the visible depth window', () => {
  const base = draw(), shaded = draw(eventShading(bands, settings));
  const curve = (svg) => svg.match(/<polyline[^>]*stroke="#102030"[^>]*\/>/)[0];
  assert.equal(curve(shaded.svg), curve(base.svg));
  assert.deepEqual(shaded.layout, base.layout);
  assert.ok(shaded.svg.indexOf('data-role="event-shading"') < shaded.svg.indexOf(curve(shaded.svg)));
  assert.match(shaded.svg, /fill="#112233" fill-opacity="0.35"/);
  const window = draw({ from: 2, to: 5, ...eventShading(bands, settings) });
  const rectangles = [...window.svg.matchAll(/<rect data-event-source="[^"]*"[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)];
  assert.equal(rectangles.length, 3);
  for (const rect of rectangles) {
    assert.ok(+rect[1] >= window.plotTop);
    assert.ok(+rect[1] + +rect[2] <= window.plotTop + window.plotHeight + 0.01);
  }
  assert.equal(draw({ ...eventShading(bands, { on: false }) }).svg, base.svg);
});

test('under-curve shading follows the displayed curve, axis baseline and reversal without changing record values', () => {
  for (const reverse of [false, true]) {
    const original = [[0, -2], [2, 6], [4, null], [6, 3], [10, 8]], before = structuredClone(original);
    const result = draw({ records: [{ name: 'Ca', color: '#102030', pts: original }],
      style: { axes: { 'rec:Ca': { min: -10, max: 10, rev: reverse } } },
      ...eventShading(bands, { ...settings, area: 'curve' }) });
    const path = result.svg.match(/<clipPath id="event-area-[^"]*"><path d="([^"]*)"/)[1];
    assert.equal((path.match(/M/g) || []).length, 1, 'the fill follows the same non-null samples as the displayed polyline');
    assert.equal((path.match(/Z/g) || []).length, 1);
    const column = result.layout.find((column) => column.id === 'rec:Ca');
    assert.ok(path.startsWith(`M${column.x + column.w / 2} ${result.plotTop}`), 'zero is the baseline for a signed axis');
    assert.match(result.svg, /data-role="event-shading" clip-path="url\(#event-area-/);
    assert.deepEqual(original, before);
  }
});

test('under-curve logarithmic shading breaks at nonpositive samples and uses the positive axis minimum', () => {
  const result = draw({ records: [{ name: 'Ca', pts: [[0, 1], [2, 10], [4, 0], [6, 10], [10, 100]] }],
    style: { axes: { 'rec:Ca': { min: 1, max: 100, log: true, rev: true } } },
    ...eventShading(bands, { ...settings, area: 'curve' }) });
  const path = result.svg.match(/<clipPath id="event-area-[^"]*"><path d="([^"]*)"/)[1];
  assert.equal((path.match(/M/g) || []).length, 2);
  assert.doesNotMatch(path, /NaN|Infinity/);
  const column = result.layout.find((column) => column.id === 'rec:Ca');
  assert.ok(path.startsWith(`M${column.x + column.w} ${result.plotTop}`));
});
