import Fuse from 'fuse.js';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../constants/languages';

export interface LocaleCountry {
  code: string;
  name: string;
  languageCodes: string[];
}

export interface LocaleLanguage {
  code: string;
  iso6391: string | null;
  iso6393: string | null;
  name: string;
  nativeName: string;
  aliases: string[];
  countryCodes: string[];
}

export interface LocaleCatalog {
  countries: LocaleCountry[];
  languages: LocaleLanguage[];
}

interface LanguageSearchResult {
  recommended: LocaleLanguage[];
  global: LocaleLanguage[];
}

const localeCatalog = require('../../data/localeCatalog.json') as LocaleCatalog;

const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const uniqueByCode = <T extends { code: string }>(items: T[]): T[] => {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.code)) {
      return false;
    }

    seen.add(item.code);
    return true;
  });
};

export function createLocaleSearchEngine(catalog: LocaleCatalog) {
  const countries = catalog.countries
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
  const languages = catalog.languages
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

  const countryFuse = new Fuse(countries, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: ['name', 'code'],
  });

  const languageFuse = new Fuse(languages, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: ['name', 'nativeName', 'aliases', 'iso6391', 'iso6393', 'code'],
  });

  const getCountryByCode = (countryCode: string | null | undefined): LocaleCountry | null => {
    if (!countryCode) {
      return null;
    }

    return countries.find((country) => country.code === countryCode.toUpperCase()) ?? null;
  };

  const getLanguageByCode = (languageCode: string | null | undefined): LocaleLanguage | null => {
    if (!languageCode) {
      return null;
    }

    return (
      languages.find(
        (language) =>
          language.code === languageCode.toLowerCase() ||
          language.iso6391 === languageCode.toLowerCase() ||
          language.iso6393 === languageCode.toLowerCase()
      ) ?? null
    );
  };

  const searchCountries = (query: string, limit: number = 30): LocaleCountry[] => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return countries.slice(0, limit);
    }

    return countryFuse
      .search(trimmedQuery)
      .map((result) => result.item)
      .slice(0, limit);
  };

  const getRecommendedLanguages = (countryCode: string | null | undefined, limit: number = 12) => {
    const country = getCountryByCode(countryCode);
    if (!country) {
      return [];
    }

    return uniqueByCode(
      country.languageCodes
        .map((languageCode) => getLanguageByCode(languageCode))
        .filter((language): language is LocaleLanguage => Boolean(language))
    ).slice(0, limit);
  };

  const searchLanguages = (
    query: string,
    countryCode: string | null | undefined,
    limit: number = 24
  ): LanguageSearchResult => {
    const trimmedQuery = query.trim();
    const recommended = getRecommendedLanguages(countryCode, limit);

    if (!trimmedQuery) {
      return {
        recommended,
        global: [],
      };
    }

    const normalizedQuery = normalizeSearchText(trimmedQuery);
    const prefixMatches = languages.filter((language) => {
      const haystacks = [language.name, language.nativeName, ...language.aliases].map(
        normalizeSearchText
      );
      return haystacks.some(
        (haystack) => haystack.includes(normalizedQuery) || normalizedQuery.includes(haystack)
      );
    });

    const fuzzyMatches = languageFuse.search(trimmedQuery).map((result) => result.item);
    const allMatches = uniqueByCode([...prefixMatches, ...fuzzyMatches]).slice(0, limit * 2);

    const recommendedCodes = new Set(recommended.map((language) => language.code));
    const recommendedMatches = allMatches.filter((language) => recommendedCodes.has(language.code));
    const globalMatches = allMatches.filter((language) => !recommendedCodes.has(language.code));

    return {
      recommended: recommendedMatches.slice(0, limit),
      global: globalMatches.slice(0, limit),
    };
  };

  const mapLanguageToAppLanguage = (language: LocaleLanguage | null): LanguageCode | null => {
    if (!language?.iso6391) {
      return null;
    }

    const supported = SUPPORTED_LANGUAGES.find((item) => item.code === language.iso6391);
    return supported?.code ?? null;
  };

  return {
    countries,
    languages,
    getCountryByCode,
    getLanguageByCode,
    searchCountries,
    getRecommendedLanguages,
    searchLanguages,
    mapLanguageToAppLanguage,
  };
}

const defaultLocaleSearchEngine = createLocaleSearchEngine(localeCatalog);

export const localeSearchEngine = defaultLocaleSearchEngine;
export const supportedLocaleCatalog = localeCatalog;
