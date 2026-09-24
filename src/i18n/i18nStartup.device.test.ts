import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';

// The real src/i18n/index.ts on a first launch (no saved preference) on an English
// device: nothing beyond the bundled English is loaded. Own file because i18n
// initialises at import time.
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  getPersistedLanguagePreference: () => null,
});
mockModule(mock, 'expo-localization', { getLocales: () => [{ languageCode: 'en' }] });

const requested: string[] = [];
mockModule(mock, sourcePath('i18n/localeLoaders.ts'), {
  localeLoaders: new Proxy(
    {},
    {
      get: (_target, code) => async () => {
        requested.push(String(code));
        return {};
      },
    }
  ),
});

test('an English device with no saved preference boots in English without loading a locale', async () => {
  const { default: i18n, getCurrentLanguage } = await import('./index');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(i18n.language, 'en');
  assert.equal(getCurrentLanguage(), 'en');
  assert.deepEqual(requested, []);
});
