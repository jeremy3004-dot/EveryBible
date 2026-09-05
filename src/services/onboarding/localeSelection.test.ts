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
