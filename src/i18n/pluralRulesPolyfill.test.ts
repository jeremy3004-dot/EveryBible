import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { installPluralRulesPolyfill, PluralRulesPolyfill } from './pluralRulesPolyfill';

// Node ships full ICU, so its Intl.PluralRules is the CLDR reference. Hermes on
// Android (and iOS) ships only Intl.Collator, DateTimeFormat and NumberFormat, so
// on device i18next silently falls back to an English-style one/other rule.
const NativePluralRules = Intl.PluralRules;

const SAMPLE_COUNTS = [
  ...Array.from({ length: 2_001 }, (_, index) => index),
  0.5,
  1.5,
  2.25,
  3.5,
  11.1,
  100.75,
  1_000_000,
  2_000_000,
  1_000_001,
  3_000_000,
];

for (const { code } of SUPPORTED_LANGUAGES) {
  test(`${code} cardinal plural categories match CLDR`, () => {
    const reference = new NativePluralRules(code);
    const polyfill = new PluralRulesPolyfill(code);

    assert.deepEqual(
      [...polyfill.resolvedOptions().pluralCategories].sort(),
      [...reference.resolvedOptions().pluralCategories].sort()
    );

    for (const count of SAMPLE_COUNTS) {
      assert.equal(
        polyfill.select(count),
        reference.select(count),
        `${code} select(${count}) should match CLDR`
      );
    }
  });
}

test('region and script subtags resolve to the base language rule', () => {
  assert.equal(new PluralRulesPolyfill('ru-RU').select(5), 'many');
  assert.equal(new PluralRulesPolyfill('zh-Hans').select(1), 'other');
  assert.equal(new PluralRulesPolyfill('pt_BR').select(0), 'one');
});

test('unknown languages keep the one/other rule i18next used before', () => {
  const rule = new PluralRulesPolyfill('dev');
  assert.equal(rule.select(1), 'one');
  assert.equal(rule.select(2), 'other');
  assert.deepEqual(rule.resolvedOptions().pluralCategories, ['one', 'other']);
});

test('resolvedOptions returns a fresh categories array each call', () => {
  // i18next sorts the array it receives in place.
  const rule = new PluralRulesPolyfill('ar');
  rule.resolvedOptions().pluralCategories.reverse();
  assert.deepEqual(rule.resolvedOptions().pluralCategories, [
    'zero',
    'one',
    'two',
    'few',
    'many',
    'other',
  ]);
});

test('ordinal rules are not faked; the constructor throws so i18next keeps its fallback', () => {
  assert.throws(() => new PluralRulesPolyfill('en', { type: 'ordinal' }), RangeError);
});

test('install only fills a missing Intl.PluralRules', () => {
  const withNative = { PluralRules: NativePluralRules } as unknown as typeof Intl;
  assert.equal(installPluralRulesPolyfill(withNative), false);
  assert.equal(withNative.PluralRules, NativePluralRules);

  const hermesLike = {} as typeof Intl;
  assert.equal(installPluralRulesPolyfill(hermesLike), true);
  assert.equal(hermesLike.PluralRules, PluralRulesPolyfill);
});

test('i18next picks Russian and Arabic plural forms when the runtime has no Intl.PluralRules', async (t) => {
  const intl = Intl as { PluralRules?: typeof Intl.PluralRules };
  delete intl.PluralRules;
  t.after(() => {
    intl.PluralRules = NativePluralRules;
  });

  installPluralRulesPolyfill(Intl);

  const instance = createInstance();
  await instance.init({
    lng: 'ru',
    resources: {
      ru: {
        translation: {
          days_one: '{{count}} день',
          days_few: '{{count}} дня',
          days_many: '{{count}} дней',
          days_other: '{{count}} дня',
        },
      },
      ar: {
        translation: {
          verses_zero: 'zero',
          verses_one: 'one',
          verses_two: 'two',
          verses_few: 'few',
          verses_many: 'many',
          verses_other: 'other',
        },
      },
    },
  });

  assert.equal(instance.t('days', { count: 1 }), '1 день');
  assert.equal(instance.t('days', { count: 3 }), '3 дня');
  assert.equal(instance.t('days', { count: 5 }), '5 дней');
  assert.equal(instance.t('days', { count: 11 }), '11 дней');

  await instance.changeLanguage('ar');
  assert.deepEqual(
    [0, 1, 2, 5, 11, 100].map((count) => instance.t('verses', { count })),
    ['zero', 'one', 'two', 'few', 'many', 'other']
  );
});
