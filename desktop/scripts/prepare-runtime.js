// Development/build command only; installed applications never download a runtime.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const desktop = path.resolve(__dirname, '..'), root = path.dirname(desktop);
execFileSync(process.execPath, [path.join(__dirname, 'prepare.js'), '--with-examples'], { cwd: desktop, stdio: 'inherit' });
const selected = process.env.SEDCORETOOL_BUILD_PYTHON;
execFileSync(selected || (process.platform === 'win32' ? 'py' : 'python3'),
  [...(!selected && process.platform === 'win32' ? ['-3.12'] : []), path.join(root, 'tools/prepare_engine_runtime.py'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', windowsHide: true });
