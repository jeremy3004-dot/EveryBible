import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleSearchEngine } from './localeSelection';

const engine = createLocaleSearchEngine({
  countries: [
    { code: 'NP', name: 'Nepal', languageCodes: ['ne'] },
    { code: 'IN', name: 'India', languageCodes: ['hi', 'pa'] },
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
