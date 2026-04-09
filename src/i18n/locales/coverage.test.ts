import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { en } from './en';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const ALLOWED_ENGLISH_VALUES = new Set(['auth.emailPlaceholder', 'gather.lessonsProgress']);

const flattenEntries = (tree: TranslationTree, prefix = ''): Array<[string, string]> =>
  Object.entries(tree).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[nextKey, value]] : flattenEntries(value, nextKey);
  });

const flattenKeys = (tree: TranslationTree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [nextKey] : flattenKeys(value, nextKey);
  });

test('every supported interface language has a locale file', async () => {
  await Promise.all(
    SUPPORTED_LANGUAGES.map(async (language) => {
      const localeFile = path.join(process.cwd(), 'src/i18n/locales', `${language.code}.ts`);
      await access(localeFile);
    })
  );
});

test('every supported locale only uses keys defined by the English locale', async () => {
  const englishKeys = flattenKeys(en as TranslationTree).sort();
  const englishKeySet = new Set(englishKeys);

  for (const language of SUPPORTED_LANGUAGES) {
    if (language.code === 'en') {
      continue;
    }

    const localeFile = path.join(process.cwd(), 'src/i18n/locales', `${language.code}.ts`);
    const localeModule = await import(pathToFileURL(localeFile).href);
    const localeTree = localeModule[language.code] as TranslationTree | undefined;

    assert.ok(localeTree, `Expected locale export for ${language.code}`);
    const localeKeys = flattenKeys(localeTree).sort();
    const unexpectedKeys = localeKeys.filter((key) => !englishKeySet.has(key));

    assert.deepEqual(unexpectedKeys, [], `Unexpected locale keys for ${language.code}`);
  }
});

test('every supported locale preserves the full English keyset', async () => {
  const englishKeys = flattenKeys(en as TranslationTree).sort();

  for (const language of SUPPORTED_LANGUAGES) {
    if (language.code === 'en') {
      continue;
    }

    const localeFile = path.join(process.cwd(), 'src/i18n/locales', `${language.code}.ts`);
    const localeModule = await import(pathToFileURL(localeFile).href);
    const localeTree = localeModule[language.code] as TranslationTree | undefined;

    assert.ok(localeTree, `Expected locale export for ${language.code}`);
    const localeKeys = flattenKeys(localeTree).sort();

    assert.deepEqual(localeKeys, englishKeys, `Missing or mismatched locale keys for ${language.code}`);
  }
});

test('every supported locale translates user-facing English strings', async () => {
  const englishEntries = Object.fromEntries(flattenEntries(en as TranslationTree));

  for (const language of SUPPORTED_LANGUAGES) {
    if (language.code === 'en') {
      continue;
    }

    const localeFile = path.join(process.cwd(), 'src/i18n/locales', `${language.code}.ts`);
    const localeModule = await import(pathToFileURL(localeFile).href);
    const localeTree = localeModule[language.code] as TranslationTree | undefined;

    assert.ok(localeTree, `Expected locale export for ${language.code}`);
    const localeEntries = Object.fromEntries(flattenEntries(localeTree));
    const untranslated = Object.keys(englishEntries).filter((key) => {
      if (ALLOWED_ENGLISH_VALUES.has(key)) {
        return false;
      }

      const localeValue = localeEntries[key];
      const englishValue = englishEntries[key];
      return localeValue === englishValue && /[A-Za-z]/.test(localeValue);
    });

    assert.deepEqual(untranslated, [], `English strings leaked in ${language.code}`);
  }
});
