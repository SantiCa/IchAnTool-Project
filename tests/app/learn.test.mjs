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
