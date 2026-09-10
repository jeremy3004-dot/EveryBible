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

  // The grouped sections used to be mapped straight into the ScrollView. They
  // are now flattened into the virtualized list's item array instead, but the
  // intent is unchanged: the full grouped Bible language list is in the default
  // view, not behind a toggle.
  assert.match(
    flowSource,
    /buildBibleLanguageListItems\(\{[\s\S]*?sections: onboardingLanguageSections/,
    'Initial onboarding should feed the grouped Bible language sections into the default list'
  );

  assert.match(
    flowSource,
    /showsFullList: bibleLanguageListState\.showsFullList/,
    'The full Bible language list should still be gated only by the list-state model'
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

test('LocaleSetupFlow virtualizes its list-heavy steps instead of mapping every row into a ScrollView', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');
  const listSource = readRelativeSource('./LocaleSetupList.tsx');

  // The regression this guards: rendering the Bible language catalog (hundreds
  // of rows), the ~249 nations and the language search results with `.map()`
  // inside one ScrollView mounted every row at once, saturating the JS thread on
  // Hermes. Each step now feeds one virtualized list.
  // Comments may still explain what was replaced; what must be gone is the
  // import and the element.
  assert.equal(
    /^import[\s\S]*?\bScrollView\b[\s\S]*?from 'react-native';/m.test(flowSource),
    false,
    'LocaleSetupFlow should no longer import ScrollView'
  );

  assert.equal(
    flowSource.includes('<ScrollView'),
    false,
    'LocaleSetupFlow should no longer render its steps inside a ScrollView'
  );

  assert.equal(
    flowSource.includes('onboardingLanguageSections.map'),
    false,
    'The Bible language sections should be flattened into list items, not mapped into the scroll body'
  );

  assert.equal(
    flowSource.includes('listedCountries.map((country, index)'),
    false,
    'The nation list should be flattened into list items, not mapped into the scroll body'
  );

  assert.equal(
    flowSource.includes('languageResults.recommended.map'),
    false,
    'The language search results should be flattened into list items, not mapped into the scroll body'
  );

  assert.match(
    flowSource,
    /<LocaleSetupList[\s\S]*data=\{stepItems\}[\s\S]*renderItem=\{renderStepItem\}/,
    'Every step body should render through the shared virtualized list'
  );

  assert.match(
    listSource,
    /from '@shopify\/flash-list'/,
    'The shared onboarding list should be backed by FlashList'
  );

  assert.match(
    listSource,
    /keyExtractor=\{keyExtractor\}[\s\S]*getItemType=\{getItemType\}[\s\S]*estimatedItemSize=/,
    'The virtualized list needs stable keys, per-type cell pools and a size estimate'
  );

  assert.match(
    listSource,
    /const keyExtractor = \(item: LocaleSetupListItemBase\): string => item\.id;/,
    'Rows must key off a stable id, never the list index'
  );

  assert.match(
    listSource,
    /keyboardShouldPersistTaps="handled"[\s\S]*keyboardDismissMode="on-drag"/,
    'The virtualized list should keep the ScrollView keyboard behaviour it replaced'
  );

  assert.match(
    listSource,
    /scrollToOffset\(\{ offset: 0, animated: false \}\)/,
    'Changing step or search query should scroll the list back to the top'
  );

  assert.match(
    flowSource,
    /contentPaddingBottom=\{\(showFooter \? footerHeight : 0\) \+ keyboardOffset \+ spacing\.xxl\}/,
    'The list must reserve the same bottom padding the ScrollView did for the pinned footer and keyboard'
  );
});

test('LocaleSetupFlow keeps the search field out of the recycled item array', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  // Recycled cells can unmount while the results below re-filter, which would
  // drop focus and dismiss the keyboard mid-word. The search field rides in the
  // list header instead, where it is re-rendered in place.
  assert.match(
    flowSource,
    /const listHeader = \(\s*<View>/,
    'The list header should be an element of a stable component type, not an inline function component'
  );

  assert.match(
    flowSource,
    /const listHeader = \([\s\S]*'onboarding-translation-search'[\s\S]*'onboarding-country-search'[\s\S]*'onboarding-language-search'[\s\S]*\);/,
    'Every step search field should live in the list header'
  );

  assert.equal(
    /type: 'search'/.test(flowSource),
    false,
    'The search field should not be a recycled list item'
  );

  assert.match(
    flowSource,
    /header=\{listHeader\}/,
    'The virtualized list should receive the header element'
  );
});

test('LocaleSetupFlow rows draw their own grouped-card edges', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');
  const listSource = readRelativeSource('./LocaleSetupList.tsx');

  // A virtualized group can no longer be wrapped in one AppCard, so each row
  // paints the slice of the card it occupies.
  assert.match(
    listSource,
    /export function GroupedRowCard\(\{ position, children \}: GroupedRowCardProps\)/,
    'There should be a per-row grouped card shell'
  );

  assert.match(
    listSource,
    /first: \{\s*borderTopWidth: 1,\s*borderTopLeftRadius: radius\.lg,\s*borderTopRightRadius: radius\.lg,/,
    'The first row of a group should draw the card top edge and radius'
  );

  assert.match(
    listSource,
    /last: \{\s*borderBottomWidth: 1,\s*borderBottomLeftRadius: radius\.lg,\s*borderBottomRightRadius: radius\.lg,/,
    'The last row of a group should draw the card bottom edge and radius'
  );

  assert.match(
    listSource,
    /only: \{\s*borderTopWidth: 1,\s*borderBottomWidth: 1,\s*borderRadius: radius\.lg,/,
    'A single-row group should draw all four card edges'
  );

  assert.match(
    flowSource,
    /isLast=\{isLastInLocaleSetupGroup\(position\)\}/,
    'Rows should keep the isLast separator semantics they had inside an AppCard'
  );
});

test('LocaleSetupFlow never resolves the locale search engine while rendering its first frame', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  // Everything above the step gate runs unconditionally on the very first
  // render. Touching the engine there costs the 129 KB catalog require plus two
  // ICU sorts before anything is on screen — and the initial flow opens on the
  // translation step, which needs none of it.
  const componentStart = flowSource.indexOf('export function LocaleSetupFlow(');
  const gateIndex = flowSource.indexOf('const needsLocaleSelection =');
  assert.ok(componentStart > 0 && gateIndex > componentStart);
  const renderPrologue = flowSource.slice(componentStart, gateIndex);

  assert.doesNotMatch(
    renderPrologue,
    /localeSearchEngine\./,
    'no value read on every first render may come from the locale search engine'
  );

  assert.match(
    flowSource,
    /const needsLocaleSelection = step === 'country' \|\| step === 'contentLanguage';/,
    'the engine-backed selection should be gated on the steps that actually display it'
  );

  assert.match(
    flowSource,
    /const selectedCountry = useMemo\([\s\S]{0,80}needsLocaleSelection \? localeSearchEngine\.getCountryByCode\(selectedCountryCode\)\s*: null,?\s*\)?,/,
    'the selected country should be memoized behind the step gate rather than resolved in the render body'
  );

  assert.match(
    flowSource,
    /const selectedLanguage = useMemo\([\s\S]{0,80}needsLocaleSelection \? localeSearchEngine\.getLanguageByCode\(selectedLanguageCode\)\s*: null,?\s*\)?,/,
    'the selected content language should be memoized behind the same gate'
  );

  assert.match(
    flowSource,
    /const \[selectedCountryDisplayName, setSelectedCountryDisplayName\] = useState\(''\);/,
    'the localized nation name should start empty and be filled in later — building Intl.DisplayNames and walking 249 countries must never happen during a render'
  );

  assert.match(
    flowSource,
    /useEffect\(\(\) => \{[\s\S]{0,400}setSelectedCountryDisplayName\(\s*localeSearchEngine\.getCountryDisplayName\(selectedCountryCode, selectedInterfaceLanguageCode\)\s*\);/,
    'the localized nation name should be resolved from an effect'
  );

  assert.match(
    flowSource,
    /useState<string \| null>\(\s*\(\) => \(preferences\.countryCode \|\| deviceCountryCode\)\?\.toUpperCase\(\) \?\? null\s*\)/,
    'the stored nation code should seed state directly instead of being resolved through the engine on first render'
  );

  assert.match(
    flowSource,
    /const canonicalCode = localeSearchEngine\.getLanguageByCode\(selectedLanguageCode\)\?\.code;/,
    'the stored content-language code should still be canonicalized against the catalog — just from an effect, once a step needs the engine'
  );

  assert.match(
    flowSource,
    /InteractionManager\.runAfterInteractions\(\(\) => \{\s*prewarmLocaleSearchEngine\(\);/,
    'the off-critical-path pre-warm should stay: the engine is still needed, just not during a render'
  );
});

test('LocaleSetupFlow lifts its footer by the measured keyboard overlap', () => {
  const flowSource = readRelativeSource('./LocaleSetupFlow.tsx');

  assert.match(
    flowSource,
    /useKeyboardBottomInset\(\{\s*surfaceRef: listSurfaceRef,\s*safeAreaBottomInset: insets\.bottom,\s*\}\)/,
    'the flow should hand the hook the surface to measure and the inset its own layout reserves — Android cannot derive the overlap from the keyboard frame alone under edge-to-edge'
  );

  assert.match(
    flowSource,
    /<View ref=\{listSurfaceRef\} style=\{styles\.listSurface\} collapsable=\{false\}>/,
    'the measured surface should be the list wrapper, whose bottom edge is where the pinned footer sits at rest — and it must not be collapsed away on Android'
  );

  assert.match(
    flowSource,
    /const keyboardOffset = keyboardBottomInset;/,
    'the safe-area correction now lives in the hook, so the flow must not subtract it a second time'
  );
});
