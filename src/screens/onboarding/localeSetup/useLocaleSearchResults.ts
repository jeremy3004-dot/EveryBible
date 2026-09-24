import { useMemo } from 'react';
import type { LanguageCode } from '../../../constants/languages';
import { localeSearchEngine } from '../../../services/onboarding/localeSelection';
import type { SetupStep } from '../localeSetupModel';

const CONTENT_LANGUAGE_RESULT_LIMIT = 30;

interface LocaleSearchResultsInput {
  step: SetupStep;
  debouncedCountryQuery: string;
  debouncedLanguageQuery: string;
  selectedInterfaceLanguageCode: LanguageCode;
  selectedCountryCode: string | null;
  deviceCountryCode: string | null;
}

/**
 * Nation and content-language search. Each query runs only while its own step is
 * showing, so the Bible step never asks the locale engine anything.
 */
export function useLocaleSearchResults({
  step,
  debouncedCountryQuery,
  debouncedLanguageQuery,
  selectedInterfaceLanguageCode,
  selectedCountryCode,
  deviceCountryCode,
}: LocaleSearchResultsInput) {
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
        ? localeSearchEngine.searchLanguages(
            debouncedLanguageQuery,
            selectedCountryCode,
            CONTENT_LANGUAGE_RESULT_LIMIT
          )
        : { recommended: [], global: [] },
    [debouncedLanguageQuery, selectedCountryCode, step]
  );

  return { countryCatalogSize, suggestedCountry, listedCountries, languageResults };
}
