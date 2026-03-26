export interface TranslationSelectionState {
  isSelectable: boolean;
  reason: 'coming-soon' | 'download-required' | 'audio-unavailable' | null;
}

interface TranslationSelectionOptions {
  isDownloaded: boolean;
  hasText: boolean;
  hasAudio: boolean;
  canPlayAudio: boolean;
  source?: 'bundled' | 'runtime';
  textPackLocalPath?: string | null;
}

export interface TranslationLanguageFilter {
  value: string;
  label: string;
}

interface TranslationPickerVisibilityOptions {
  isHydratingRuntimeCatalog: boolean;
  hasHydratedRuntimeCatalog: boolean;
}

function normalizeTranslationLanguage(language: string | null | undefined): string {
  return language?.trim() || 'Other';
}

export const isAudioOnlyTranslation = (translation: Pick<TranslationSelectionOptions, 'hasText' | 'hasAudio'>): boolean =>
  !translation.hasText && translation.hasAudio;

export const isTranslationReadableLocally = ({
  isDownloaded,
  hasText,
  source,
  textPackLocalPath,
}: Pick<TranslationSelectionOptions, 'isDownloaded' | 'hasText' | 'source' | 'textPackLocalPath'>): boolean => {
  if (isDownloaded) {
    return true;
  }

  if (!hasText) {
    return false;
  }

  return source !== 'runtime' || Boolean(textPackLocalPath);
};

export const buildTranslationLanguageFilters = <T extends { language: string | null | undefined }>(
  translations: T[]
): TranslationLanguageFilter[] => {
  const labels = Array.from(
    new Set(translations.map((translation) => normalizeTranslationLanguage(translation.language)))
  );

  return labels
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({ value: label, label }));
};

export const filterTranslationsByLanguage = <T extends { language: string | null | undefined }>(
  translations: T[],
  selectedLanguage: string
): T[] => {
  if (selectedLanguage === 'all') {
    return translations;
  }

  return translations.filter(
    (translation) => normalizeTranslationLanguage(translation.language) === selectedLanguage
  );
};

export const getVisibleTranslationsForPicker = <
  T extends Pick<TranslationSelectionOptions, 'isDownloaded' | 'hasText' | 'source' | 'textPackLocalPath'>
>(
  translations: T[],
  { isHydratingRuntimeCatalog, hasHydratedRuntimeCatalog }: TranslationPickerVisibilityOptions
): T[] => {
  if (!isHydratingRuntimeCatalog || hasHydratedRuntimeCatalog) {
    return translations;
  }

  return translations.filter((translation) =>
    translation.source !== 'runtime'
      ? true
      : isTranslationReadableLocally({
          isDownloaded: translation.isDownloaded,
          hasText: translation.hasText,
          source: translation.source,
          textPackLocalPath: translation.textPackLocalPath,
        })
  );
};

export const getTranslationSelectionState = ({
  isDownloaded,
  hasText,
  hasAudio,
  canPlayAudio,
  source,
  textPackLocalPath,
}: TranslationSelectionOptions): TranslationSelectionState => {
  if (
    isTranslationReadableLocally({
      isDownloaded,
      hasText,
      source,
      textPackLocalPath,
    })
  ) {
    return { isSelectable: true, reason: null };
  }

  if (hasAudio) {
    return canPlayAudio
      ? { isSelectable: true, reason: null }
      : { isSelectable: false, reason: 'audio-unavailable' };
  }

  if (hasText && source === 'runtime') {
    return { isSelectable: false, reason: 'download-required' };
  }

  return { isSelectable: false, reason: 'coming-soon' };
};
