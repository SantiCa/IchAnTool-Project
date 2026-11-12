// Builds the installers for the current operating system with electron-builder.
// Version = delivery number (V31 → 31.0.0); files named SedCoreTool-V31-<os>-<arch>.<ext>.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const desktop = path.resolve(__dirname, '..'), root = path.dirname(desktop);
execFileSync(process.execPath, [path.join(__dirname, 'prepare.js')], { stdio: 'inherit', cwd: desktop });
const runtimeTargets = process.platform === 'darwin' ? ['darwin-x64', 'darwin-arm64'] : [`${process.platform}-x64`];
const python = process.env.SEDCORETOOL_BUILD_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
execFileSync(python, [...(process.platform === 'win32' && !process.env.SEDCORETOOL_BUILD_PYTHON ? ['-3.12'] : []),
  path.join(root, 'tools/prepare_engine_runtime.py'), ...runtimeTargets.flatMap((target) => ['--target', target]),
  ...(process.env.SEDCORETOOL_RUNTIME_OFFLINE === '1' ? ['--offline'] : [])], { stdio: 'inherit', cwd: root, windowsHide: true });
const V = fs.readFileSync(path.resolve(__dirname, '..', 'web', 'DELIVERY'), 'utf8').trim(), n = ((V.match(/\d+/g) || ['0']).concat('0', '0')).slice(0, 3).map(Number).join('.');   // V0.2 → 0.2.0
const builder = require('electron-builder');
const config = {
  appId: 'org.sedcoretool.app', productName: 'SedCoreTool', copyright: 'Santiago Casanova-Arenillas',
  extraMetadata: { version: n },
  artifactName: `SedCoreTool-${V}-\${os}-\${arch}.\${ext}`,
  files: ['main.js', 'preload.js', 'trainer.js', 'model-store.js', 'diagnostics.js', 'engine.js', 'engine-protocol.js', 'engine-runtime.js', 'runtime-lock.json', 'web/**', 'build/icon.png', 'package.json'],
  extraResources: [{ from: 'python', to: 'python' }, ...runtimeTargets.map((target) => ({ from: `runtime/${target}`, to: `engine-runtime/${target}` }))],
  directories: { output: 'dist', buildResources: 'build' },
  win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }], icon: 'build/icon.png' },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, artifactName: `SedCoreTool-${V}-windows-setup.\${ext}` },
  portable: { artifactName: `SedCoreTool-${V}-windows-portable.\${ext}` },
  // Both fixed interpreter trees travel unchanged in each half of the universal application.
  mac: { target: [{ target: 'dmg', arch: ['universal'] }], x64ArchFiles: 'Contents/Resources/engine-runtime/**',
    category: 'public.app-category.education', icon: 'build/icon.png', identity: null },
  linux: { target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }], category: 'Science', icon: 'build/icon.png', maintainer: 'Santiago Casanova-Arenillas' },
  publish: null,
};
builder.build({ config, dir: process.argv.includes('--dir') }).then((files) => console.log(files.join('\n'))).catch((e) => { console.error(e); process.exit(1); });
