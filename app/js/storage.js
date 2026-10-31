// CorAnTool web — project library in the browser (IndexedDB). Each project is a "folder" holding its
// images, depths, age model, labels and external records. Data stay on this computer and browser.

const DB_NAME = 'ichantool', DB_VERSION = 3;
let dbPromise = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('lite')) db.createObjectStore('lite', { keyPath: 'id' }); // numeric data only, for the all-projects view
    };
    req.onsuccess = () => { const d = req.result; d.onversionchange = () => { d.close(); dbPromise = null; }; resolve(d); };
    req.onblocked = () => console.warn('IndexedDB upgrade blocked by another tab');
    req.onerror = () => reject(req.error);
  });
}
const db = () => (dbPromise ||= openDB());

function run(stores, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function storageAvailable() {
  try { await db(); return true; } catch { return false; }
}
export const listProjects = () => run(['meta'], 'readonly', (tx) => tx.objectStore('meta').getAll());
export const getProject = (id) => run(['data'], 'readonly', (tx) => tx.objectStore('data').get(id)).then((r) => r?.data || null);
export const putProject = (meta, data) => run(['meta', 'data'], 'readwrite', (tx) => {
  tx.objectStore('meta').put(meta);
  tx.objectStore('data').put({ id: meta.id, data });
});
export const putMeta = (meta) => run(['meta'], 'readwrite', (tx) => tx.objectStore('meta').put(meta));
export const deleteProject = (id) => run(['meta', 'data', 'lite'], 'readwrite', (tx) => {
  tx.objectStore('meta').delete(id);
  tx.objectStore('data').delete(id);
  tx.objectStore('lite').delete(id);
});
export const putLite = (id, lite) => run(['lite'], 'readwrite', (tx) => tx.objectStore('lite').put({ ...lite, id }));
export const listLite = () => run(['lite'], 'readonly', (tx) => tx.objectStore('lite').getAll());
export const getMeta = (id) => run(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(id));

/** Preferences shared by all projects (user presets, backup folder handle, last backup time). */
export const getPref = (key) => run(['prefs'], 'readonly', (tx) => tx.objectStore('prefs').get(key)).then((r) => r?.value);
export const setPref = (key, value) => run(['prefs'], 'readwrite', (tx) => tx.objectStore('prefs').put({ key, value }));
