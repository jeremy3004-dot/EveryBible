import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { localeLoaders } from './localeLoaders';

test('localeLoaders covers every non-English supported language', () => {
  const expectedLanguageCodes = SUPPORTED_LANGUAGES.map((language) => language.code)
    .filter((code) => code !== 'en')
    .sort();

  assert.deepEqual(Object.keys(localeLoaders).sort(), expectedLanguageCodes);
});

test('localeLoaders resolve representative locale payloads', async () => {
  for (const languageCode of ['ar', 'es', 'ne'] as const) {
    const locale = await localeLoaders[languageCode]();
    const common = locale.common as { cancel?: unknown } | undefined;

    assert.equal(
      typeof common?.cancel,
      'string',
      `${languageCode} should resolve a translation payload`
    );
  }
});
