import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocaleSetupSteps } from './localeSetupModel';

test('initial onboarding asks only for a Bible translation', () => {
  assert.deepEqual(getLocaleSetupSteps('initial'), ['translation']);
});

test('settings locale flow stays focused on nation and Bible language', () => {
  assert.deepEqual(getLocaleSetupSteps('settings'), ['country', 'contentLanguage']);
});
