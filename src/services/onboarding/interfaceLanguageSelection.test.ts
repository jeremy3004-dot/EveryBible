import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERFACE_LANGUAGE_CODES, interfaceLanguageSearchEngine } from './interfaceLanguageSelection';

test('supports a broad global interface language set without dropping Nepali', () => {
  assert.ok(INTERFACE_LANGUAGE_CODES.length >= 20);

  const requiredLanguageCodes = ['en', 'zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'ur', 'id', 'de', 'ne'];

  for (const code of requiredLanguageCodes) {
    assert.ok(INTERFACE_LANGUAGE_CODES.includes(code));
  }
});

test('returns native app-language labels for major scripts', () => {
  assert.equal(interfaceLanguageSearchEngine.getLanguageByCode('en')?.appLanguageLabel, 'App language');
  assert.equal(interfaceLanguageSearchEngine.getLanguageByCode('zh')?.appLanguageLabel, '应用语言');
  assert.equal(interfaceLanguageSearchEngine.getLanguageByCode('hi')?.appLanguageLabel, 'ऐप भाषा');
  assert.equal(interfaceLanguageSearchEngine.getLanguageByCode('ar')?.appLanguageLabel, 'لغة التطبيق');
});

test('returns supported interface languages in declared order when the query is empty', () => {
  const results = interfaceLanguageSearchEngine.search('', 4);

  assert.deepEqual(
    results.map((language) => language.code),
    INTERFACE_LANGUAGE_CODES.slice(0, 4)
  );
});

test('matches interface languages by alias and native script', () => {
  assert.equal(interfaceLanguageSearchEngine.search('castellano', 1)[0]?.code, 'es');
  assert.equal(interfaceLanguageSearchEngine.search('नेपाली', 1)[0]?.code, 'ne');
});

test('fuzzy interface language search still finds misspelled queries', () => {
  const results = interfaceLanguageSearchEngine.search('manderin');

  assert.equal(results[0]?.code, 'zh');
});

test('does not return duplicate languages when prefix and fuzzy search both match', () => {
  const results = interfaceLanguageSearchEngine.search('english', 5);

  assert.deepEqual(results.map((language) => language.code), ['en']);
});
