import test from 'node:test';
import assert from 'node:assert/strict';
import { Classifier, FEATURES } from '../../app/js/learn.js';

const mk = (y, base, i) => ({ y, x: FEATURES.map((_, j) => base + ((i * 7 + j * 3) % 5) * 0.01) });

test('k-NN: class probabilities, novelty and stored model', () => {
  const ex = [];
  for (let i = 0; i < 10; i++) { ex.push(mk('Zoophycos', 0, i)); ex.push(mk('Chondrites', 1, i)); }
  const c = new Classifier({ k: 5, novelty: 3 }).fit(ex);
  const p = c.predict(FEATURES.map(() => 0.02));
  assert.equal(p.y, 'Zoophycos');
  assert.ok(Math.abs(Object.values(p.probs).reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.ok(c.predict(FEATURES.map(() => 50)).novel);
  const back = Classifier.fromJSON(JSON.parse(JSON.stringify(c)));
  const q = back.predict(FEATURES.map(() => 0.98));
  assert.equal(q.y, 'Chondrites'); assert.equal(back.n, 20); assert.equal(back.accuracy, c.accuracy);
});

test('methods and scopes compared on the same test traces', async () => {
  const { TaxonModel, evaluateModels, stratifiedFolds } = await import('../../app/js/learn.js');
  const { fitModel, predictProba } = await import('../../app/js/geo.js');
  const ex = [];
  for (let i = 0; i < 20; i++) { ex.push({ key: 'a' + i, ...mk('Zoophycos', 0, i) }); ex.push({ key: 'b' + i, ...mk('Chondrites', 1, i) }); }
  const folds = stratifiedFolds(ex.map((e) => e.y), 5, 1);
  assert.equal(folds.flat().length, 40); assert.ok(folds.every((f) => f.filter((i) => ex[i].y === 'Zoophycos').length === 4));
  const opt = { k: 5, novelty: 3, fitFn: fitModel, probaFn: predictProba, rf: { trees: 20 } };
  const rf = new TaxonModel({ ...opt, method: 'rf' }).fit(ex);
  assert.equal(rf.predict(FEATURES.map(() => 0.99)).y, 'Chondrites');
  const r = evaluateModels({ test: ex.slice(0, 20), pools: { core: ex.slice(0, 20), project: ex }, methods: ['knn', 'nb', 'rf'], opt });
  for (const sc of ['core', 'project']) for (const m of ['knn', 'nb', 'rf']) assert.equal(r[sc][m].accuracy, 1);
});
