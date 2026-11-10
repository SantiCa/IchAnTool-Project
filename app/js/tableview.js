// @ts-check
/** Visible-row geometry and DOM lifecycle for the experimental Data table. */

/**
 * @param {{rowCount: number, scrollTop: number, height: number, rowHeight: number, headerHeight?: number, overscan?: number}} options
 */
export function visibleTableRows({ rowCount, scrollTop, height, rowHeight, headerHeight = 0, overscan = 12 }) {
  if (!Number.isInteger(rowCount) || rowCount < 0 || !Number.isFinite(rowHeight) || rowHeight <= 0
    || !Number.isFinite(scrollTop) || !Number.isFinite(height) || !Number.isFinite(headerHeight)
    || !Number.isInteger(overscan) || overscan < 0) throw new RangeError('Invalid table viewport geometry');
  const first = Math.min(Math.max(0, rowCount - 1), Math.floor(Math.max(0, scrollTop - headerHeight) / rowHeight));
  const count = Math.ceil(Math.max(0, height) / rowHeight);
  return { start: Math.max(0, first - overscan), end: Math.min(rowCount, first + count + overscan + 1) };
}

/**
 * @param {{grid: HTMLElement, body: HTMLTableSectionElement, rowCount: number, columnCount: number,
 *   renderRows: (start: number, end: number) => string, scrollTop?: number}} options
 */
export function mountTableViewport({ grid, body, rowCount, columnCount, renderRows, scrollTop = 0 }) {
  const rowHeight = 28;
  let frame = 0, disposed = false, start = -1, end = -1;
  /** @type {Map<number, HTMLTableRowElement>} */
  const mounted = new Map();
  const top = createSpacer(), bottom = createSpacer();
  body.replaceChildren(top, bottom);

  function createSpacer() {
    const row = document.createElement('tr'), cell = document.createElement('td');
    row.dataset.spacer = ''; row.setAttribute('aria-hidden', 'true');
    cell.colSpan = columnCount; row.append(cell);
    return row;
  }

  /** @param {Node | null} node */
  function rowAt(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    const row = element?.closest('tr[data-row]');
    return row && body.contains(row) ? Number(/** @type {HTMLElement} */ (row).dataset.row) : null;
  }

  function selectedRows() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const anchor = rowAt(selection.anchorNode), focus = rowAt(selection.focusNode);
    if (anchor != null && focus != null) return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) + 1 };
    if (selection.getRangeAt(0).intersectsNode(body)) return { start: 0, end: rowCount };
    return null;
  }

  /** @param {number} from @param {number} to @param {Node} before */
  function insertRows(from, to, before) {
    if (to <= from) return;
    const staging = document.createElement('tbody');
    staging.innerHTML = renderRows(from, to);
    const fragment = document.createDocumentFragment();
    for (const row of [...staging.rows]) { mounted.set(Number(row.dataset.row), row); fragment.append(row); }
    body.insertBefore(fragment, before);
  }

  /** @param {HTMLTableRowElement} spacer @param {number} height */
  function sizeSpacer(spacer, height) {
    spacer.hidden = height === 0;
    spacer.cells[0].style.height = `${height}px`;
  }

  function update() {
    cancelAnimationFrame(frame); frame = 0;
    if (disposed || !body.isConnected) return;
    const range = visibleTableRows({ rowCount, scrollTop: grid.scrollTop, height: grid.clientHeight,
      headerHeight: grid.querySelector('thead')?.getBoundingClientRect().height || 0, rowHeight });
    const selected = selectedRows();
    if (selected) { range.start = Math.min(range.start, selected.start); range.end = Math.max(range.end, selected.end); }
    const active = document.activeElement;
    const activeRow = rowAt(active);
    if (activeRow != null && (activeRow < range.start || activeRow >= range.end) && active instanceof HTMLElement) {
      active.blur();
      if (disposed) return;
    }
    if (range.start === start && range.end === end) return;
    let first = Infinity, last = -1;
    for (const [index, row] of mounted) {
      if (index < range.start || index >= range.end) { row.remove(); mounted.delete(index); }
      else { first = Math.min(first, index); last = Math.max(last, index); }
    }
    if (last < 0) insertRows(range.start, range.end, bottom);
    else {
      insertRows(range.start, first, /** @type {HTMLTableRowElement} */ (mounted.get(first)));
      insertRows(last + 1, range.end, bottom);
    }
    start = range.start; end = range.end;
    sizeSpacer(top, start * rowHeight); sizeSpacer(bottom, (rowCount - end) * rowHeight);
    grid.dataset.start = String(start); grid.dataset.end = String(end); grid.dataset.available = String(rowCount);
  }

  function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(update); }
  grid.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('selectionchange', schedule);
  const resize = new ResizeObserver(schedule); resize.observe(grid);
  // Establish the full scroll extent before restoring a previously scrolled window.
  sizeSpacer(bottom, rowCount * rowHeight);
  grid.scrollTop = scrollTop;
  update();

  /** @param {number} index @param {number} column */
  function focusCell(index, column) {
    if (index < 0 || index >= rowCount) return false;
    const selection = window.getSelection(); selection?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement && body.contains(document.activeElement)) document.activeElement.blur();
    if (disposed) return false;
    const headerHeight = grid.querySelector('thead')?.getBoundingClientRect().height || 0;
    const rowTop = headerHeight + index * rowHeight;
    if (rowTop < grid.scrollTop + headerHeight) grid.scrollTop = index * rowHeight;
    else if (rowTop + rowHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = rowTop + rowHeight - grid.clientHeight;
    update();
    const cell = mounted.get(index)?.cells[column];
    if (!cell?.isContentEditable) return false;
    cell.focus({ preventScroll: true });
    const bounds = grid.getBoundingClientRect(), rect = cell.getBoundingClientRect();
    const left = bounds.left + (grid.querySelector('td.rn')?.getBoundingClientRect().width || 0);
    if (rect.left < left) grid.scrollLeft -= left - rect.left;
    else if (rect.right > bounds.right) grid.scrollLeft += rect.right - bounds.right;
    return true;
  }

  return {
    focusCell,
    pageRows: () => Math.max(1, Math.floor(grid.clientHeight / rowHeight) - 1),
    destroy() {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect();
      grid.removeEventListener('scroll', schedule); document.removeEventListener('selectionchange', schedule);
      mounted.clear();
    },
  };
}
