import Fuse from 'fuse.js';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from '../../constants/languages';

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

interface CountrySearchEntry {
  country: LocaleCountry;
  displayName: string;
  searchNames: string[];
}

const localeCatalog = require('../../data/localeCatalog.json') as LocaleCatalog;

const COUNTRY_DISPLAY_LOCALES: Record<LanguageCode, string[]> = {
  en: ['en'],
  zh: ['zh-Hans', 'zh'],
  hi: ['hi'],
  es: ['es'],
  ar: ['ar'],
  fr: ['fr'],
  bn: ['bn'],
  pt: ['pt'],
  ru: ['ru'],
  ur: ['ur'],
  id: ['id'],
  de: ['de'],
  ja: ['ja'],
  pa: ['pa-Guru', 'pa'],
  mr: ['mr'],
  te: ['te'],
  tr: ['tr'],
  ta: ['ta'],
  vi: ['vi'],
  ko: ['ko'],
  ne: ['ne'],
};

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
  const countryDisplayNameCache = new Map<LanguageCode, Map<string, string>>();
  const countrySearchCache = new Map<
    LanguageCode,
    { entries: CountrySearchEntry[]; fuse: Fuse<CountrySearchEntry> }
  >();

  // Lazy-init: building a Fuse index over 487 languages is expensive on Hermes
  // (no JIT). Defer to the first call to searchLanguages so it doesn't block
  // module evaluation or initial render.
  let _languageFuse: Fuse<LocaleLanguage> | null = null;
  const getLanguageFuse = (): Fuse<LocaleLanguage> => {
    if (!_languageFuse) {
      _languageFuse = new Fuse(languages, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.35,
        keys: ['name', 'nativeName', 'aliases', 'iso6391', 'iso6393', 'code'],
      });
    }
    return _languageFuse;
  };

  const getCountryByCode = (countryCode: string | null | undefined): LocaleCountry | null => {
    if (!countryCode) {
      return null;
    }

    return countries.find((country) => country.code === countryCode.toUpperCase()) ?? null;
  };

  const getCountryDisplayNames = (languageCode: LanguageCode) => {
    const cached = countryDisplayNameCache.get(languageCode);
    if (cached) {
      return cached;
    }

    const names = new Map<string, string>();
    let displayNames: Intl.DisplayNames | null = null;

    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      try {
        displayNames = new Intl.DisplayNames(
          [...COUNTRY_DISPLAY_LOCALES[languageCode], DEFAULT_LANGUAGE],
          { type: 'region' }
        );
      } catch {
        displayNames = null;
      }
    }

    countries.forEach((country) => {
      const localizedName = displayNames?.of(country.code);
      names.set(
        country.code,
        localizedName && localizedName !== country.code ? localizedName : country.name
      );
    });

    countryDisplayNameCache.set(languageCode, names);
    return names;
  };

  const getCountryDisplayName = (
    countryCode: string | null | undefined,
    languageCode: LanguageCode = DEFAULT_LANGUAGE
  ): string => {
    const country = getCountryByCode(countryCode);
    if (!country) {
      return '';
    }

    return getCountryDisplayNames(languageCode).get(country.code) ?? country.name;
  };

  const getCountrySearchData = (languageCode: LanguageCode) => {
    const cached = countrySearchCache.get(languageCode);
    if (cached) {
      return cached;
    }

    const entries = countries
      .map((country) => {
        const displayName = getCountryDisplayName(country.code, languageCode);
        const searchNames = [country.name, displayName].filter(
          (value, index, values) => values.findIndex((candidate) => candidate === value) === index
        );

        return {
          country,
          displayName,
          searchNames,
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName, languageCode));

    const fuse = new Fuse(entries, {
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.35,
      keys: ['displayName', 'searchNames'],
    });

    const searchData = { entries, fuse };
    countrySearchCache.set(languageCode, searchData);
    return searchData;
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

  const searchCountries = (
    query: string,
    languageCode: LanguageCode = DEFAULT_LANGUAGE,
    limit: number = countries.length
  ): LocaleCountry[] => {
    const trimmedQuery = query.trim();
    const { entries, fuse } = getCountrySearchData(languageCode);

    if (!trimmedQuery) {
      return entries.map((entry) => entry.country).slice(0, limit);
    }

    const normalizedQuery = normalizeSearchText(trimmedQuery);
    const exactCodeMatches = entries.filter(
      (entry) => normalizeSearchText(entry.country.code) === normalizedQuery
    );
    const prefixMatches = entries.filter((entry) =>
      entry.searchNames.some((searchName) => {
        const haystack = normalizeSearchText(searchName);
        return haystack.includes(normalizedQuery);
      })
    );

    const fuzzyMatches = fuse.search(trimmedQuery).map((result) => result.item);

    return uniqueByCode(
      [...exactCodeMatches, ...prefixMatches, ...fuzzyMatches].map((entry) => entry.country)
    ).slice(0, limit);
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
    const exactMatches = languages.filter((language) => {
      const haystacks = [
        language.code,
        language.iso6391 ?? '',
        language.iso6393 ?? '',
        language.name,
        language.nativeName,
        ...language.aliases,
      ].map(normalizeSearchText);

      return haystacks.some((haystack) => haystack === normalizedQuery);
    });
    const prefixMatches = languages.filter((language) => {
      const haystacks = [language.name, language.nativeName, ...language.aliases].map(
        normalizeSearchText
      );
      return haystacks.some(
        (haystack) => haystack.includes(normalizedQuery) || normalizedQuery.includes(haystack)
      );
    });

    const fuzzyMatches = getLanguageFuse().search(trimmedQuery).map((result) => result.item);
    const allMatches = uniqueByCode([...exactMatches, ...prefixMatches, ...fuzzyMatches]).slice(
      0,
      limit * 2
    );

    const recommendedCodes = new Set(recommended.map((language) => language.code));
    const recommendedMatches = allMatches.filter((language) => recommendedCodes.has(language.code));
    const globalMatches = allMatches.filter((language) => !recommendedCodes.has(language.code));

    return {
      recommended: recommendedMatches.slice(0, limit),
      global: globalMatches.slice(0, limit),
    };
  };

  const getLanguageByName = (name: string | null | undefined): LocaleLanguage | null => {
    if (!name) {
      return null;
    }

    const normalized = name.trim().toLowerCase();
    return (
      languages.find(
        (language) =>
          language.name.toLowerCase() === normalized ||
          language.nativeName.toLowerCase() === normalized
      ) ?? null
    );
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
    getCountryDisplayName,
    getLanguageByCode,
    getLanguageByName,
    searchCountries,
    getRecommendedLanguages,
    searchLanguages,
    mapLanguageToAppLanguage,
  };
}

// Lazy-init the search engine so the two localeCompare sorts (249 countries +
// 487 languages) and the Fuse index build are deferred off the module-eval
// critical path. On Hermes (no JIT) these operations are slow and were
// blocking the splash screen for several seconds before first render.
let _resolvedEngine: ReturnType<typeof createLocaleSearchEngine> | null = null;
function resolveLocaleSearchEngine(): ReturnType<typeof createLocaleSearchEngine> {
  if (!_resolvedEngine) {
    console.log('[EB-T] locale:engine-init-start', Date.now());
    _resolvedEngine = createLocaleSearchEngine(localeCatalog);
    console.log('[EB-T] locale:engine-init-done', Date.now());
  }
  return _resolvedEngine;
}

export const localeSearchEngine: ReturnType<typeof createLocaleSearchEngine> = {
  get countries() { return resolveLocaleSearchEngine().countries; },
  get languages() { return resolveLocaleSearchEngine().languages; },
  getCountryByCode: (...args) => resolveLocaleSearchEngine().getCountryByCode(...args),
  getCountryDisplayName: (...args) => resolveLocaleSearchEngine().getCountryDisplayName(...args),
  getLanguageByCode: (...args) => resolveLocaleSearchEngine().getLanguageByCode(...args),
  getLanguageByName: (...args) => resolveLocaleSearchEngine().getLanguageByName(...args),
  searchCountries: (...args) => resolveLocaleSearchEngine().searchCountries(...args),
  getRecommendedLanguages: (...args) => resolveLocaleSearchEngine().getRecommendedLanguages(...args),
  searchLanguages: (...args) => resolveLocaleSearchEngine().searchLanguages(...args),
  mapLanguageToAppLanguage: (...args) => resolveLocaleSearchEngine().mapLanguageToAppLanguage(...args),
};
export const supportedLocaleCatalog = localeCatalog;
