import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocaleSetupSteps } from './localeSetupModel';

test('initial onboarding asks for interface language before nation and Bible language', () => {
  assert.deepEqual(getLocaleSetupSteps('initial'), [
    'interface',
    'country',
    'contentLanguage',
    'privacy',
  ]);
});

test('settings locale flow stays focused on nation and Bible language', () => {
  assert.deepEqual(getLocaleSetupSteps('settings'), ['country', 'contentLanguage']);
});
