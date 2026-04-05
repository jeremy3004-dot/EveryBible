import { bibleBooks, newTestamentBooks } from '../../constants/books';
import type { BibleTranslation, TranslationAudioCoverage } from '../../types';

export interface TranslationSelectionState {
  isSelectable: boolean;
  reason: 'coming-soon' | 'download-required' | 'audio-unavailable' | null;
}

interface TranslationSelectionOptions {
  isDownloaded: boolean;
  hasText: boolean;
  hasAudio: boolean;
  canPlayAudio: boolean;
  hasDownloadableTextPack?: boolean;
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

export type TranslationAudioCollectionAction = 'full-bible' | 'new-testament';

const ALL_BIBLE_BOOK_IDS = new Set(bibleBooks.map((book) => book.id));
const NEW_TESTAMENT_BOOK_IDS = new Set(newTestamentBooks.map((book) => book.id));

function sortAudioBookIds(bookIds: string[]): string[] {
  const order = new Map(bibleBooks.map((book, index) => [book.id, index]));

  return [...bookIds].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
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

const KNOWN_FULL_AUDIO_TRANSLATION_IDS = new Set(['bsb', 'web']);

const SEARCHABLE_CODE_POINT_RANGES: Array<readonly [number, number]> = [
  [0x0030, 0x0039], // 0-9
  [0x0061, 0x007a], // a-z
  [0x0400, 0x04ff], // Cyrillic
  [0x0600, 0x06ff], // Arabic
  [0x0900, 0x097f], // Devanagari
  [0x0980, 0x09ff], // Bengali
  [0x0b80, 0x0bff], // Tamil
  [0x0c00, 0x0c7f], // Telugu
  [0x0c80, 0x0cff], // Kannada
  [0x0d00, 0x0d7f], // Malayalam
  [0x0e00, 0x0e7f], // Thai
  [0x3040, 0x30ff], // Hiragana and Katakana
  [0x3400, 0x9fff], // CJK Unified Ideographs
  [0xac00, 0xd7af], // Hangul syllables
] as const;

function isSearchableCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint == null) {
    return false;
  }

  return SEARCHABLE_CODE_POINT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

export function normalizeTranslationLanguage(language: string | null | undefined): string {
  return language?.trim() || 'Other';
}

function normalizeTranslationSearchText(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return Array.from(normalized, (char) => (isSearchableCharacter(char) ? char : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyTokenMatches(haystack: string, token: string): boolean {
  if (!token) {
    return true;
  }

  if (haystack.includes(token)) {
    return true;
  }

  if (token.length <= 4) {
    return false;
  }

  let tokenIndex = 0;
  for (const char of haystack) {
    if (char === token[tokenIndex]) {
      tokenIndex += 1;
      if (tokenIndex === token.length) {
        return true;
      }
    }
  }

  return false;
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

function getTranslationSearchAvailabilityTerms(
  translation: Pick<BibleTranslation, 'id' | 'hasText' | 'hasAudio' | 'catalog'>
): string[] {
  const terms: string[] = [];
  const hasText = translation.hasText || Boolean(translation.catalog?.text?.downloadUrl);
  const coverage = inferTranslationAudioCoverage(translation);

  if (hasText) {
    terms.push('text', 'written text', 'search');
  }

  if (translation.hasAudio) {
    terms.push('audio', 'listen', 'listening');
  }

  if (coverage === 'full-bible') {
    terms.push('full bible', 'old testament', 'new testament', 'ot', 'nt');
  } else if (coverage === 'new-testament') {
    terms.push('new testament', 'nt');
  } else if (translation.hasAudio) {
    terms.push('partial audio', 'by book');
  }

  if (!hasText && translation.hasAudio) {
    terms.push('audio only', 'audio first');
  }

  return terms;
}

export function getTranslationAvailabilitySummary(
  translation: Pick<BibleTranslation, 'id' | 'hasText' | 'hasAudio' | 'catalog'>,
  translate: (key: string) => string
): string {
  const parts: string[] = [];
  const hasText = translation.hasText || Boolean(translation.catalog?.text?.downloadUrl);
  const coverage = inferTranslationAudioCoverage(translation);

  if (hasText) {
    parts.push(translate('audio.showText'));
  }

  if (translation.hasAudio) {
    if (coverage === 'full-bible') {
      parts.push(`${translate('bible.audioDownloads')} (${translate('bible.fullBible')})`);
    } else if (coverage === 'new-testament') {
      parts.push(`${translate('bible.audioDownloads')} (${translate('bible.newTestament')})`);
    } else {
      parts.push(translate('bible.audioDownloads'));
    }
  }

  return parts.join(' • ');
}

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

export const filterTranslationsBySearchQuery = <
  T extends {
    id?: string | null | undefined;
    name: string;
    abbreviation?: string | null | undefined;
    description?: string | null | undefined;
    language: string | null | undefined;
    hasText?: boolean;
    hasAudio?: boolean;
    catalog?: BibleTranslation['catalog'];
  }
>(
  translations: T[],
  query: string
): T[] => {
  const normalizedQuery = normalizeTranslationSearchText(query);
  if (!normalizedQuery) {
    return translations;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return translations.filter((translation) => {
    const haystack = normalizeTranslationSearchText(
      [
        translation.id,
        translation.name,
        translation.abbreviation,
        translation.description,
        normalizeTranslationLanguage(translation.language),
        getTranslationLanguageDisplayLabel(translation.language),
        ...getTranslationSearchAvailabilityTerms({
          id: translation.id ?? '',
          hasText: Boolean(translation.hasText),
          hasAudio: Boolean(translation.hasAudio),
          catalog: translation.catalog,
        }),
      ].join(' ')
    );

    return queryTokens.every((token) => fuzzyTokenMatches(haystack, token));
  });
};

function inferTranslationAudioCoverage(
  translation: Pick<BibleTranslation, 'id' | 'catalog'>
): TranslationAudioCoverage | null {
  const explicitCoverage = translation.catalog?.audio?.coverage;
  if (explicitCoverage) {
    return explicitCoverage;
  }

  if (translation.catalog?.version?.includes('open-bible-nt')) {
    return 'new-testament';
  }

  if (KNOWN_FULL_AUDIO_TRANSLATION_IDS.has(translation.id)) {
    return 'full-bible';
  }

  return null;
}

export function getTranslationAudioBookIds(
  translation: Pick<BibleTranslation, 'id' | 'catalog'>
): string[] {
  const explicitAudioBooks = translation.catalog?.audio?.books;
  if (explicitAudioBooks && Object.keys(explicitAudioBooks).length > 0) {
    return sortAudioBookIds(
      Object.keys(explicitAudioBooks).filter((bookId) => ALL_BIBLE_BOOK_IDS.has(bookId))
    );
  }

  const coverage = inferTranslationAudioCoverage(translation);
  if (coverage === 'full-bible') {
    return bibleBooks.map((book) => book.id);
  }

  if (coverage === 'new-testament') {
    return newTestamentBooks.map((book) => book.id);
  }

  return [];
}

export function getTranslationAudioCollectionActions(
  translation: Pick<BibleTranslation, 'id' | 'catalog'>
): TranslationAudioCollectionAction[] {
  const audioBookIds = getTranslationAudioBookIds(translation);

  if (audioBookIds.length === bibleBooks.length) {
    return ['full-bible', 'new-testament'];
  }

  if (
    audioBookIds.length === newTestamentBooks.length &&
    audioBookIds.every((bookId) => NEW_TESTAMENT_BOOK_IDS.has(bookId))
  ) {
    return ['new-testament'];
  }

  const coverage = inferTranslationAudioCoverage(translation);
  if (coverage === 'full-bible') {
    return ['full-bible', 'new-testament'];
  }

  if (coverage === 'new-testament') {
    return ['new-testament'];
  }

  return [];
}

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
  hasDownloadableTextPack,
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

  if (hasText && source === 'runtime' && hasDownloadableTextPack) {
    return { isSelectable: false, reason: 'download-required' };
  }

  if (hasAudio) {
    return canPlayAudio
      ? { isSelectable: true, reason: null }
      : { isSelectable: false, reason: 'audio-unavailable' };
  }

  return { isSelectable: false, reason: 'coming-soon' };
};
