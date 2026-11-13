// Verify immutable packaged resources before executing Python. No network or system-Python lookup.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { parseControl } = require('./engine-protocol');

const MAX_FILES = 50000, MAX_BYTES = 2 * 1024 ** 3;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (left, right) => JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

function resourcePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || relative.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid runtime path');
  const absolute = path.resolve(root, relative), inside = path.relative(path.resolve(root), absolute);
  if (!inside || inside.startsWith(`..${path.sep}`) || inside === '..' || path.isAbsolute(inside)) throw new Error('Runtime path escapes root');
  return absolute;
}

async function readManifest(filename, limit) {
  const info = await fs.lstat(filename);
  if (!info.isFile() || info.size > limit) throw new Error('Runtime metadata limit');
  const chunks = []; let size = 0;
  for await (const chunk of createReadStream(filename, { highWaterMark: 65536 })) {
    size += chunk.length;
    if (size > limit) throw new Error('Runtime metadata limit');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  return { bytes, value: parseControl(bytes) };
}

async function fileHash(filename, expectedSize) {
  const digest = createHash('sha256'); let size = 0;
  for await (const bytes of createReadStream(filename, { highWaterMark: 1024 * 1024 })) {
    size += bytes.length;
    if (size > expectedSize) throw new Error('Runtime file grew during verification');
    digest.update(bytes);
  }
  if (size !== expectedSize) throw new Error('Runtime file changed during verification');
  return digest.digest('hex');
}

/**
 * Checks that `root` holds exactly the listed files and returns `{ fingerprint, hashed }`.
 * `trusted` is the fingerprint recorded after an earlier full verification: when the current fingerprint (path, size,
 * modification and change times, inode, device and expected digest of every file) is identical, content hashing is skipped.
 */
async function verifyInventory(root, entries, { manifest = false, trusted = null } = {}) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_FILES) throw new Error('Runtime inventory limit');
  const expected = new Map(), normalized = new Set();
  let total = 0;
  for (const entry of entries) {
    resourcePath(root, entry.path);
    const key = process.platform === 'win32' ? entry.path.toLowerCase() : entry.path;
    if (normalized.has(key)) throw new Error('Duplicate runtime resource');
    normalized.add(key);
    if (typeof entry.link === 'string') {
      if (Object.keys(entry).sort().join() !== 'link,path') throw new Error('Invalid link descriptor');
    } else {
      if (Object.keys(entry).sort().join() !== 'path,sha256,size' || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('Invalid file descriptor');
      total += entry.size;
      if (total > MAX_BYTES) throw new Error('Runtime size limit');
    }
    expected.set(entry.path, entry);
  }
  const pending = [''], files = [];
  let visited = 0;
  while (pending.length) {
    const directory = pending.pop();
    for (const item of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      if (++visited > MAX_FILES) throw new Error('Runtime traversal limit');
      const relative = directory ? `${directory}/${item.name}` : item.name;
      if (manifest && relative === 'manifest.json') continue;
      if (item.isDirectory()) pending.push(relative);
      else {
        if (!expected.has(relative)) throw new Error('Unlisted runtime resource');
        files.push(relative);
      }
    }
  }
  if (files.length !== entries.length) throw new Error('Missing runtime resource');
  // Pass 1 (cheap): structure, links, sizes and a fingerprint of every file's identity on disk.
  const realRoot = await fs.realpath(root), lines = [];
  for (let index = 0; index < files.length; index += 64) {
    await Promise.all(files.slice(index, index + 64).map(async (relative) => {
      const entry = expected.get(relative), filename = resourcePath(root, relative), info = await fs.lstat(filename, { bigint: true });
      if (typeof entry.link === 'string') {
        if (!info.isSymbolicLink() || await fs.readlink(filename) !== entry.link) throw new Error('Runtime link mismatch');
        const resolved = path.relative(realRoot, await fs.realpath(filename));
        if (!resolved || resolved === '..' || resolved.startsWith(`..${path.sep}`) || path.isAbsolute(resolved)) throw new Error('Runtime link escapes root');
      } else if (!info.isFile() || info.size !== BigInt(entry.size)) throw new Error('Runtime checksum mismatch');
      lines.push([relative, info.size, info.mtimeNs, info.ctimeNs, info.ino, info.dev, entry.sha256 || entry.link].join('\0'));
    }));
  }
  const fingerprint = hash(lines.sort().join('\n'));
  // Pass 2 (expensive): content hashes, skipped only when the fingerprint equals the one recorded after a full pass.
  const hashed = fingerprint !== trusted;
  if (hashed) {
    const regular = files.filter((relative) => typeof expected.get(relative).link !== 'string');
    for (let index = 0; index < regular.length; index += 2) {
      await Promise.all(regular.slice(index, index + 2).map(async (relative) => {
        const entry = expected.get(relative);
        if (await fileHash(resourcePath(root, relative), entry.size) !== entry.sha256) throw new Error('Runtime checksum mismatch');
      }));
    }
  }
  return { fingerprint, hashed };
}

/** Fingerprints recorded after the last full verification of this exact manifest; any defect means "no record". */
async function readVerifiedRecord(cacheFile, runtimeId) {
  try {
    const { value } = await readManifest(cacheFile, 4096);
    const valid = (item) => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item);
    if (value.schema === 1 && value.runtime_id === runtimeId && valid(value.runtime) && valid(value.sources)) return value;
  } catch { /* Missing, oversized or corrupt: verify everything. */ }
  return {};
}

/** Best effort and atomic: a failed write only costs a full verification next time. */
async function writeVerifiedRecord(cacheFile, runtimeId, runtime, sources) {
  const temporary = `${cacheFile}.${process.pid}.tmp`;
  try {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify({ schema: 1, runtime_id: runtimeId, runtime, sources }));
    await fs.rename(temporary, cacheFile);
  } catch { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

async function loadRuntime({ runtimeDirectory, sourceDirectory, lockPath, version, cacheFile = null, platform = process.platform, arch = process.arch }) {
  if (!path.isAbsolute(runtimeDirectory || '') || !path.isAbsolute(sourceDirectory || '') || !path.isAbsolute(lockPath || '')) throw new Error('Missing runtime location');
  const target = `${platform}-${arch}`;
  const lock = await readManifest(lockPath, 1024 * 1024), specification = lock.value.targets?.[target];
  if (lock.value.schema !== 1 || !specification) throw new Error('Unsupported runtime target');
  const directory = resourcePath(runtimeDirectory, target);
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error('Invalid runtime root');
  const manifest = await readManifest(path.join(directory, 'manifest.json'), 8 * 1024 * 1024), value = manifest.value;
  if (value.schema !== 1 || value.target !== target || value.lock_sha256 !== hash(lock.bytes) || value.application_version !== version
      || value.python_version !== lock.value.python_version || !same(value.packages, lock.value.packages) || value.executable !== specification.executable) throw new Error('Runtime identity mismatch');
  const runtimeId = hash(manifest.bytes), record = cacheFile ? await readVerifiedRecord(cacheFile, runtimeId) : {};
  const files = await verifyInventory(directory, value.files, { manifest: true, trusted: record.runtime });
  const sources = await verifyInventory(sourceDirectory, value.sources, { trusted: record.sources });
  const executable = resourcePath(directory, value.executable), script = resourcePath(sourceDirectory, 'sedcoretool/engine/server.py');
  await fs.access(executable); await fs.access(script);
  const full = files.hashed || sources.hashed;
  if (cacheFile && full) await writeVerifiedRecord(cacheFile, runtimeId, files.fingerprint, sources.fingerprint);
  return { executable, script, runtimeId, runtime: 'bundled-verified', verification: full ? 'full' : 'recorded' };
}

module.exports = { loadRuntime, verifyInventory, resourcePath };
