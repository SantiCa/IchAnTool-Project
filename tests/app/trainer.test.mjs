import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Trainer } from '../../desktop/trainer.js';

test('the managed trainer resolves current bundled Python code before its installed copy', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sedcoretool-trainer-'));
  const pySrc = fileURLToPath(new URL('../../', import.meta.url));
  try {
    const managed = new Trainer({ root, pySrc, python: null });
    assert.equal(managed.pythonEnv().PYTHONPATH.split(path.delimiter)[0], path.join(pySrc, 'src'));
    const external = new Trainer({ root, pySrc, python: 'external-python' });
    assert.equal(external.pythonEnv().PYTHONPATH, process.env.PYTHONPATH);
  } finally {
    rmdirSync(path.join(root, 'models'));
    rmdirSync(path.join(root, 'runs'));
    rmdirSync(root);
  }
});
