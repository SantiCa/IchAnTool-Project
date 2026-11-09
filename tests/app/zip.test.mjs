import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { zipFiles, unzipBlob, crc32 } from '../../app/js/zip.js';

test('V0.8: zip round trip (text and binary entries) and CRC-32', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bin = new Uint8Array(3000).map((_, i) => (i * 7) & 255);
  const z = await zipFiles([{ name: 'project.json', data: '{"a":1}' }, { name: 'images/x ñ.jpg', data: new Blob([bin]) }]);
  const m = await unzipBlob(z);
  assert.equal(await (await m.get('project.json').get()).text(), '{"a":1}');
  assert.deepEqual(new Uint8Array(await (await m.get('images/x ñ.jpg').get()).arrayBuffer()), bin);
});

test('ZIP computes the CRC across bounded slices without reading the original as one buffer', async () => {
  class SliceOnlyBlob extends Blob {
    arrayBuffer() { throw new Error('whole input read'); }
  }
  const bytes = new Uint8Array(4 * 1024 * 1024 + 23);
  bytes.set([12, 34, 56, 78], 4 * 1024 * 1024 - 2);
  const zip = await zipFiles([{ name: 'images/core.tif', data: new SliceOnlyBlob([bytes]) }]);
  const header = new DataView(await zip.slice(0, 30).arrayBuffer());
  assert.equal(header.getUint32(14, true), crc32(bytes));
  const result = await (await unzipBlob(zip)).get('images/core.tif').get();
  assert.equal(result.size, bytes.length);
  assert.deepEqual(new Uint8Array(await result.slice(-25, -21).arrayBuffer()), new Uint8Array([12, 34, 56, 78]));
});

test('ZIP checks stored payloads in bounded reads and returns a sliceable Blob', async () => {
  const blockSize = 4 * 1024 ** 2, reads = [];
  class BoundedBlob extends Blob {
    slice(...args) { return new BoundedBlob([super.slice(...args)]); }
    arrayBuffer() {
      assert.ok(this.size <= blockSize, 'read exceeds the CRC block size');
      reads.push(this.size);
      return super.arrayBuffer();
    }
  }
  const payload = new Uint8Array(blockSize + 23);
  payload.set([12, 34, 56, 78], blockSize - 2);
  const name = 'images/core.tif';
  const zip = await zipFiles([{ name, data: payload }]);
  const entries = await unzipBlob(new BoundedBlob([zip]));
  reads.length = 0;
  const member = await entries.get(name).get();
  assert.deepEqual(reads.slice(-2), [blockSize, 23]);
  assert.equal(member.size, payload.length);
  assert.deepEqual(new Uint8Array(await member.slice(blockSize - 2, blockSize + 2).arrayBuffer()), new Uint8Array([12, 34, 56, 78]));
});

for (const [name, data, offset] of [
  ['project.json', '{"name":"Core"}', 9],
  ['images/core.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 1],
]) {
  test(`ZIP rejects a stored ${name} with one altered payload byte`, async () => {
    const zip = await zipFiles([{ name, data }]);
    const bytes = new Uint8Array(await zip.arrayBuffer()), header = new DataView(bytes.buffer);
    const start = 30 + header.getUint16(26, true) + header.getUint16(28, true);
    bytes[start + offset] ^= 1;
    const entries = await unzipBlob(new Blob([bytes]));
    await assert.rejects(entries.get(name).get(), /CRC mismatch/);
  });
}

async function deflatedMember(data, size = data.length) {
  const blob = await zipFiles([{ name: 'project.json', data: deflateRawSync(data) }]);
  const view = new DataView(await blob.arrayBuffer()), cd = view.getUint32(view.byteLength - 6, true);
  view.setUint16(8, 8, true); view.setUint16(cd + 10, 8, true);
  view.setUint32(14, crc32(data), true); view.setUint32(cd + 16, crc32(data), true);
  view.setUint32(22, size, true); view.setUint32(cd + 24, size, true);
  return new Blob([view.buffer]);
}

test('ZIP accepts valid deflate and rejects a forged low or oversized expanded size', async () => {
  const data = new TextEncoder().encode(JSON.stringify({ a: 'A'.repeat(64 * 1024) }));
  const valid = await unzipBlob(await deflatedMember(data));
  assert.deepEqual(new Uint8Array(await (await valid.get('project.json').get()).arrayBuffer()), data);
  const forged = await unzipBlob(await deflatedMember(data, 64));
  await assert.rejects(forged.get('project.json').get(), /inflated size/);
  await assert.rejects(unzipBlob(await deflatedMember(data, 129 * 1024**2)), /uncompressed size/);
});

test('ZIP rejects unsafe paths, duplicate names and overlapping member offsets', async () => {
  await assert.rejects(unzipBlob(await zipFiles([{ name: '../project.json', data: '{}' }])), /member name/);
  const repeated = [{ name: 'project.json', data: '{}' }, { name: 'project.json', data: '{}' }];
  await assert.rejects(unzipBlob(await zipFiles(repeated)), /duplicate/);
  const blob = await zipFiles([{ name: 'a', data: 'A' }, { name: 'b', data: 'B' }]);
  const view = new DataView(await blob.arrayBuffer()), cd = view.getUint32(view.byteLength - 6, true);
  view.setUint32(cd + 47 + 42, 0, true);
  await assert.rejects(unzipBlob(new Blob([view.buffer])), /Overlapping ZIP/);
});
