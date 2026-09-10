import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('i18n startup keeps only English on the synchronous import path', () => {
  const source = readRelativeSource('./index.ts');

  assert.equal(
    source.includes("import * as locales from './locales'"),
    false,
    'i18n startup should not import the locale barrel because that pulls every locale into startup'
  );
  assert.equal(
    source.includes("from './locales';"),
    false,
    'i18n startup should not import from the locale barrel'
  );
  assert.match(
    source,
    /import \{ en \} from '\.\/locales\/en';/,
    'i18n startup should synchronously import only the English fallback locale'
  );
  assert.match(
    source,
    /resources = \{\s*en:\s*\{\s*translation:\s*en,\s*\},\s*\};/s,
    'i18n should initialize with only English resources'
  );
});

test('changeLanguage loads locale resources before switching languages', () => {
  const source = readRelativeSource('./index.ts');

  assert.match(
    source,
    /async function ensureLanguageResources\(lang: LanguageCode\): Promise<void>/,
    'i18n should expose an internal async resource loader'
  );
  assert.match(
    source,
    /i18n\.hasResourceBundle\(lang, 'translation'\)/,
    'i18n should avoid reloading languages that are already registered'
  );
  assert.match(
    source,
    /languageResourceLoads\.get\(lang\)/,
    'i18n should reuse in-flight language resource loads'
  );
  assert.match(
    source,
    /i18n\.addResourceBundle\(lang, 'translation', translation, true, true\)/,
    'i18n should register dynamically loaded locale payloads'
  );
  assert.match(
    source,
    /export const changeLanguage = async \(lang: LanguageCode\) => \{\s*await ensureLanguageResources\(lang\);\s*return i18n\.changeLanguage\(lang\);\s*\};/s,
    'changeLanguage should wait for resources before switching languages'
  );
});

test('i18n boots in the persisted language rather than eagerly loading the device locale', () => {
  const source = readRelativeSource('./index.ts');

  assert.match(
    source,
    /const persistedLanguage = getPersistedLanguagePreference\(\);/,
    'i18n should consult the persisted interface-language preference before falling back to the device locale'
  );
  assert.match(
    source,
    /import \{ getPersistedLanguagePreference \} from '\.\.\/stores\/mmkvStorage';/,
    'the preference should be read straight out of MMKV, without hydrating the auth store'
  );

  const persistedIndex = source.indexOf(
    'const persistedLanguage = getPersistedLanguagePreference()'
  );
  const deviceLocaleIndex = source.indexOf('Localization.getLocales()');
  assert.ok(
    persistedIndex !== -1 && deviceLocaleIndex !== -1 && persistedIndex < deviceLocaleIndex,
    'the persisted preference must win over the device locale, otherwise boot loads a locale module App.tsx immediately discards'
  );

  assert.match(
    source,
    /if \(initialLanguage !== DEFAULT_LANGUAGE\) \{\s*void ensureLanguageResources\(initialLanguage\)/,
    'i18n should still preload exactly one non-English locale module, and only when one is actually needed'
  );
});
