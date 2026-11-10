import test from 'node:test';
import assert from 'node:assert/strict';
import { figureViewOf, editFigureView } from '../../app/js/figview.js';
import { segmentsOnAxis } from '../../app/js/geo.js';

const column = () => ({ axis: 'depth', tracks: { total: true, species: true }, style: { axes: { total: { max: 75 } }, colHide: [] }, colW: { total: 150 }, imgMode: 'orig', hideExcl: true });

test('reading legacy figures preserves inherited presentation without adding saved state', () => {
  const log = column(), geo = { style: { colHide: ['rec:Ca'] } };
  for (const type of ['core', 'log', 'range', 'sections', 'geolog']) {
    const figure = { type, secFrom: 1, secTo: 5, corePanels: ['mask'], coreHideExcl: false, rangeAxis: 'age', tracks: { total: false } };
    const original = JSON.stringify({ figure, log, geo }), view = figureViewOf(figure, log, geo, 'age');
    assert.equal(view.axis, ['range', 'geolog'].includes(type) ? 'age' : 'depth');
    if (type === 'core') { assert.deepEqual(view.imgPanels, ['mask']); assert.equal(view.hideExcl, false); assert.equal(view.tracks.total, false); }
    assert.equal(JSON.stringify({ figure, log, geo }), original);
  }
});

test('the first edit snapshots nested settings and isolates figure types, tabs and analysis views', () => {
  const log = column(), geo = {}, figure = { type: 'core' }, original = structuredClone(log);
  const core = editFigureView(figure, log, geo, 'depth');
  core.style.axes.total.max = 100; core.colW.total = 90; core.tracks.species = false;
  figure.type = 'log'; const ownLog = editFigureView(figure, log, geo, 'depth'); ownLog.axis = 'age';
  assert.deepEqual(log, original); assert.equal(ownLog.style.axes.total.max, 75); assert.equal(ownLog.tracks.species, true);
  const otherTab = structuredClone(figure); otherTab.views.core.colW.total = 200;
  assert.equal(figure.views.core.colW.total, 90);
  log.style.axes.total.max = 20;
  figure.type = 'core'; assert.equal(figureViewOf(figure, log, geo, 'depth').style.axes.total.max, 100);
  delete figure.views.core; assert.equal(figureViewOf(figure, log, geo, 'depth').style.axes.total.max, 20);
});

test('legacy multiproxy compositions inherit missing fields and gain independent axis/image settings when edited', () => {
  const log = column(), figure = { type: 'geolog', geoView: { colW: { total: 80 }, tracks: { species: true } } };
  assert.equal(figureViewOf(figure, log, {}, 'age').axis, 'age');
  const view = editFigureView(figure, log, {}, 'age'); view.imgMode = 'enh'; view.hideExcl = false;
  assert.equal(figureViewOf(JSON.parse(JSON.stringify(figure)), log, {}, 'depth').axis, 'age');
  assert.equal(log.imgMode, 'orig'); assert.equal(log.hideExcl, true); assert.equal(view.colW.total, 80);
  delete figure.geoView; assert.equal(figureViewOf(figure, log, {}, 'depth').axis, 'depth');
});

test('classification bands convert both endpoints through nonlinear depth-age data with exact unchanged labels', () => {
  const core = { depth: [0, 5, 10], age: [0, 10, 30] }, segments = [{ a0: 2, a1: 7, label: 'Event', color: '#123456', opacity: 0.4 }];
  const original = structuredClone(segments), converted = segmentsOnAxis(segments, 'depth', 'age', core);
  assert.deepEqual(converted, [{ ...segments[0], a0: 4, a1: 18 }]);
  assert.deepEqual(segmentsOnAxis(converted, 'age', 'depth', core), segments);
  assert.deepEqual(segments, original);
  assert.equal(segmentsOnAxis(segments, 'depth', 'depth', core), segments);
  assert.deepEqual(segmentsOnAxis([{ a0: -5, a1: 15, label: 'A' }], 'depth', 'age', core), [{ a0: 0, a1: 30, label: 'A' }]);
  assert.deepEqual(segmentsOnAxis(segments, 'depth', 'age', { depth: [0, 10] }), []);
});
