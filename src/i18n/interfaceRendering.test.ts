import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { en } from './locales/en';
import { localeLoaders } from './localeLoaders';
import {
  buildCalendarLocale,
  formatListeningTime,
  formatRelativeTime,
} from './interfaceFormatting';
import {
  localizeRhythmPreset,
  getLocalizedRhythmTitle,
  getLocalizedPassageTitle,
} from '../services/plans/rhythmLocalization';
import { RHYTHM_PRESET_LIBRARY } from '../services/plans/rhythmPresets';
import { buildBookCompanionSections } from '../screens/bible/bookCompanionModel';
import { bibleBookExperienceContent } from '../data/bibleBookExperience';
import {
  FOUNDATION_TITLE_KEYS,
  FOUNDATION_DESC_KEYS,
  FOUNDATION_LESSON_TITLE_KEYS,
} from '../data/gatherFoundations';
import {
  WISDOM_CATEGORY_NAME_KEYS,
  WISDOM_TITLE_KEYS,
  WISDOM_LESSON_TITLE_KEYS,
} from '../data/gatherWisdom';

function flatten(tree: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const name = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string' ? [[name, value]] : Object.entries(flatten(value, name));
    })
  );
}

for (const { code } of SUPPORTED_LANGUAGES) {
  test(`${code} renders every bundled interface string without fallback or unresolved tokens`, async () => {
    const locale = code === 'en' ? en : await localeLoaders[code]();
    const instance = createInstance();
    await instance.init({
      lng: code,
      fallbackLng: false,
      resources: { [code]: { translation: locale } },
    });
    const t = instance.getFixedT(code);
    for (const [key, value] of Object.entries(flatten(locale))) {
      const tokens = [...value.matchAll(/\{\{\s*([^},]+)(?:,[^}]+)?\}\}/g)].map(
        (match) => match[1]
      );
      const variables = Object.fromEntries(
        tokens.map((token) => [token, token === 'count' ? 2 : '7'])
      );
      const result = t(key, { ...variables, returnDetails: true });
      assert.equal(result.usedLng, code, `${code}.${key} fell back`);
      assert.equal(typeof result.res, 'string', `${code}.${key} did not render text`);
      assert.notEqual(result.res, key, `${code}.${key} returned its key`);
      assert.doesNotMatch(String(result.res), /\{\{/, `${code}.${key} left an unresolved token`);
    }
    for (const key of Object.keys(flatten(en)).filter((key) => key.endsWith('_other'))) {
      for (const count of [0, 1, 2, 3, 5, 11, 21, 100, 1_000_000]) {
        const result = t(key.replace(/_other$/, ''), { count, returnDetails: true });
        assert.equal(result.usedLng, code, `${code}.${key} count ${count} fell back`);
        assert.ok(!String(result.res).includes(key.replace(/_other$/, '')));
      }
    }
    for (const map of [
      FOUNDATION_TITLE_KEYS,
      FOUNDATION_DESC_KEYS,
      FOUNDATION_LESSON_TITLE_KEYS,
      WISDOM_CATEGORY_NAME_KEYS,
      WISDOM_TITLE_KEYS,
      WISDOM_LESSON_TITLE_KEYS,
    ]) {
      for (const key of Object.values(map))
        assert.notEqual(t(key), key, `${code}.${key} missing content label`);
    }
    for (const preset of RHYTHM_PRESET_LIBRARY) {
      const localized = localizeRhythmPreset(preset, t);
      assert.equal(localized.id, preset.id);
      assert.equal(localized.title, t(`interface.rhythmPresets.${preset.id}.title`));
      assert.equal(getLocalizedRhythmTitle(preset.title, t), localized.title);
      assert.ok(!JSON.stringify(localized).includes('interface.'));
    }
    for (const bookId of Object.keys(bibleBookExperienceContent)) {
      const sections = buildBookCompanionSections(bookId, t);
      assert.ok(
        !JSON.stringify(sections).includes('interface.'),
        `${code}.${bookId} has untranslated companion content`
      );
    }
    const calendar = buildCalendarLocale(code, t('home.today'));
    assert.equal(calendar.monthNames.length, 12);
    assert.equal(calendar.dayNames.length, 7);
    assert.equal(new Set(calendar.monthNames).size, 12);
  });
}

test('time labels and built-in reference titles use the current translator without changing custom titles', async () => {
  const instance = createInstance();
  await instance.init({ lng: 'en', resources: { en: { translation: en } } });
  const t = instance.getFixedT('en');
  const now = Date.UTC(2026, 8, 5);
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  assert.equal(formatRelativeTime(ago(0), t, now), 'Just now');
  assert.equal(formatRelativeTime(ago(17), t, now), '17 min ago');
  assert.equal(formatRelativeTime(ago(180), t, now), '3 hr ago');
  assert.equal(formatRelativeTime(ago(2_880), t, now), '2 d ago');
  assert.equal(formatListeningTime(65, t), '1 hr 5 min');
  assert.equal(formatListeningTime(60, t), '1 hr');
  assert.equal(getLocalizedRhythmTitle('My personal prayer', t), 'My personal prayer');
  assert.equal(getLocalizedPassageTitle('My family prayer', 'PSA', 1, 1, t), 'My family prayer');
});
