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

// A fresh install's first catalog request competes with the bundled Bible import and a cold
// network stack (DNS, TLS, Supabase client start-up). 7 s timed out on first launches that a
// relaunch then served fine. The wait never blocks anything: the Bibles that ship with the app
// stay selectable while the catalog loads.
export const RUNTIME_CATALOG_HYDRATION_TIMEOUT_MS = 15_000;
export const RUNTIME_CATALOG_AUTOMATIC_RETRY_DELAY_MS = 2_000;

export type RuntimeCatalogHydrationResult = 'loaded' | 'timeout' | 'failed';

/** Resolves `false` or an error result (see isRuntimeCatalogLoadFailure) when nothing loaded. */
export type RuntimeCatalogLoader = () => Promise<unknown>;

export interface RuntimeCatalogHydrationPolicy {
  timeoutMs: number;
  /** Extra attempts made on their own before onboarding shows the "can't reach" card. */
  automaticRetries: number;
  retryDelayMs: number;
}

/**
 * Attempt 0 is the automatic load when onboarding opens; it retries once on its own, so a slow
 * or briefly unreachable first launch does not surface an error. Later attempts come from the
 * Retry button, which the person just pressed, so they make one attempt and report back.
 */
export function getRuntimeCatalogHydrationPolicy(attempt: number): RuntimeCatalogHydrationPolicy {
  return {
    timeoutMs: RUNTIME_CATALOG_HYDRATION_TIMEOUT_MS,
    automaticRetries: attempt === 0 ? 1 : 0,
    retryDelayMs: RUNTIME_CATALOG_AUTOMATIC_RETRY_DELAY_MS,
  };
}

const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs the catalog load under `policy`. A retry after a timeout calls the loader again, and
 * ensureRuntimeCatalogLoaded joins the request still in flight rather than starting a second
 * one, so a slow response keeps counting instead of being thrown away.
 */
export async function hydrateRuntimeCatalogWithRetry(
  loadRuntimeCatalog: RuntimeCatalogLoader,
  policy: RuntimeCatalogHydrationPolicy,
  {
    wait = waitMs,
    shouldContinue = () => true,
  }: { wait?: (ms: number) => Promise<void>; shouldContinue?: () => boolean } = {}
): Promise<RuntimeCatalogHydrationResult> {
  let result = await waitForRuntimeCatalogHydration(loadRuntimeCatalog, policy.timeoutMs);

  for (let retry = 0; retry < policy.automaticRetries && result !== 'loaded'; retry += 1) {
    await wait(policy.retryDelayMs * (retry + 1));
    if (!shouldContinue()) {
      break;
    }
    result = await waitForRuntimeCatalogHydration(loadRuntimeCatalog, policy.timeoutMs);
  }

  return result;
}

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

/**
 * The catalog service catches transport errors and resolves, so an unreachable library usually
 * arrives as a value: `false` (ensureRuntimeCatalogLoaded found no usable catalog) or an error
 * result such as `{ success: false, error }`. Those fail exactly like a throw; anything else
 * (true, void, a success result) counts as loaded.
 */
export function isRuntimeCatalogLoadFailure(value: unknown): boolean {
  if (value === false) {
    return true;
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const result = value as { success?: unknown; error?: unknown };
  return result.success === false || (result.success === undefined && Boolean(result.error));
}

export async function waitForRuntimeCatalogHydration(
  loadRuntimeCatalog: RuntimeCatalogLoader,
  timeoutMs = RUNTIME_CATALOG_HYDRATION_TIMEOUT_MS
): Promise<RuntimeCatalogHydrationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      loadRuntimeCatalog()
        .then(
          (value): RuntimeCatalogHydrationResult =>
            isRuntimeCatalogLoadFailure(value) ? 'failed' : 'loaded'
        )
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

  // The native labels are a fixed table, so a case-insensitive match is all "English" needs;
  // an ICU comparison here would run once per language on every rebuild.
  if (nativeLabel == null || nativeLabel.toLowerCase() === normalizedLanguage.toLowerCase()) {
    return normalizedLanguage;
  }

  return `${normalizedLanguage} / ${nativeLabel}`;
}

// Hermes has no JIT and collating is an ICU call there, so localeCompare in a sort comparator
// is slow. One collator is built on first use — never at module evaluation, which is on the
// first-run startup path — and reused for every comparison after that.
let languageLabelCollator: Intl.Collator | null = null;

function collateLabels(left: string, right: string): number {
  if (!languageLabelCollator) {
    if (typeof Intl === 'undefined' || typeof Intl.Collator !== 'function') {
      return left < right ? -1 : left > right ? 1 : 0;
    }
    languageLabelCollator = new Intl.Collator();
  }

  return languageLabelCollator.compare(left, right);
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

  return collateLabels(left.label, right.label);
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

        return collateLabels(left.name, right.name);
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

/**
 * Narrows options built once by buildInitialOnboardingLanguageOptions to the translations a
 * search matched. The options are already sorted, and each keeps its translations in priority
 * order, so filtering preserves both orders without sorting or collating on every keystroke.
 * A language keeps the label of its full-list entry; only its primary Bible can change.
 */
export function filterInitialOnboardingLanguageOptions<T extends InitialOnboardingTranslation>(
  options: InitialOnboardingLanguageOption<T>[],
  matchingTranslations: readonly T[]
): InitialOnboardingLanguageOption<T>[] {
  const matching = new Set(matchingTranslations);
  const filteredOptions: InitialOnboardingLanguageOption<T>[] = [];

  for (const option of options) {
    const translations = option.translations.filter((translation) => matching.has(translation));
    if (translations.length === 0) {
      continue;
    }

    filteredOptions.push(
      translations.length === option.translations.length
        ? option
        : { ...option, primaryTranslation: translations[0], translations }
    );
  }

  return filteredOptions;
}
