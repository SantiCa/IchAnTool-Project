// SedCoreTool desktop (V31; formerly CorAnTool): the web application in its own window, with more memory and its data on disk.
// - The page is served from the app:// scheme (ES modules, IndexedDB and fetch work as on a web server).
// - The renderer may use up to ~75 % of the computer's RAM for JavaScript (images live outside that limit);
//   beyond physical RAM the operating system pages memory to disk (SSD) as for any program.
// - Projects are stored in IndexedDB inside the user-data folder (on disk), not in a browser profile.
const { Trainer } = require('./trainer');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const APP_HOST = 'corantool';
const WEB = path.join(__dirname, 'web');

function isWithinRoot(webRoot, targetPath, pathMod = path) {
  if (typeof webRoot !== 'string' || typeof targetPath !== 'string' || !webRoot || !targetPath) return false;
  if (webRoot.includes('\0') || targetPath.includes('\0')) return false;
  if (pathMod.sep === '\\' && (/^[a-zA-Z]:(?![\\/])/.test(webRoot) || /^[a-zA-Z]:(?![\\/])/.test(targetPath))) return false;
  const root = pathMod.resolve(webRoot);
  const file = pathMod.resolve(targetPath);
  const rel = pathMod.relative(root, file);
  return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${pathMod.sep}`) && !pathMod.isAbsolute(rel);
}

function resolveAppPath(rawUrl, webRoot = WEB, pathMod = path) {
  if (typeof rawUrl !== 'string' || typeof webRoot !== 'string' || !webRoot) return null;
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== 'app:' || u.host !== APP_HOST || u.username || u.password) return null;
  if (!u.pathname || !u.pathname.startsWith('/') || u.pathname.startsWith('//')) return null;
  let decoded;
  try { decoded = decodeURIComponent(u.pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.endsWith('/') || decoded.startsWith('//') || decoded.startsWith('/\\')) return null;
  const rel = decoded.slice(1);
  if (!rel || rel.includes(':')) return null;
  const root = pathMod.resolve(webRoot);
  const normalizedRel = rel.replace(/[\\/]+/g, pathMod.sep);
  const file = pathMod.resolve(root, normalizedRel);
  if (!isWithinRoot(root, file, pathMod)) return null;
  if (/%(?:2f|5c)/i.test(u.pathname) || decoded.includes('\\')) return null;
  return file;
}

function handleAppRequest(req, { webRoot = WEB, pathMod = path, fetchFile } = {}) {
  const file = resolveAppPath(req && req.url, webRoot, pathMod);
  if (!file) return new Response('forbidden', { status: 403 });
  return fetchFile ? fetchFile(file) : require('electron').net.fetch(pathToFileURL(file).toString());
}

function setupSessionPermissions(ses) {
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['persistent-storage', 'clipboard-sanitized-write', 'fileSystem'].includes(perm)));
  // Electron leaves a restricted picker pending unless the application answers this event.
  ses.on('file-system-access-restricted', (_event, _details, callback) => callback('deny'));
}

if (process.versions.electron) {
  const { app, BrowserWindow, protocol, net, shell, session, ipcMain } = require('electron');

  const heapMB = Math.max(2048, Math.min(32768, Math.floor((os.totalmem() / 2 ** 20) * 0.75)));
  app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${heapMB}`);

  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
  // V0.52: renamed CorAnTool → SedCoreTool. If only the old data folder exists, keep using it so saved projects stay;
  // the page origin keeps the old host (app://corantool) for the same reason (IndexedDB belongs to the origin).
  { const fs = require('node:fs'), old = path.join(app.getPath('appData'), 'CorAnTool');
    if (fs.existsSync(old) && !fs.existsSync(app.getPath('userData'))) app.setPath('userData', old); }

  function createWindow() {
    const win = new BrowserWindow({
      width: 1500, height: 950, minWidth: 900, minHeight: 600, title: 'SedCoreTool', backgroundColor: '#ecefee',
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
    });
    win.removeMenu();
    win.loadURL('app://corantool/app/index.html');
    // external links open in the system browser; the app's own floating windows stay inside
    win.webContents.setWindowOpenHandler(({ url }) => (resolveAppPath(url) ? { action: 'allow', overrideBrowserWindowOptions: { width: 1200, height: 850, autoHideMenuBar: true } } : (String(url || '').startsWith('app:') ? { action: 'deny' } : (shell.openExternal(url), { action: 'deny' }))));
    return win;
  }

  app.whenReady().then(() => {
    protocol.handle('app', (req) => handleAppRequest(req, { fetchFile: (file) => net.fetch(pathToFileURL(file).toString()) }));
    // keep the project library: ask Chromium to treat the storage as persistent
    setupSessionPermissions(session.defaultSession);
    setupTrainer();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

  /* V0.17: U-Net training on this computer (see trainer.js). The Python source travels as an extra resource. */
  function setupTrainer() {
    const pySrc = app.isPackaged ? path.join(process.resourcesPath, 'python') : path.join(__dirname, 'python');
    const send = (type, data) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('trainer:event', type, data); };
    const tr = new Trainer({ root: path.join(app.getPath('userData'), 'trainer'), pySrc, send });
    const fromApp = (e) => Boolean(e && e.senderFrame && resolveAppPath(e.senderFrame.url));   // only the program's own pages
    const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromApp(e)) throw new Error('forbidden'); return fn(...a); });
    handle('trainer:status', () => tr.status());
    handle('trainer:install', () => tr.install());
    handle('trainer:train', (opt) => tr.train(opt));
    handle('trainer:cancel', () => tr.cancel());
    handle('trainer:readModel', (name) => tr.readModel(name));
    handle('trainer:unfinished', (name) => tr.unfinished(name));
    handle('trainer:openFolder', () => shell.openPath(tr.root));
  }
}

module.exports = { APP_HOST, WEB, isWithinRoot, resolveAppPath, handleAppRequest, setupSessionPermissions };
