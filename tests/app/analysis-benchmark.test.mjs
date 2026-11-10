import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCPU } from '../../tools/benchmark_analysis.mjs';

test('analysis CPU profiles attribute weighted samples without counting unsampled ancestors', () => {
  const frame = (functionName, url = 'http://127.0.0.1:123/app/js/core.js') => ({ functionName, url, lineNumber: 148 });
  const result = summarizeCPU({ nodes: [
    { id: 1, callFrame: frame('(root)', '') },
    { id: 2, callFrame: frame('rowCounts') },
    { id: 3, callFrame: frame('binRows') },
  ], samples: [2, 3, 2], timeDeltas: [1000, 500, 2000] });
  assert.equal(result.sampled_ms, 3.5);
  assert.equal(result.samples, 3);
  assert.deepEqual(result.sites.map((site) => [site.function, site.source, site.sampled_self_ms]),
    [['rowCounts', 'js/core.js', 3], ['binRows', 'js/core.js', 0.5]]);
});

test('analysis CPU profiles reject unmatched samples and invalid weights', () => {
  const nodes = [{ id: 1, callFrame: { functionName: 'f', url: '', lineNumber: 0 } }];
  assert.throws(() => summarizeCPU({ nodes, samples: [1], timeDeltas: [] }), /matching weights/);
  assert.throws(() => summarizeCPU({ nodes, samples: [2], timeDeltas: [1] }), /Invalid CPU sample/);
  assert.throws(() => summarizeCPU({ nodes, samples: [1], timeDeltas: [-1] }), /Invalid CPU sample/);
});
