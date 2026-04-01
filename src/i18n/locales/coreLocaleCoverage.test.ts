import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from './en';
import { hi } from './hi';
import { ne } from './ne';
import { ru } from './ru';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const flattenEntries = (tree: TranslationTree, prefix = ''): Array<[string, string]> =>
  Object.entries(tree).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[nextKey, value]] : flattenEntries(value, nextKey);
  });

const englishEntries = Object.fromEntries(flattenEntries(en as TranslationTree));
const englishKeys = Object.keys(englishEntries).sort();
const allowedEnglishValues = new Set(['auth.emailPlaceholder', 'gather.lessonsProgress']);

for (const [code, locale] of Object.entries({ hi, ne, ru })) {
  test(`${code} preserves the full English keyset`, () => {
    const localeEntries = Object.fromEntries(flattenEntries(locale as TranslationTree));
    assert.deepEqual(Object.keys(localeEntries).sort(), englishKeys);
  });

  test(`${code} does not leave interface strings in English`, () => {
    const localeEntries = Object.fromEntries(flattenEntries(locale as TranslationTree));
    const untranslated = englishKeys.filter((key) => {
      if (allowedEnglishValues.has(key)) {
        return false;
      }

      const localeValue = localeEntries[key];
      const englishValue = englishEntries[key];
      return localeValue === englishValue && /[A-Za-z]/.test(localeValue);
    });

    assert.deepEqual(untranslated, []);
  });
}
