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
    description: 'Ask EveryBible AI a question or request prayer.',
    primaryActionLabel: 'Open chat',
    title: 'Chat with EveryBible AI',
  });
});

test('getOperatorLauncherConfig trims the url and accepts Telegram deep links', () => {
  assert.equal(
    getOperatorLauncherConfig({
      NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL: '  https://t.me/everybible_global_bot  ',
    })?.chatUrl,
    'https://t.me/everybible_global_bot'
  );
  assert.equal(
    getOperatorLauncherConfig({
      NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL: 'tg://resolve?domain=everybible_global_bot',
    })?.chatUrl,
    'tg://resolve?domain=everybible_global_bot'
  );
});

test('getOperatorLauncherConfig hides the launcher for blank, malformed or unsafe urls', () => {
  for (const value of [
    '   ',
    'not a url',
    'http://t.me/everybible_global_bot',
    'javascript:alert(1)',
    'data:text/html,hi',
  ]) {
    assert.equal(
      getOperatorLauncherConfig({ NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL: value }),
      null,
      value
    );
  }
});

test('getOperatorLauncherConfig reads process.env by default', (t) => {
  const original = process.env.NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL;
  t.after(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL;
    else process.env.NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL = original;
  });

  process.env.NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL = 'https://t.me/from_env';
  assert.equal(getOperatorLauncherConfig()?.chatUrl, 'https://t.me/from_env');
  delete process.env.NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL;
  assert.equal(getOperatorLauncherConfig(), null);
});

test('RootLayout renders the operator launcher globally', () => {
  const source = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  assert.match(source, /OperatorLauncher/);
});
