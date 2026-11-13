import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadRuntime, verifyInventory, resourcePath } = require('../../desktop/engine-runtime.js');
const { createEngineService } = require('../../desktop/engine.js');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, target = 'win32-x64') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sedcoretool-runtime-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^sedcoretool-runtime-test-[a-zA-Z0-9]+$/);
    await fs.rm(directory, { recursive: true, force: true });
  });
  const runtimeDirectory = path.join(directory, 'runtime'), sourceDirectory = path.join(directory, 'src');
  const root = path.join(runtimeDirectory, target), executable = target.startsWith('win') ? 'python/python.exe' : 'python/bin/python3.12';
  const entry = 'sedcoretool/engine/server.py', data = Buffer.from('public fixture');
  for (const filename of [path.join(root, executable), path.join(sourceDirectory, entry)]) {
    await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, data);
  }
  const lock = Buffer.from(JSON.stringify({ schema: 1, python_version: '3.12.test', packages: { numpy: 'test' }, targets: { [target]: { executable } } }));
  const lockPath = path.join(directory, 'lock.json'); await fs.writeFile(lockPath, lock);
  const manifest = { schema: 1, target, executable, python_version: '3.12.test', packages: { numpy: 'test' }, application_version: 'test', lock_sha256: digest(lock),
    files: [{ path: executable, size: data.length, sha256: digest(data) }], sources: [{ path: entry, size: data.length, sha256: digest(data) }] };
  const manifestPath = path.join(root, 'manifest.json');
  const writeManifest = () => fs.writeFile(manifestPath, JSON.stringify(manifest));
  await writeManifest();
  return { directory, root, runtimeDirectory, sourceDirectory, lockPath, manifest, manifestPath, writeManifest, version: 'test', platform: target.split('-')[0], arch: target.split('-')[1] };
}

test('runtime identity selects all four architecture directories without trusting a system executable', async (t) => {
  for (const target of ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64']) {
    const input = await fixture(t, target), result = await loadRuntime(input);
    assert.equal(result.runtime, 'bundled-verified');
    assert.equal(result.runtimeId, digest(await fs.readFile(input.manifestPath)));
    assert.equal(result.executable, path.join(input.root, input.manifest.executable));
  }
});

test('modified, missing and extra executable resources prevent startup', async (t) => {
  const input = await fixture(t), executable = path.join(input.root, input.manifest.executable);
  await fs.writeFile(executable, 'changed bytes!');
  await assert.rejects(loadRuntime(input), /checksum/);
  await fs.rm(executable);
  await assert.rejects(loadRuntime(input), /Missing/);
  await fs.writeFile(executable, 'public fixture');
  const injected = path.join(input.root, 'python/injected.pth');
  await fs.writeFile(injected, 'import unlisted_code');
  await assert.rejects(loadRuntime(input), /Unlisted/);
});

test('lock, application version and source revisions must match before executing Python', async (t) => {
  const input = await fixture(t);
  await assert.rejects(loadRuntime({ ...input, version: 'next' }), /identity/);
  await fs.appendFile(input.lockPath, ' ');
  await assert.rejects(loadRuntime(input), /identity/);
  input.manifest.lock_sha256 = digest(await fs.readFile(input.lockPath)); await input.writeManifest();
  await fs.appendFile(path.join(input.sourceDirectory, 'sedcoretool/engine/server.py'), ' changed');
  await assert.rejects(loadRuntime(input), /checksum/);
});

test('inventory rejects duplicate names, unsafe paths and impossible resource budgets', async (t) => {
  const input = await fixture(t), entry = input.manifest.files[0];
  for (const value of ['/escape', '../escape', 'C:/drive', 'python\\file', 'python//file']) assert.throws(() => resourcePath(input.root, value));
  await assert.rejects(verifyInventory(input.root, [entry, entry]), /Duplicate/);
  await assert.rejects(verifyInventory(input.root, [{ ...entry, size: 2 ** 32 }]), /size/);
  await assert.rejects(verifyInventory(input.root, [{ ...entry, sha256: 'untrusted' }]), /descriptor/);
});

test('a recorded verification skips hashing only while every file keeps its identity on disk', async (t) => {
  const input = await fixture(t), cacheFile = path.join(input.directory, 'user', 'verified.json');
  const executable = path.join(input.root, input.manifest.executable), source = path.join(input.sourceDirectory, 'sedcoretool/engine/server.py');
  assert.equal((await loadRuntime({ ...input, cacheFile })).verification, 'full');
  assert.equal((await loadRuntime({ ...input, cacheFile })).verification, 'recorded');
  // Same size and content, new file: the change time differs, so everything is hashed again and the record is renewed.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await fs.writeFile(source, 'public fixture');
  assert.equal((await loadRuntime({ ...input, cacheFile })).verification, 'full');
  assert.equal((await loadRuntime({ ...input, cacheFile })).verification, 'recorded');
  // Same size, different bytes, timestamps restored: the change time still moves, so the hash catches it.
  const before = await fs.stat(executable);
  await fs.writeFile(executable, 'public FIXTURE');
  await fs.utimes(executable, before.atime, before.mtime);
  await assert.rejects(loadRuntime({ ...input, cacheFile }), /checksum/);
});

test('a corrupt, foreign or unwritable verification record never weakens verification', async (t) => {
  const input = await fixture(t), cacheFile = path.join(input.directory, 'verified.json');
  await loadRuntime({ ...input, cacheFile });
  const record = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  for (const text of ['{', 'null', JSON.stringify({ ...record, runtime_id: 'f'.repeat(64) }), JSON.stringify({ ...record, runtime: 'x' }), 'x'.repeat(5000)]) {
    await fs.writeFile(cacheFile, text);
    assert.equal((await loadRuntime({ ...input, cacheFile })).verification, 'full');
  }
  await fs.writeFile(path.join(input.root, input.manifest.executable), 'changed bytes!');
  await assert.rejects(loadRuntime({ ...input, cacheFile }), /checksum/);
  const blocked = path.join(input.directory, 'blocked'); await fs.writeFile(blocked, 'a file, not a folder');
  await fs.writeFile(path.join(input.root, input.manifest.executable), 'public fixture');
  assert.equal((await loadRuntime({ ...input, cacheFile: path.join(blocked, 'verified.json') })).verification, 'full');
});

test('a packaged service rejects a bad bundle even when a user interpreter override is supplied', async (t) => {
  const input = await fixture(t);
  const service = createEngineService({ ...input, enabled: true, packaged: true, executable: path.join(input.directory, 'untrusted.exe'),
    sourceDirectory: input.directory });
  await service.start();
  assert.equal(service.status().state, 'unavailable');
  assert.deepEqual(service.status().methods, []);
  await service.stop();
});
