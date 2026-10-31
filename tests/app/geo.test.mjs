import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable } from '../../app/js/log.js';
import { coresFromLongTable, applyCatalogue, buildSamples, labelSamples, ruleMatches, resample, coreConvert,
  fitModel, predictLabel, crossValidate, kmeansFit, mapSummary, idwGrid, buildMapSVG, mapBBox, seededRandom } from '../../app/js/geo.js';

const tab = parseTable(readFileSync(new URL('../../examples/geochem_demo/demo_long.csv', import.meta.url), 'utf8'));
const H = tab.headers, col = (n) => H.indexOf(n);
const proxies = ['Ti/Al', 'Zr/Rb', 'Ba/Al', 'Mn/Al', 'Ca_pct', 'TOC_pct'];
const cores = coresFromLongTable(tab, { core: col('core'), lat: col('lat'), lon: col('lon'), depth: col('depth_m'), age: col('age_ka'), proxies: proxies.map(col) });
cores.forEach((c, i) => (c.id = c.name));
const truth = new Map(); tab.text.forEach((r) => truth.set(`${r[0]}|${(+r[col('age_ka')]).toFixed(2)}`, r[col('event_true')]));
const cfg = { axis: 'age', step: 0.5, features: proxies, ratios: [], logs: proxies, scaling: 'global' };
const samples = buildSamples(cores, cfg);
const truthOf = (s) => truth.get(`${s.core}|${s.age.toFixed(2)}`);

test('import: 15 cores with coordinates, catalogue matching, depth↔age conversion', () => {
  assert.equal(cores.length, 15);
  assert.ok(cores.every((c) => c.lat != null && c.lon != null && c.depth.length === 301));
  const cat = parseTable('core,lat,lon,water_depth_m\ndemo-01,1,2,300\n');
  const copy = [{ name: 'DEMO-01' }];
  assert.equal(applyCatalogue(copy, cat, { core: 0, lat: 1, lon: 2, wd: 3 }), 1);
  assert.deepEqual([copy[0].lat, copy[0].lon, copy[0].waterDepth], [1, 2, 300]);
  const c = cores[0]; assert.ok(Math.abs(coreConvert(c, coreConvert(c, 50, 'age', 'depth'), 'depth', 'age') - 50) < 1e-6);
});

test('resample and samples', () => {
  assert.deepEqual(resample([0, 2], [0, 4], [0, 1, 2, 3]), [0, 2, 4, null]);
  assert.deepEqual(resample([0, 1, 5], [0, 1, 5], [3], 2), [null]);
  assert.equal(samples.length, 15 * 301);
  assert.ok(samples.every((s) => s.f.length === 6 && s.zc.length === 6));
});

test('rules use per-core z-scores', () => {
  const rule = { label: 'lowO2', conds: [{ feature: 'Ba/Al', op: 'z>', value: 1 }, { feature: 'Mn/Al', op: 'z<', value: -0.5 }] };
  const hits = samples.filter((s) => ruleMatches(rule, s, proxies));
  const precision = hits.filter((s) => truthOf(s) === 'low_oxygenation').length / hits.length;
  assert.ok(hits.length > 100 && precision > 0.8, `rule precision ${precision}`);
});

test('random forest trained on 3 cores classifies the other 12 (synthetic truth)', () => {
  const trainCores = new Set(['DEMO-02', 'DEMO-09', 'DEMO-13']);
  const intervals = [];
  for (const s of samples) if (trainCores.has(s.core)) intervals.push({ core: s.core, axis: 'age', from: s.x - 0.25, to: s.x + 0.25, label: truthOf(s) });
  const lab = labelSamples(samples, { intervals, rules: [], features: proxies, axis: 'age', cores });
  const tr = samples.map((s, i) => i).filter((i) => lab[i].label);
  for (const method of ['rf', 'knn', 'nb']) {
    const m = fitModel(method, tr.map((i) => samples[i].f), tr.map((i) => lab[i].label), method === 'rf' ? { trees: 40 } : {}, 7);
    const test = samples.filter((s) => !trainCores.has(s.core));
    const acc = test.filter((s) => predictLabel(m, s.f).label === truthOf(s)).length / test.length;
    assert.ok(acc > 0.8, `${method} accuracy ${acc.toFixed(3)}`);
  }
  const cv = crossValidate(samples, lab.map((l) => l.label), 'nb', {}, 1);
  assert.equal(cv.scheme, 'leave-one-core-out'); assert.equal(cv.folds, 3); assert.ok(cv.accuracy > 0.7);
});

test('k-means and seeded reproducibility', () => {
  const X = samples.slice(0, 600).map((s) => s.f);
  const a = kmeansFit(X, { k: 3, restarts: 2, maxIter: 50 }, 5), b = kmeansFit(X, { k: 3, restarts: 2, maxIter: 50 }, 5);
  assert.deepEqual(a.centers, b.centers);
  const r1 = seededRandom(3), r2 = seededRandom(3); assert.equal(r1(), r2());
});

test('map summary, IDW and SVG', () => {
  const preds = samples.map((s) => ({ label: truthOf(s) }));
  const pts = mapSummary(samples, preds, cores, { a0: 6, a1: 10, mode: 'class' });
  const east = pts.find((p) => p.name === 'DEMO-15'), west = pts.find((p) => p.name === 'DEMO-01');
  assert.equal(east.dominant, 'low_oxygenation'); assert.equal(west.dominant, 'background');
  const vals = mapSummary(samples, preds, cores, { a0: 6, a1: 10, mode: 'value', feature: 2 });
  const grid = idwGrid(vals, mapBBox(vals), 20, 10, 2);
  assert.equal(grid.length, 200); assert.ok(grid.every((v) => v != null));
  const svg = buildMapSVG({ land: [[0, 35, 10, 35, 10, 40, 0, 40]], bbox: mapBBox(vals), points: pts, mode: 'class', colors: { low_oxygenation: '#000' }, title: 'T' });
  assert.ok(svg.startsWith('<svg') && svg.includes('DEMO-15'));
});

test('labels: interval beats rule, intervals convert between axes; ratios and per-core scaling', async () => {
  const { featureSeries } = await import('../../app/js/geo.js');
  const c = { id: 'X', name: 'X', depth: [0, 1, 2, 3, 4], age: [0, 10, 20, 30, 40], proxies: { A: [1, 2, 3, 4, 50], B: [1, 1, 1, 2, 0] } };
  assert.deepEqual(featureSeries(c, 'A/B', [{ a: 'A', b: 'B' }]), [1, 2, 3, 2, null]);
  const smp = buildSamples([c], { axis: 'age', step: 10, features: ['A'], ratios: [], logs: [], scaling: 'core' });
  assert.deepEqual(smp.map((s) => s.f[0]), smp.map((s) => s.zc[0]));
  const rule = { label: 'R', conds: [{ feature: 'A', op: '>', value: 0 }] };
  const iv = [{ core: 'X', axis: 'depth', from: 1, to: 2, label: 'I' }];   // depth 1–2 = age 10–20
  const lab = labelSamples(smp, { intervals: iv, rules: [rule], features: ['A'], axis: 'age', cores: [c] });
  assert.deepEqual(lab.map((l) => l.label), ['R', 'I', 'R', 'R', 'R']);
  assert.equal(lab[1].source, 'interval');
  const noRules = labelSamples(smp, { intervals: iv, rules: [rule], useRules: false, features: ['A'], axis: 'age', cores: [c] });
  assert.deepEqual(noRules.map((l) => l.label), [null, 'I', null, null, null]);
});

test('interval layers: import, 0/1 features, target layer, nesting check', async () => {
  const { intervalsFromTable, layerFeatureNames, orphanIntervals } = await import('../../app/js/geo.js');
  const t1 = parseTable('core,top,bottom,Lithology,Turbidite\nX,0,2,clay,\nX,2,4,marl,yes\nX,4,5,marl,\n');
  const recs = intervalsFromTable(t1, { core: 0, from: 1, to: 2, layer: -1, values: [3, 4] });
  assert.equal(recs.length, 4); assert.deepEqual(recs[2], { core: 'X', layer: 'Turbidite', value: 'yes', from: 2, to: 4 });
  const t2 = parseTable('top;bottom;layer;value\n1;3;Metals;front\n');
  assert.deepEqual(intervalsFromTable(t2, { core: -1, from: 0, to: 1, layer: 2, values: [3] }, 'Y'), [{ core: 'Y', layer: 'Metals', value: 'front', from: 1, to: 3 }]);
  const c = { id: 'X', name: 'X', depth: [0, 1, 2, 3, 4, 5], age: [0, 10, 20, 30, 40, 50], proxies: { A: [1, 2, 3, 4, 5, 6] } };
  const layers = [{ id: 'lit', name: 'Lith', parent: null, cats: [{ id: 'clay', name: 'clay' }, { id: 'marl', name: 'marl' }] }, { id: 'tb', name: 'Turb', parent: 'lit', cats: [{ id: 'y', name: 'yes' }] }];
  const iv = [{ id: 1, core: 'X', layer: 'lit', axis: 'depth', from: 0, to: 2, cat: 'clay' }, { id: 2, core: 'X', layer: 'lit', axis: 'depth', from: 2, to: 5, cat: 'marl' },
    { id: 3, core: 'X', layer: 'tb', axis: 'age', from: 25, to: 35, cat: 'y' }, { id: 4, core: 'X', layer: 'tb', axis: 'depth', from: 1.5, to: 2.5, cat: 'y' }];
  assert.deepEqual(layerFeatureNames(layers), ['Lith: clay', 'Lith: marl', 'Turb: yes']);
  const smp = buildSamples([c], { axis: 'depth', step: 1, features: ['A'], ratios: [], logs: [], scaling: 'global', layers, intervals: iv });
  assert.deepEqual(smp.map((s) => s.f.slice(1)), [[1, 0, 0], [1, 0, 0], [0, 1, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]);
  const lab = labelSamples(smp, { intervals: iv, rules: [{ layer: 'other', cat: 'z', conds: [{ feature: 'A', op: '>', value: 0 }] }], features: ['A'], axis: 'depth', cores: [c], layer: 'tb' });
  assert.deepEqual(lab.map((l) => l.label), [null, null, 'y', 'y', null, null]);
  assert.deepEqual(orphanIntervals(iv, layers, [c]), [4]);
});
