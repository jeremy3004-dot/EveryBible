import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';

// The real src/i18n/index.ts, booted with a persisted Nepali preference on a French
// device. Initialisation happens at import time, so each boot scenario has its own file
// (i18nStartup.device.test.ts covers the device-locale fallback).
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  getPersistedLanguagePreference: () => 'ne',
});
mockModule(mock, 'expo-localization', { getLocales: () => [{ languageCode: 'fr' }] });

// Locale modules resolve when the test says so, so load ordering is observable.
const requested: string[] = [];
const pending = new Map<string, (value: Record<string, unknown>) => void>();
const loader = (code: string) => () => {
  requested.push(code);
  return new Promise<Record<string, unknown>>((resolve) => pending.set(code, resolve));
};
mockModule(mock, sourcePath('i18n/localeLoaders.ts'), {
  localeLoaders: { ne: loader('ne'), fr: loader('fr'), es: loader('es') },
});

const load = () => import('./index');
const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('boot uses the persisted language and preloads only that one locale', async () => {
  const { default: i18n } = await load();

  assert.equal(i18n.language, 'ne');
  assert.deepEqual(requested, ['ne'], 'the French device locale is never loaded');
  assert.deepEqual(Object.keys(i18n.options.resources ?? {}), ['en'], 'only English is bundled');

  pending.get('ne')?.({ tabs: { home: 'गृह' } });
  await settle();
  assert.equal(i18n.hasResourceBundle('ne', 'translation'), true);
  assert.equal(i18n.t('tabs.home'), 'गृह');
});

test('changeLanguage loads a locale before switching to it', async () => {
  const { default: i18n, changeLanguage } = await load();
  requested.length = 0;

  const switching = changeLanguage('fr');
  await settle();
  assert.deepEqual(requested, ['fr']);
  assert.equal(i18n.language, 'ne', 'the language does not change until French has loaded');

  pending.get('fr')?.({ tabs: { home: 'Accueil' } });
  await switching;
  assert.equal(i18n.language, 'fr');
  assert.equal(i18n.t('tabs.home'), 'Accueil');
});

test('concurrent switches share one load, and a loaded locale is not fetched again', async () => {
  const { changeLanguage } = await load();
  requested.length = 0;

  const first = changeLanguage('es');
  const second = changeLanguage('es');
  await settle();
  assert.deepEqual(requested, ['es']);
  pending.get('es')?.({ tabs: { home: 'Inicio' } });
  await Promise.all([first, second]);

  await changeLanguage('fr');
  await changeLanguage('en');
  assert.deepEqual(requested, ['es']);
});
