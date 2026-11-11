// Desktop-only temporary diagnostics; field values and project contents are never inspected.
import { t, lang } from './i18n.js';

/** @type {DesktopDiagnosticsBridge | undefined} */
let diagnosticBridge;
/** @type {DesktopDiagnosticsStatus | null} */
let diagnosticStatus = null;
let diagnosticSnapshot = () => ({}), diagnosticHeartbeat = 0, diagnosticSequence = 0, diagnosticChanging = false;

function rendererDiagnosticError(error) {
  try {
    const frames = [];
    if (typeof error?.stack === 'string') for (const hit of error.stack.slice(0, 8192).matchAll(/[\\/]([a-zA-Z0-9-]+\.js):(\d+):(\d+)/g)) {
      frames.push({ file: hit[1], line: Number(hit[2]), column: Number(hit[3]) });
      if (frames.length === 8) break;
    }
    return { errorName: typeof error?.name === 'string' ? error.name.slice(0, 64) : 'Error', frames };
  } catch { return { errorName: 'Error', frames: [] }; }
}

export function diagnosticEvent(type, fields = {}) {
  if (!diagnosticStatus?.enabled || !diagnosticBridge) return;
  try { diagnosticBridge.record({ ...diagnosticSnapshot(), ...fields, type }); } catch { /* Diagnostics cannot stop application work. */ }
}

/** Returns a completion callback without changing the operation's result or error handling. */
export function diagnosticOperation(operation) {
  if (!diagnosticStatus?.enabled) return (_error = undefined) => {};
  const opId = ++diagnosticSequence, started = performance.now();
  diagnosticEvent('operation.start', { operation, opId });
  let finished = false;
  return (error = undefined) => {
    if (finished) return; finished = true;
    diagnosticEvent(error ? 'operation.error' : 'operation.end', {
      operation, opId, durationMs: Math.round(performance.now() - started), ...(error ? rendererDiagnosticError(error) : {}),
    });
  };
}

export function renderDiagnosticStatus() {
  const box = document.getElementById('diagBox');
  if (!box || !diagnosticStatus) return;
  box.hidden = false;
  const toggle = /** @type {HTMLInputElement} */ (document.getElementById('diagEnabled'));
  toggle.checked = diagnosticStatus.enabled; toggle.disabled = diagnosticChanging;
  document.getElementById('diagIndicator').hidden = !diagnosticStatus.enabled;
  const until = diagnosticStatus.expiresAt ? new Date(diagnosticStatus.expiresAt).toLocaleString(lang(), { dateStyle: 'short', timeStyle: 'short' }) : '';
  document.getElementById('diagStatus').textContent = t(diagnosticStatus.failed ? 'diag.failed' : diagnosticStatus.enabled ? 'diag.active' : 'diag.off', { until, kb: Math.ceil(diagnosticStatus.bytes / 1024) });
  document.getElementById('diagExport').toggleAttribute('disabled', diagnosticChanging || !diagnosticStatus.bytes);
  document.getElementById('diagClear').toggleAttribute('disabled', diagnosticChanging || (!diagnosticStatus.bytes && !diagnosticStatus.expiresAt && !diagnosticStatus.failed));
}

function applyDiagnosticStatus(status) {
  diagnosticStatus = status;
  clearInterval(diagnosticHeartbeat);
  if (status.enabled) {
    diagnosticEvent('renderer.heartbeat', { visible: document.visibilityState === 'visible' });
    let last = performance.now();
    diagnosticHeartbeat = window.setInterval(() => {
      const now = performance.now();
      diagnosticEvent('renderer.heartbeat', { lagMs: Math.max(0, Math.round(now - last - 5000)), visible: document.visibilityState === 'visible' });
      last = now;
    }, 5000);
  }
  renderDiagnosticStatus();
}

export function initializeDiagnostics({ snapshot, openHome }) {
  diagnosticBridge = window['corantoolDesktop']?.diagnostics;
  if (!diagnosticBridge) return;
  diagnosticSnapshot = snapshot;
  // Snapshot only the initial control IDs, before saved projects create dynamic elements.
  const controlIds = new Set([...document.querySelectorAll('[id]')].map((element) => element.id));
  const capture = (event) => {
    if (!diagnosticStatus?.enabled || !(event.target instanceof Element)) return;
    const target = event.target;
    if (event.type === 'keydown') {
      if (target.closest('input,textarea,select,[contenteditable]')) return;
      const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
      const shortcut = command && key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : command && key === 'y' ? 'redo' : key === 'delete' ? 'delete' : key === 'escape' ? 'escape' : null;
      if (shortcut) diagnosticEvent('ui.shortcut', { shortcut });
      return;
    }
    let element = target.closest('[id]');
    while (element && !controlIds.has(element.id)) element = element.parentElement?.closest('[id]');
    if (!element) return;
    diagnosticEvent(event.type === 'pointerdown' ? 'ui.pointer' : event.type === 'change' ? 'ui.change' : 'ui.click', { controlId: element.id });
  };
  for (const type of ['click', 'change', 'pointerdown', 'keydown']) document.addEventListener(type, capture, true);
  window.addEventListener('error', (event) => diagnosticEvent('renderer.error', rendererDiagnosticError(event.error)));
  window.addEventListener('unhandledrejection', (event) => diagnosticEvent('renderer.rejection', rendererDiagnosticError(event.reason)));
  diagnosticBridge.onStatus(applyDiagnosticStatus);
  const change = async (work) => {
    if (diagnosticChanging) return;
    diagnosticChanging = true; renderDiagnosticStatus();
    try { await work(); }
    catch { if (diagnosticStatus) diagnosticStatus = { ...diagnosticStatus, failed: true }; }
    finally { diagnosticChanging = false; renderDiagnosticStatus(); }
  };
  document.getElementById('diagEnabled').addEventListener('change', (event) => {
    const enabled = /** @type {HTMLInputElement} */ (event.target).checked;
    void change(async () => applyDiagnosticStatus(await diagnosticBridge.setEnabled(enabled)));
  });
  document.getElementById('diagExport').addEventListener('click', () => change(async () => {
    await diagnosticBridge.export(); applyDiagnosticStatus(await diagnosticBridge.status());
  }));
  document.getElementById('diagClear').addEventListener('click', () => change(async () => applyDiagnosticStatus(await diagnosticBridge.clear())));
  document.getElementById('diagIndicator').addEventListener('click', async () => {
    await openHome(); /** @type {HTMLDetailsElement} */ (document.getElementById('diagBox')).open = true;
    document.getElementById('diagBox').scrollIntoView({ block: 'center' });
  });
  diagnosticBridge.status().then(applyDiagnosticStatus).catch(() => {});
}
