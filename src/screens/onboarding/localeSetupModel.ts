import type { LanguageCode } from '../../constants/languages';

export type SetupMode = 'initial' | 'settings';

export type SetupStep = 'interfaceLanguage' | 'translation' | 'country' | 'contentLanguage';

interface InitialOnboardingTranslation {
  id: string;
  name: string;
  abbreviation?: string | null;
  language: string | null | undefined;
  isDownloaded?: boolean;
  hasText?: boolean;
  hasAudio?: boolean;
  catalog?: {
    text?: {
      downloadUrl?: string | null;
    } | null;
  } | null;
}

export interface InitialOnboardingLanguageOption<T extends InitialOnboardingTranslation> {
  key: string;
  label: string;
  groupLabel: string;
  primaryTranslation: T;
  translations: T[];
}

export const RUNTIME_CATALOG_HYDRATION_TIMEOUT_MS = 7000;

export type RuntimeCatalogHydrationResult = 'loaded' | 'timeout' | 'failed';

export interface InitialBibleLanguageListState {
  showsSearch: boolean;
  showsFullList: boolean;
  pinsRecommendedOption: boolean;
}

export interface InterfaceLanguageSelectionResult {
  languageCode: LanguageCode;
  shouldClosePicker: true;
  nextStep: 'translation';
  changeLanguageSucceeded: boolean;
  changeLanguageError: unknown | null;
}

/**
 * First run (and the re-run after sign-out) starts from the language the interface is
 * actually showing; the stored preference there is only the app default. Settings starts
 * from the stored choice.
 */
export function getInitialInterfaceLanguageCode(
  mode: SetupMode,
  {
    currentLanguage,
    preferredLanguage,
  }: { currentLanguage: LanguageCode; preferredLanguage: LanguageCode }
): LanguageCode {
  return mode === 'initial' ? currentLanguage : preferredLanguage;
}

export function getLocaleSetupSteps(mode: SetupMode): SetupStep[] {
  if (mode === 'settings') {
    return ['country', 'contentLanguage'];
  }

  return ['translation'];
}

export function getInitialBibleLanguageListState(mode: SetupMode): InitialBibleLanguageListState {
  return {
    showsSearch: true,
    showsFullList: true,
    pinsRecommendedOption: mode === 'initial',
  };
}

export async function waitForRuntimeCatalogHydration(
  loadRuntimeCatalog: () => Promise<void>,
  timeoutMs = RUNTIME_CATALOG_HYDRATION_TIMEOUT_MS
): Promise<RuntimeCatalogHydrationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      loadRuntimeCatalog()
        .then((): RuntimeCatalogHydrationResult => 'loaded')
        .catch((): RuntimeCatalogHydrationResult => 'failed'),
      new Promise<RuntimeCatalogHydrationResult>((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getInterfaceLanguageSelectionResult(
  languageCode: LanguageCode,
  changeLanguageForCode: (languageCode: LanguageCode) => Promise<unknown>
): Promise<InterfaceLanguageSelectionResult> {
  try {
    await changeLanguageForCode(languageCode);

    return {
      languageCode,
      shouldClosePicker: true,
      nextStep: 'translation',
      changeLanguageSucceeded: true,
      changeLanguageError: null,
    };
  } catch (error) {
    return {
      languageCode,
      shouldClosePicker: true,
      nextStep: 'translation',
      changeLanguageSucceeded: false,
      changeLanguageError: error,
    };
  }
}

function normalizeLanguageLabel(language: string | null | undefined): string {
  return language?.trim() || 'Other';
}

function getDisplayLanguageLabel(language: string | null | undefined): string {
  const normalizedLanguage = normalizeLanguageLabel(language);
  const nativeLabels: Record<string, string> = {
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
  const nativeLabel = nativeLabels[normalizedLanguage.toLowerCase()] ?? null;

  if (
    nativeLabel == null ||
    nativeLabel.localeCompare(normalizedLanguage, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return normalizedLanguage;
  }

  return `${normalizedLanguage} / ${nativeLabel}`;
}

const OTHER_GROUP_LABEL = '#';

function getLanguageGroupLabel(label: string): string {
  // Decompose only the first character so an accented Latin initial (É, Ọ) files under its
  // base letter, where collation already sorts it.
  const initial = label.trim().charAt(0);
  const groupLabel = (initial.normalize ? initial.normalize('NFD') : initial)
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(groupLabel) ? groupLabel : OTHER_GROUP_LABEL;
}

// Sections are built from runs of equal group labels, so the order must keep each group
// contiguous: letters A–Z, then everything else, collated within each group.
function compareLanguageOptions(
  left: { label: string; groupLabel: string },
  right: { label: string; groupLabel: string }
): number {
  if (left.groupLabel !== right.groupLabel) {
    if (left.groupLabel === OTHER_GROUP_LABEL) return 1;
    if (right.groupLabel === OTHER_GROUP_LABEL) return -1;
    return left.groupLabel < right.groupLabel ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
}

function getTranslationPriority(translation: InitialOnboardingTranslation): number {
  const language = normalizeLanguageLabel(translation.language).toLowerCase();
  let priority = 0;

  if (language === 'english' && translation.id.toLowerCase() === 'bsb') {
    priority -= 1000;
  }

  if (translation.isDownloaded) {
    priority -= 100;
  }

  if (translation.hasText) {
    priority -= 50;
  }

  if (translation.hasAudio) {
    priority -= 20;
  }

  if (translation.catalog?.text?.downloadUrl) {
    priority -= 15;
  }

  return priority;
}

export function buildInitialOnboardingLanguageOptions<T extends InitialOnboardingTranslation>(
  translations: T[]
): InitialOnboardingLanguageOption<T>[] {
  const groupedTranslations = new Map<string, T[]>();

  for (const translation of translations) {
    const label = normalizeLanguageLabel(translation.language);
    const key = label.toLowerCase();
    groupedTranslations.set(key, [...(groupedTranslations.get(key) ?? []), translation]);
  }

  return Array.from(groupedTranslations.entries())
    .map(([key, groupTranslations]) => {
      const translationsByPriority = [...groupTranslations].sort((left, right) => {
        const priorityDelta = getTranslationPriority(left) - getTranslationPriority(right);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return left.name.localeCompare(right.name);
      });
      const primaryTranslation = translationsByPriority[0];
      const label = getDisplayLanguageLabel(primaryTranslation.language);

      return {
        key,
        label,
        groupLabel: getLanguageGroupLabel(label),
        primaryTranslation,
        translations: translationsByPriority,
      };
    })
    .sort(compareLanguageOptions);
}
