// Immutable desktop model generations, selected by one atomically replaced reference.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const safe = (value) => {
  const name = String(value || 'model').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'model';
  return name === '.' || name === '..' ? 'model' : name;
};
const isRunId = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

function readRecord(file) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Cannot read model metadata ${file}: ${error.message}`, { cause: error }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid model metadata: ${file}`);
  return value;
}

function writeJSONAtomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600, flush: true });
    fs.renameSync(temporary, file);
  } finally {
    // Preserve the original error if a failed write also prevents temporary-file cleanup.
    try { fs.rmSync(temporary, { force: true }); } catch { /* unreferenced temporary file */ }
  }
}

class ModelStore {
  constructor(root) {
    this.root = root;
    this.directory = path.join(root, 'models');
    fs.mkdirSync(this.directory, { recursive: true });
  }

  referenceFile(name) { return path.join(this.directory, `${safe(name)}.current`); }

  /** Resolve once per read: a concurrent publication cannot mix files from two generations. */
  current(name) {
    name = safe(name);
    const reference = this.referenceFile(name);
    if (!fs.existsSync(reference)) return { base: path.join(this.directory, name),
      evaluation: path.join(this.root, 'runs', name, 'evaluation_test.json'), runId: null };
    const value = readRecord(reference);
    if (value.version !== 1 || !isRunId(value.generation) || !isRunId(value.runId)) {
      throw new Error(`Invalid published model reference: ${reference}`);
    }
    const directory = path.join(this.directory, `${name}.versions`, value.generation);
    return { base: path.join(directory, 'model'), evaluation: path.join(directory, 'evaluation_test.json'), runId: value.runId };
  }

  /** All fallible preparation precedes the reference replacement; old generations remain readable. */
  publish({ name, base, runId, evaluationFile = null }) {
    name = safe(name);
    if (!isRunId(runId)) throw new Error('Invalid training run identifier');
    readRecord(base + '.json');
    const onnx = fs.statSync(base + '.onnx');
    if (!onnx.isFile() || onnx.size === 0) throw new Error('Empty or invalid ONNX model');
    const evaluation = evaluationFile ? readRecord(evaluationFile) : null;
    const generation = randomUUID(), directory = path.join(this.directory, `${name}.versions`, generation);
    fs.mkdirSync(directory, { recursive: true });
    for (const extension of ['.onnx', '.json']) fs.copyFileSync(base + extension, path.join(directory, 'model' + extension), fs.constants.COPYFILE_EXCL);
    if (evaluationFile) fs.copyFileSync(evaluationFile, path.join(directory, 'evaluation_test.json'), fs.constants.COPYFILE_EXCL);
    writeJSONAtomic(this.referenceFile(name), { version: 1, generation, runId });
    return evaluation;
  }

  read(name) {
    const { base } = this.current(name);
    return { name: safe(name), onnx: fs.readFileSync(base + '.onnx'), json: fs.readFileSync(base + '.json', 'utf8') };
  }

  list() {
    const files = fs.readdirSync(this.directory);
    const names = new Set(files.filter((file) => file.endsWith('.current')).map((file) => file.slice(0, -8)));
    for (const file of files) if (file.endsWith('.json') && fs.existsSync(path.join(this.directory, file.slice(0, -5) + '.onnx'))) names.add(file.slice(0, -5));
    return [...names].map((name) => {
      const { base, evaluation } = this.current(name), metadata = readRecord(base + '.json');
      const test = fs.existsSync(evaluation) ? readRecord(evaluation).pooled : null;
      return { name, valDice: metadata.valDice, bestEpoch: metadata.bestEpoch, split: metadata.split,
        date: fs.statSync(base + '.json').mtime.toISOString(), test };
    }).sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}

module.exports = { ModelStore, safe, isRunId, readRecord, writeJSONAtomic };
