import assert from 'node:assert/strict';
import { taxonFigureFixture } from './taxon-figures.mjs';

/** Keep previews resident while changing their inputs; reference preparation must not clear the preview cache. */
export async function verifyNavigationPreviewCache(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ichantool);
    await page.evaluate(async (fixture) => {
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 100;
      const context = canvas.getContext('2d');
      for (let y = 0; y < 100; y++) { context.fillStyle = `rgb(${y + 50},${y + 80},${200 - y})`; context.fillRect(0, y, 8, 1); }
      fixture.cores[0].sections[0].file = { name: 'synthetic.png', type: 'image/png', blob: await new Promise((resolve) => canvas.toBlob(resolve)) };
      await window.ichantool.loadProject(fixture);
      document.getElementById('home').hidden = true;
    }, taxonFigureFixture());
    await page.waitForFunction(() => window.ichantool.S.sections[0]?.enh);
    const results = await page.evaluate(async () => {
      const { navigationPreviewCanvas, sectionCanvas, buildColumnLog, clearNavigationPreviews } = await import('./js/columns.js');
      const I = window.ichantool, s = I.S.sections[0], view = I.S.logView, checks = [];
      let previous = null;
      const verify = (name, width = 24, height = 600) => {
        const preview = navigationPreviewCanvas(s, width, height);
        if (!preview || (previous && previous.width !== 0)) throw new Error(`${name}: invalidated canvas was retained`);
        if (navigationPreviewCanvas(s, width, height) !== preview) throw new Error(`${name}: unchanged preview was rebuilt`);
        s._lc = null; s._lb = null;
        const legacy = sectionCanvas(s), scale = s._lc.k, roi = s.roi;
        const expected = document.createElement('canvas'); expected.width = width; expected.height = height;
        expected.getContext('2d').drawImage(legacy, roi.x0 * scale, roi.y0 * scale, (roi.x1 - roi.x0) * scale, (roi.y1 - roi.y0) * scale, 0, 0, width, height);
        const a = preview.getContext('2d').getImageData(0, 0, width, height).data;
        const b = expected.getContext('2d').getImageData(0, 0, width, height).data;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`${name}: pixel ${i} differs`);
        previous = preview; checks.push(name);
      };
      verify('initial');
      view.imgMode = view.imgMode === 'orig' ? 'enh' : 'orig'; verify('image source');
      view.overlay = !view.overlay; verify('overlay');
      view.hideExcl = !view.hideExcl; verify('excluded zones');
      I.S.ovAlpha = 0.71; verify('opacity');
      I.S.classes[0].color = '#b32d8a'; verify('class colour');
      I.S.settings.predThr = 0.61; verify('prediction threshold');
      I.S.settings.includePred = !I.S.settings.includePred; verify('prediction inclusion');
      I.S.settings.countCandidates = !I.S.settings.countCandidates; verify('candidate inclusion');
      s.roi = { x0: 1, x1: 7, y0: 5, y1: 95 }; verify('analysis region');
      view.overlay = true; I.S.selected = 1; I.assignClass('pl'); verify('trace assignment');
      verify('preview dimensions', 16, 500);
      if (navigationPreviewCanvas(s, 25, 500) !== null || navigationPreviewCanvas(s, 16, 4097) !== null) throw new Error('Unsupported dimensions must fall back');
      const checkbox = document.getElementById('navPreview');
      checkbox.checked = false; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      if (previous.width !== 0) throw new Error('Disabling the experiment must release previews');
      previous = null; verify('rollback');
      view.tracks.image = true;
      const before = buildColumnLog().svg;
      checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      if (buildColumnLog().svg !== before) throw new Error('Navigation flag changed column SVG');
      clearNavigationPreviews();
      if (previous.width !== 0) throw new Error('Project-reset cache clearing must release previews');
      return checks;
    });
    assert.equal(results.length, 13);
    console.log('Navigation preview cache: retained hits, input invalidation, disposal, bounds, rollback and exact column SVG verified.');
  } finally { await page.close(); }
}
