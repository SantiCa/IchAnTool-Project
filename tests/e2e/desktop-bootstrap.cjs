// Real desktop entry point with an isolated test profile and hidden windows.
const { app, session, dialog } = require('electron');
const path = require('node:path');
const profile = process.env.SEDCORETOOL_TEST_PROFILE || process.env.CORANTOOL_TEST_PROFILE;
if (!profile) throw new Error('Missing isolated test profile');
app.setPath('userData', profile);
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(profile, 'diagnostic-export.jsonl') });
app.on('browser-window-created', (_event, win) => win.hide());
app.on('window-all-closed', () => app.quit());
require(path.resolve(__dirname, '../../desktop/main.js'));
app.whenReady().then(() => {
  let answer;
  session.defaultSession.emit('file-system-access-restricted', {}, { origin: 'app://corantool', path: profile, isDirectory: true }, (value) => { answer = value; });
  if (answer !== 'deny') { console.error('Restricted filesystem request did not settle'); app.exit(1); }
});
