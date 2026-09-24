import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocaleCountry, LocaleLanguage } from '../../../services/onboarding/localeSelection';
import { announceForAccessibility } from '../../../utils/a11y';
import type { SetupMode, SetupStep } from '../localeSetupModel';
import {
  buildBibleLanguageListItems,
  buildContentLanguageListItems,
  buildCountryListItems,
  countLocaleSetupSearchMatches,
  type BibleLanguageListItem,
  type ContentLanguageListItem,
  type CountryListItem,
} from '../localeSetupListModel';
import type { OnboardingLanguageOption } from './useOnboardingTranslationOptions';
import { useDebouncedValue } from './useDebouncedValue';

// On top of the search debounce: how long typing must pause before the match count is spoken.
const SEARCH_ANNOUNCEMENT_DEBOUNCE_MS = 700;

// Every step feeds the same virtualized list, so their item unions are merged
// into one discriminated union keyed on `type` — which is also what FlashList's
// getItemType() pools recycled cells by.
export type LocaleSetupStepItem =
  | { type: 'interfaceLanguageList'; id: string }
  | BibleLanguageListItem<OnboardingLanguageOption>
  | CountryListItem
  | ContentLanguageListItem<LocaleLanguage>;

interface LocaleSetupStepItemsInput {
  step: SetupStep;
  mode: SetupMode;
  onboardingLanguageSections: Array<{ groupLabel: string; options: OnboardingLanguageOption[] }>;
  hasOnboardingLanguageOptions: boolean;
  primaryOption: OnboardingLanguageOption | null;
  isPrimaryOptionPending: boolean;
  pinsRecommendedOption: boolean;
  showsFullList: boolean;
  isHydratingRuntimeCatalog: boolean;
  runtimeCatalogLoadFailed: boolean;
  suggestedCountry: LocaleCountry | null;
  listedCountries: LocaleCountry[];
  debouncedCountryQuery: string;
  languageResults: { recommended: LocaleLanguage[]; global: LocaleLanguage[] };
  selectedCountryDisplayName: string;
}

/**
 * Every step's body is one flat item array behind a single virtualized list.
 * Mapped into a ScrollView, these lists mounted every row of the catalog at
 * once — hundreds of views in a single commit, which is exactly the kind of
 * synchronous work that jams the JS thread on Hermes (no JIT) and hung this
 * screen on low-end Android. The flattening itself is a pure function in
 * localeSetupListModel.ts so it can be unit tested.
 */
export function useLocaleSetupStepItems({
  step,
  mode,
  onboardingLanguageSections,
  hasOnboardingLanguageOptions,
  primaryOption,
  isPrimaryOptionPending,
  pinsRecommendedOption,
  showsFullList,
  isHydratingRuntimeCatalog,
  runtimeCatalogLoadFailed,
  suggestedCountry,
  listedCountries,
  debouncedCountryQuery,
  languageResults,
  selectedCountryDisplayName,
}: LocaleSetupStepItemsInput): LocaleSetupStepItem[] {
  const { t } = useTranslation();

  return useMemo<LocaleSetupStepItem[]>(() => {
    if (step === 'interfaceLanguage') {
      return [{ type: 'interfaceLanguageList', id: 'interface-language-list' }];
    }

    if (step === 'translation') {
      return buildBibleLanguageListItems({
        sections: onboardingLanguageSections,
        primaryOption,
        showsPrimaryOption: mode === 'initial',
        isPrimaryOptionPending,
        pinsRecommendedOption,
        showsFullList,
        isHydratingRuntimeCatalog,
        runtimeCatalogLoadFailed,
        hasAnyOptions: hasOnboardingLanguageOptions,
        recommendedLabel: t('onboarding.recommendedBadge'),
      });
    }

    if (step === 'country') {
      return buildCountryListItems({
        suggestedCountryCode: suggestedCountry?.code ?? null,
        listedCountryCodes: listedCountries.map((country) => country.code),
        suggestedLabel: t('onboarding.suggestedFromDevice'),
        listLabel: debouncedCountryQuery.trim()
          ? t('onboarding.searchResults')
          : t('onboarding.allNations'),
      });
    }

    if (step === 'contentLanguage') {
      return buildContentLanguageListItems({
        recommended: languageResults.recommended,
        global: languageResults.global,
        recommendedLabel: t('onboarding.recommendedLanguages', {
          country: selectedCountryDisplayName,
        }),
        moreLabel: t('onboarding.moreLanguages'),
      });
    }

    return [];
  }, [
    debouncedCountryQuery,
    hasOnboardingLanguageOptions,
    isHydratingRuntimeCatalog,
    isPrimaryOptionPending,
    languageResults.global,
    languageResults.recommended,
    listedCountries,
    mode,
    onboardingLanguageSections,
    pinsRecommendedOption,
    primaryOption,
    runtimeCatalogLoadFailed,
    selectedCountryDisplayName,
    showsFullList,
    step,
    suggestedCountry,
    t,
  ]);
}

/**
 * Results arrive silently while focus stays in the search field, so the match
 * count is spoken. It waits for a pause in typing, or a fast typist hears a stale
 * count per letter.
 */
export function useSearchResultAnnouncement(
  step: SetupStep,
  activeSearchQuery: string,
  stepItems: LocaleSetupStepItem[]
): void {
  const { t } = useTranslation();
  const trimmedSearchQuery = activeSearchQuery.trim();
  const searchMatchCount = useMemo(() => countLocaleSetupSearchMatches(stepItems), [stepItems]);
  const searchAnnouncement = useMemo(
    () =>
      trimmedSearchQuery && searchMatchCount != null
        ? { step, query: trimmedSearchQuery, count: searchMatchCount }
        : null,
    [trimmedSearchQuery, searchMatchCount, step]
  );
  const settledSearchAnnouncement = useDebouncedValue(
    searchAnnouncement,
    SEARCH_ANNOUNCEMENT_DEBOUNCE_MS
  );
  useEffect(() => {
    if (!settledSearchAnnouncement) return;
    announceForAccessibility(
      t('interface.searchResultCount', { count: settledSearchAnnouncement.count })
    );
  }, [settledSearchAnnouncement, t]);
}
