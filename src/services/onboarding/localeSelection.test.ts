import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleSearchEngine } from './localeSelection';
import localeCatalog from '../../data/localeCatalog.json';
import countryDisplayNames from '../../data/countryDisplayNames.generated.json';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';

const engine = createLocaleSearchEngine({
  countries: [
    { code: 'NP', name: 'Nepal', languageCodes: ['ne'] },
    { code: 'IN', name: 'India', languageCodes: ['hi', 'pa'] },
    { code: 'DE', name: 'Germany', languageCodes: ['de'] },
    { code: 'GB', name: 'United Kingdom', languageCodes: ['en'] },
  ],
  languages: [
    {
      code: 'cpe',
      iso6391: null,
      iso6393: 'cpe',
      name: 'Creoles and pidgins, English based',
      nativeName: 'Creoles and pidgins, English based',
      aliases: ['Creoles and pidgins, English based'],
      countryCodes: [],
    },
    {
      code: 'en',
      iso6391: 'en',
      iso6393: 'eng',
      name: 'English',
      nativeName: 'English',
      aliases: ['English'],
      countryCodes: ['NP', 'IN'],
    },
    {
      code: 'ne',
      iso6391: 'ne',
      iso6393: 'nep',
      name: 'Nepali',
      nativeName: 'नेपाली',
      aliases: ['Nepali', 'नेपाली'],
      countryCodes: ['NP'],
    },
    {
      code: 'hi',
      iso6391: 'hi',
      iso6393: 'hin',
      name: 'Hindi',
      nativeName: 'हिन्दी',
      aliases: ['Hindi', 'हिन्दी'],
      countryCodes: ['IN'],
    },
    {
      code: 'pa',
      iso6391: 'pa',
      iso6393: 'pan',
      name: 'Panjabi',
      nativeName: 'ਪੰਜਾਬੀ',
      aliases: ['Panjabi', 'Punjabi', 'ਪੰਜਾਬੀ'],
      countryCodes: ['IN'],
    },
    {
      code: 'es',
      iso6391: 'es',
      iso6393: 'spa',
      name: 'Spanish',
      nativeName: 'Español',
      aliases: ['Spanish', 'Español'],
      countryCodes: ['ES'],
    },
  ],
});

test('fuzzy country search tolerates misspellings', () => {
  const results = engine.searchCountries('nepl');

  assert.equal(results[0]?.code, 'NP');
});

test('country search returns the full catalog when no query is provided', () => {
  const results = engine.searchCountries('', 'en');

  assert.equal(results.length, 4);
});

test('country display names localize to the selected interface language', () => {
  assert.equal(engine.getCountryDisplayName('DE', 'es'), 'Alemania');
  assert.equal(engine.getCountryDisplayName('GB', 'es'), 'Reino Unido');
});

test('country names and search remain French when Intl.DisplayNames is unavailable', (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DisplayNames')!;
  Object.defineProperty(Intl, 'DisplayNames', { ...descriptor, value: undefined });
  context.after(() => Object.defineProperty(Intl, 'DisplayNames', descriptor));
  const offlineEngine = createLocaleSearchEngine(localeCatalog);

  assert.equal(offlineEngine.getCountryDisplayName('US', 'fr'), 'États-Unis');
  assert.equal(offlineEngine.searchCountries('états-unis', 'fr')[0]?.code, 'US');
  assert.equal(offlineEngine.getCountryByCode('US')?.name, 'United States');
  assert.equal(offlineEngine.getLanguageByCode('en')?.nativeName, 'English');
  for (const { code } of SUPPORTED_LANGUAGES) {
    for (const country of localeCatalog.countries) {
      assert.equal(
        offlineEngine.getCountryDisplayName(country.code, code),
        (countryDisplayNames.names[code] as Record<string, string>)[country.code],
        `${code}.${country.code} must use its offline country label`
      );
    }
  }
  assert.equal(offlineEngine.getCountryDisplayName('US', 'zh'), '美国');
  assert.equal(offlineEngine.getCountryDisplayName('US', 'pa'), 'ਸੰਯੁਕਤ ਰਾਜ (ਅਮਰੀਕਾ)');
});

test('country search matches localized country names', () => {
  const results = engine.searchCountries('alem', 'es');

  assert.equal(results[0]?.code, 'DE');
});

test('country search prioritizes translated name matches over incidental country-code matches', () => {
  const results = engine.searchCountries('reino', 'es');

  assert.equal(results[0]?.code, 'GB');
});

test('language search returns recommended matches first for the selected country', () => {
  const results = engine.searchLanguages('nepalee', 'NP');

  assert.equal(results.recommended[0]?.code, 'ne');
});

test('language search prioritizes exact English over English-based catalog groups', () => {
  const results = engine.searchLanguages('English', null);

  assert.equal(results.global[0]?.code, 'en');
});

test('language search still returns matches outside the selected country', () => {
  const results = engine.searchLanguages('hindii', 'NP');

  assert.equal(results.recommended.length, 0);
  assert.equal(results.global[0]?.code, 'hi');
});

test('recommended languages are returned when there is no query', () => {
  const results = engine.searchLanguages('', 'IN');

  assert.deepEqual(
    results.recommended.map((language) => language.code),
    ['hi', 'pa']
  );
  assert.deepEqual(results.global, []);
});

// The haystacks these filters compare against are normalized once at index
// time rather than on every (debounced) keystroke, so the cases that depend on
// that normalization are pinned here: accents must still fold away, and the
// results must not change with how many times a query has already been run.
test('accented queries still match through the precomputed haystacks', () => {
  assert.equal(engine.searchLanguages('Español', null).global[0]?.code, 'es');
  assert.equal(engine.searchLanguages('espanol', null).global[0]?.code, 'es');
  assert.equal(engine.searchLanguages('ESPAÑOL', null).global[0]?.code, 'es');
});

test('accented country queries fold to the same result as their unaccented form', () => {
  const accented = createLocaleSearchEngine(localeCatalog).searchCountries('côte', 'fr');
  const plain = createLocaleSearchEngine(localeCatalog).searchCountries('cote', 'fr');

  assert.ok(accented.length > 0);
  assert.deepEqual(
    accented.map((country) => country.code),
    plain.map((country) => country.code)
  );
});

test('repeated searches return identical results from the reused index', () => {
  const first = engine.searchLanguages('nepalee', 'NP');
  const second = engine.searchLanguages('nepalee', 'NP');

  assert.deepEqual(
    second.recommended.map((language) => language.code),
    first.recommended.map((language) => language.code)
  );
  assert.deepEqual(
    second.global.map((language) => language.code),
    first.global.map((language) => language.code)
  );
  assert.deepEqual(
    engine.searchCountries('nep', 'en').map((country) => country.code),
    engine.searchCountries('nep', 'en').map((country) => country.code)
  );
});

test('language codes match exactly while name fragments match by substring', () => {
  assert.equal(engine.searchLanguages('nep', null).global[0]?.code, 'ne', 'ISO 639-3 code');
  assert.equal(engine.searchLanguages('pan', null).global[0]?.code, 'pa', 'ISO 639-3 code');
  assert.equal(engine.searchLanguages('panj', null).global[0]?.code, 'pa', 'name fragment');
  assert.equal(engine.searchLanguages('Punjabi', null).global[0]?.code, 'pa', 'alias');
});

test('country lookups ignore code case and return nothing for a missing or unknown code', () => {
  assert.equal(engine.getCountryByCode('np')?.name, 'Nepal');
  assert.equal(engine.getCountryByCode(null), null);
  assert.equal(engine.getCountryByCode(''), null);
  assert.equal(engine.getCountryByCode('ZZ'), null);
  assert.equal(engine.getCountryDisplayName('ZZ', 'es'), '');
  assert.equal(engine.getCountryDisplayName(undefined), '');
});

test('country display names use the offline labels when Intl.DisplayNames rejects the locale', (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DisplayNames')!;
  Object.defineProperty(Intl, 'DisplayNames', {
    ...descriptor,
    value: function ThrowingDisplayNames() {
      throw new RangeError('Incorrect locale information provided');
    },
  });
  context.after(() => Object.defineProperty(Intl, 'DisplayNames', descriptor));
  const offlineEngine = createLocaleSearchEngine(localeCatalog);

  assert.equal(offlineEngine.getCountryDisplayName('US', 'fr'), 'États-Unis');
  assert.equal(offlineEngine.getCountryDisplayName('DE', 'es'), 'Alemania');
});

test('country search stops at the requested limit', () => {
  assert.deepEqual(
    engine.searchCountries('', 'en', 2).map((country) => country.code),
    ['DE', 'IN']
  );
  assert.equal(engine.searchCountries('i', 'en', 1).length, 1);
});

test('language codes resolve by app code, ISO 639-1, or ISO 639-3 in any case', () => {
  assert.equal(engine.getLanguageByCode('NE')?.name, 'Nepali');
  assert.equal(engine.getLanguageByCode('HIN')?.code, 'hi');
  assert.equal(engine.getLanguageByCode('cpe')?.code, 'cpe');
  assert.equal(engine.getLanguageByCode('xx'), null);
  assert.equal(engine.getLanguageByCode(null), null);
  assert.equal(engine.getLanguageByCode(''), null);
});

test('recommended languages skip codes missing from the catalog and respect the limit', () => {
  const sparseEngine = createLocaleSearchEngine({
    countries: [{ code: 'CH', name: 'Switzerland', languageCodes: ['de', 'xx', 'deu', 'fr'] }],
    languages: [
      {
        code: 'de',
        iso6391: 'de',
        iso6393: 'deu',
        name: 'German',
        nativeName: 'Deutsch',
        aliases: [],
        countryCodes: ['CH'],
      },
      {
        code: 'fr',
        iso6391: 'fr',
        iso6393: 'fra',
        name: 'French',
        nativeName: 'Français',
        aliases: [],
        countryCodes: ['CH'],
      },
    ],
  });

  assert.deepEqual(
    sparseEngine.getRecommendedLanguages('ch').map((language) => language.code),
    ['de', 'fr']
  );
  assert.deepEqual(
    sparseEngine.getRecommendedLanguages('CH', 1).map((language) => language.code),
    ['de']
  );
  assert.deepEqual(sparseEngine.getRecommendedLanguages('ZZ'), []);
  assert.deepEqual(sparseEngine.getRecommendedLanguages(undefined), []);
});

test('languages resolve by name, native name, or alias regardless of case and padding', () => {
  assert.equal(engine.getLanguageByName('Nepali')?.code, 'ne');
  assert.equal(engine.getLanguageByName('  नेपाली ')?.code, 'ne');
  assert.equal(engine.getLanguageByName('PUNJABI')?.code, 'pa');
  assert.equal(engine.getLanguageByName('Klingon'), null);
  assert.equal(engine.getLanguageByName(null), null);
  assert.equal(engine.getLanguageByName(''), null);
});

test('a name shared by two languages resolves to the one sorted first, and blank names never resolve', () => {
  const collidingEngine = createLocaleSearchEngine({
    countries: [],
    languages: [
      {
        code: 'zh-hant',
        iso6391: null,
        iso6393: null,
        name: 'Chinese Traditional',
        nativeName: '繁體中文',
        aliases: ['Chinese', ''],
        countryCodes: [],
      },
      {
        code: 'zh',
        iso6391: 'zh',
        iso6393: 'zho',
        name: 'Chinese',
        nativeName: '中文',
        aliases: ['Chinese Simplified', '   '],
        countryCodes: [],
      },
    ],
  });

  // 'Chinese' sorts before 'Chinese Traditional', so its own name wins the collision.
  assert.equal(collidingEngine.getLanguageByName('chinese')?.code, 'zh');
  assert.equal(collidingEngine.getLanguageByName('Chinese Simplified')?.code, 'zh');
  assert.equal(collidingEngine.getLanguageByName('繁體中文')?.code, 'zh-hant');
  assert.equal(collidingEngine.getLanguageByName('   '), null);
});

test('only languages with a supported ISO 639-1 code map to an app interface language', () => {
  const welsh = {
    code: 'cy',
    iso6391: 'cy',
    iso6393: 'cym',
    name: 'Welsh',
    nativeName: 'Cymraeg',
    aliases: [],
    countryCodes: ['GB'],
  };

  assert.equal(engine.mapLanguageToAppLanguage(engine.getLanguageByCode('ne')), 'ne');
  assert.equal(engine.mapLanguageToAppLanguage(engine.getLanguageByCode('pa')), 'pa');
  assert.equal(engine.mapLanguageToAppLanguage(welsh), null);
  assert.equal(engine.mapLanguageToAppLanguage(engine.getLanguageByCode('cpe')), null);
  assert.equal(engine.mapLanguageToAppLanguage(null), null);
});
