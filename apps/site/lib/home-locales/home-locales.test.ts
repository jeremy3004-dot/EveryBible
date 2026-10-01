import assert from 'node:assert/strict';
import test from 'node:test';

import { homeCopyEn } from '../home-copy';
import {
  HOME_LOCALE_CODES,
  homeAlternateLanguages,
  PUBLISHED_HOME_LOCALE_CODES,
} from '../home-locale-meta';
import { ALL_HOME_LOCALES, HOME_LOCALES, homeCopyFor } from './index';

const EXPECTED_CODES = [
  'zh',
  'hi',
  'es',
  'ar',
  'fr',
  'bn',
  'pt',
  'ru',
  'ur',
  'id',
  'de',
  'ja',
  'pa',
  'mr',
  'te',
  'tr',
  'ta',
  'vi',
  'ko',
  'ne',
];

/** Strings that may legitimately match English: the brand name, kept in Latin. */
const SAME_AS_ENGLISH_ALLOWED = new Set<string>([
  'story.inTheApp.eyebrow', // EveryBible
]);
/** A locale may share at most this many other strings with English. */
const MAX_SAME_AS_ENGLISH = 3;
/* Words that are genuinely spelled the same in a language, not left untranslated. */
const COGNATES: Partial<Record<string, ReadonlySet<string>>> = {
  fr: new Set(['nav.bible', 'nav.plans', 'nav.mission', 'nav.menu']),
};

interface Leaf {
  path: string;
  value: string;
}

/** Every string in a copy tree, with a dotted path; arrays use `[i]`. */
function leaves(value: unknown, path = ''): Leaf[] {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => leaves(item, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key)
    );
  throw new Error(`Unexpected ${typeof value} at ${path}`);
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const copyLeaves = (copy: unknown) =>
  leaves(copy).filter((leaf) => leaf.path !== 'locale' && leaf.path !== 'dir');
const english = new Map(copyLeaves(homeCopyEn).map((leaf) => [leaf.path, leaf.value]));

test('the registry has exactly the 20 non-English interface languages, in app order', () => {
  assert.deepEqual(
    HOME_LOCALES.map((locale) => locale.code),
    EXPECTED_CODES
  );
  assert.deepEqual([...HOME_LOCALE_CODES], EXPECTED_CODES);
  assert.equal(ALL_HOME_LOCALES.length, 21);
  assert.equal(ALL_HOME_LOCALES[0].code, 'en');
  for (const locale of HOME_LOCALES) assert.ok(locale.nativeName.trim(), locale.code);
  assert.equal(homeCopyFor('es'), HOME_LOCALES.find((l) => l.code === 'es')?.copy);
  assert.equal(homeCopyFor('xx'), homeCopyEn);
});

test('hreflang lists only published homepages', () => {
  const published = homeAlternateLanguages();
  assert.equal(Object.keys(published).length, PUBLISHED_HOME_LOCALE_CODES.length + 2);
  assert.equal(published['x-default'], '/');
  for (const code of HOME_LOCALE_CODES)
    if (!PUBLISHED_HOME_LOCALE_CODES.includes(code))
      assert.equal(
        published[code === 'zh' ? 'zh-Hans' : code],
        undefined,
        `${code} is not live yet`
      );
});

test('hreflang can cover all 21 homepages and x-default once published', () => {
  const languages = homeAlternateLanguages(['en', ...HOME_LOCALE_CODES]);
  assert.equal(Object.keys(languages).length, 22);
  assert.equal(languages['en'], '/');
  assert.equal(languages['x-default'], '/');
  assert.equal(languages['zh-Hans'], '/zh');
  assert.equal(languages['ar'], '/ar');
});

for (const { code, copy } of HOME_LOCALES) {
  test(`${code}: same keys, shape and placeholders as English`, () => {
    const mine = new Map(copyLeaves(copy).map((leaf) => [leaf.path, leaf.value]));
    assert.deepEqual([...mine.keys()].sort(), [...english.keys()].sort());
    for (const [path, value] of mine) {
      assert.ok(value.trim().length > 0, `${path} is empty`);
      assert.deepEqual(
        placeholders(value),
        placeholders(english.get(path) ?? ''),
        `${path} placeholders differ`
      );
    }
  });

  test(`${code}: direction and locale tag`, () => {
    assert.equal(copy.dir, code === 'ar' || code === 'ur' ? 'rtl' : 'ltr');
    assert.equal(copy.locale, code === 'zh' ? 'zh-Hans' : code);
  });

  test(`${code}: is translated, not copied from English`, () => {
    const same = copyLeaves(copy).filter(
      (leaf) =>
        leaf.value === english.get(leaf.path) &&
        !SAME_AS_ENGLISH_ALLOWED.has(leaf.path) &&
        !COGNATES[code]?.has(leaf.path)
    );
    assert.ok(
      same.length <= MAX_SAME_AS_ENGLISH,
      `identical to English: ${same.map((leaf) => leaf.path).join(', ')}`
    );
  });
}
