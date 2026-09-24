import { useMemo } from 'react';
import type { BibleTranslation } from '../../../types';
import type { LanguageCode } from '../../../constants/languages';
import { config } from '../../../constants';
import { localeSearchEngine } from '../../../services/onboarding/localeSelection';
import { getAudioAvailability } from '../../../services/audio/audioAvailability';
import { isRemoteAudioAvailable } from '../../../services/audio/audioRemote';
import {
  buildTranslationSearchIndex,
  getTranslationSelectionState,
  getVisibleTranslationsForPicker,
  searchTranslationIndex,
} from '../../bible/bibleTranslationModel';
import {
  buildInitialOnboardingLanguageOptions,
  filterInitialOnboardingLanguageOptions,
  type InitialOnboardingLanguageOption,
  type SetupMode,
} from '../localeSetupModel';
import {
  pickRecommendedOnboardingOption,
  rankRecommendedOnboardingOptions,
  resolveSeedRecommendationLanguage,
  type OnboardingRecommendation,
} from '../onboardingRecommendation';
import { groupOptionsIntoSections } from './localeSetupFlowModel';

export type OnboardingLanguageOption = InitialOnboardingLanguageOption<BibleTranslation>;

export interface TranslationDisplayData {
  availability: ReturnType<typeof getAudioAvailability>;
  selectionState: ReturnType<typeof getTranslationSelectionState>;
}

/** Whether a translation can be read now, needs a download first, or neither. */
export function getOnboardingTranslationDisplayData(
  translation: BibleTranslation
): TranslationDisplayData {
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
  return { availability, selectionState };
}

interface OnboardingTranslationOptionsInput {
  mode: SetupMode;
  translations: BibleTranslation[];
  isHydratingRuntimeCatalog: boolean;
  hasHydratedRuntimeCatalog: boolean;
  debouncedTranslationQuery: string;
  isLocaleEngineWarm: boolean;
  deviceLanguageCode: string | null;
  deviceCountryCode: string | null;
  selectedInterfaceLanguageCode: LanguageCode;
}

/**
 * The Bible step's options: every translation onboarding can finish with,
 * grouped by language, filtered by the search, and the one pinned on top.
 */
export function useOnboardingTranslationOptions({
  mode,
  translations,
  isHydratingRuntimeCatalog,
  hasHydratedRuntimeCatalog,
  debouncedTranslationQuery,
  isLocaleEngineWarm,
  deviceLanguageCode,
  deviceCountryCode,
  selectedInterfaceLanguageCode,
}: OnboardingTranslationOptionsInput) {
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
    const map = new Map<string, TranslationDisplayData>();
    for (const translation of visibleTranslations) {
      map.set(translation.id, getOnboardingTranslationDisplayData(translation));
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
  // Grouping, sorting and the search index are built once per catalog change. A keystroke
  // only matches against the prebuilt index and filters the presorted options, so typing
  // never re-collates the list (slow on Hermes).
  const allOnboardingLanguageOptions = useMemo(
    () => buildInitialOnboardingLanguageOptions(eligibleOnboardingTranslations),
    [eligibleOnboardingTranslations]
  );
  const onboardingTranslationSearchIndex = useMemo(
    () => buildTranslationSearchIndex(eligibleOnboardingTranslations),
    [eligibleOnboardingTranslations]
  );
  const onboardingLanguageOptions = useMemo(() => {
    if (!debouncedTranslationQuery.trim()) {
      return allOnboardingLanguageOptions;
    }

    return filterInitialOnboardingLanguageOptions(
      allOnboardingLanguageOptions,
      searchTranslationIndex(onboardingTranslationSearchIndex, debouncedTranslationQuery)
    );
  }, [allOnboardingLanguageOptions, debouncedTranslationQuery, onboardingTranslationSearchIndex]);
  const onboardingLanguageSections = useMemo(
    () => groupOptionsIntoSections(onboardingLanguageOptions),
    [onboardingLanguageOptions]
  );
  // The first frame ranks from the small seed of interface languages and pins a
  // Bible only when the seed proves it is the one the engine will choose; otherwise
  // the slot holds a placeholder until the engine is warm. The engine's ranking is
  // unchanged, so the pinned Bible never changes once shown (short of a catalog
  // refresh or a new interface language, which re-rank as they always did).
  const onboardingRecommendation = useMemo<
    OnboardingRecommendation<OnboardingLanguageOption>
  >(() => {
    if (mode !== 'initial') {
      return { status: 'ready', option: null };
    }

    const context = {
      deviceLanguageCode,
      deviceCountryCode,
      interfaceLanguageCode: selectedInterfaceLanguageCode,
    };
    if (!isLocaleEngineWarm) {
      return pickRecommendedOnboardingOption(
        onboardingLanguageOptions,
        context,
        resolveSeedRecommendationLanguage
      );
    }

    const [option] = rankRecommendedOnboardingOptions(onboardingLanguageOptions, context, (name) =>
      localeSearchEngine.getLanguageByName(name)
    );
    return { status: 'ready', option: option ?? null };
  }, [
    deviceCountryCode,
    deviceLanguageCode,
    isLocaleEngineWarm,
    mode,
    onboardingLanguageOptions,
    selectedInterfaceLanguageCode,
  ]);
  const isPrimaryOptionPending = onboardingRecommendation.status === 'pending';
  const primaryOption =
    onboardingRecommendation.status === 'ready'
      ? (onboardingRecommendation.option ?? onboardingLanguageOptions[0] ?? null)
      : null;

  return {
    translationDisplayDataById,
    onboardingLanguageOptions,
    onboardingLanguageSections,
    isPrimaryOptionPending,
    primaryOption,
  };
}
