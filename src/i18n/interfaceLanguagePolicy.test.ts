import test from 'node:test';
import assert from 'node:assert/strict';

import { getStoredInterfaceLanguageToApply } from './interfaceLanguagePolicy';

// App.tsx applies the stored interface language whenever it changes. Before onboarding is
// finished that stored value is only the app default ('en'): on a fresh install, and again
// after sign-out resets every preference. Applying it switched a French or Arabic device to
// English underneath the onboarding flow, which still showed the device language as chosen.

test('while onboarding is unfinished the stored default language is not applied', () => {
  assert.equal(
    getStoredInterfaceLanguageToApply({ language: 'en', onboardingCompleted: false }),
    null
  );
});

test('once onboarding is finished the stored language is the user choice and is applied', () => {
  assert.equal(
    getStoredInterfaceLanguageToApply({ language: 'ne', onboardingCompleted: true }),
    'ne'
  );
});
