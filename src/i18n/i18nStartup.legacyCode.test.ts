import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';

// The real src/i18n/index.ts on a first launch (no saved preference) on an Android phone set
// to Indonesian. java.util.Locale#getLanguage() reports the withdrawn code "in", so a plain
// lookup of languageCode in SUPPORTED_LANGUAGES booted these users in English. Own file
// because i18n initialises at import time.
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  getPersistedLanguagePreference: () => null,
});
mockModule(mock, 'expo-localization', {
  getLocales: () => [{ languageCode: 'in', languageTag: 'id-ID', regionCode: 'ID' }],
});

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

test('an Android Indonesian device with no saved preference boots in Indonesian', async () => {
  const { default: i18n, getCurrentLanguage } = await import('./index');

  assert.equal(i18n.language, 'id');
  assert.equal(getCurrentLanguage(), 'id');
  assert.deepEqual(requested, ['id']);
});
