import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { en } from './en';
import { ar } from './ar';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const flattenEntries = (tree: TranslationTree, prefix = ''): Array<[string, string]> =>
  Object.entries(tree).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[nextKey, value]] : flattenEntries(value, nextKey);
  });

const englishEntries = Object.fromEntries(flattenEntries(en as TranslationTree));
const coreLocaleCodes = ['es', 'hi', 'ru', 'ne'] as const;
const criticalLocalizedKeys = [
  'audio.showTextHint',
  'about.resources',
  'about.madeWithLove',
  'readingPlans.completeDayHint',
  'prayer.ownerLongPressHint',
  'gather.moreOptions',
  'bible.nextChapterHint',
  'bible.openBookAndChapterPickerHint',
  'bible.openTranslationOptionsHint',
  'bible.returnToPlanHint',
] as const;

for (const languageCode of coreLocaleCodes) {
  test(`${languageCode} includes the critical translated UI keys`, async () => {
    const localeFile = path.join(process.cwd(), 'src/i18n/locales', `${languageCode}.ts`);
    const localeModule = await import(pathToFileURL(localeFile).href);
    const locale = localeModule[languageCode] as TranslationTree | undefined;

    assert.ok(locale, `Expected locale export for ${languageCode}`);
    const localeEntries = Object.fromEntries(flattenEntries(locale));
    for (const key of criticalLocalizedKeys) {
      assert.ok(key in localeEntries, `Expected ${languageCode} to define ${key}`);
    }
  });

  test(`${languageCode} does not leave the critical UI keys in English`, async () => {
    const localeFile = path.join(process.cwd(), 'src/i18n/locales', `${languageCode}.ts`);
    const localeModule = await import(pathToFileURL(localeFile).href);
    const locale = localeModule[languageCode] as TranslationTree | undefined;

    assert.ok(locale, `Expected locale export for ${languageCode}`);
    const localeEntries = Object.fromEntries(flattenEntries(locale));
    const untranslated = criticalLocalizedKeys.filter((key) => {
      const localeValue = localeEntries[key];
      const englishValue = englishEntries[key];
      return localeValue === englishValue && /[A-Za-z]/.test(localeValue);
    });

    assert.deepEqual(untranslated, []);
  });
}
test('Arabic Settings and Home labels use the intended UI meanings', () => {
  assert.equal(ar.settings.fontSizeMedium, 'متوسط');
  assert.equal(ar.settings.themeMode, 'المظهر');
  assert.equal(ar.settings.themeLight, 'فاتح');
  assert.equal(ar.settings.themeDark, 'داكن');
  assert.equal(ar.settings.nationAndLanguage, 'البلد ولغة الكتاب المقدس');
  assert.equal(ar.settings.chapterFeedback, 'ملاحظات الفصل');
  assert.equal(ar.settings.chapterFeedbackIdentity, 'هوية الملاحظات');
  assert.equal(ar.bible.chapterFeedback, 'ملاحظات الفصل');
  assert.equal(ar.tabs.home, 'الرئيسية');
  assert.equal(ar.tabs.more, 'المزيد');
  assert.equal(ar.tabs.gather, 'اجتماع');
  assert.equal(ar.common.continue, 'متابعة');
  assert.equal(ar.groups.share, 'مشاركة');
});
