import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadDailyScriptureText } from './dailyScripture';

test('daily scripture skips text loading when the translation has no text', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: false,
      isBibleReady: false,
      allowInitialization: true,
    }),
    false
  );
});

test('daily scripture can avoid triggering heavyweight bible initialization on launch', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: true,
      isBibleReady: false,
      allowInitialization: false,
    }),
    false
  );
});

test('daily scripture loads text when the bible data is already ready', () => {
  assert.equal(
    shouldLoadDailyScriptureText({
      translationHasText: true,
      isBibleReady: true,
      allowInitialization: false,
    }),
    true
  );
});
