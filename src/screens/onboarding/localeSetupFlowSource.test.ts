import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('LocaleSetupFlow no longer includes an initial auth-choice step', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  assert.equal(
    flowSource.includes("step === 'account'"),
    false,
    'LocaleSetupFlow should not render a dedicated account step during initial onboarding'
  );

  assert.equal(
    flowSource.includes('selectedAccessMode'),
    false,
    'LocaleSetupFlow should not carry first-run auth selection state anymore'
  );
});

test('App boot no longer routes onboarding completion through accessMode', () => {
  const appSource = readRelativeSource('../../../App.tsx');
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  assert.equal(
    appSource.includes('accessMode'),
    false,
    'App.tsx should not depend on onboarding accessMode handoff after guest-first onboarding'
  );

  assert.equal(
    appSource.includes('onInitialAuthRequest'),
    false,
    'App.tsx should not queue an initial auth request during onboarding'
  );

  assert.match(
    appSource,
    /if \(!preferences\.onboardingCompleted\) \{\s*return <LocaleSetupFlow mode="initial" onComplete=\{\(\) => undefined\} \/>;\s*\}/,
    'App.tsx should still gate first run behind LocaleSetupFlow before rendering the main shell'
  );

  assert.match(
    flowSource,
    /onboardingCompleted: true/,
    'LocaleSetupFlow should still mark onboarding completed before leaving first run'
  );
});
