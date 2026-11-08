// Check the application archives produced by electron-builder before uploading installers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listPackage } = require('@electron/asar');

const dist = path.resolve(__dirname, '..', 'dist');
const files = fs.readdirSync(dist, { recursive: true });
const archives = files.filter((file) => path.basename(file) === 'app.asar');
assert.ok(archives.length, 'No packaged application archive found');

const coastline = ['web/examples', 'web/examples/data', 'web/examples/data/land-50m.json'];
function checkExamples(archive, expected) {
  const examples = listPackage(path.join(dist, archive))
    .map((file) => file.replaceAll('\\', '/').replace(/^\/+/, ''))
    .filter((file) => file === 'web/examples' || file.startsWith('web/examples/'))
    .sort();
  assert.deepEqual(examples, expected, `Only the coastline may be packaged as example data in ${archive}`);
  console.log(`Packaged data verified: ${archive}`);
}

for (const archive of archives) {
  // A split macOS universal bundle uses app.asar as a launcher for both architecture archives.
  const split = ['x64', 'arm64'].map((arch) => path.join(path.dirname(archive), `app-${arch}.asar`))
    .filter((file) => files.includes(file));
  assert.ok(split.length === 0 || split.length === 2, `Incomplete universal application next to ${archive}`);
  checkExamples(archive, split.length ? [] : coastline);
  for (const part of split) checkExamples(part, coastline);
}
