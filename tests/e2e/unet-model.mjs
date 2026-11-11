import assert from 'node:assert/strict';

/** Exercise normal file-picker/detection wiring with a deterministic injected ONNX runtime. */
export async function verifyUnetModel(browser, url) {
  const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(60000);
  await page.evaluateOnNewDocument(() => {
    window.unetTestCalls = { creates: 0, runs: 0 };
    window.ort = {
      env: { wasm: {} },
      Tensor: class { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } },
      InferenceSession: { async create(bytes, options) {
        if (bytes[0] === 255) throw new Error('test invalid ONNX');
        if (options.executionProviders.join() !== 'wasm') throw new Error('unexpected provider');
        window.unetTestCalls.creates++;
        return { inputNames: ['input'], outputNames: ['output'], async run(feeds) {
          const tensor = feeds.input, tile = tensor.dims[2];
          if (tensor.type !== 'float32' || tensor.dims.join() !== `1,3,${tile},${tile}`) throw new Error('invalid input');
          window.unetTestCalls.runs++;
          return { output: { data: new Float32Array(tile * tile).fill(.25), dims: [1, 1, tile, tile] } };
        } };
      } },
    };
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool);
    await page.evaluate(() => window.ichantool.ready);
    await page.waitForSelector('#newProjOpen', { visible: true });
    await page.click('#newProjOpen'); await page.type('#newProjName', 'U-Net controller regression'); await page.click('#newProjBtn');
    await page.waitForFunction(() => window.ichantool.S.id && document.getElementById('home').hidden);
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
      canvas.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'synthetic.png', { type: 'image/png' }));
      const input = document.getElementById('addImg'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('#pcOk'); await page.click('#pcOk');
    await page.waitForFunction(() => window.ichantool.S.sections[0]?.enh && document.getElementById('busy').hidden);
    const load = async (name, bytes = [1], json = '{"tile":4,"overlap":1,"output":"probs"}') => {
      const previous = await page.$eval('#unetName', (el) => el.textContent);
      await page.evaluate(({ name, bytes, json }) => {
        const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], name));
        if (json !== null) dt.items.add(new File([json], 'config.json'));
        const input = document.getElementById('unetFile'); input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, { name, bytes, json });
      await page.waitForFunction((previous) => document.getElementById('busy').hidden
        && document.getElementById('unetName').textContent !== previous, {}, previous);
    };
    await load('deterministic.onnx');
    assert.match(await page.$eval('#unetName', (el) => el.textContent), /deterministic.onnx/);
    await page.evaluate(() => {
      const s = window.ichantool.S.sections[0];
      Object.assign(s.detect, { method: 'unet', pThr: .6, smooth: 0, minArea: 1 });
      window.ichantool.analyze(s);
      window.unetTestBefore = JSON.stringify({ labels: Array.from(s.labels), exclude: Array.from(s.exclude), bins: s.bins });
      window.ichantool.runDetection();
    });
    await page.waitForFunction(() => window.ichantool.S.sections[0]._unet && document.getElementById('busy').hidden);
    assert.deepEqual(await page.evaluate(() => {
      const s = window.ichantool.S.sections[0];
      window.ichantool.analyze(s);
      return { prob: Array.from(s._unet.prob), same: window.unetTestBefore === JSON.stringify({ labels: Array.from(s.labels), exclude: Array.from(s.exclude), bins: s.bins }) };
    }), { prob: Array(64).fill(.25), same: true });
    const runs = await page.evaluate(() => window.unetTestCalls.runs);
    await page.evaluate(() => window.ichantool.runDetection());
    await page.waitForFunction(() => document.getElementById('busy').hidden);
    assert.equal(await page.evaluate(() => window.unetTestCalls.runs), runs);
    await load('replacement.onnx');
    assert.equal(await page.evaluate(() => window.ichantool.S.sections[0]._unet), null);
    await load('invalid.onnx', [255]);
    assert.doesNotMatch(await page.$eval('#unetName', (el) => el.textContent), /replacement.onnx|invalid.onnx/);
    assert.deepEqual(errors, []);
    console.log(`U-Net controller: file loading, inference, cache/replacement and failure verified (${url}).`);
  } finally { await context.close(); }
}
