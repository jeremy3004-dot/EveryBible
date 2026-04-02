import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import test from 'node:test';

import { getOperatorLauncherConfig } from './operator-launcher';

test('getOperatorLauncherConfig returns null when the chat url is missing', () => {
  assert.equal(getOperatorLauncherConfig({}), null);
});

test('getOperatorLauncherConfig returns launcher copy when the chat url is valid', () => {
  const config = getOperatorLauncherConfig({
    NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL: 'https://t.me/everybible_global_bot',
  });

  assert.deepEqual(config, {
    chatUrl: 'https://t.me/everybible_global_bot',
    description:
      'Start a guided chat with the EveryBible AI operator for questions, prayer, and trusted follow-up.',
    primaryActionLabel: 'Open chat',
    title: 'Chat with EveryBible AI',
  });
});

test('RootLayout renders the operator launcher globally', () => {
  const source = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  assert.match(source, /OperatorLauncher/);
});
