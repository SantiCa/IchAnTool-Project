// Check the application archives produced by electron-builder before uploading installers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listPackage } = require('@electron/asar');

const dist = path.resolve(__dirname, '..', 'dist');
const archives = fs.readdirSync(dist, { recursive: true }).filter((file) => path.basename(file) === 'app.asar');
assert.ok(archives.length, 'No packaged application archive found');

const expected = ['web/examples', 'web/examples/data', 'web/examples/data/land-50m.json'];
for (const archive of archives) {
  const examples = listPackage(path.join(dist, archive))
    .map((file) => file.replaceAll('\\', '/').replace(/^\/+/, ''))
    .filter((file) => file === 'web/examples' || file.startsWith('web/examples/'))
    .sort();
  assert.deepEqual(examples, expected, `Only the coastline may be packaged as example data in ${archive}`);
  console.log(`Packaged data verified: ${archive}`);
}
