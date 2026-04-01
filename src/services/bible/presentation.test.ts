import test from 'node:test';
import assert from 'node:assert/strict';
import type { Verse } from '../../types';
import {
  buildAudioFirstChapterPresentation,
  buildDailyScripture,
  getChapterPresentationMode,
} from './presentation';

const textAndAudioTranslation = {
  hasText: true,
  hasAudio: true,
  audioGranularity: 'chapter' as const,
};

const audioOnlyChapterTranslation = {
  hasText: false,
  hasAudio: true,
  audioGranularity: 'chapter' as const,
};

const audioOnlyVerseTranslation = {
  hasText: false,
  hasAudio: true,
  audioGranularity: 'verse' as const,
};

const sampleVerse: Verse = {
  id: 1,
  bookId: 'JHN',
  chapter: 3,
  verse: 16,
  text: 'For God so loved the world...',
};

test('shows text mode when the chapter has verses', () => {
  const mode = getChapterPresentationMode({
    verses: [sampleVerse],
    translation: textAndAudioTranslation,
    audioAvailable: true,
  });

  assert.equal(mode, 'text');
});

test('shows audio-first mode when the chapter has no verses but audio is available', () => {
  const mode = getChapterPresentationMode({
    verses: [],
    translation: audioOnlyChapterTranslation,
    audioAvailable: true,
  });

  assert.equal(mode, 'audio-first');
});

test('falls back to empty mode when translation has audio but no source is currently available', () => {
  const mode = getChapterPresentationMode({
    verses: [],
    translation: audioOnlyChapterTranslation,
    audioAvailable: false,
  });

  assert.equal(mode, 'empty');
});

test('falls back to empty mode when the chapter has no text or audio', () => {
  const mode = getChapterPresentationMode({
    verses: [],
    translation: {
      hasText: false,
      hasAudio: false,
      audioGranularity: 'none' as const,
    },
    audioAvailable: false,
  });

  assert.equal(mode, 'empty');
});

test('keeps verse text for the daily scripture when text exists', () => {
  const daily = buildDailyScripture({
    reference: { bookId: 'JHN', chapter: 3, verse: 16 },
    verse: sampleVerse,
    translation: textAndAudioTranslation,
    audioAvailable: true,
  });

  assert.deepEqual(daily, {
    kind: 'verse-text',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world...',
    playScope: 'none',
  });
});

test('keeps the passage reference and passage text for a ranged daily scripture', () => {
  const rangeDailyScriptureOptions: Parameters<typeof buildDailyScripture>[0] = {
    reference: { bookId: 'NUM', chapter: 6, verse: 24, verseEnd: 26 },
    verse: {
      id: 2,
      bookId: 'NUM',
      chapter: 6,
      verse: 24,
      text: 'The LORD bless you and keep you.',
    } as Verse,
    passageText:
      'The LORD bless you and keep you. The LORD make His face shine upon you and be gracious to you.',
    translation: textAndAudioTranslation,
    audioAvailable: true,
  };

  const daily = buildDailyScripture(rangeDailyScriptureOptions);

  assert.deepEqual(daily, {
    kind: 'verse-text',
    bookId: 'NUM',
    chapter: 6,
    verse: 24,
    verseEnd: 26,
    text: 'The LORD bless you and keep you. The LORD make His face shine upon you and be gracious to you.',
    playScope: 'none',
  });
});

test('falls back to section audio when text is missing and audio is chapter-based', () => {
  const daily = buildDailyScripture({
    reference: { bookId: 'JHN', chapter: 3, verse: 16 },
    verse: null,
    translation: audioOnlyChapterTranslation,
    audioAvailable: true,
  });

  assert.deepEqual(daily, {
    kind: 'section-audio',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: null,
    playScope: 'chapter',
  });
});

test('falls back to verse audio when text is missing and verse audio is available', () => {
  const daily = buildDailyScripture({
    reference: { bookId: 'JHN', chapter: 3, verse: 16 },
    verse: null,
    translation: audioOnlyVerseTranslation,
    audioAvailable: true,
  });

  assert.deepEqual(daily, {
    kind: 'verse-audio',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: null,
    playScope: 'verse',
  });
});

test('falls back to empty daily scripture when text is missing and no audio can play', () => {
  const daily = buildDailyScripture({
    reference: { bookId: 'JHN', chapter: 3, verse: 16 },
    verse: null,
    translation: audioOnlyChapterTranslation,
    audioAvailable: false,
  });

  assert.deepEqual(daily, {
    kind: 'empty',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: null,
    playScope: 'none',
  });
});

test('builds a polished presentation model for audio-first chapters', () => {
  const presentation = buildAudioFirstChapterPresentation({
    bookName: 'John',
    chapter: 3,
    translationLabel: 'BSB',
    testamentLabel: 'New Testament',
    chapterLabel: 'Chapter',
    availableLabel: 'Available',
  });

  assert.deepEqual(presentation, {
    title: 'John 3',
    pills: ['BSB', 'New Testament'],
    facts: [
      { label: 'Chapter', value: '3' },
      { label: 'Available', value: 'BSB' },
    ],
  });
});

test('includes the offline pill when chapter audio is already saved', () => {
  const presentation = buildAudioFirstChapterPresentation({
    bookName: 'Psalms',
    chapter: 23,
    translationLabel: 'BSB',
    testamentLabel: 'Old Testament',
    chapterLabel: 'Chapter',
    availableLabel: 'Available',
    offlineLabel: 'Saved for Offline Listening',
  });

  assert.deepEqual(presentation.pills, ['BSB', 'Old Testament', 'Saved for Offline Listening']);
});
