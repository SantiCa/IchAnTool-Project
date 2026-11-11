import assert from 'node:assert/strict';

/** Check bundled control wiring without module imports or native directory-picker interaction. */
export async function verifyBackupControls(browser, url) {
  const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool && !document.getElementById('home').hidden);
    assert.equal(await page.$eval('#diagBox', (element) => element.hidden), true, 'desktop diagnostics stay hidden without a desktop bridge');
    await page.click('#newProjOpen'); await page.type('#newProjName', 'Backup controls'); await page.click('#newProjBtn');
    await page.waitForFunction(() => window.ichantool.S.id && document.getElementById('saveState').dataset.state === 'saved');
    const checks = await page.evaluate(async () => {
      const files = new Map(), checks = {};
      let fail = false, permission = 'granted';
      const directory = (path = '') => ({
        name: 'Synthetic backup', kind: 'directory',
        requestPermission: async () => permission,
        getDirectoryHandle: async (name) => directory(path + name + '/'),
        async *entries() {},
        getFileHandle: async (name) => ({
          async createWritable() {
            if (fail && name === 'project.json') throw new Error('Controlled backup failure');
            let contents;
            return { async write(text) { contents = text; }, async close() { files.set(path + name, contents); }, async abort() {} };
          },
        }),
      });
      window.showDirectoryPicker = async () => directory();
      const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
      const choose = async () => {
        document.getElementById('bkChoose').click();
        for (let i = 0; i < 200; i++) {
          await pause();
          if (!document.getElementById('bkChoose').disabled
            && document.getElementById('bkStatus').dataset.state === (fail ? 'error' : 'ok')) return;
        }
        throw new Error('Backup control did not settle');
      };
      const logError = console.error; console.error = () => {};
      try {
        await window.ichantool.showHome(); await choose();
        const manifest = [...files].find(([path]) => path.endsWith('/project.json'));
        checks.manifestWritten = Boolean(manifest);
        fail = true; await choose();
        checks.failureShown = document.getElementById('bkStatus').textContent.includes('Controlled backup failure');
        checks.previousManifestPreserved = files.get(manifest[0]) === manifest[1];
        fail = false; permission = 'denied';
        document.getElementById('bkReactivate').click(); await pause();
        checks.permissionRecoveryOffered = document.getElementById('bkStatus').dataset.state === 'needs'
          && !document.getElementById('bkChoose').disabled && !document.getElementById('bkReactivate').disabled;
        permission = 'granted'; await choose();
        checks.reselectionRecovers = document.getElementById('bkStatus').dataset.state === 'ok';
      } finally { console.error = logError; }
      return checks;
    });
    for (const [name, passed] of Object.entries(checks)) assert.equal(passed, true, name);
    assert.deepEqual(errors, []);
    console.log(`Backup controls: failure visibility, manifest preservation, permission recovery and reselection verified (${url}).`);
  } finally { await context.close(); }
}
