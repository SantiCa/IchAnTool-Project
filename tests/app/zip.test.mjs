import test from 'node:test';
import assert from 'node:assert/strict';
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
