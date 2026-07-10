import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import {
  LANGUAGES,
  SUPPORTED_LANGUAGES,
  type Language,
  type LanguageCode,
} from '../../constants/languages';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { changeLanguage } from '../../i18n';
import {
  ensureRuntimeCatalogLoaded,
  hasRuntimeCatalogTranslations,
} from '../../services/translations';
import { resolveRegionalFallbackTranslation } from '../../services/translations/regionalTranslationFallback';
import {
  localeSearchEngine,
  prewarmLocaleSearchEngine,
  type LocaleLanguage,
} from '../../services/onboarding/localeSelection';
import {
  buildInitialOnboardingLanguageOptions,
  getInitialBibleLanguageListState,
  getInterfaceLanguageSelectionResult,
  getLocaleSetupSteps,
  waitForRuntimeCatalogHydration,
  type InitialOnboardingLanguageOption,
  type SetupMode,
  type SetupStep,
} from './localeSetupModel';
import { radius, spacing } from '../../design/system';
import { ProgressBar } from '../../components/ui/ProgressBar';
import type { BibleTranslation } from '../../types';
import {
  filterTranslationsBySearchQuery,
  getTranslationAvailabilitySummary,
  getTranslationSelectionState,
  getVisibleTranslationsForPicker,
  normalizeTranslationLanguage,
} from '../bible/bibleTranslationModel';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import { isRemoteAudioAvailable } from '../../services/audio/audioRemote';
import { config } from '../../constants';

interface LocaleSetupFlowProps {
  mode?: SetupMode;
  onClose?: () => void;
  onComplete?: () => void;
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

// Debounce a rapidly-changing value (search query text) so downstream result
// memos and the row lists only recompute ~150ms after the user stops typing,
// rather than on every keystroke. The TextInput keeps binding the raw value so
// typing still feels immediate; only the expensive filtering/search follows the
// debounced value.
const SEARCH_DEBOUNCE_MS = 150;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debouncedValue;
}

const getFlagEmoji = (countryCode: string): string => {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return '';
  }

  return String.fromCodePoint(...countryCode.split('').map((char) => 127397 + char.charCodeAt(0)));
};

// Row components are extracted and memoized (keyed by stable id) so a keystroke
// that only changes one row's selection — or leaves the visible set unchanged —
// doesn't re-render every row in the non-virtualized ScrollView. Props are kept
// primitive/stable (precomputed labels + a stable onSelect callback) so
// React.memo's shallow compare actually skips unchanged rows.
interface CountryRowProps {
  countryCode: string;
  countryName: string;
  isSelected: boolean;
  colors: ThemeColors;
  onSelect: (countryCode: string) => void;
}

const CountryRow = memo(function CountryRow({
  countryCode,
  countryName,
  isSelected,
  colors,
  onSelect,
}: CountryRowProps) {
  const flag = getFlagEmoji(countryCode);

  return (
    <TouchableOpacity
      style={[
        styles.optionCard,
        {
          backgroundColor: isSelected ? colors.accentSoft : colors.cardBackground,
          borderColor: isSelected ? colors.accentGreen : colors.cardBorder,
        },
      ]}
      onPress={() => onSelect(countryCode)}
      activeOpacity={0.85}
    >
      <View style={styles.optionCopy}>
        <View style={styles.countryTitleRow}>
          {flag ? <Text style={styles.flagEmoji}>{flag}</Text> : null}
          <Text style={[styles.optionTitle, { color: colors.primaryText }]}>{countryName}</Text>
        </View>
        <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>{countryCode}</Text>
      </View>
      {isSelected ? (
        <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
      ) : null}
    </TouchableOpacity>
  );
});

interface LanguageRowProps {
  language: LocaleLanguage;
  isRecommended: boolean;
  isSelected: boolean;
  recommendedBadgeLabel: string;
  colors: ThemeColors;
  onSelect: (languageCode: string) => void;
}

const LanguageRow = memo(function LanguageRow({
  language,
  isRecommended,
  isSelected,
  recommendedBadgeLabel,
  colors,
  onSelect,
}: LanguageRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.optionCard,
        {
          backgroundColor: isSelected ? colors.accentSoft : colors.cardBackground,
          borderColor: isSelected ? colors.accentGreen : colors.cardBorder,
        },
      ]}
      onPress={() => onSelect(language.code)}
      activeOpacity={0.85}
    >
      <View style={styles.optionCopy}>
        <Text style={[styles.optionTitle, { color: colors.primaryText }]}>
          {language.nativeName}
        </Text>
        <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>{language.name}</Text>
        <View style={styles.badgeRow}>
          {isRecommended ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.accentGreen + '18',
                  borderColor: colors.accentGreen + '44',
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.accentGreen }]}>
                {recommendedBadgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {isSelected ? (
        <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
      ) : null}
    </TouchableOpacity>
  );
});

interface OnboardingLanguageRowProps {
  translation: BibleTranslation;
  optionLabel: string;
  translationLabel: string;
  availabilitySummary: string;
  statusLabel: string;
  recommendedBadgeLabel: string;
  downloadingLabel: string;
  isRecommended: boolean;
  isInstalling: boolean;
  progress: number | null;
  colors: ThemeColors;
  onPress: (translation: BibleTranslation) => void;
}

const OnboardingLanguageRow = memo(function OnboardingLanguageRow({
  translation,
  optionLabel,
  translationLabel,
  availabilitySummary,
  statusLabel,
  recommendedBadgeLabel,
  downloadingLabel,
  isRecommended,
  isInstalling,
  progress,
  colors,
  onPress,
}: OnboardingLanguageRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.optionCard,
        {
          backgroundColor: isRecommended ? colors.accentGreen + '10' : colors.cardBackground,
          borderColor: isRecommended ? colors.accentGreen : colors.cardBorder,
        },
      ]}
      onPress={() => onPress(translation)}
      disabled={isInstalling}
      activeOpacity={0.85}
    >
      <View style={styles.optionCopy}>
        <Text style={[styles.optionTitle, { color: colors.primaryText }]}>{optionLabel}</Text>
        <Text style={[styles.optionMeta, { color: colors.secondaryText }]} numberOfLines={1}>
          {translationLabel}
        </Text>
        <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>
          {availabilitySummary}
        </Text>
        <View style={styles.badgeRow}>
          {isRecommended ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.accentGreen + '18',
                  borderColor: colors.accentGreen + '44',
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.accentGreen }]}>
                {recommendedBadgeLabel}
              </Text>
            </View>
          ) : null}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: colors.accentGreen + '18',
                borderColor: colors.accentGreen + '44',
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: colors.accentGreen }]}>
              {isInstalling && progress != null ? `${downloadingLabel} ${progress}%` : statusLabel}
            </Text>
          </View>
        </View>
      </View>
      {isInstalling && progress != null ? (
        <View style={styles.downloadProgress}>
          <ProgressBar progress={progress / 100} />
        </View>
      ) : isInstalling ? (
        <ActivityIndicator color={colors.accentGreen} />
      ) : (
        <Ionicons name="chevron-forward" size={22} color={colors.secondaryText} />
      )}
    </TouchableOpacity>
  );
});

export function LocaleSetupFlow({
  mode = 'initial',
  onClose,
  onComplete,
  titleKey,
}: LocaleSetupFlowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const translations = useBibleStore((state) => state.translations);
  const downloadProgress = useBibleStore((state) => state.downloadProgress);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
  const steps = useMemo(() => getLocaleSetupSteps(mode), [mode]);

  const deviceLocale = Localization.getLocales()[0];
  const deviceCountryCode = deviceLocale?.regionCode ?? null;
  const deviceLanguageCode = deviceLocale?.languageCode as LanguageCode | undefined;
  const initialCountry =
    localeSearchEngine.getCountryByCode(preferences.countryCode || deviceCountryCode) ?? null;
  const initialLanguage = localeSearchEngine.getLanguageByCode(preferences.contentLanguageCode);
  const totalSteps = steps.length;
  const initialInterfaceLanguageCode =
    mode === 'initial' && deviceLanguageCode && LANGUAGES[deviceLanguageCode]
      ? deviceLanguageCode
      : preferences.language;

  const [step, setStep] = useState<SetupStep>(steps[0] ?? 'translation');
  const [translationQuery, setTranslationQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const [selectedInterfaceLanguageCode, setSelectedInterfaceLanguageCode] = useState<LanguageCode>(
    initialInterfaceLanguageCode
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    initialCountry?.code ?? null
  );
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string | null>(
    initialLanguage?.code ?? null
  );
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(mode === 'initial');
  const [runtimeCatalogLoadFailed, setRuntimeCatalogLoadFailed] = useState(false);
  const [runtimeCatalogHydrationAttempt, setRuntimeCatalogHydrationAttempt] = useState(0);
  const [installingTranslationId, setInstallingTranslationId] = useState<string | null>(null);
  const [showInterfaceLanguagePicker, setShowInterfaceLanguagePicker] = useState(false);

  // Debounced mirrors of the raw search inputs. The result memos below consume
  // these so keystrokes don't trigger a filter/search + full list re-render on
  // every character.
  const debouncedTranslationQuery = useDebouncedValue(translationQuery, SEARCH_DEBOUNCE_MS);
  const debouncedCountryQuery = useDebouncedValue(countryQuery, SEARCH_DEBOUNCE_MS);
  const debouncedLanguageQuery = useDebouncedValue(languageQuery, SEARCH_DEBOUNCE_MS);

  const selectedCountry = localeSearchEngine.getCountryByCode(selectedCountryCode);
  const selectedLanguage = localeSearchEngine.getLanguageByCode(selectedLanguageCode);
  const selectedInterfaceLanguage = LANGUAGES[selectedInterfaceLanguageCode];
  const selectedCountryDisplayName = selectedCountry
    ? localeSearchEngine.getCountryDisplayName(selectedCountry.code, selectedInterfaceLanguageCode)
    : '';
  const currentStepNumber = Math.max(steps.indexOf(step) + 1, 1);
  const isFinalStep = step === steps[steps.length - 1];
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );
  const bibleLanguageListState = useMemo(() => getInitialBibleLanguageListState(mode), [mode]);

  const visibleTranslations = useMemo(
    () =>
      getVisibleTranslationsForPicker(translations, {
        isHydratingRuntimeCatalog,
        hasHydratedRuntimeCatalog,
      }),
    [hasHydratedRuntimeCatalog, isHydratingRuntimeCatalog, translations]
  );

  // Compute audio availability + selection state ONCE per translation, keyed by
  // id. Previously this ran inside the eligibility filter AND again inside every
  // row render (on every keystroke), so a large catalog recomputed it hundreds
  // of times per render. Memoized on visibleTranslations only.
  const translationDisplayDataById = useMemo(() => {
    const map = new Map<
      string,
      {
        availability: ReturnType<typeof getAudioAvailability>;
        selectionState: ReturnType<typeof getTranslationSelectionState>;
      }
    >();

    for (const translation of visibleTranslations) {
      const availability = getAudioAvailability({
        featureEnabled: config.features.audioEnabled,
        translationHasAudio: translation.hasAudio,
        remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
        downloadedAudioBooks: translation.downloadedAudioBooks,
      });
      const selectionState = getTranslationSelectionState({
        isDownloaded: translation.isDownloaded,
        hasText: translation.hasText,
        hasAudio: translation.hasAudio,
        canPlayAudio: availability.canPlayAudio,
        hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
        source: translation.source,
        textPackLocalPath: translation.textPackLocalPath,
      });
      map.set(translation.id, { availability, selectionState });
    }

    return map;
  }, [visibleTranslations]);

  const eligibleOnboardingTranslations = useMemo(() => {
    return visibleTranslations.filter((translation) => {
      const selectionState = translationDisplayDataById.get(translation.id)?.selectionState;
      return (
        selectionState?.isSelectable === true || selectionState?.reason === 'download-required'
      );
    });
  }, [translationDisplayDataById, visibleTranslations]);
  const onboardingLanguageOptions = useMemo(() => {
    const matchingTranslations = filterTranslationsBySearchQuery(
      eligibleOnboardingTranslations,
      debouncedTranslationQuery
    );

    return buildInitialOnboardingLanguageOptions(matchingTranslations);
  }, [eligibleOnboardingTranslations, debouncedTranslationQuery]);
  const onboardingLanguageSections = useMemo(() => {
    const sections: Array<{
      groupLabel: string;
      options: Array<InitialOnboardingLanguageOption<BibleTranslation>>;
    }> = [];

    for (const option of onboardingLanguageOptions) {
      const currentSection = sections[sections.length - 1];
      if (currentSection?.groupLabel === option.groupLabel) {
        currentSection.options.push(option);
      } else {
        sections.push({ groupLabel: option.groupLabel, options: [option] });
      }
    }

    return sections;
  }, [onboardingLanguageOptions]);
  const recommendedOnboardingLanguageOptions = useMemo(() => {
    if (mode !== 'initial') {
      return [];
    }

    const normalizedDeviceCountryCode = deviceCountryCode?.toUpperCase() ?? null;
    const scoreOption = (option: InitialOnboardingLanguageOption<BibleTranslation>) => {
      const translation = option.primaryTranslation;
      const translationLanguage = localeSearchEngine.getLanguageByName(translation.language);
      const normalizedTranslationLanguage = normalizeTranslationLanguage(
        translation.language
      ).toLowerCase();
      let score = 0;

      if (translationLanguage?.iso6391 === deviceLanguageCode) {
        score -= 500;
      }

      if (translationLanguage?.iso6391 === selectedInterfaceLanguageCode) {
        score -= 300;
      }

      if (
        normalizedDeviceCountryCode &&
        translationLanguage?.countryCodes.includes(normalizedDeviceCountryCode)
      ) {
        score -= 250;
      }

      if (normalizedTranslationLanguage === 'english' && translation.id.toLowerCase() === 'bsb') {
        score -= 100;
      }

      if (translation.isDownloaded) {
        score -= 60;
      }

      if (translation.hasText) {
        score -= 40;
      }

      if (translation.hasAudio) {
        score -= 20;
      }

      return score;
    };

    // Precompute each option's score once rather than recomputing it twice per
    // comparison inside sort().
    const scoreByKey = new Map<string, number>();
    for (const option of onboardingLanguageOptions) {
      scoreByKey.set(option.key, scoreOption(option));
    }

    return [...onboardingLanguageOptions]
      .sort((left, right) => {
        const scoreDelta = (scoreByKey.get(left.key) ?? 0) - (scoreByKey.get(right.key) ?? 0);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        // Plain code-point compare for the tiebreak instead of ICU
        // localeCompare: this sort runs on every keystroke, and localeCompare
        // is a slow ICU call on Hermes (no JIT). The tiebreak only needs a
        // stable deterministic order, not linguistic collation.
        if (left.label < right.label) {
          return -1;
        }
        if (left.label > right.label) {
          return 1;
        }
        return 0;
      })
      .slice(0, 5);
  }, [
    deviceCountryCode,
    deviceLanguageCode,
    mode,
    onboardingLanguageOptions,
    selectedInterfaceLanguageCode,
  ]);
  const primaryOnboardingLanguageOption =
    recommendedOnboardingLanguageOptions[0] ?? onboardingLanguageOptions[0] ?? null;

  const countryResults = useMemo(
    () =>
      step === 'country'
        ? localeSearchEngine.searchCountries(debouncedCountryQuery, selectedInterfaceLanguageCode)
        : [],
    [debouncedCountryQuery, selectedInterfaceLanguageCode, step]
  );

  const languageResults = useMemo(
    () =>
      step === 'contentLanguage'
        ? localeSearchEngine.searchLanguages(debouncedLanguageQuery, selectedCountryCode, 30)
        : { recommended: [], global: [] },
    [debouncedLanguageQuery, selectedCountryCode, step]
  );
  // Pre-warm the locale search engine off the interaction/render critical path.
  // The engine's first use (129 KB catalog require + ICU sorts + Fuse build) is
  // otherwise paid synchronously on the first country-step render or first
  // keystroke. Running it after interactions on mount moves that cost earlier
  // and off the hot path. Idempotent — safe if the engine was already resolved.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      prewarmLocaleSearchEngine();
    });

    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (mode !== 'initial' || hasHydratedRuntimeCatalog) {
      setIsHydratingRuntimeCatalog(false);
      setRuntimeCatalogLoadFailed(false);
      return;
    }

    let isMounted = true;
    setIsHydratingRuntimeCatalog(true);
    setRuntimeCatalogLoadFailed(false);

    void waitForRuntimeCatalogHydration(() => ensureRuntimeCatalogLoaded())
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (result !== 'loaded') {
          console.warn('[Onboarding] Failed to hydrate runtime translation catalog:', result);
          setRuntimeCatalogLoadFailed(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsHydratingRuntimeCatalog(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasHydratedRuntimeCatalog, mode, runtimeCatalogHydrationAttempt]);

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

  const resolveTranslationLanguage = (translation: BibleTranslation): LocaleLanguage | null => {
    return localeSearchEngine.getLanguageByName(translation.language);
  };

  const completeInitialSetup = async (translation: BibleTranslation) => {
    const translationLanguage = resolveTranslationLanguage(translation);
    const interfaceLanguageCode = selectedInterfaceLanguageCode;
    const deviceCountry = localeSearchEngine.getCountryByCode(deviceCountryCode);

    await changeLanguage(interfaceLanguageCode);
    setPreferredTranslationLanguage(normalizeTranslationLanguage(translation.language));
    setCurrentTranslation(translation.id);

    setPreferences({
      language: interfaceLanguageCode,
      countryCode: deviceCountry?.code ?? null,
      countryName: deviceCountry?.name ?? null,
      contentLanguageCode: translationLanguage?.code ?? null,
      contentLanguageName:
        translationLanguage?.name ?? normalizeTranslationLanguage(translation.language),
      contentLanguageNativeName:
        translationLanguage?.nativeName ?? normalizeTranslationLanguage(translation.language),
      onboardingCompleted: true,
    });

    syncPreferencesAfterOnboarding();
    onComplete?.();
  };

  const handleTranslationSelectImpl = async (translation: BibleTranslation) => {
    const availability = getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
      downloadedAudioBooks: translation.downloadedAudioBooks,
    });
    const selectionState = getTranslationSelectionState({
      isDownloaded: translation.isDownloaded,
      hasText: translation.hasText,
      hasAudio: translation.hasAudio,
      canPlayAudio: availability.canPlayAudio,
      hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
      source: translation.source,
      textPackLocalPath: translation.textPackLocalPath,
    });

    if (selectionState.reason === 'download-required') {
      try {
        setInstallingTranslationId(translation.id);
        await downloadTranslation(translation.id);
        const installedTranslation =
          useBibleStore
            .getState()
            .translations.find((candidate) => candidate.id === translation.id) ?? translation;
        await completeInitialSetup(installedTranslation);
      } catch (error) {
        const fallbackTranslation = resolveRegionalFallbackTranslation(
          useBibleStore.getState().translations,
          translation,
          deviceCountryCode
        );
        if (fallbackTranslation) {
          await completeInitialSetup(fallbackTranslation);
          return;
        }

        Alert.alert(
          t('common.error'),
          error instanceof Error ? error.message : t('bible.failedToLoad'),
          [{ text: t('common.ok') }]
        );
      } finally {
        setInstallingTranslationId(null);
      }
      return;
    }

    if (selectionState.isSelectable) {
      await completeInitialSetup(translation);
      return;
    }

    const fallbackTranslation = resolveRegionalFallbackTranslation(
      useBibleStore.getState().translations,
      translation,
      deviceCountryCode
    );
    if (fallbackTranslation) {
      await completeInitialSetup(fallbackTranslation);
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: translation.name }),
      [{ text: t('common.ok') }]
    );
  };

  // Keep a stable onPress identity for the memoized onboarding rows while always
  // invoking the latest handler implementation (which closes over changing
  // render state). Without this, a fresh handler each render would defeat
  // React.memo's shallow prop compare.
  const handleTranslationSelectRef = useRef(handleTranslationSelectImpl);
  handleTranslationSelectRef.current = handleTranslationSelectImpl;
  const handleTranslationSelect = useCallback((translation: BibleTranslation) => {
    void handleTranslationSelectRef.current(translation);
  }, []);

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
    const nextStep = steps[steps.indexOf(step) + 1];
    if (nextStep) {
      setStep(nextStep);
    }
  };

  const goToPreviousStep = () => {
    const previousStep = steps[steps.indexOf(step) - 1];
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

  const handleInterfaceLanguageSelect = async (language: Language) => {
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

  const renderInterfaceLanguageButton = (language: Language) => {
    const isSelected = selectedInterfaceLanguageCode === language.code;

    return (
      <TouchableOpacity
        key={language.code}
        style={[
          styles.languageButton,
          {
            backgroundColor: isSelected ? colors.accentGreen + '18' : colors.cardBackground,
            borderColor: isSelected ? colors.accentGreen : colors.cardBorder,
          },
        ]}
        onPress={() => void handleInterfaceLanguageSelect(language)}
        activeOpacity={0.85}
      >
        <Text style={[styles.languageButtonNative, { color: colors.primaryText }]}>
          {language.nativeName}
        </Text>
        {language.nativeName !== language.name ? (
          <Text style={[styles.languageButtonEnglish, { color: colors.secondaryText }]}>
            {language.name}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderOnboardingLanguageRow = (
    option: InitialOnboardingLanguageOption<BibleTranslation>,
    isRecommended = false
  ) => {
    const translation = option.primaryTranslation;
    const isInstalling = installingTranslationId === translation.id;
    const progress =
      downloadProgress?.translationId === translation.id ? downloadProgress.progress : null;
    // Read precomputed availability/selection state (computed once per
    // translation in translationDisplayDataById) instead of recomputing per row.
    const selectionState =
      translationDisplayDataById.get(translation.id)?.selectionState ??
      getTranslationSelectionState({
        isDownloaded: translation.isDownloaded,
        hasText: translation.hasText,
        hasAudio: translation.hasAudio,
        canPlayAudio: false,
        hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
        source: translation.source,
        textPackLocalPath: translation.textPackLocalPath,
      });
    const statusLabel =
      selectionState.reason === 'download-required'
        ? t('translations.download')
        : t('common.continue');
    const translationLabel = translation.abbreviation
      ? `${translation.name} (${translation.abbreviation})`
      : translation.name;

    return (
      <OnboardingLanguageRow
        key={option.key}
        translation={translation}
        optionLabel={option.label}
        translationLabel={translationLabel}
        availabilitySummary={getTranslationAvailabilitySummary(translation, t)}
        statusLabel={statusLabel}
        recommendedBadgeLabel={t('onboarding.recommendedBadge')}
        downloadingLabel={t('translations.downloading')}
        isRecommended={isRecommended}
        isInstalling={isInstalling}
        progress={progress}
        colors={colors}
        onPress={handleTranslationSelect}
      />
    );
  };

  const renderCountryRow = (countryCode: string) => {
    const isSelected = selectedCountryCode === countryCode;
    const countryName = localeSearchEngine.getCountryDisplayName(
      countryCode,
      selectedInterfaceLanguageCode
    );

    return (
      <CountryRow
        key={countryCode}
        countryCode={countryCode}
        countryName={countryName}
        isSelected={isSelected}
        colors={colors}
        onSelect={handleCountrySelect}
      />
    );
  };

  const renderLanguageRow = (language: LocaleLanguage, isRecommended: boolean) => {
    const isSelected = selectedLanguageCode === language.code;

    return (
      <LanguageRow
        key={`${isRecommended ? 'recommended' : 'global'}-${language.code}`}
        language={language}
        isRecommended={isRecommended}
        isSelected={isSelected}
        recommendedBadgeLabel={t('onboarding.recommendedBadge')}
        colors={colors}
        onSelect={handleLanguageSelect}
      />
    );
  };

  const stepSubtitle =
    mode === 'initial'
      ? ''
      : t('onboarding.stepProgress', {
          current: currentStepNumber,
          count: totalSteps,
        });
  const canUseHeaderBack = mode === 'settings' || step !== steps[0];
  const handleHeaderBack = () => {
    if (mode === 'settings') {
      onClose?.();
      return;
    }

    goToPreviousStep();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        {canUseHeaderBack ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleHeaderBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="arrow-back" size={22} color={colors.primaryText} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}

        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
            {t(titleKey ?? 'onboarding.title')}
          </Text>
          {stepSubtitle ? (
            <Text style={[styles.headerStep, { color: colors.secondaryText }]}>{stepSubtitle}</Text>
          ) : null}
        </View>

        {mode === 'settings' ? (
          <TouchableOpacity style={styles.headerButton} onPress={completeSetup}>
            <Text style={[styles.headerAction, { color: colors.accentGreen }]}>
              {t('common.done')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'interfaceLanguage' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.interfaceLanguageTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.interfaceLanguageBody')}
            </Text>

            <View style={styles.languageButtonGrid}>
              {SUPPORTED_LANGUAGES.map((language) => renderInterfaceLanguageButton(language))}
            </View>
          </>
        ) : step === 'translation' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.languageTitle')}
            </Text>

            {mode === 'initial' ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.inlinePreferenceButton,
                    { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                  ]}
                  testID="onboarding-interface-language-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={selectedInterfaceLanguage.appLanguageLabel}
                  onPress={() => setShowInterfaceLanguagePicker((isVisible) => !isVisible)}
                  activeOpacity={0.85}
                >
                  <View style={styles.inlinePreferenceCopy}>
                    <Text style={[styles.inlinePreferenceLabel, { color: colors.secondaryText }]}>
                      {selectedInterfaceLanguage.appLanguageLabel}
                    </Text>
                    <Text style={[styles.inlinePreferenceValue, { color: colors.primaryText }]}>
                      {selectedInterfaceLanguage.nativeName}
                    </Text>
                  </View>
                  <Ionicons
                    name={showInterfaceLanguagePicker ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.secondaryText}
                  />
                </TouchableOpacity>

                {showInterfaceLanguagePicker ? (
                  <View
                    style={styles.languageButtonGrid}
                    testID="onboarding-interface-language-inline-picker"
                  >
                    {SUPPORTED_LANGUAGES.map((language) => renderInterfaceLanguageButton(language))}
                  </View>
                ) : null}
              </>
            ) : null}

            {bibleLanguageListState.showsSearch ? (
              <TextInput
                value={translationQuery}
                onChangeText={setTranslationQuery}
                testID="onboarding-translation-search"
                accessibilityLabel={t('onboarding.languageSearchPlaceholder')}
                placeholder={t('onboarding.languageSearchPlaceholder')}
                placeholderTextColor={colors.secondaryText}
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                    color: colors.primaryText,
                  },
                ]}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : null}

            {isHydratingRuntimeCatalog ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.accentGreen} />
              </View>
            ) : null}

            {runtimeCatalogLoadFailed ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
                  {t('common.somethingWentWrong')}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                  {t('onboarding.noLanguagesFoundBody')}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.secondaryWideButton,
                    { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                  ]}
                  testID="onboarding-runtime-catalog-retry"
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  onPress={() =>
                    setRuntimeCatalogHydrationAttempt((currentAttempt) => currentAttempt + 1)
                  }
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryWideButtonText, { color: colors.primaryText }]}>
                    {t('common.retry')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {mode === 'initial' && primaryOnboardingLanguageOption ? (
              <View testID="onboarding-primary-recommendation">
                {renderOnboardingLanguageRow(
                  primaryOnboardingLanguageOption,
                  bibleLanguageListState.pinsRecommendedOption
                )}
              </View>
            ) : null}

            {bibleLanguageListState.showsFullList
              ? onboardingLanguageSections.map((section) => {
                  const sectionOptions =
                    mode === 'initial' && primaryOnboardingLanguageOption
                      ? section.options.filter(
                          (option) => option.key !== primaryOnboardingLanguageOption.key
                        )
                      : section.options;

                  if (sectionOptions.length === 0) {
                    return null;
                  }

                  return (
                    <View key={section.groupLabel} style={styles.listSection}>
                      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
                        {section.groupLabel}
                      </Text>
                      {sectionOptions.map((option) => renderOnboardingLanguageRow(option))}
                    </View>
                  );
                })
              : null}

            {!isHydratingRuntimeCatalog && onboardingLanguageOptions.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
                  {t('onboarding.noLanguagesFound')}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                  {t('onboarding.noLanguagesFoundBody')}
                </Text>
              </View>
            ) : null}
          </>
        ) : step === 'country' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.countryTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.countryBody')}
            </Text>

            <TextInput
              value={countryQuery}
              onChangeText={setCountryQuery}
              testID="onboarding-country-search"
              accessibilityLabel={t('onboarding.countrySearchPlaceholder')}
              placeholder={t('onboarding.countrySearchPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                  color: colors.primaryText,
                },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <View style={styles.listSection}>
              {countryResults.map((country) => renderCountryRow(country.code))}
            </View>
          </>
        ) : step === 'contentLanguage' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.languageTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.languageBody', {
                country: selectedCountryDisplayName || t('common.notSet'),
              })}
            </Text>

            <View style={styles.countryPillRow}>
              <TouchableOpacity
                style={[
                  styles.countryPill,
                  { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                ]}
                onPress={() => goToStep('country')}
              >
                <Ionicons name="location-outline" size={16} color={colors.accentGreen} />
                {selectedCountry ? (
                  <Text style={styles.pillFlagEmoji}>{getFlagEmoji(selectedCountry.code)}</Text>
                ) : null}
                <Text style={[styles.countryPillText, { color: colors.primaryText }]}>
                  {selectedCountryDisplayName}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={languageQuery}
              onChangeText={setLanguageQuery}
              testID="onboarding-language-search"
              accessibilityLabel={t('onboarding.languageSearchPlaceholder')}
              placeholder={t('onboarding.languageSearchPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                  color: colors.primaryText,
                },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {languageResults.recommended.length > 0 ? (
              <View style={styles.listSection}>
                <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
                  {t('onboarding.recommendedLanguages', {
                    country: selectedCountryDisplayName,
                  })}
                </Text>
                {languageResults.recommended.map((language) => renderLanguageRow(language, true))}
              </View>
            ) : null}

            {languageResults.global.length > 0 ? (
              <View style={styles.listSection}>
                <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
                  {t('onboarding.moreLanguages')}
                </Text>
                {languageResults.global.map((language) => renderLanguageRow(language, false))}
              </View>
            ) : null}

            {languageResults.recommended.length === 0 && languageResults.global.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
                  {t('onboarding.noLanguagesFound')}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                  {t('onboarding.noLanguagesFoundBody')}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {mode === 'settings' ? (
        <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
          {step !== steps[0] ? (
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
              testID="onboarding-secondary-action"
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={goToPreviousStep}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.primaryText }]}>
                {t('common.back')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerSpacer} />
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.bibleControlBackground,
                opacity:
                  step === 'country' ? (selectedCountry ? 1 : 0.45) : selectedLanguage ? 1 : 0.45,
              },
            ]}
            testID="onboarding-primary-action"
            accessibilityRole="button"
            accessibilityLabel={isFinalStep ? t('onboarding.finish') : t('common.continue')}
            onPress={async () => {
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
                return;
              }
            }}
            disabled={step === 'country' ? !selectedCountry : !selectedLanguage}
          >
            <Text style={[styles.primaryButtonText, { color: colors.bibleBackground }]}>
              {isFinalStep ? t('onboarding.finish') : t('common.continue')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 56,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerCopy: {
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerStep: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerAction: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  languageButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  languageButton: {
    minWidth: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 3,
  },
  languageButtonNative: {
    fontSize: 16,
    fontWeight: '700',
  },
  languageButtonEnglish: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlinePreferenceButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlinePreferenceCopy: {
    flex: 1,
    gap: 3,
  },
  inlinePreferenceLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  inlinePreferenceValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryWideButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryWideButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  loadingRow: {
    paddingTop: 20,
  },
  listSection: {
    marginTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  downloadProgress: {
    width: 72,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionCopy: {
    flex: 1,
    gap: 4,
  },
  countryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  flagEmoji: {
    fontSize: 20,
  },
  optionMeta: {
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countryPillRow: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  countryPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillFlagEmoji: {
    fontSize: 16,
  },
  emptyCard: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    gap: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1.35,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
