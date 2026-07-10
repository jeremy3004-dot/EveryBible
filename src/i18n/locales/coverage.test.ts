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

const ALLOWED_ENGLISH_VALUES = new Set([
  'auth.emailPlaceholder',
  'gather.lessonsProgress',
  'bible.chapterFeedbackAudioIdle',
  'bible.chapterFeedbackAudioRecording',
  'bible.chapterFeedbackAudioReady',
  'bible.chapterFeedbackAudioLimit',
  'bible.chapterFeedbackAudioRecord',
  'bible.chapterFeedbackAudioStop',
  'bible.chapterFeedbackAudioPreview',
  'bible.chapterFeedbackAudioRerecord',
  'bible.chapterFeedbackAudioUploading',
  'bible.chapterFeedbackAudioPermissionDenied',
  'bible.chapterFeedbackAudioPermissionHelp',
  'bible.chapterFeedbackAudioStartError',
  'bible.chapterFeedbackAudioStopError',
  'bible.chapterFeedbackAudioRecordingMissing',
  'bible.chapterFeedbackAudioUploadError',
  'bible.translatorReviewTitle',
  'bible.translatorReviewSummary',
  'bible.translatorReviewSummaryComplete',
  'bible.translatorReviewLoading',
  'bible.translatorReviewEmpty',
  'bible.translatorReviewUnknownUser',
  'bible.translatorReviewUnread',
  'bible.translatorReviewSubmittedAt',
  'bible.translatorReviewSubmittedBy',
  'bible.translatorReviewNoComment',
  'bible.translatorReviewFixed',
  'bible.translatorReviewConfirmedAccurate',
  'bible.translatorReviewReviewed',
  'bible.translatorReviewConfirmAccurate',
  'bible.translatorReviewMarkFixed',
  'bible.translatorReviewNoActionNeeded',
  'bible.translatorReviewReopen',
  'bible.translatorReviewListened',
  'bible.translatorReviewListen',
  'bible.translatorReviewAudioError',
  'bible.chapterFeedbackSuccessTitle',
  'bible.readerFontsAndSettings',
  // Translator feedback queue screen (same English-only admin surface).
  'translatorQueue.title',
  'translatorQueue.subtitle',
  'translatorQueue.empty',
  'translatorQueue.pendingCount',
  'translatorQueue.chapterCounts',
  'translatorQueue.openLabel',
  'settings.translatorAccess',
  'settings.translatorAccessTitle',
  'settings.translatorAccessBody',
  'settings.translatorAccessPlaceholder',
  'settings.translatorAccessUnlock',
  'settings.translatorAccessIncorrect',
  'settings.translatorAccessEnabled',
  'settings.translatorAccessEnabledBody',
  'settings.translatorAccessSummaryOn',
  'settings.translatorAccessSummaryOff',
  // Council "My feedback" surface — same admin-ish feedback tooling as the translator
  // review keys above; kept English-only until the feature is localized.
  'myFeedback.title',
  'myFeedback.settingsRow',
  'myFeedback.settingsRowSummary',
  'myFeedback.subtitle',
  'myFeedback.empty',
  'myFeedback.signInRequired',
  'myFeedback.audioLabel',
  'myFeedback.statusReceived',
  'myFeedback.statusFixed',
  'myFeedback.statusNoChange',
  // Pure template tokens — nothing to translate
  'home.greetingWithName',
  'home.percentComplete',
  // Orthodox liturgical proper noun — intentionally kept as-is in all locales
  'readingPlans.kathisma.title',
  // Cross-lingual cognate: "Plan" is the correct spelling in Spanish, French, German, etc.
  'home.plan',
  // Cross-lingual cognate: "Tradition" is the correct spelling in German and French.
  'plans.rhythmComposer.tradition',
  // Cross-lingual cognate: "Error" is the correct spelling in Spanish.
  'settings.diagnostics.badgeError',
]);

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

    assert.deepEqual(
      localeKeys,
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
