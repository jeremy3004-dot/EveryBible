import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import * as Localization from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { LANGUAGES, type Language, type LanguageCode } from '../../constants/languages';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { changeLanguage, getCurrentLanguage } from '../../i18n';
import { normalizeDeviceLanguageCode } from '../../i18n/deviceLanguage';
import { localeSearchEngine } from '../../services/onboarding/localeSelection';
import {
  getInitialBibleLanguageListState,
  getInitialInterfaceLanguageCode,
  getInterfaceLanguageSelectionResult,
  getLocaleSetupSteps,
  type SetupMode,
  type SetupStep,
} from './localeSetupModel';
import { LocaleSetupList } from './LocaleSetupList';
import { spacing } from '../../design/system';
// Import the hooks from their own modules rather than the hooks barrel: the
// barrel re-exports useSync, which transitively evaluates the Supabase client.
// A barrel import here would undo the deferred-import work below.
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset';
import {
  ESTIMATED_FOOTER_HEIGHT,
  LocaleSetupFooter,
  LocaleSetupHeaderBar,
  LocaleSetupListHeader,
  getActiveSearchQuery,
  getAdjacentSetupStep,
  useDebouncedValue,
  useLocaleEnginePrewarm,
  useLocaleSearchResults,
  useLocaleSelectionSync,
  useLocaleSetupStepItems,
  useOnboardingBibleSelection,
  useOnboardingTranslationOptions,
  useRuntimeCatalogHydration,
  useSearchResultAnnouncement,
  useStepItemRenderer,
} from './localeSetup';

interface LocaleSetupFlowProps {
  mode?: SetupMode;
  onClose?: () => void;
  onComplete?: () => void;
  /**
   * Accepted for API compatibility with LocalePreferencesScreen. The redesigned
   * header carries the step indicator instead of a screen title, and each step
   * already names itself in its own display title, so this is no longer
   * rendered.
   */
  titleKey?: string;
}

// Load syncPreferences lazily inside completion handlers rather than as a
// static top-of-file import. services/sync transitively evaluates
// supabase/client.ts (@supabase/supabase-js), which is heavy on Hermes; a
// static import would pull it into the onboarding screen's module eval at first
// mount. Deferring the require to the completion path keeps supabase-js off the
// first-run critical path. Fire-and-forget: sync failures must never block
// finishing onboarding.
const syncPreferencesAfterOnboarding = (): void => {
  void import('../../services/sync')
    .then(({ syncPreferences }) => syncPreferences())
    .catch(() => {});
};

// Keystrokes feed the result memos and row lists only ~150ms after typing pauses.
const SEARCH_DEBOUNCE_MS = 150;

export function LocaleSetupFlow({ mode = 'initial', onClose, onComplete }: LocaleSetupFlowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  // Android cannot learn the keyboard overlap from the keyboard frame alone
  // (edge-to-edge clears decorFitsSystemWindows, so adjustResize never shrinks
  // this surface), so the list wrapper measures its own bottom edge instead.
  const listSurfaceRef = useRef<View>(null);
  const keyboardBottomInset = useKeyboardBottomInset({
    surfaceRef: listSurfaceRef,
    safeAreaBottomInset: insets.bottom,
  });
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const translations = useBibleStore((state) => state.translations);
  const downloadProgress = useBibleStore((state) => state.downloadProgress);
  const steps = useMemo(() => getLocaleSetupSteps(mode), [mode]);

  // Read once per mount: getLocales() is a native call, and the device locale does not
  // change under an open onboarding flow in a way this screen reacts to.
  const [deviceLocale] = useState(() => Localization.getLocales()[0]);
  const deviceCountryCode = deviceLocale?.regionCode ?? null;
  // Any language, not only interface ones: it ranks the device's Bible language first.
  const deviceLanguageCode = normalizeDeviceLanguageCode(deviceLocale);
  const initialInterfaceLanguageCode = getInitialInterfaceLanguageCode(mode, {
    currentLanguage: getCurrentLanguage(),
    preferredLanguage: preferences.language,
  });

  const [step, setStep] = useState<SetupStep>(steps[0] ?? 'translation');
  const [translationQuery, setTranslationQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const [selectedInterfaceLanguageCode, setSelectedInterfaceLanguageCode] = useState<LanguageCode>(
    initialInterfaceLanguageCode
  );
  // Seeded straight from the stored preference rather than from the locale
  // search engine: resolving a code through the engine pulls in the 129 KB
  // catalog require plus two ICU sorts, and the initial onboarding flow opens
  // on the translation step, which never reads either value. getCountryByCode
  // upper-cases what it is given, so pre-normalizing here keeps the resolved
  // country — and the selected-row comparison against catalog codes — identical.
  // An unknown code still resolves to null below, exactly as it did before.
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    () => (preferences.countryCode || deviceCountryCode)?.toUpperCase() ?? null
  );
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string | null>(
    () => preferences.contentLanguageCode?.toLowerCase() ?? null
  );
  const catalog = useRuntimeCatalogHydration(mode, translations);
  const [showInterfaceLanguagePicker, setShowInterfaceLanguagePicker] = useState(false);
  // Flips once the prewarm below has loaded the locale search engine. Until then
  // nothing rendered may ask the engine anything — even when an earlier screen
  // already warmed it, so the first frame costs the same on every path.
  const [isLocaleEngineWarm, setIsLocaleEngineWarm] = useState(false);
  const [footerHeight, setFooterHeight] = useState(ESTIMATED_FOOTER_HEIGHT);

  // Debounced mirrors of the raw search inputs. The result memos below consume
  // these so keystrokes don't trigger a filter/search + full list re-render on
  // every character.
  const debouncedTranslationQuery = useDebouncedValue(translationQuery, SEARCH_DEBOUNCE_MS);
  const debouncedCountryQuery = useDebouncedValue(countryQuery, SEARCH_DEBOUNCE_MS);
  const debouncedLanguageQuery = useDebouncedValue(languageQuery, SEARCH_DEBOUNCE_MS);

  // Only the nation and content-language steps show a resolved selection, so
  // nothing here may touch the engine until one of them is on screen.
  const needsLocaleSelection = step === 'country' || step === 'contentLanguage';
  const selectedCountry = useMemo(
    () => (needsLocaleSelection ? localeSearchEngine.getCountryByCode(selectedCountryCode) : null),
    [needsLocaleSelection, selectedCountryCode]
  );
  const selectedLanguage = useMemo(
    () =>
      needsLocaleSelection ? localeSearchEngine.getLanguageByCode(selectedLanguageCode) : null,
    [needsLocaleSelection, selectedLanguageCode]
  );
  const selectedInterfaceLanguage = LANGUAGES[selectedInterfaceLanguageCode];
  // Filled by an effect, never during render (see useLocaleSelectionSync). Until
  // it lands the label is empty, which every call site already handles.
  const [selectedCountryDisplayName, setSelectedCountryDisplayName] = useState('');
  const currentStepNumber = Math.max(steps.indexOf(step) + 1, 1);
  const isFinalStep = step === steps[steps.length - 1];
  const bibleLanguageListState = useMemo(() => getInitialBibleLanguageListState(mode), [mode]);

  const options = useOnboardingTranslationOptions({
    mode,
    translations,
    isHydratingRuntimeCatalog: catalog.isHydratingRuntimeCatalog,
    hasHydratedRuntimeCatalog: catalog.hasHydratedRuntimeCatalog,
    debouncedTranslationQuery,
    isLocaleEngineWarm,
    deviceLanguageCode,
    deviceCountryCode,
    selectedInterfaceLanguageCode,
  });

  const { countryCatalogSize, suggestedCountry, listedCountries, languageResults } =
    useLocaleSearchResults({
      step,
      debouncedCountryQuery,
      debouncedLanguageQuery,
      selectedInterfaceLanguageCode,
      selectedCountryCode,
      deviceCountryCode,
    });

  const stepItems = useLocaleSetupStepItems({
    step,
    mode,
    onboardingLanguageSections: options.onboardingLanguageSections,
    hasOnboardingLanguageOptions: options.onboardingLanguageOptions.length > 0,
    primaryOption: options.primaryOption,
    isPrimaryOptionPending: options.isPrimaryOptionPending,
    pinsRecommendedOption: bibleLanguageListState.pinsRecommendedOption,
    showsFullList: bibleLanguageListState.showsFullList,
    isHydratingRuntimeCatalog: catalog.isHydratingRuntimeCatalog,
    runtimeCatalogLoadFailed: catalog.runtimeCatalogLoadFailed,
    suggestedCountry,
    listedCountries,
    debouncedCountryQuery,
    languageResults,
    selectedCountryDisplayName,
  });

  const activeSearchQuery = getActiveSearchQuery(step, {
    translation: debouncedTranslationQuery,
    country: debouncedCountryQuery,
    language: debouncedLanguageQuery,
  });
  useSearchResultAnnouncement(step, activeSearchQuery, stepItems);

  useLocaleEnginePrewarm(() => setIsLocaleEngineWarm(true));
  useLocaleSelectionSync({
    needsLocaleSelection,
    selectedLanguageCode,
    setSelectedLanguageCode,
    selectedCountryCode,
    selectedInterfaceLanguageCode,
    setSelectedCountryDisplayName,
  });

  const completeSetup = async () => {
    if (!selectedCountry || !selectedLanguage) {
      return;
    }

    await changeLanguage(selectedInterfaceLanguageCode);

    setPreferences({
      language: selectedInterfaceLanguageCode,
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      contentLanguageCode: selectedLanguage.code,
      contentLanguageName: selectedLanguage.name,
      contentLanguageNativeName: selectedLanguage.nativeName,
      onboardingCompleted: true,
    });

    syncPreferencesAfterOnboarding();
    onComplete?.();
  };

  const { bibleSelectionState, handleTranslationSelect } = useOnboardingBibleSelection({
    deviceCountryCode,
    selectedInterfaceLanguageCode,
    onFinished: () => {
      syncPreferencesAfterOnboarding();
      onComplete?.();
    },
  });

  const handleCountrySelect = useCallback((countryCode: string) => {
    setSelectedCountryCode(countryCode);
    setLanguageQuery('');
    setSelectedLanguageCode(null);
  }, []);

  const handleLanguageSelect = useCallback((languageCode: string) => {
    setSelectedLanguageCode(languageCode);
  }, []);

  const goToStep = (targetStep: SetupStep) => {
    if (steps.includes(targetStep)) {
      setStep(targetStep);
    }
  };

  const goToNextStep = () => {
    const nextStep = getAdjacentSetupStep(steps, step, 1);
    if (nextStep) {
      setStep(nextStep);
    }
  };

  const goToPreviousStep = () => {
    const previousStep = getAdjacentSetupStep(steps, step, -1);
    if (previousStep) {
      setStep(previousStep);
    }
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === steps[0]) {
        return false;
      }

      goToPreviousStep();
      return true;
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, steps]);

  const handleInterfaceLanguageSelectImpl = async (language: Language) => {
    setSelectedInterfaceLanguageCode(language.code);
    try {
      const result = await getInterfaceLanguageSelectionResult(language.code, changeLanguage);
      if (!result.changeLanguageSucceeded) {
        console.warn('[Onboarding] Failed to load interface language:', result.changeLanguageError);
      }
    } finally {
      setPreferences({ language: language.code });
      setShowInterfaceLanguagePicker(false);
      goToStep('translation');
    }
  };

  const handleInterfaceLanguageSelectRef = useRef(handleInterfaceLanguageSelectImpl);
  handleInterfaceLanguageSelectRef.current = handleInterfaceLanguageSelectImpl;
  const handleInterfaceLanguageSelect = useCallback((language: Language) => {
    void handleInterfaceLanguageSelectRef.current(language);
  }, []);

  const renderStepItem = useStepItemRenderer({
    step,
    colors,
    eyebrowFont: displayFont.regular,
    selectedInterfaceLanguageCode,
    onInterfaceLanguageSelect: handleInterfaceLanguageSelect,
    bibleSelectionState,
    downloadProgress,
    translationDisplayDataById: options.translationDisplayDataById,
    onTranslationSelect: handleTranslationSelect,
    selectedCountryCode,
    onCountrySelect: handleCountrySelect,
    selectedLanguageCode,
    onLanguageSelect: handleLanguageSelect,
    onRetryCatalog: catalog.retryRuntimeCatalog,
  });

  const canUseHeaderBack = mode === 'settings' || step !== steps[0];
  const handleHeaderBack = () => {
    if (mode === 'settings') {
      onClose?.();
      return;
    }

    goToPreviousStep();
  };

  const isCountryStep = step === 'country';
  const canAdvance = isCountryStep ? Boolean(selectedCountry) : Boolean(selectedLanguage);
  const primaryActionLabel = isCountryStep
    ? selectedCountry
      ? t('onboarding.continueWithNation', { name: selectedCountryDisplayName })
      : t('common.continue')
    : isFinalStep
      ? t('onboarding.finish')
      : t('common.continue');
  // Already net of what this surface reserves: the hook discounts the
  // home-indicator inset on iOS and measures the list's own bottom edge on
  // Android, so the footer lifts by exactly what the keyboard covers.
  const keyboardOffset = keyboardBottomInset;
  const showFooter = mode === 'settings';

  // A new step, or a freshly filtered result set, is a different list: keeping
  // the old scroll offset would drop the reader into the middle of results they
  // have not seen. The list scrolls itself back to the top when this changes.
  const scrollResetKey = `${step}:${activeSearchQuery}`;

  const handlePrimaryAction = () => {
    if (step === 'country') {
      if (selectedCountry) {
        goToNextStep();
      }
      return;
    }

    if (step === 'contentLanguage') {
      if (selectedLanguage) {
        void completeSetup();
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <LocaleSetupHeaderBar
        steps={steps}
        currentStepNumber={currentStepNumber}
        colors={colors}
        eyebrowFont={displayFont.regular}
        onBack={canUseHeaderBack ? handleHeaderBack : null}
        onDone={mode === 'settings' ? () => void completeSetup() : null}
      />

      <View ref={listSurfaceRef} style={styles.listSurface} collapsable={false}>
        <LocaleSetupList
          // Remounting per step keeps recycled cells from one step's item types
          // out of the next step's list, and resets the scroll offset for free.
          key={step}
          data={stepItems}
          renderItem={renderStepItem}
          header={
            <LocaleSetupListHeader
              step={step}
              mode={mode}
              colors={colors}
              displayFont={displayFont}
              selectedInterfaceLanguage={selectedInterfaceLanguage}
              selectedInterfaceLanguageCode={selectedInterfaceLanguageCode}
              showInterfaceLanguagePicker={showInterfaceLanguagePicker}
              onToggleInterfaceLanguagePicker={() =>
                setShowInterfaceLanguagePicker((isVisible) => !isVisible)
              }
              onInterfaceLanguageSelect={handleInterfaceLanguageSelect}
              showsTranslationSearch={bibleLanguageListState.showsSearch}
              translationQuery={translationQuery}
              onTranslationQueryChange={setTranslationQuery}
              countryQuery={countryQuery}
              onCountryQueryChange={setCountryQuery}
              countryCatalogSize={countryCatalogSize}
              languageQuery={languageQuery}
              onLanguageQueryChange={setLanguageQuery}
              selectedCountryCode={selectedCountry?.code ?? null}
              selectedCountryDisplayName={selectedCountryDisplayName}
              onEditCountry={() => goToStep('country')}
            />
          }
          contentPaddingBottom={(showFooter ? footerHeight : 0) + keyboardOffset + spacing.xxl}
          scrollResetKey={scrollResetKey}
          // FlashList compares extraData by reference and only re-renders the
          // header and the visible cells when it changes, so this is deliberately
          // a fresh object per render: the search field's value and the rows'
          // selection marks/download progress have to stay current on every
          // keystroke. The memoized row components are what keep that cheap — a
          // re-render of ~10 visible cells whose props did not change costs
          // nothing beyond creating the elements.
          extraData={{
            bibleSelectionState,
            colors,
            countryQuery,
            displayFont,
            downloadProgress,
            languageQuery,
            selectedCountryCode,
            selectedInterfaceLanguageCode,
            selectedLanguageCode,
            showInterfaceLanguagePicker,
            translationQuery,
          }}
        />
      </View>

      {showFooter ? (
        <LocaleSetupFooter
          label={primaryActionLabel}
          canAdvance={canAdvance}
          keyboardOffset={keyboardOffset}
          colors={colors}
          onPress={handlePrimaryAction}
          onHeightChange={setFooterHeight}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // The list's own bottom edge is the reference the Android keyboard overlap is
  // measured against: it ends where the safe-area padding starts, which is
  // exactly where the pinned footer sits at rest.
  listSurface: {
    flex: 1,
  },
});
