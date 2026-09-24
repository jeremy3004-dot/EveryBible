import assert from 'node:assert/strict';
import test from 'node:test';

import * as appLocales from '../../../src/i18n/locales/index.ts';
import {
  GROUP_SESSION_MESSAGE_LANGUAGES,
  cleanGroupName,
  groupSessionMessage,
} from './messages.ts';

const locales = appLocales as unknown as Record<
  string,
  { notifications: { groupSessionTitle: string; groupSessionBody: string } }
>;

test('the push copy covers exactly the app interface languages', () => {
  assert.deepEqual([...GROUP_SESSION_MESSAGE_LANGUAGES].sort(), Object.keys(locales).sort());
});

for (const [code, locale] of Object.entries(locales)) {
  test(`the ${code} push matches the app's notifications.groupSession* strings`, () => {
    const message = groupSessionMessage(code, 'Alpha');
    assert.equal(message.title, locale.notifications.groupSessionTitle);
    assert.equal(
      message.body,
      locale.notifications.groupSessionBody.replace('{{groupName}}', 'Alpha')
    );
  });
}

test('region-tagged, differently cased, unknown and missing languages resolve sensibly', () => {
  const english = groupSessionMessage('en', 'Alpha');
  assert.deepEqual(groupSessionMessage('ES-mx', 'Alpha'), groupSessionMessage('es', 'Alpha'));
  assert.deepEqual(groupSessionMessage('zh_Hans', 'Alpha'), groupSessionMessage('zh', 'Alpha'));
  assert.deepEqual(groupSessionMessage('xx', 'Alpha'), english);
  assert.deepEqual(groupSessionMessage(null, 'Alpha'), english);
  assert.deepEqual(groupSessionMessage(undefined, 'Alpha'), english);
});

test('a group name is inserted literally, never as a replacement pattern', () => {
  assert.equal(groupSessionMessage('en', "$& $' $$").body, "A session was recorded in $& $' $$");
});

test('group names are flattened to one line and capped at 80 characters', () => {
  assert.equal(cleanGroupName('  Alpha\n Click\u0000here\t now  '), 'Alpha Click here now');
  assert.equal(cleanGroupName('é'.repeat(100)), 'é'.repeat(80));
  assert.equal(cleanGroupName('🙂'.repeat(81)), '🙂'.repeat(80), 'counts characters, not UTF-16');
  assert.equal(cleanGroupName(null), '');
  assert.equal(cleanGroupName(42), '');
});
