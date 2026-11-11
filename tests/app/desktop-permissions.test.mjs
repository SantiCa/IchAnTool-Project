import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import desktopMain from '../../desktop/main.js';

test('restricted directory requests settle without granting access or leaving the picker pending', () => {
  const session = new EventEmitter();
  session.setPermissionRequestHandler = () => {};
  desktopMain.setupSessionPermissions(session);
  for (const origin of ['app://corantool', 'https://example.invalid']) {
    const answers = [];
    session.emit('file-system-access-restricted', {}, { origin, path: 'restricted-folder' }, (answer) => answers.push(answer));
    assert.deepEqual(answers, ['deny']);
  }
});
