// Measure the real Data table handlers in a disposable browser profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { prepareDataTableFixture, captureDataTableCSV } from './data_table_fixture.mjs';
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE || 'puppeteer-core');

const [url, profilePath, chrome, rowArgument, runMode] = process.argv.slice(2);
const rowCount = Number(rowArgument), profiling = runMode === 'profile';
const browser = await puppeteer.launch({ executablePath: chrome, userDataDir: profilePath,
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const errors = [];
try {
  const [page] = await browser.pages();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#projList .pempty');
  const fixture = await page.evaluate(prepareDataTableFixture, rowCount);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const client = await page.createCDPSession();
  await client.send('HeapProfiler.collectGarbage');
  if (profiling) { await client.send('Profiler.enable'); await client.send('Profiler.start'); }
  const timings = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const measure = async (action) => { const start = performance.now(); action(); void document.getElementById('dBody').offsetHeight; await frame(); return performance.now() - start; };
    const open_ms = await measure(() => document.getElementById('modeData').click());
    const initial = document.querySelectorAll('#dBody tbody tr').length;
    const edit_ms = await measure(() => document.getElementById('dsEdit').click());
    const cell = document.querySelector('#dBody tbody tr:nth-child(2) td[data-col="value_0"]');
    const select_ms = await measure(() => {
      cell.focus(); const range = document.createRange(); range.selectNodeContents(cell);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    const selected = window.getSelection().toString() === cell.textContent && document.activeElement === cell;
    const more_ms = await measure(() => document.getElementById('dMore').click());
    const expanded = document.querySelectorAll('#dBody tbody tr').length;
    const grid = document.querySelector('#dBody .dsgrid');
    const scroll_ms = await measure(() => { grid.scrollTop = grid.scrollHeight; });
    return { open_ms, edit_ms, select_ms, more_ms, scroll_ms, initial, expanded, selected,
      scroll_verified: grid.scrollTop > 0 && grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 2 };
  });
  let cpu;
  if (profiling) {
    const { profile } = await client.send('Profiler.stop');
    const durations = new Map();
    (profile.samples || []).forEach((id, index) => durations.set(id, (durations.get(id) || 0) + profile.timeDeltas[index]));
    const sites = new Map();
    for (const node of profile.nodes) {
      const url = node.callFrame.url;
      const source = url.startsWith('pptr:') ? '(benchmark)' : url.split('/').slice(-2).join('/') || '(runtime)';
      const key = `${source}:${node.callFrame.lineNumber}:${node.callFrame.functionName}`;
      const site = sites.get(key) || { function: node.callFrame.functionName || '(anonymous)', source,
        line: node.callFrame.lineNumber + 1, sampled_self_ms: 0 };
      site.sampled_self_ms += (durations.get(node.id) || 0) / 1000;
      sites.set(key, site);
    }
    cpu = [...sites.values()].filter((site) => site.sampled_self_ms > 0)
      .sort((a, b) => b.sampled_self_ms - a.sampled_self_ms).slice(0, 25);
    await client.send('Profiler.disable');
  }
  const exported = await page.evaluate(captureDataTableCSV, { rowCount });
  assert.equal(timings.initial, 400); assert.equal(timings.expanded, fixture.more_display_rows);
  assert.equal(timings.selected, true); assert.equal(timings.scroll_verified, true);
  assert.deepEqual(errors, []);
  const { data, ...verification } = exported;
  console.log(JSON.stringify({ fixture, ...timings, ...verification,
    csv_sha256: createHash('sha256').update(data).digest('hex'), cpu,
    chrome: await browser.version(), node: process.version,
    puppeteer: createRequire(process.env.PUPPETEER_MODULE || import.meta.url)('puppeteer-core/package.json').version }));
  await client.detach();
} finally { await browser.close(); }
