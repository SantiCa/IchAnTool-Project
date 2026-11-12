import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EngineClient, createEngineService } = require('../../desktop/engine.js');
const { MAX_JSON, MAX_CHUNK, parseControl, controlFrame, frame, ControlReader } = require('../../desktop/engine-protocol.js');
const script = fileURLToPath(new URL('../../src/sedcoretool/engine/server.py', import.meta.url));
const runtimeId = '0'.repeat(64);
const pythonCheck = spawnSync(process.platform === 'win32' ? 'py' : 'python3',
  [...(process.platform === 'win32' ? ['-3.12'] : []), '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true });
const python = process.env.SEDCORETOOL_TEST_PYTHON || (pythonCheck.status === 0 ? pythonCheck.stdout.trim() : null);
const digest = (data) => createHash('sha256').update(data).digest('hex');

test('engine response framing handles arbitrary splits, coalescing and exact control limits', () => {
  const value = { depth: -10, result: ['one', 'two'] };
  const encoded = Buffer.concat(controlFrame(value));
  for (let split = 1; split < encoded.length; split++) {
    const decoded = [], reader = new ControlReader((item) => decoded.push(item));
    reader.push(encoded.subarray(0, split)); reader.push(Buffer.concat([encoded.subarray(split), encoded])); reader.end();
    assert.deepEqual(decoded, [value, value]);
  }
  const oversized = Buffer.alloc(12); oversized.write('SCE1'); oversized[4] = 1; oversized.writeUInt32LE(MAX_JSON + 1, 8);
  assert.throws(() => new ControlReader(() => {}).push(oversized), /header/);
  const highBit = Buffer.from(encoded); highBit[0] |= 128;
  assert.throws(() => new ControlReader(() => {}).push(highBit), /header/);
  const reader = new ControlReader(() => {}); reader.push(encoded.subarray(0, -1));
  assert.throws(() => reader.end(), /Truncated/);
});

test('engine controls reject duplicate keys, malformed UTF-8, deep structures and unsafe numbers', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":1e309}', '{"x":9007199254740992}', '['.repeat(17) + '0' + ']'.repeat(17)]) {
    assert.throws(() => parseControl(Buffer.from(text)));
  }
  assert.throws(() => parseControl(Buffer.from([0xff])));
  assert.deepEqual(parseControl(Buffer.from('{"a":{"x":1},"b":{"x":2},"literal":"{\\\"x\\\":1}"}')).b, { x: 2 });
});

async function clientFixture(t, options = {}) {
  const client = new EngineClient({ executable: python, script, version: 'test', runtimeId, ...options });
  t.after(() => client.stop());
  await client.start();
  return client;
}

async function upload(client, data) {
  const { handle } = await client.request('buffer.begin', { dtype: 'u8', shape: [data.length], byte_length: data.length, sha256: digest(data) });
  for (let offset = 0; offset < data.length; offset += MAX_CHUNK) {
    const chunk = data.subarray(offset, offset + MAX_CHUNK);
    const result = await client.request('buffer.chunk', { handle, offset, byte_length: chunk.length }, chunk);
    assert.equal(result.next_offset, offset + chunk.length);
  }
  await client.request('buffer.commit', { handle });
  return handle;
}

test('actual isolated Python transfers multiple bounded chunks and computes only an advertised diagnostic', { skip: !python }, async (t) => {
  const client = await clientFixture(t);
  assert.deepEqual(client.status().methods, ['buffer.digest/1']);
  const data = Buffer.alloc(MAX_CHUNK * 2 + 137, 93), handle = await upload(client, data);
  assert.deepEqual(await client.request('buffer.digest', { handle }), { sha256: digest(data), byte_length: data.length });
  assert.deepEqual(await client.request('buffer.release', { handles: [handle] }), { released: [handle] });
  await assert.rejects(client.request('buffer.digest', { handle }), { code: 'INVALID_BUFFER' });
  assert.equal(client.status().state, 'ready');
  const scratch = client.scratchDirectory;
  const child = client.child;
  await client.stop();
  assert.equal(child.exitCode, 0, 'normal shutdown exits without a forced kill');
  assert.equal(existsSync(scratch), false, 'normal shutdown removes private staging data');
});

test('local saturation, invalid chunks and cancelled jobs preserve the responding session', { skip: !python }, async (t) => {
  const client = await clientFixture(t);
  const pending = Array.from({ length: 32 }, () => client.request('buffer.release', { handles: [] }));
  await assert.rejects(client.request('buffer.release', { handles: [] }), { code: 'BUSY' });
  await Promise.all(pending);
  const handle = await upload(client, Buffer.alloc(123456, 17));
  await assert.rejects(client.request('buffer.chunk', { handle, offset: 0, byte_length: 1 }, Buffer.from([1])), { code: 'INVALID_BUFFER' });
  const chunks = Array.from({ length: 2 }, () => assert.rejects(
    client.request('buffer.chunk', { handle, offset: 0, byte_length: 1 }, Buffer.from([1])), { code: 'INVALID_BUFFER' }));
  await assert.rejects(client.request('buffer.chunk', { handle, offset: 0, byte_length: 1 }, Buffer.from([1])), { code: 'BUSY' });
  await Promise.all(chunks);
  const job = client.request('buffer.digest', { handle });
  const cancellation = await client.request('job.cancel', { request_id: job.requestId });
  assert.equal(cancellation.state, 'requested');
  assert.deepEqual(await job, { cancelled: true });
  assert.equal(client.status().state, 'ready');
});

test('coordinator death invalidates handles, rejects in-flight work and permits a new clean session', { skip: !python }, async (t) => {
  const client = await clientFixture(t);
  const handle = await upload(client, Buffer.alloc(32, 4));
  const session = client.session, scratch = client.scratchDirectory;
  const inFlight = client.request('buffer.digest', { handle });
  const rejected = assert.rejects(inFlight, { code: 'ENGINE_UNAVAILABLE' });
  client.child.kill();
  await client.exited;
  await rejected;
  assert.equal(client.status().state, 'unavailable');
  assert.equal(existsSync(scratch), false, 'failed coordinator staging is reaped by its main-process owner');
  await assert.rejects(client.request('buffer.digest', { handle }), { code: 'ENGINE_UNAVAILABLE' });
  await client.start();
  assert.notEqual(client.session, session);
  await assert.rejects(client.request('buffer.digest', { handle }), { code: 'INVALID_BUFFER' });
});

test('a stalled child fails within the startup deadline and is reaped', { skip: !python }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sedcoretool-engine-fixture-'));
  const fixture = path.join(directory, 'stalled.py');
  await fs.writeFile(fixture, 'import time\ntime.sleep(30)\n');
  t.after(async () => {
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
    assert.match(path.basename(absolute), /^sedcoretool-engine-fixture-[a-zA-Z0-9]+$/);
    await fs.rm(absolute, { recursive: true, force: true });
  });
  const client = new EngineClient({ executable: python, script: fixture, version: 'test', runtimeId, timeoutMs: 150 });
  t.after(() => client.stop());
  await assert.rejects(client.start(), { code: 'ENGINE_UNAVAILABLE' });
  await client.exited;
  assert.equal(client.status().state, 'unavailable');
  assert.equal(existsSync(client.scratchDirectory), false);
});

test('unexpected binary frames invalidate and clean the session', { skip: !python }, async (t) => {
  const client = await clientFixture(t);
  const scratch = client.scratchDirectory;
  for (const part of frame(2, Buffer.from([1]))) client.child.stdin.write(part);
  await client.exited;
  assert.equal(client.status().state, 'unavailable');
  assert.equal(existsSync(scratch), false);
});

test('disabled and packaged services never launch a user interpreter', async () => {
  for (const [enabled, packaged, state] of [[false, false, 'disabled'], [true, true, 'unavailable'], [true, false, 'unavailable']]) {
    const service = createEngineService({ enabled, packaged, executable: 'untrusted-relative-path', version: 'test', sourceDirectory: '/not-used' });
    await service.start();
    assert.equal(service.status().state, state);
    assert.deepEqual(service.status().methods, []);
    await service.stop();
  }
});
