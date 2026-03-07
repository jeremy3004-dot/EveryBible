import Fuse from 'fuse.js';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  SUPPORTED_LANGUAGES,
  type Language,
  type LanguageCode,
} from '../../constants/languages';

export const INTERFACE_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((language) => language.code);

const uniqueByCode = (items: Language[]): Language[] => {
  const seen = new Set<LanguageCode>();

  return items.filter((item) => {
    if (seen.has(item.code)) {
      return false;
    }

    seen.add(item.code);
    return true;
  });
};

function createInterfaceLanguageSearchEngine() {
  const languages = SUPPORTED_LANGUAGES.slice();

  const languageFuse = new Fuse(languages, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: ['name', 'nativeName', 'aliases', 'code'],
  });

  const getLanguageByCode = (code: LanguageCode | null | undefined): Language | null => {
    if (!code) {
      return null;
    }

    return LANGUAGES[code] ?? null;
  };

  const search = (query: string, limit: number = languages.length): Language[] => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return languages.slice(0, limit);
    }

    const prefixMatches = languages.filter((language) => {
      const haystacks = [
        language.name.toLowerCase(),
        language.nativeName.toLowerCase(),
        ...language.aliases.map((alias) => alias.toLowerCase()),
      ];

      const normalizedQuery = trimmedQuery.toLowerCase();
      return haystacks.some(
        (haystack) => haystack.includes(normalizedQuery) || normalizedQuery.includes(haystack)
      );
    });

    const fuzzyMatches = languageFuse.search(trimmedQuery).map((result) => result.item);
    return uniqueByCode([...prefixMatches, ...fuzzyMatches]).slice(0, limit);
  };

  return {
    languages,
    defaultLanguageCode: DEFAULT_LANGUAGE,
    getLanguageByCode,
    search,
  };
}

export const interfaceLanguageSearchEngine = createInterfaceLanguageSearchEngine();
