import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import desktopMain from '../../desktop/main.js';

const { APP_HOST, isWithinRoot, resolveAppPath, handleAppRequest } = desktopMain;

test('isWithinRoot enforces strict directory boundaries on POSIX and Windows paths', () => {
  assert.equal(APP_HOST, 'corantool');

  const posixRoot = '/opt/sedcoretool/web';
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/web/app/index.html', path.posix), true);
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/web/app/..hidden.js', path.posix), true);
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/web', path.posix), false);
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/web-sibling/secret.txt', path.posix), false);
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/web_backup/secret.txt', path.posix), false);
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/main.js', path.posix), false);
  assert.equal(isWithinRoot(posixRoot, '/opt/sedcoretool/web/app/index.html\0.js', path.posix), false);

  const winRoot = 'C:\\SedCoreTool\\web';
  assert.equal(isWithinRoot(winRoot, 'C:\\SedCoreTool\\web\\app\\index.html', path.win32), true);
  assert.equal(isWithinRoot('c:\\sedcoretool\\web', 'C:\\SedCoreTool\\web\\app\\index.html', path.win32), true);
  assert.equal(isWithinRoot(winRoot, 'C:\\SedCoreTool\\web\\app\\..hidden.js', path.win32), true);
  assert.equal(isWithinRoot(winRoot, 'C:\\SedCoreTool\\web', path.win32), false);
  assert.equal(isWithinRoot(winRoot, 'C:\\SedCoreTool\\web-sibling\\secret.txt', path.win32), false);
  assert.equal(isWithinRoot(winRoot, 'C:\\SedCoreTool\\web2\\secret.txt', path.win32), false);
  assert.equal(isWithinRoot(winRoot, 'C:\\SedCoreTool\\main.js', path.win32), false);
  assert.equal(isWithinRoot(winRoot, 'D:\\SedCoreTool\\web\\app\\index.html', path.win32), false);
  assert.equal(isWithinRoot(winRoot, 'C:app\\index.html', path.win32), false);
  assert.equal(isWithinRoot(winRoot, 'C:..\\web-sibling\\secret.txt', path.win32), false);
  assert.equal(isWithinRoot(winRoot, '\\\\server\\share\\web\\app\\index.html', path.win32), false);
  assert.equal(isWithinRoot(winRoot, '\\\\?\\C:\\SedCoreTool\\web\\app\\index.html', path.win32), false);
  assert.equal(isWithinRoot(winRoot, '\\\\.\\C:\\SedCoreTool\\web\\app\\index.html', path.win32), false);
  assert.equal(isWithinRoot('', 'C:\\SedCoreTool\\web\\app\\index.html', path.win32), false);
  assert.equal(isWithinRoot(winRoot, '', path.win32), false);
});

test('resolveAppPath preserves legitimate app://corantool assets and rejects traversal, encoded separators, drive/UNC and malformed URLs', () => {
  for (const [label, pathMod, root] of [
    ['posix', path.posix, '/opt/sedcoretool/web'],
    ['win32', path.win32, 'C:\\SedCoreTool\\web'],
  ]) {
    assert.equal(
      resolveAppPath('app://corantool/app/index.html', root, pathMod),
      pathMod.join(root, 'app', 'index.html'),
      `${label}: main entry point`,
    );
    assert.equal(
      resolveAppPath('app://corantool/app/index.html#win=col&project=p1&core=c1', root, pathMod),
      pathMod.join(root, 'app', 'index.html'),
      `${label}: floating window URL with hash`,
    );
    assert.equal(
      resolveAppPath('app://corantool/app/js/core.js?v=1', root, pathMod),
      pathMod.join(root, 'app', 'js', 'core.js'),
      `${label}: module with query string`,
    );
    assert.equal(
      resolveAppPath('app://corantool/examples/U1385I-1H/section%201.png', root, pathMod),
      pathMod.join(root, 'examples', 'U1385I-1H', 'section 1.png'),
      `${label}: percent-encoded space in filename`,
    );
    assert.equal(
      resolveAppPath('app://corantool/app/..hidden.js', root, pathMod),
      pathMod.join(root, 'app', '..hidden.js'),
      `${label}: filename starting with two dots inside root`,
    );

    // Unencoded dot-dot segments at the URL root are clamped to '/' by standard URL parsing
    // before decodeURIComponent, so they resolve inside webRoot rather than escaping to a sibling.
    for (const normalizedByUrlParser of [
      'app://corantool/../web-sibling/secret.txt',
      'app://corantool/%2e%2e/web-sibling/secret.txt',
      'app://corantool/app/../../web-sibling/secret.txt',
    ]) {
      assert.equal(new URL(normalizedByUrlParser).pathname, '/web-sibling/secret.txt');
      assert.equal(
        resolveAppPath(normalizedByUrlParser, root, pathMod),
        pathMod.join(root, 'web-sibling', 'secret.txt'),
        `${label}: URL-normalised request resolves inside webRoot (${normalizedByUrlParser})`,
      );
    }

    // Requests that survive URL parsing or use invalid separators, traversal, drive/UNC forms,
    // malformed percent-escapes, NUL bytes, directories or non-app origins are rejected.
    const rejectedUrls = [
      'app://corantool/..%2fweb-sibling/secret.txt',
      'app://corantool/%2e%2e%2fweb-sibling/secret.txt',
      'app://corantool/app/..%2f..%2fweb-sibling/secret.txt',
      'app://corantool/..%2fmain.js',
      'app://corantool/..%5cweb-sibling%5csecret.txt',
      'app://corantool/%2e%2e%5cweb-sibling%5csecret.txt',
      'app://corantool/..%5cmain.js',
      'app://corantool/..\\web-sibling\\secret.txt',
      'app://corantool/app%2findex.html',
      'app://corantool/app%5cindex.html',
      'app://corantool/%2fapp/index.html',
      'app://corantool/%5capp%5cindex.html',
      'app://corantool/C:/Windows/win.ini',
      'app://corantool/C:%5cWindows%5cwin.ini',
      'app://corantool/D:%5csecret.txt',
      'app://corantool/C:..%2fweb-sibling/secret.txt',
      'app://corantool/C:app/index.html',
      'app://corantool/app/index.html:$DATA',
      'app://corantool//server/share/file.txt',
      'app://corantool///etc/passwd',
      'app://corantool/%5c%5cserver%5cshare%5cfile.txt',
      'app://corantool/%5c%5c?%5cC:%5cWindows%5cwin.ini',
      'app://corantool/%5c%5c.%5cC:%5cWindows%5cwin.ini',
      'app://corantool/%E0%A4%A',
      'app://corantool/app/%ZZ.js',
      'app://corantool/app/%',
      'app://corantool/app/index.html%00.js',
      'app://corantool/',
      'app://corantool/.',
      'app://corantool/app/',
      'app://otherhost/app/index.html',
      'app://corantool:8080/app/index.html',
      'app://user:pass@corantool/app/index.html',
      'https://corantool/app/index.html',
      'file:///opt/sedcoretool/web/app/index.html',
      'not a valid url',
      '',
    ];
    for (const bad of rejectedUrls) {
      assert.equal(resolveAppPath(bad, root, pathMod), null, `${label}: must reject ${bad}`);
    }
  }
});

test('handleAppRequest serves in-root files, returns 403 for rejected paths without touching disk, and distinguishes URL-normalised paths', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'sedcoretool-protocol-'));
  const webRoot = path.join(base, 'web');
  const siblingRoot = path.join(base, 'web-sibling');
  try {
    mkdirSync(path.join(webRoot, 'app'), { recursive: true });
    mkdirSync(siblingRoot, { recursive: true });
    writeFileSync(path.join(webRoot, 'app', 'index.html'), '<!doctype html><title>SedCoreTool</title>');
    writeFileSync(path.join(siblingRoot, 'secret.txt'), 'OUTSIDE_SIBLING_SECRET');
    writeFileSync(path.join(base, 'main.js'), 'OUTSIDE_PARENT_SECRET');

    const fetched = [];
    const fetchFile = (file) => {
      fetched.push(file);
      if (!existsSync(file)) return new Response('not found', { status: 404 });
      return new Response(readFileSync(file, 'utf8'), { status: 200 });
    };

    const okRes = await handleAppRequest({ url: 'app://corantool/app/index.html' }, { webRoot, fetchFile });
    assert.equal(okRes.status, 200);
    assert.equal(await okRes.text(), '<!doctype html><title>SedCoreTool</title>');
    assert.deepEqual(fetched, [path.join(webRoot, 'app', 'index.html')]);

    fetched.length = 0;
    for (const rejectedUrl of [
      'app://corantool/..%2fweb-sibling/secret.txt',
      'app://corantool/%2e%2e%2fweb-sibling/secret.txt',
      'app://corantool/..%5cweb-sibling%5csecret.txt',
      'app://corantool/..\\web-sibling\\secret.txt',
      'app://corantool/..%2fmain.js',
      'app://corantool/C:%5cWindows%5cwin.ini',
      'app://corantool/%E0%A4%A',
    ]) {
      const res = await handleAppRequest({ url: rejectedUrl }, { webRoot, fetchFile });
      assert.equal(res.status, 403, `expected 403 for ${rejectedUrl}`);
      assert.equal(await res.text(), 'forbidden');
    }
    assert.deepEqual(fetched, [], 'rejected requests must not invoke fetchFile');

    // A request with unencoded /../ at the URL root is normalised by new URL() to /web-sibling/secret.txt
    // inside webRoot (where no file exists -> 404), never reaching the sibling folder outside webRoot.
    const normRes = await handleAppRequest({ url: 'app://corantool/../web-sibling/secret.txt' }, { webRoot, fetchFile });
    assert.equal(normRes.status, 404);
    assert.deepEqual(fetched, [path.join(webRoot, 'web-sibling', 'secret.txt')]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
