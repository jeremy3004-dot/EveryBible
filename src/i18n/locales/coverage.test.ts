import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { en } from './en';
import { sharedTranslationValues } from './sharedTranslationValues';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const pluralStem = (key: string): string => key.replace(/_(zero|one|two|few|many|other)$/, '');
const isLocalePluralKey = (key: string, english: Set<string>, code: string): boolean => {
  const suffix = key.match(/_(zero|one|two|few|many|other)$/)?.[1];
  return (
    !!suffix &&
    new Intl.PluralRules(code)
      .resolvedOptions()
      .pluralCategories.includes(suffix as Intl.LDMLPluralRule) &&
    english.has(`${pluralStem(key)}_other`)
  );
};

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
    const unexpectedKeys = localeKeys.filter(
      (key) => !englishKeySet.has(key) && !isLocalePluralKey(key, englishKeySet, language.code)
    );

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

    assert.deepEqual(
      localeKeys.filter((key) => englishKeys.includes(key)),
      englishKeys,
      `Missing or mismatched locale keys for ${language.code}`
    );
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
      if (sharedTranslationValues[language.code]?.[key] === englishEntries[key]) {
        return false;
      }

      const localeValue = localeEntries[key];
      const englishValue = englishEntries[key];
      return (
        localeValue === englishValue && /[A-Za-z]/.test(localeValue.replace(/\{\{[^}]+\}\}/g, ''))
      );
    });

    assert.deepEqual(untranslated, [], `English strings leaked in ${language.code}`);
  }
});

test('all locale placeholders, plural forms, and translation text are valid', async () => {
  const english = Object.fromEntries(flattenEntries(en as TranslationTree));
  const pluralStems = Object.keys(english)
    .filter((key) => key.endsWith('_other'))
    .map(pluralStem);
  const placeholders = (value: string) => (value.match(/\{\{[^}]+\}\}/g) ?? []).sort();
  for (const { code } of SUPPORTED_LANGUAGES) {
    const module = await import(
      pathToFileURL(path.join(process.cwd(), 'src/i18n/locales', `${code}.ts`)).href
    );
    const entries = Object.fromEntries(flattenEntries(module[code]));
    for (const [key, value] of Object.entries(entries)) {
      assert.ok(value.trim(), `${code}.${key} must not be blank`);
      assert.doesNotMatch(
        value,
        /__CTX_|PH_\d+|EVERY_?BIBLE_APP|\u200b|\ufffd/,
        `${code}.${key} contains a translation artifact`
      );
      const source = english[key] ?? english[`${pluralStem(key)}_other`];
      assert.ok(source !== undefined, `${code}.${key} has no English source`);
      assert.deepEqual(
        placeholders(value),
        placeholders(source),
        `${code}.${key} changed interpolation tokens`
      );
    }
    for (const stem of pluralStems) {
      for (const category of new Intl.PluralRules(code).resolvedOptions().pluralCategories) {
        assert.ok(entries[`${stem}_${category}`], `${code} is missing ${stem}_${category}`);
      }
    }
  }
});
