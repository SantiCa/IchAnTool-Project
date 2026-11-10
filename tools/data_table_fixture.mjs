/** Deterministic imported records, without image decoding or classifier work. */
export async function prepareDataTableFixture(rowCount) {
  const { loadProject, setMode } = window.ichantool;
  setMode('section');
  const seed = 210108, columns = 6, perCore = rowCount / 2, bandRows = 100;
  const layers = [0, 1].map((layer) => ({ id: `layer-${layer}`, name: `Layer ${layer}`,
    cats: [0, 1].map((category) => ({ id: `cat-${layer}-${category}`, name: `L${layer}C${category}`, color: '#567890' })) }));
  const intervals = [];
  const cores = [0, 1].map((core) => {
    const id = `table-core-${core}`, depth = Array.from({ length: perCore }, (_, row) => row);
    const proxies = Object.fromEntries(Array.from({ length: columns }, (_, column) => [
      `value_${column}`, depth.map((row) => row % 37 === 0 ? null : ((row + 1) * (column + 3) + core + seed) % 1009 - 504),
    ]));
    for (const layer of [0, 1]) for (let from = 0; from < perCore; from += bandRows) intervals.push({
      id: `interval-${core}-${layer}-${from}`, core: id, layer: `layer-${layer}`, axis: 'depth',
      from, to: Math.min(from + bandRows, perCore), cat: `cat-${layer}-${Math.floor(from / bandRows) % 2}`, auto: false,
    });
    return { id, name: `Core ${core}`, units: 'cm', sections: [],
      imp: { depth, age: depth.map((row) => row * 2), proxies } };
  });
  await loadProject({ app: 'SedCoreTool', kind: 'project', version: 5, id: 'benchmark-data-table',
    name: 'Synthetic data table', cores, curCore: cores[0].id, settings: { tips: false },
    geo: { layers, intervals, classifiers: [] } });
  document.getElementById('home').hidden = true;
  document.getElementById('dCore').innerHTML = '<option value="__all">All cores</option>';
  document.getElementById('dCore').value = '__all';
  document.getElementById('dView').value = 'table';
  document.getElementById('dLayers').checked = true;
  return { seed, row_count: rowCount, core_count: cores.length, numeric_columns: columns,
    layer_count: layers.length, interval_count: intervals.length, rows_per_interval: bandRows,
    initial_display_rows: 400, more_display_rows: Math.min(1400, rowCount) };
}

/** Capture the real CSV export without downloading a file, then check every cell. Runs in the page. */
export async function captureDataTableCSV({ rowCount, edited = null, verify = true }) {
  const { parseTable } = await import('./js/log.js');
  const createURL = URL.createObjectURL;
  let csv = null;
  const preventDownload = (event) => { if (event.target.closest?.('a[download]')) event.preventDefault(); };
  document.addEventListener('click', preventDownload, true);
  URL.createObjectURL = (blob) => { if (blob.type === 'text/csv') csv = blob; return createURL(blob); };
  try {
    const start = performance.now(); document.getElementById('dCsv').click();
    if (!csv) throw new Error('Data export did not produce a CSV');
    const export_ms = performance.now() - start;
    if (!verify) return { export_ms, csv_bytes: csv.size };
    const text = await csv.text();
    const data = text.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).join('\n');
    const table = parseTable(text), perCore = rowCount / 2;
    const headers = ['core', 'depth', 'age', ...Array.from({ length: 6 }, (_, column) => `value_${column}`), 'Layer 0', 'Layer 1'];
    if (table.rows.length !== rowCount || JSON.stringify(table.headers) !== JSON.stringify(headers)) throw new Error('Incomplete CSV');
    for (let index = 0; index < rowCount; index++) {
      const core = index < perCore ? 0 : 1, row = index % perCore;
      const values = Array.from({ length: 6 }, (_, column) => edited?.row === index && edited.column === column ? edited.value
        : row % 37 === 0 ? '' : ((row + 1) * (column + 3) + core + 210108) % 1009 - 504);
      const expected = [`Core ${core}`, row, row * 2, ...values,
        ...[0, 1].map((layer) => `L${layer}C${Math.floor(row / 100) % 2}`)].map(String);
      if (JSON.stringify(table.text[index]) !== JSON.stringify(expected)) throw new Error('CSV row differs: ' + index);
    }
    return { export_ms, data, csv_rows_verified: rowCount, csv_bytes: csv.size };
  } finally { URL.createObjectURL = createURL; document.removeEventListener('click', preventDownload, true); }
}
