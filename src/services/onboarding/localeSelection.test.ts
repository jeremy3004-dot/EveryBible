import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleSearchEngine } from './localeSelection';

const engine = createLocaleSearchEngine({
  countries: [
    { code: 'NP', name: 'Nepal', languageCodes: ['ne'] },
    { code: 'IN', name: 'India', languageCodes: ['hi', 'pa'] },
    { code: 'DE', name: 'Germany', languageCodes: ['de'] },
    { code: 'GB', name: 'United Kingdom', languageCodes: ['en'] },
  ],
  languages: [
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
