// Narrow bridges for local training and opt-in technical diagnostics; no arbitrary filesystem access.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('corantoolDesktop', {
  diagnostics: {
    status: () => ipcRenderer.invoke('diagnostics:status'),
    setEnabled: (enabled) => ipcRenderer.invoke('diagnostics:setEnabled', enabled),
    record: (event) => ipcRenderer.send('diagnostics:event', event),
    export: () => ipcRenderer.invoke('diagnostics:export'),
    clear: () => ipcRenderer.invoke('diagnostics:clear'),
    onStatus: (callback) => { const listener = (_event, status) => callback(status); ipcRenderer.on('diagnostics:statusChanged', listener); return () => ipcRenderer.removeListener('diagnostics:statusChanged', listener); },
  },
  trainer: {
    status: () => ipcRenderer.invoke('trainer:status'),
    install: () => ipcRenderer.invoke('trainer:install'),
    train: (opt) => ipcRenderer.invoke('trainer:train', opt),
    cancel: () => ipcRenderer.invoke('trainer:cancel'),
    readModel: (name) => ipcRenderer.invoke('trainer:readModel', name),
    unfinished: (name) => ipcRenderer.invoke('trainer:unfinished', name),
    openFolder: () => ipcRenderer.invoke('trainer:openFolder'),
    onEvent: (cb) => { const f = (_e, type, data) => cb(type, data); ipcRenderer.on('trainer:event', f); return () => ipcRenderer.removeListener('trainer:event', f); },
  },
});
