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

test('LocaleSetupFlow initial onboarding shows Bible search and the full list immediately', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');
  const modelSource = readRelativeSource('./localeSetupModel.ts');

  assert.match(
    modelSource,
    /return \['translation'\];/,
    'Initial onboarding should open directly to Bible language selection'
  );

  assert.equal(
    flowSource.includes('onboarding-translation-search'),
    true,
    'Initial onboarding should expose a Bible language search field immediately'
  );

  assert.equal(
    flowSource.includes('showBibleLanguagePicker'),
    false,
    'Initial onboarding should not gate Bible search or the full list behind a preference toggle'
  );

  assert.equal(
    flowSource.includes('onboarding-bible-language-toggle'),
    false,
    'Initial onboarding should not require a Bible language preference tap before browsing'
  );

  assert.equal(
    flowSource.includes('onboardingLanguageSections.map'),
    true,
    'Initial onboarding should render the grouped Bible language sections in the default view'
  );

  assert.equal(
    flowSource.includes('onboarding-interface-language-search'),
    false,
    'Initial onboarding should not use a full interface-language search step'
  );

  assert.equal(
    flowSource.includes('onboarding-interface-language-toggle'),
    true,
    'Initial onboarding should keep app language available as an inline control'
  );

  assert.equal(
    flowSource.includes('onboarding-primary-recommendation'),
    true,
    'Initial onboarding should show a primary recommended Bible option'
  );
});

test('LocaleSetupFlow bounds runtime catalog hydration and exposes retry without hiding bundled Bibles', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');
  const modelSource = readRelativeSource('./localeSetupModel.ts');

  assert.equal(
    modelSource.includes('RUNTIME_CATALOG_HYDRATION_TIMEOUT_MS'),
    true,
    'Runtime catalog hydration should have a bounded timeout constant'
  );

  assert.equal(
    flowSource.includes('waitForRuntimeCatalogHydration'),
    true,
    'LocaleSetupFlow should use the timeout-bounded hydration helper'
  );

  assert.equal(
    flowSource.includes('runtimeCatalogLoadFailed'),
    true,
    'LocaleSetupFlow should remember catalog load timeout/failure so it can show retry UI'
  );

  assert.equal(
    flowSource.includes('onboarding-runtime-catalog-retry'),
    true,
    'LocaleSetupFlow should expose a retry affordance when runtime catalog loading fails'
  );

  assert.match(
    flowSource,
    /getVisibleTranslationsForPicker\(translations,\s*\{[\s\S]*isHydratingRuntimeCatalog[\s\S]*hasHydratedRuntimeCatalog/,
    'LocaleSetupFlow should keep using picker visibility rules that leave bundled translations visible while hydrating'
  );
});

test('LocaleSetupFlow closes interface-language picker even when changeLanguage rejects', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  assert.equal(
    flowSource.includes('getInterfaceLanguageSelectionResult'),
    true,
    'Interface language selection should go through the robust model helper'
  );

  assert.match(
    flowSource,
    /finally \{[\s\S]*setShowInterfaceLanguagePicker\(false\)[\s\S]*goToStep\('translation'\)/,
    'Interface language selection should close the picker and return to translation in finally'
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

test('LocaleSetupFlow intercepts the Android hardware back button to step backward instead of exiting onboarding', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  assert.match(
    flowSource,
    /import \{[\s\S]*BackHandler[\s\S]*\} from 'react-native';/,
    'LocaleSetupFlow should import BackHandler from react-native'
  );

  assert.match(
    flowSource,
    /BackHandler\.addEventListener\('hardwareBackPress',/,
    'LocaleSetupFlow should register a hardwareBackPress handler'
  );

  assert.match(
    flowSource,
    /goToPreviousStep\(\);\s*return true;/,
    'The hardware back handler should step backward through onboarding instead of exiting it'
  );

  assert.match(
    flowSource,
    /return \(\) => subscription\.remove\(\);/,
    'The hardware back handler should clean up with .remove(), not the removed removeEventListener API'
  );

  assert.equal(
    flowSource.includes('BackHandler.removeEventListener'),
    false,
    'LocaleSetupFlow should not use the deprecated/removed BackHandler.removeEventListener API'
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
    /if \(!preferences\.onboardingCompleted\) \{[\s\S]*?<OnboardingHost \/>[\s\S]*?\}/,
    'App.tsx should still gate first run behind onboarding before rendering the main shell'
  );

  assert.match(
    appSource,
    /function OnboardingHost\(\) \{[\s\S]*?import\('\.\/src\/screens\/onboarding\/LocaleSetupFlow'\)[\s\S]*?return LocaleSetupFlow \? <LocaleSetupFlow mode="initial" onComplete=\{\(\) => undefined\} \/> : null;/,
    'App.tsx should lazily load LocaleSetupFlow via a dynamic import (not a static top-level import) and render it in initial mode'
  );

  assert.equal(
    appSource.includes('import { LocaleSetupFlow } from'),
    false,
    'App.tsx should not statically import LocaleSetupFlow onto the boot render path'
  );

  assert.match(
    flowSource,
    /onboardingCompleted: true/,
    'LocaleSetupFlow should still mark onboarding completed before leaving first run'
  );

  assert.match(
    flowSource,
    /const syncPreferencesAfterOnboarding = \(\): void => \{[\s\S]*?import\('\.\.\/\.\.\/services\/sync'\)[\s\S]*?\.then\(\(\{ syncPreferences \}\) => syncPreferences\(\)\)/,
    'LocaleSetupFlow should sync preferences after onboarding via a deferred dynamic import instead of a static syncPreferences call'
  );

  assert.equal(
    flowSource.includes('accessMode'),
    false,
    'LocaleSetupFlow completion should not route onboarding handoff through accessMode'
  );
});

test('LocaleSetupFlow renders the Every Language nation step: step rail, suggested card, gradient footer', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  assert.equal(
    flowSource.includes("from '@expo/vector-icons'"),
    false,
    'The locale flow should draw Lucide glyphs, not Ionicons'
  );

  assert.match(
    flowSource,
    /from 'lucide-react-native'/,
    'The locale flow should import its glyphs from lucide-react-native'
  );

  assert.match(
    flowSource,
    /const STEP_BAR_WIDTH = 120;[\s\S]*const STEP_BAR_HEIGHT = 3;/,
    'The header should carry the 120x3pt segmented step rail from the design system'
  );

  assert.match(
    flowSource,
    /t\('onboarding\.stepEyebrow', \{ step: currentStepNumber, total: totalSteps \}\)/,
    'The step eyebrow should be driven by the real step index and step count, not a hardcoded "2 of 3"'
  );

  assert.match(
    flowSource,
    /index < currentStepNumber \? colors\.accentPrimary : colors\.borderStrong/,
    'Completed step segments should fill with accentPrimary and the rest stay borderStrong'
  );

  assert.match(
    flowSource,
    /t\('onboarding\.suggestedFromDevice'\)[\s\S]*<AppCard\s+accentRule/,
    'The device-suggested nation should sit in an accent-rule card under its own eyebrow'
  );

  assert.equal(
    flowSource.includes("t('onboarding.suggestedBadge')"),
    true,
    'The suggested nation should carry the SUGGESTED chip'
  );

  assert.match(
    flowSource,
    /<LinearGradient[\s\S]*colors=\{\['transparent', colors\.background, colors\.background\]\}[\s\S]*locations=\{\[0, 0\.3, 1\]\}/,
    'The footer should fade the scrolling list out over its top 30% instead of sitting on a hard rule'
  );

  assert.match(
    flowSource,
    /t\('onboarding\.continueWithNation', \{ name: selectedCountryDisplayName \}\)/,
    'The primary action should name the chosen nation'
  );

  assert.equal(
    flowSource.includes('languageButtonGrid'),
    false,
    'The interface-language tile grid should be replaced by the shared option-row list'
  );

  assert.equal(
    flowSource.includes('testID="onboarding-secondary-action"'),
    false,
    'The in-body Back button should be gone — the header icon-button owns backward navigation'
  );

  assert.match(
    flowSource,
    /import \{ useKeyboardBottomInset \} from '\.\.\/\.\.\/hooks\/useKeyboardBottomInset';/,
    'The pinned footer should lift clear of the keyboard, and the hook must be imported directly rather than through the hooks barrel (which pulls Supabase onto this screen)'
  );
});
