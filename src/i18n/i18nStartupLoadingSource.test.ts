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
