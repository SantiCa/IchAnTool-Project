import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Each path starts with a fresh library; the normal UI must be able to leave the uninitialised workspace. */
export async function verifyFirstRun(browser, url) {
  const fixture = resolve('dist', `first-import-${randomUUID()}.sedcoretool`), errors = [];
  await mkdir(resolve('dist'), { recursive: true });
  await writeFile(fixture, JSON.stringify({ app: 'SedCoreTool', kind: 'project', version: 5, id: 'first-import', name: 'First imported project',
    cores: [{ id: 'first-core', name: 'First core', units: 'cm', sections: [] }] }));
  try {
    for (const action of ['create', 'import']) {
      const context = await browser.createBrowserContext(), page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(url, { waitUntil: 'networkidle0' }); await page.waitForSelector('#projList .pempty');
        assert.deepEqual(await page.evaluate(() => ({ id: window.ichantool.S.id, cores: window.ichantool.S.cores.length })), { id: '', cores: 0 });
        if (action === 'create') {
          await page.click('#newProjOpen'); await page.type('#newProjName', 'First created project'); await page.click('#newProjBtn');
        } else await (await page.$('#impProj')).uploadFile(fixture);
        await page.waitForFunction((name) => window.ichantool.S.name === name && window.ichantool.S.id
          && document.getElementById('saveState').dataset.state === 'saved' && document.getElementById('home').hidden,
        {}, action === 'create' ? 'First created project' : 'First imported project');
        const expected = await page.evaluate(() => ({ id: window.ichantool.S.id, name: window.ichantool.S.name }));
        assert.equal(await page.evaluate(() => window.ichantool.S.cores.length), 1);
        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction((expected) => window.ichantool?.S.id === expected.id && window.ichantool.S.name === expected.name
          && document.getElementById('saveState').dataset.state === 'saved', {}, expected);
      } finally { await context.close(); }
    }
    assert.deepEqual(errors, []);
    console.log('First run: real project creation/import from empty libraries and saved reload verified.');
  } finally { await unlink(fixture); }
}
