import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  Search,
} from 'lucide-react-native';
import * as Localization from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { layout, radius, spacing, typography } from '../../design/system';
import { AppButton, AppCard, IconButton, PressableScale, ProgressBar } from '../../components/ui';
// Import the hooks from their own modules rather than the hooks barrel: the
// barrel re-exports useSync, which transitively evaluates the Supabase client.
// A barrel import here would undo the deferred-import work below.
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { useKeyboardBottomInset } from '../../hooks/useKeyboardBottomInset';
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

// Debounce a rapidly-changing value (search query text) so downstream result
// memos and the row lists only recompute ~150ms after the user stops typing,
// rather than on every keystroke. The TextInput keeps binding the raw value so
// typing still feels immediate; only the expensive filtering/search follows the
// debounced value.
const SEARCH_DEBOUNCE_MS = 150;

// EL geometry for this screen. The step bar is a fixed 120pt rail regardless of
// how many segments it carries, so the header reads the same on every step.
const STEP_BAR_WIDTH = 120;
const STEP_BAR_HEIGHT = 3;
const SEARCH_FIELD_HEIGHT = 46;
const ROW_MIN_HEIGHT = 54;
const RADIO_SIZE = 22;
const SUGGESTED_MARK_SIZE = 24;
// Fallback footer height used for the first frame, before onLayout reports the
// real one: 24 top pad + 50 pill + 8 gap + 15 hint + 16 bottom pad.
const ESTIMATED_FOOTER_HEIGHT = 113;

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

// The 22pt selection mark used by every option row: a hairline ring when empty,
// an accent disc with a check when chosen. Never a tinted row background — the
// EL system reserves fills for chips and the accent rule.
interface SelectionMarkProps {
  isSelected: boolean;
  colors: ThemeColors;
  size?: number;
}

function SelectionMark({ isSelected, colors, size = RADIO_SIZE }: SelectionMarkProps) {
  if (isSelected) {
    return (
      <View
        style={[
          styles.selectionMark,
          { width: size, height: size, borderRadius: size / 2 },
          { backgroundColor: colors.accentPrimary },
        ]}
      >
        <Check size={14} color={colors.onAccent} strokeWidth={2} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.selectionMark,
        styles.selectionMarkEmpty,
        { width: size, height: size, borderRadius: size / 2 },
        { borderColor: colors.borderStrong },
      ]}
    />
  );
}

// One row recipe for every list on this flow: title over subtitle on the left,
// a caller-supplied trailing slot on the right, hairline dividers between rows,
// and the 1pt EL press translate.
interface OptionRowProps {
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  isLast?: boolean;
  disabled?: boolean;
  colors: ThemeColors;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
}

function OptionRow({
  title,
  subtitle,
  trailing,
  isLast = false,
  disabled = false,
  colors,
  accessibilityLabel,
  testID,
  onPress,
}: OptionRowProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      pressEffect="translate"
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
      style={[
        styles.optionRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderStrong },
      ]}
    >
      <View style={styles.optionRowCopy}>
        <Text style={[styles.optionRowTitle, { color: colors.primaryText }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.optionRowSubtitle, { color: colors.secondaryText }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </PressableScale>
  );
}

// Soft status chip — "SUGGESTED", "RECOMMENDED", "DOWNLOAD". Accent surface fill
// with its own foreground token so it stays legible in both scopes.
interface StatusChipProps {
  label: string;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
}

function StatusChip({ label, colors, eyebrowFont }: StatusChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: colors.accentSurface }]}>
      <Text style={[typography.monoSmall, eyebrowFont, { color: colors.onAccentSurface }]}>
        {label}
      </Text>
    </View>
  );
}

interface SectionEyebrowProps {
  label: string;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
}

function SectionEyebrow({ label, colors, eyebrowFont }: SectionEyebrowProps) {
  return (
    <Text
      style={[
        typography.eyebrow,
        eyebrowFont,
        styles.sectionEyebrow,
        { color: colors.secondaryText },
      ]}
    >
      {label}
    </Text>
  );
}

// Row components are extracted and memoized (keyed by stable id) so a keystroke
// that only changes one row's selection — or leaves the visible set unchanged —
// doesn't re-render every row in the non-virtualized ScrollView. Props are kept
// primitive/stable (precomputed labels + a stable onSelect callback) so
// React.memo's shallow compare actually skips unchanged rows.
interface CountryRowProps {
  countryCode: string;
  countryName: string;
  countrySubtitle: string;
  isSelected: boolean;
  isLast: boolean;
  colors: ThemeColors;
  onSelect: (countryCode: string) => void;
}

const CountryRow = memo(function CountryRow({
  countryCode,
  countryName,
  countrySubtitle,
  isSelected,
  isLast,
  colors,
  onSelect,
}: CountryRowProps) {
  return (
    <OptionRow
      title={countryName}
      subtitle={countrySubtitle}
      isLast={isLast}
      colors={colors}
      trailing={<SelectionMark isSelected={isSelected} colors={colors} />}
      onPress={() => onSelect(countryCode)}
    />
  );
});

interface LanguageRowProps {
  language: LocaleLanguage;
  isRecommended: boolean;
  isSelected: boolean;
  isLast: boolean;
  recommendedBadgeLabel: string;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
  onSelect: (languageCode: string) => void;
}

const LanguageRow = memo(function LanguageRow({
  language,
  isRecommended,
  isSelected,
  isLast,
  recommendedBadgeLabel,
  colors,
  eyebrowFont,
  onSelect,
}: LanguageRowProps) {
  return (
    <OptionRow
      title={language.nativeName}
      subtitle={language.name}
      isLast={isLast}
      colors={colors}
      trailing={
        <View style={styles.optionRowTrailing}>
          {isRecommended ? (
            <StatusChip label={recommendedBadgeLabel} colors={colors} eyebrowFont={eyebrowFont} />
          ) : null}
          <SelectionMark isSelected={isSelected} colors={colors} />
        </View>
      }
      onPress={() => onSelect(language.code)}
    />
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
  isLast: boolean;
  progress: number | null;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
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
  isLast,
  progress,
  colors,
  eyebrowFont,
  onPress,
}: OnboardingLanguageRowProps) {
  const trailing = isInstalling ? (
    progress != null ? (
      <View style={styles.downloadProgress}>
        <ProgressBar progress={progress / 100} />
      </View>
    ) : (
      <ActivityIndicator color={colors.accentPrimary} />
    )
  ) : (
    <View style={styles.optionRowTrailing}>
      <StatusChip
        label={isRecommended ? recommendedBadgeLabel : statusLabel}
        colors={colors}
        eyebrowFont={eyebrowFont}
      />
      <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2} />
    </View>
  );

  return (
    <OptionRow
      title={optionLabel}
      subtitle={
        isInstalling && progress != null
          ? `${downloadingLabel} ${progress}%`
          : `${translationLabel} · ${availabilitySummary}`
      }
      isLast={isLast}
      disabled={isInstalling}
      colors={colors}
      trailing={trailing}
      onPress={() => onPress(translation)}
    />
  );
});

interface InterfaceLanguageRowProps {
  language: Language;
  isSelected: boolean;
  isLast: boolean;
  colors: ThemeColors;
  onSelect: (language: Language) => void;
}

const InterfaceLanguageRow = memo(function InterfaceLanguageRow({
  language,
  isSelected,
  isLast,
  colors,
  onSelect,
}: InterfaceLanguageRowProps) {
  return (
    <OptionRow
      title={language.nativeName}
      subtitle={language.nativeName !== language.name ? language.name : null}
      isLast={isLast}
      colors={colors}
      accessibilityLabel={language.appLanguageLabel}
      trailing={<SelectionMark isSelected={isSelected} colors={colors} />}
      onPress={() => onSelect(language)}
    />
  );
});

export function LocaleSetupFlow({ mode = 'initial', onClose, onComplete }: LocaleSetupFlowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  const keyboardBottomInset = useKeyboardBottomInset();
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
  const [footerHeight, setFooterHeight] = useState(ESTIMATED_FOOTER_HEIGHT);

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

  const countryCatalogSize = useMemo(
    () => (step === 'country' ? localeSearchEngine.countries.length : 0),
    [step]
  );

  // The device-suggested nation is pinned above the list while the search field
  // is empty; once the user searches, the results speak for themselves.
  const suggestedCountry = useMemo(
    () =>
      step === 'country' && !debouncedCountryQuery.trim()
        ? localeSearchEngine.getCountryByCode(deviceCountryCode)
        : null,
    [debouncedCountryQuery, deviceCountryCode, step]
  );

  const listedCountries = useMemo(
    () =>
      suggestedCountry
        ? countryResults.filter((country) => country.code !== suggestedCountry.code)
        : countryResults,
    [countryResults, suggestedCountry]
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
      } catch {
        const fallbackTranslation = resolveRegionalFallbackTranslation(
          useBibleStore.getState().translations,
          translation,
          deviceCountryCode
        );
        if (fallbackTranslation) {
          await completeInitialSetup(fallbackTranslation);
          return;
        }

        Alert.alert(t('common.error'), t('bible.failedToLoad'), [{ text: t('common.ok') }]);
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

  const renderInterfaceLanguageList = (testID?: string) => (
    <View testID={testID}>
      <AppCard padding={0}>
        {SUPPORTED_LANGUAGES.map((language, index) => (
          <InterfaceLanguageRow
            key={language.code}
            language={language}
            isSelected={selectedInterfaceLanguageCode === language.code}
            isLast={index === SUPPORTED_LANGUAGES.length - 1}
            colors={colors}
            onSelect={handleInterfaceLanguageSelect}
          />
        ))}
      </AppCard>
    </View>
  );

  const renderOnboardingLanguageRow = (
    option: InitialOnboardingLanguageOption<BibleTranslation>,
    isRecommended = false,
    isLast = true
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
        isLast={isLast}
        progress={progress}
        colors={colors}
        eyebrowFont={displayFont.regular}
        onPress={handleTranslationSelect}
      />
    );
  };

  // "Nepal · 123 languages" under the localized nation name. The English name is
  // dropped when it is the same string the title already shows.
  const getCountrySubtitle = (countryCode: string, displayName: string): string => {
    const country = localeSearchEngine.getCountryByCode(countryCode);
    const languageCount = t('onboarding.countryLanguageCount', {
      count: country?.languageCodes.length ?? 0,
    });

    return country && country.name !== displayName
      ? `${country.name} · ${languageCount}`
      : languageCount;
  };

  const renderCountryRow = (countryCode: string, isLast: boolean) => {
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
        countrySubtitle={getCountrySubtitle(countryCode, countryName)}
        isSelected={isSelected}
        isLast={isLast}
        colors={colors}
        onSelect={handleCountrySelect}
      />
    );
  };

  const renderLanguageRow = (language: LocaleLanguage, isRecommended: boolean, isLast: boolean) => {
    const isSelected = selectedLanguageCode === language.code;

    return (
      <LanguageRow
        key={`${isRecommended ? 'recommended' : 'global'}-${language.code}`}
        language={language}
        isRecommended={isRecommended}
        isSelected={isSelected}
        isLast={isLast}
        recommendedBadgeLabel={t('onboarding.recommendedBadge')}
        colors={colors}
        eyebrowFont={displayFont.regular}
        onSelect={handleLanguageSelect}
      />
    );
  };

  const renderSearchField = (
    value: string,
    onChangeText: (next: string) => void,
    placeholder: string,
    testID: string
  ) => (
    <View
      style={[
        styles.searchField,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <Search size={17} color={colors.secondaryText} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        testID={testID}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryText}
        style={[styles.searchInput, { color: colors.primaryText }]}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );

  const renderEmptyCard = (title: string, body: string, retry?: () => void) => (
    <AppCard padding={layout.cardPaddingWide} style={styles.emptyCard}>
      <Text style={[typography.cardTitle, { color: colors.primaryText }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>{body}</Text>
      {retry ? (
        <View style={styles.emptyCta} testID="onboarding-runtime-catalog-retry">
          <AppButton
            label={t('common.retry')}
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={retry}
          />
        </View>
      ) : null}
    </AppCard>
  );

  const canUseHeaderBack = mode === 'settings' || step !== steps[0];
  const showStepProgress = totalSteps > 1;
  const handleHeaderBack = () => {
    if (mode === 'settings') {
      onClose?.();
      return;
    }

    goToPreviousStep();
  };

  const suggestedCountryName = suggestedCountry
    ? localeSearchEngine.getCountryDisplayName(suggestedCountry.code, selectedInterfaceLanguageCode)
    : '';

  const isCountryStep = step === 'country';
  const canAdvance = isCountryStep ? Boolean(selectedCountry) : Boolean(selectedLanguage);
  const primaryActionLabel = isCountryStep
    ? selectedCountry
      ? t('onboarding.continueWithNation', { name: selectedCountryDisplayName })
      : t('common.continue')
    : isFinalStep
      ? t('onboarding.finish')
      : t('common.continue');
  // The iOS keyboard frame includes the home-indicator inset that SafeAreaView
  // already reserves, so subtract it or the footer floats too high.
  const keyboardOffset = Math.max(0, keyboardBottomInset - insets.bottom);
  const showFooter = mode === 'settings';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {canUseHeaderBack ? (
            <IconButton
              icon={ArrowLeft}
              onPress={handleHeaderBack}
              accessibilityLabel={t('common.back')}
            />
          ) : null}
        </View>

        <View style={styles.headerCenter}>
          {showStepProgress ? (
            <>
              <Text
                style={[typography.eyebrow, displayFont.regular, { color: colors.secondaryText }]}
              >
                {t('onboarding.stepEyebrow', { step: currentStepNumber, total: totalSteps })}
              </Text>
              <View style={styles.stepBar}>
                {steps.map((stepKey, index) => (
                  <View
                    key={stepKey}
                    style={[
                      styles.stepSegment,
                      {
                        backgroundColor:
                          index < currentStepNumber ? colors.accentPrimary : colors.borderStrong,
                      },
                    ]}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View style={[styles.headerSide, styles.headerSideEnd]}>
          {mode === 'settings' ? (
            <TouchableOpacity
              onPress={() => void completeSetup()}
              accessibilityRole="button"
              accessibilityLabel={t('common.done')}
              hitSlop={12}
            >
              <Text style={[typography.captionStrong, { color: colors.accentPrimary }]}>
                {t('common.done')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (showFooter ? footerHeight : 0) + keyboardOffset + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {step === 'interfaceLanguage' ? (
          <>
            <Text style={[styles.heroTitle, displayFont.bold, { color: colors.primaryText }]}>
              {t('onboarding.interfaceLanguageTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.interfaceLanguageBody')}
            </Text>

            <SectionEyebrow
              label={t('onboarding.availableInterfaceLanguages')}
              colors={colors}
              eyebrowFont={displayFont.regular}
            />
            {renderInterfaceLanguageList()}
          </>
        ) : step === 'translation' ? (
          <>
            <Text style={[styles.heroTitle, displayFont.bold, { color: colors.primaryText }]}>
              {t('onboarding.languageTitle')}
            </Text>

            {mode === 'initial' ? (
              <>
                <View testID="onboarding-interface-language-toggle">
                  <AppCard
                    pressable
                    padding={14}
                    style={styles.inlinePreferenceCard}
                    accessibilityLabel={selectedInterfaceLanguage.appLanguageLabel}
                    onPress={() => setShowInterfaceLanguagePicker((isVisible) => !isVisible)}
                  >
                    <View style={styles.inlinePreferenceRow}>
                      <View style={styles.inlinePreferenceCopy}>
                        <Text
                          style={[
                            typography.eyebrow,
                            displayFont.regular,
                            { color: colors.secondaryText },
                          ]}
                        >
                          {selectedInterfaceLanguage.appLanguageLabel}
                        </Text>
                        <Text style={[styles.inlinePreferenceValue, { color: colors.primaryText }]}>
                          {selectedInterfaceLanguage.nativeName}
                        </Text>
                      </View>
                      {showInterfaceLanguagePicker ? (
                        <ChevronUp size={18} color={colors.textTertiary} strokeWidth={2} />
                      ) : (
                        <ChevronDown size={18} color={colors.textTertiary} strokeWidth={2} />
                      )}
                    </View>
                  </AppCard>
                </View>

                {showInterfaceLanguagePicker
                  ? renderInterfaceLanguageList('onboarding-interface-language-inline-picker')
                  : null}
              </>
            ) : null}

            {bibleLanguageListState.showsSearch
              ? renderSearchField(
                  translationQuery,
                  setTranslationQuery,
                  t('onboarding.languageSearchPlaceholder'),
                  'onboarding-translation-search'
                )
              : null}

            {isHydratingRuntimeCatalog ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.accentPrimary} />
              </View>
            ) : null}

            {runtimeCatalogLoadFailed
              ? renderEmptyCard(
                  t('common.somethingWentWrong'),
                  t('onboarding.noLanguagesFoundBody'),
                  () => setRuntimeCatalogHydrationAttempt((currentAttempt) => currentAttempt + 1)
                )
              : null}

            {mode === 'initial' && primaryOnboardingLanguageOption ? (
              <View testID="onboarding-primary-recommendation">
                <SectionEyebrow
                  label={t('onboarding.recommendedBadge')}
                  colors={colors}
                  eyebrowFont={displayFont.regular}
                />
                <AppCard accentRule padding={0}>
                  {renderOnboardingLanguageRow(
                    primaryOnboardingLanguageOption,
                    bibleLanguageListState.pinsRecommendedOption
                  )}
                </AppCard>
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
                      <SectionEyebrow
                        label={section.groupLabel}
                        colors={colors}
                        eyebrowFont={displayFont.regular}
                      />
                      <AppCard padding={0}>
                        {sectionOptions.map((option, index) =>
                          renderOnboardingLanguageRow(
                            option,
                            false,
                            index === sectionOptions.length - 1
                          )
                        )}
                      </AppCard>
                    </View>
                  );
                })
              : null}

            {!isHydratingRuntimeCatalog && onboardingLanguageOptions.length === 0
              ? renderEmptyCard(
                  t('onboarding.noLanguagesFound'),
                  t('onboarding.noLanguagesFoundBody')
                )
              : null}
          </>
        ) : step === 'country' ? (
          <>
            <Text style={[styles.heroTitle, displayFont.bold, { color: colors.primaryText }]}>
              {t('onboarding.countryTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.countryBody')}
            </Text>

            {renderSearchField(
              countryQuery,
              setCountryQuery,
              t('onboarding.countrySearchPlaceholderCount', { total: countryCatalogSize }),
              'onboarding-country-search'
            )}

            {suggestedCountry ? (
              <View style={styles.listSection}>
                <SectionEyebrow
                  label={t('onboarding.suggestedFromDevice')}
                  colors={colors}
                  eyebrowFont={displayFont.regular}
                />
                <AppCard
                  accentRule
                  pressable
                  padding={layout.cardPadding}
                  accessibilityLabel={suggestedCountryName}
                  onPress={() => handleCountrySelect(suggestedCountry.code)}
                >
                  <View style={styles.suggestedRow}>
                    <View style={styles.optionRowCopy}>
                      <Text
                        style={[styles.suggestedTitle, { color: colors.primaryText }]}
                        numberOfLines={1}
                      >
                        {suggestedCountryName}
                      </Text>
                      <Text
                        style={[styles.suggestedSubtitle, { color: colors.secondaryText }]}
                        numberOfLines={1}
                      >
                        {getCountrySubtitle(suggestedCountry.code, suggestedCountryName)}
                      </Text>
                    </View>
                    <StatusChip
                      label={t('onboarding.suggestedBadge')}
                      colors={colors}
                      eyebrowFont={displayFont.regular}
                    />
                    <SelectionMark
                      isSelected={selectedCountryCode === suggestedCountry.code}
                      colors={colors}
                      size={SUGGESTED_MARK_SIZE}
                    />
                  </View>
                </AppCard>
              </View>
            ) : null}

            <View style={styles.listSection}>
              <SectionEyebrow
                label={
                  debouncedCountryQuery.trim()
                    ? t('onboarding.searchResults')
                    : t('onboarding.allNations')
                }
                colors={colors}
                eyebrowFont={displayFont.regular}
              />
              {listedCountries.length > 0 ? (
                <AppCard padding={0}>
                  {listedCountries.map((country, index) =>
                    renderCountryRow(country.code, index === listedCountries.length - 1)
                  )}
                </AppCard>
              ) : (
                renderEmptyCard(t('onboarding.noNationsFound'), t('onboarding.noNationsFoundBody'))
              )}
            </View>
          </>
        ) : step === 'contentLanguage' ? (
          <>
            <Text style={[styles.heroTitle, displayFont.bold, { color: colors.primaryText }]}>
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
                accessibilityRole="button"
                accessibilityLabel={selectedCountryDisplayName}
                onPress={() => goToStep('country')}
                activeOpacity={0.85}
              >
                <MapPin size={16} color={colors.accentPrimary} strokeWidth={2} />
                {selectedCountry ? (
                  <Text style={styles.pillFlagEmoji}>{getFlagEmoji(selectedCountry.code)}</Text>
                ) : null}
                <Text style={[typography.captionStrong, { color: colors.primaryText }]}>
                  {selectedCountryDisplayName}
                </Text>
              </TouchableOpacity>
            </View>

            {renderSearchField(
              languageQuery,
              setLanguageQuery,
              t('onboarding.languageSearchPlaceholder'),
              'onboarding-language-search'
            )}

            {languageResults.recommended.length > 0 ? (
              <View style={styles.listSection}>
                <SectionEyebrow
                  label={t('onboarding.recommendedLanguages', {
                    country: selectedCountryDisplayName,
                  })}
                  colors={colors}
                  eyebrowFont={displayFont.regular}
                />
                <AppCard padding={0}>
                  {languageResults.recommended.map((language, index) =>
                    renderLanguageRow(
                      language,
                      true,
                      index === languageResults.recommended.length - 1
                    )
                  )}
                </AppCard>
              </View>
            ) : null}

            {languageResults.global.length > 0 ? (
              <View style={styles.listSection}>
                <SectionEyebrow
                  label={t('onboarding.moreLanguages')}
                  colors={colors}
                  eyebrowFont={displayFont.regular}
                />
                <AppCard padding={0}>
                  {languageResults.global.map((language, index) =>
                    renderLanguageRow(language, false, index === languageResults.global.length - 1)
                  )}
                </AppCard>
              </View>
            ) : null}

            {languageResults.recommended.length === 0 && languageResults.global.length === 0
              ? renderEmptyCard(
                  t('onboarding.noLanguagesFound'),
                  t('onboarding.noLanguagesFoundBody')
                )
              : null}
          </>
        ) : null}
      </ScrollView>

      {showFooter ? (
        <View
          style={[styles.footer, { bottom: keyboardOffset }]}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', colors.background, colors.background]}
            locations={[0, 0.3, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View testID="onboarding-primary-action">
            <AppButton
              label={primaryActionLabel}
              variant="primary"
              size="lg"
              trailingIcon={ChevronRight}
              disabled={!canAdvance}
              accessibilityLabel={primaryActionLabel}
              onPress={() => {
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
              }}
            />
          </View>
          <Text
            style={[typography.captionStrong, styles.footerHint, { color: colors.secondaryText }]}
          >
            {t('onboarding.searchAboveHint')}
          </Text>
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
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerSide: {
    width: 56,
    minHeight: layout.iconButton,
    justifyContent: 'center',
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepBar: {
    flexDirection: 'row',
    width: STEP_BAR_WIDTH,
    gap: spacing.xs,
  },
  stepSegment: {
    flex: 1,
    height: STEP_BAR_HEIGHT,
    borderRadius: STEP_BAR_HEIGHT / 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  heroTitle: {
    ...typography.displayHero,
    fontSize: 34,
    lineHeight: 37,
    letterSpacing: -1.36,
    marginBottom: spacing.sm,
  },
  heroBody: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  searchField: {
    height: SEARCH_FIELD_HEIGHT,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: 0,
  },
  inlinePreferenceCard: {
    marginBottom: spacing.md,
  },
  inlinePreferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  inlinePreferenceCopy: {
    flex: 1,
    gap: 2,
  },
  inlinePreferenceValue: {
    ...typography.cardTitle,
  },
  loadingRow: {
    paddingTop: spacing.lg,
  },
  listSection: {
    marginTop: spacing.lg,
  },
  sectionEyebrow: {
    marginBottom: 10,
  },
  optionRow: {
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionRowCopy: {
    flex: 1,
    gap: 2,
  },
  optionRowTitle: {
    ...typography.bodyStrong,
    fontSize: 15.5,
  },
  optionRowSubtitle: {
    ...typography.caption,
  },
  optionRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestedTitle: {
    ...typography.cardTitle,
  },
  suggestedSubtitle: {
    ...typography.captionStrong,
    fontWeight: '400',
  },
  selectionMark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionMarkEmpty: {
    borderWidth: 1.5,
  },
  chip: {
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  downloadProgress: {
    width: 72,
  },
  countryPillRow: {
    marginBottom: spacing.md,
    flexDirection: 'row',
  },
  countryPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pillFlagEmoji: {
    fontSize: 16,
  },
  emptyCard: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    lineHeight: 22,
  },
  emptyCta: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  footerHint: {
    textAlign: 'center',
  },
});
