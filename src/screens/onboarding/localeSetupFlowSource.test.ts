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

test('LocaleSetupFlow initial onboarding is a direct Bible translation chooser', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');
  const modelSource = readRelativeSource('./localeSetupModel.ts');

  assert.match(
    modelSource,
    /return \['translation'\];/,
    'Initial onboarding should ask for a Bible translation instead of walking through locale setup'
  );

  assert.equal(
    flowSource.includes('onboarding-translation-search'),
    true,
    'Initial onboarding should expose a direct translation search field'
  );

  assert.equal(
    flowSource.includes('onboarding-interface-language-search'),
    false,
    'Initial onboarding should not force a separate interface-language search step'
  );
});

test('LocaleSetupFlow falls back to bundled Hindi or Nepali for India and Nepal language misses', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');
  const fallbackSource = readFileSync(
    fileURLToPath(
      new URL('../../services/translations/regionalTranslationFallback.ts', import.meta.url).href
    ),
    'utf8'
  );

  assert.match(
    fallbackSource,
    /REGIONAL_FALLBACK_TRANSLATION_IDS[\s\S]*IN:\s*'hincv'[\s\S]*NP:\s*'npiulb'/,
    'Initial onboarding should know the bundled Hindi and Nepali fallback translations'
  );

  assert.match(
    fallbackSource,
    /resolveRegionalFallbackTranslation[\s\S]*countryCodes\.includes\('NP'\)[\s\S]*REGIONAL_FALLBACK_TRANSLATION_IDS\.NP[\s\S]*countryCodes\.includes\('IN'\)[\s\S]*REGIONAL_FALLBACK_TRANSLATION_IDS\.IN/,
    'Initial onboarding should prefer Nepali/Hindi fallbacks for Nepal/India language selections'
  );

  assert.equal(
    flowSource.includes('resolveRegionalFallbackTranslation'),
    true,
    'Initial onboarding should use the shared regional fallback resolver'
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
