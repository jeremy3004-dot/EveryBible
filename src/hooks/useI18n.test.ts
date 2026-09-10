import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, sourcePath } from '../testing/mockModules';
import { LANGUAGES, type LanguageCode } from '../constants/languages';
import type { UserPreferences } from '../types';
import type { useI18n as UseI18n } from './useI18n';

// ---------------------------------------------------------------------------
// Mocks. `useEffect` runs its effect immediately so one call of useI18n() is one
// mount; `useCallback` is the identity so the returned setLanguage is the real
// implementation.
// ---------------------------------------------------------------------------

mockModule(mock, 'react', {
  useEffect: (effect: () => void | (() => void)) => {
    effect();
  },
  useCallback: <T>(callback: T) => callback,
});

// react-i18next resolves to dist/es for `import` but to dist/commonjs for the
// `require` tsx emits here, so the bare specifier alone would not intercept it.
const requireFrom = createRequire(import.meta.url);
const i18nInstance = { language: 'en', __marker: 'i18n-instance' };
mockModule(mock, requireFrom.resolve('react-i18next'), {
  useTranslation: () => ({ t: (key: string) => `t:${key}`, i18n: i18nInstance }),
});

let currentLanguage: LanguageCode = 'en';
const changeLanguageCalls: string[] = [];
let changeLanguageResult: () => Promise<void> = async () => {};
mockModule(mock, sourcePath('i18n/index.ts'), {
  changeLanguage: async (language: LanguageCode) => {
    changeLanguageCalls.push(language);
    await changeLanguageResult();
    currentLanguage = language;
  },
  getCurrentLanguage: () => currentLanguage,
});

const preferenceWrites: Array<Partial<UserPreferences>> = [];
const authState: {
  preferences: { language: LanguageCode | '' };
  setPreferences: (prefs: Partial<UserPreferences>) => void;
} = {
  preferences: { language: 'en' },
  setPreferences: (prefs) => {
    preferenceWrites.push(prefs);
  },
};
const useAuthStore = Object.assign(
  <T>(selector: (state: typeof authState) => T): T => selector(authState),
  { getState: () => authState }
);
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore });

let syncPreferenceCalls = 0;
let syncPreferencesResult: () => Promise<unknown> = async () => ({ success: true });
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncPreferences: () => {
    syncPreferenceCalls += 1;
    return syncPreferencesResult();
  },
});

let useI18n: typeof UseI18n;

const flush = () => new Promise((resolve) => setImmediate(resolve));

before(async () => {
  ({ useI18n } = await import('./useI18n'));
});

beforeEach(() => {
  currentLanguage = 'en';
  authState.preferences = { language: 'en' };
  changeLanguageCalls.length = 0;
  preferenceWrites.length = 0;
  syncPreferenceCalls = 0;
  changeLanguageResult = async () => {};
  syncPreferencesResult = async () => ({ success: true });
});

test('mounting with the preference already active does not re-apply the language', () => {
  useI18n();

  assert.deepEqual(changeLanguageCalls, []);
});

test('mounting with a stored preference i18n has not applied yet switches the language', () => {
  authState.preferences = { language: 'es' };

  useI18n();

  assert.deepEqual(changeLanguageCalls, ['es']);
});

test('mounting with no stored language preference leaves i18n alone', () => {
  authState.preferences = { language: '' };

  useI18n();

  assert.deepEqual(changeLanguageCalls, []);
});

test('the hook reports the stored language and its descriptor', () => {
  authState.preferences = { language: 'ar' };

  const i18n = useI18n();

  assert.equal(i18n.currentLanguage, 'ar');
  assert.equal(i18n.languageInfo, LANGUAGES.ar);
  assert.equal(i18n.languageInfo.direction, 'rtl');
});

test('a reader with no stored language preference falls back to English', () => {
  authState.preferences = { language: '' };

  const i18n = useI18n();

  assert.equal(i18n.currentLanguage, 'en');
  assert.equal(i18n.languageInfo, LANGUAGES.en);
});

test('the hook exposes the whole supported-language catalogue for pickers', () => {
  assert.equal(useI18n().availableLanguages, LANGUAGES);
});

test('the hook passes through the translator and the i18next instance', () => {
  const i18n = useI18n();

  assert.equal(i18n.t('tabs.home'), 't:tabs.home');
  assert.equal(i18n.i18n, i18nInstance);
});

test('choosing a language applies it, stores it and pushes it to the cloud', async () => {
  await useI18n().setLanguage('fr');

  assert.deepEqual(changeLanguageCalls, ['fr']);
  assert.deepEqual(preferenceWrites, [{ language: 'fr' }]);
  assert.equal(syncPreferenceCalls, 1);
});

test('choosing a language applies it to i18n before the preference is stored', async () => {
  const order: string[] = [];
  changeLanguageResult = async () => {
    order.push('changeLanguage');
  };
  authState.setPreferences = (prefs) => {
    order.push('setPreferences');
    preferenceWrites.push(prefs);
  };

  try {
    await useI18n().setLanguage('de');
  } finally {
    authState.setPreferences = (prefs) => {
      preferenceWrites.push(prefs);
    };
  }

  assert.deepEqual(order, ['changeLanguage', 'setPreferences']);
});

test('a language that fails to load is not stored as the preference', async () => {
  changeLanguageResult = async () => {
    throw new Error('locale bundle missing');
  };

  await assert.rejects(() => useI18n().setLanguage('ja'), /locale bundle missing/);
  assert.deepEqual(preferenceWrites, []);
  assert.equal(syncPreferenceCalls, 0);
});

test('a failing preference sync never surfaces as an unhandled rejection', async () => {
  syncPreferencesResult = async () => {
    throw new Error('offline');
  };

  await useI18n().setLanguage('ko');
  await flush();

  assert.deepEqual(preferenceWrites, [{ language: 'ko' }]);
});

test('a remount after the language has been applied does not apply it a second time', async () => {
  authState.preferences = { language: 'es' };
  useI18n();
  assert.deepEqual(changeLanguageCalls, ['es']);
  await flush();

  useI18n();

  assert.deepEqual(changeLanguageCalls, ['es']);
});
