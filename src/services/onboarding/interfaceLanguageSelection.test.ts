import test from 'node:test';
import assert from 'node:assert/strict';
import type { LanguageCode } from '../../constants/languages';
import {
  interfaceLanguageSearchEngine,
  INTERFACE_LANGUAGE_CODES,
} from './interfaceLanguageSelection';

test('supports a broad global interface language set without dropping Nepali', () => {
  assert.ok(INTERFACE_LANGUAGE_CODES.length >= 20);

  const majorLanguageCodes: LanguageCode[] = [
    'en',
    'zh',
    'hi',
    'es',
    'ar',
    'fr',
    'bn',
    'pt',
    'ru',
    'ur',
    'id',
    'de',
  ];

  for (const code of majorLanguageCodes) {
    assert.ok(INTERFACE_LANGUAGE_CODES.includes(code));
  }

  assert.ok(INTERFACE_LANGUAGE_CODES.includes('ne'));
});

test('returns native app-language labels for major scripts', () => {
  assert.equal(
    interfaceLanguageSearchEngine.getLanguageByCode('en')?.appLanguageLabel,
    'App language'
  );
  assert.equal(interfaceLanguageSearchEngine.getLanguageByCode('zh')?.appLanguageLabel, '应用语言');
  assert.equal(interfaceLanguageSearchEngine.getLanguageByCode('hi')?.appLanguageLabel, 'ऐप भाषा');
  assert.equal(
    interfaceLanguageSearchEngine.getLanguageByCode('ar')?.appLanguageLabel,
    'لغة التطبيق'
  );
});

test('fuzzy interface language search still finds misspelled queries', () => {
  const results = interfaceLanguageSearchEngine.search('manderin');

  assert.equal(results[0]?.code, 'zh');
});
