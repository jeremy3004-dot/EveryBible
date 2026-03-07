import test from 'node:test';
import assert from 'node:assert/strict';
import type { Verse } from '../../types';
import { buildDailyScripture, getChapterPresentationMode } from './presentation';

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
