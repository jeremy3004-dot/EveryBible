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

export function getLocaleSetupSteps(mode: SetupMode): SetupStep[] {
  if (mode === 'settings') {
    return ['country', 'contentLanguage'];
  }

  return ['translation'];
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

function getLanguageGroupLabel(label: string): string {
  const groupLabel = label.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(groupLabel) ? groupLabel : '#';
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
    .sort((left, right) => left.label.localeCompare(right.label));
}
