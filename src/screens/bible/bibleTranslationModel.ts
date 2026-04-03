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

export interface TranslationPickerSections<T> {
  myTranslations: T[];
  availableTranslations: T[];
}

interface TranslationPickerVisibilityOptions {
  isHydratingRuntimeCatalog: boolean;
  hasHydratedRuntimeCatalog: boolean;
}

const TRANSLATION_LANGUAGE_NATIVE_LABELS: Record<string, string> = {
  arabic: 'العربية',
  bengali: 'বাংলা',
  chinese: '中文',
  english: 'English',
  french: 'Français',
  german: 'Deutsch',
  hindi: 'हिन्दी',
  indonesian: 'Bahasa Indonesia',
  japanese: '日本語',
  korean: '한국어',
  marathi: 'मराठी',
  nepali: 'नेपाली',
  portuguese: 'Português',
  punjabi: 'ਪੰਜਾਬੀ',
  russian: 'Русский',
  spanish: 'Español',
  tamil: 'தமிழ்',
  telugu: 'తెలుగు',
  turkish: 'Türkçe',
  urdu: 'اردو',
  vietnamese: 'Tiếng Việt',
};

export function normalizeTranslationLanguage(language: string | null | undefined): string {
  return language?.trim() || 'Other';
}

export function getTranslationLanguageDisplayLabel(language: string | null | undefined): string {
  const normalizedLanguage = normalizeTranslationLanguage(language);
  const nativeLabel =
    TRANSLATION_LANGUAGE_NATIVE_LABELS[normalizedLanguage.toLowerCase()] ?? null;

  if (
    nativeLabel == null ||
    nativeLabel.localeCompare(normalizedLanguage, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return normalizedLanguage;
  }

  return `${normalizedLanguage} / ${nativeLabel}`;
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
    .map((label) => ({ value: label, label: getTranslationLanguageDisplayLabel(label) }));
};

export const resolvePreferredTranslationLanguage = <
  T extends { id: string; language: string | null | undefined }
>(
  translations: T[],
  preferredLanguage: string | null | undefined,
  currentTranslationId: string | null | undefined
): string | null => {
  const languageFilters = buildTranslationLanguageFilters(translations);

  if (languageFilters.length === 0) {
    return null;
  }

  const normalizedPreferredLanguage = preferredLanguage?.trim() || null;
  if (
    normalizedPreferredLanguage &&
    languageFilters.some((filter) => filter.value === normalizedPreferredLanguage)
  ) {
    return normalizedPreferredLanguage;
  }

  const currentTranslation = currentTranslationId
    ? translations.find((translation) => translation.id === currentTranslationId)
    : null;
  if (currentTranslation) {
    return normalizeTranslationLanguage(currentTranslation.language);
  }

  return languageFilters[0]?.value ?? null;
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

export const buildTranslationPickerSections = <
  T extends {
    id: string;
    language: string | null | undefined;
    isDownloaded: boolean;
    hasText: boolean;
    source?: 'bundled' | 'runtime';
    textPackLocalPath?: string | null;
  }
>(
  translations: T[],
  preferredLanguage: string | null
): TranslationPickerSections<T> => {
  const myTranslations = translations.filter((translation) =>
    isTranslationReadableLocally({
      isDownloaded: translation.isDownloaded,
      hasText: translation.hasText,
      source: translation.source,
      textPackLocalPath: translation.textPackLocalPath,
    })
  );
  const myTranslationIds = new Set(myTranslations.map((translation) => translation.id));
  const availableTranslations = preferredLanguage
    ? translations.filter(
        (translation) =>
          normalizeTranslationLanguage(translation.language) === preferredLanguage &&
          !myTranslationIds.has(translation.id)
      )
    : translations.filter((translation) => !myTranslationIds.has(translation.id));

  return {
    myTranslations,
    availableTranslations,
  };
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
