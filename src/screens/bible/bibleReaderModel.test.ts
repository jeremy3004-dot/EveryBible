import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEstimatedFollowAlongVerse,
  getNextChapterSessionMode,
  getNextFontSizeSheetVisibility,
  getInitialChapterSessionMode,
  getNextTranslationSheetVisibility,
} from './bibleReaderModel';

test('toggles the font sheet from the font button', () => {
  assert.equal(getNextFontSizeSheetVisibility(false, 'toggleButton'), true);
  assert.equal(getNextFontSizeSheetVisibility(true, 'toggleButton'), false);
});

test('closes the font sheet when the reader content is tapped', () => {
  assert.equal(getNextFontSizeSheetVisibility(true, 'readerContentTap'), false);
  assert.equal(getNextFontSizeSheetVisibility(false, 'readerContentTap'), false);
});

test('closes the font sheet when chapter navigation or scrolling starts', () => {
  assert.equal(getNextFontSizeSheetVisibility(true, 'scrollStart'), false);
  assert.equal(getNextFontSizeSheetVisibility(true, 'chapterChange'), false);
});

test('opens the translation sheet from the header chip when multiple translations are enabled', () => {
  assert.equal(getNextTranslationSheetVisibility(false, true, 'toggleChip'), true);
  assert.equal(getNextTranslationSheetVisibility(true, true, 'toggleChip'), false);
});

test('keeps the translation sheet closed when translation switching is unavailable', () => {
  assert.equal(getNextTranslationSheetVisibility(false, false, 'toggleChip'), false);
  assert.equal(getNextTranslationSheetVisibility(true, false, 'toggleChip'), false);
});

test('closes the translation sheet after selection or manual dismissal', () => {
  assert.equal(getNextTranslationSheetVisibility(true, true, 'selectTranslation'), false);
  assert.equal(getNextTranslationSheetVisibility(true, true, 'dismiss'), false);
});

test('prefers listen mode when autoplay starts the chapter session', () => {
  assert.equal(
    getInitialChapterSessionMode({
      audioEnabled: true,
      hasText: true,
      autoplayAudio: true,
      preferredMode: null,
      bookId: 'MAT',
      chapter: 1,
      activeAudioBookId: null,
      activeAudioChapter: null,
    }),
    'listen'
  );
});

test('prefers listen mode when the active audio chapter already matches the session', () => {
  assert.equal(
    getInitialChapterSessionMode({
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: null,
      bookId: 'MAT',
      chapter: 1,
      activeAudioBookId: 'MAT',
      activeAudioChapter: 1,
    }),
    'listen'
  );
});

test('falls back to read mode when the chapter has text and no active audio context', () => {
  assert.equal(
    getInitialChapterSessionMode({
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: null,
      bookId: 'MAT',
      chapter: 1,
      activeAudioBookId: 'MRK',
      activeAudioChapter: 2,
    }),
    'read'
  );
});

test('forces the session into a supported mode when toggling between listen and read', () => {
  assert.equal(
    getNextChapterSessionMode('read', {
      requestedMode: 'listen',
      audioEnabled: false,
      hasText: true,
    }),
    'read'
  );
  assert.equal(
    getNextChapterSessionMode('listen', {
      requestedMode: 'read',
      audioEnabled: true,
      hasText: false,
    }),
    'listen'
  );
  assert.equal(
    getNextChapterSessionMode('read', {
      requestedMode: 'listen',
      audioEnabled: true,
      hasText: true,
    }),
    'listen'
  );
});

test('respects an explicit preferred launch mode from the book hub when that mode is supported', () => {
  assert.equal(
    getInitialChapterSessionMode({
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: 'read',
      bookId: 'MAT',
      chapter: 1,
      activeAudioBookId: 'MAT',
      activeAudioChapter: 1,
    }),
    'read'
  );

  assert.equal(
    getInitialChapterSessionMode({
      audioEnabled: true,
      hasText: true,
      autoplayAudio: false,
      preferredMode: 'listen',
      bookId: 'MAT',
      chapter: 1,
      activeAudioBookId: null,
      activeAudioChapter: null,
    }),
    'listen'
  );
});

test('estimates the follow-along verse from weighted playback progress', () => {
  const verses = [
    { id: 1, bookId: 'MAT', chapter: 1, verse: 1, text: 'Short intro' },
    {
      id: 2,
      bookId: 'MAT',
      chapter: 1,
      verse: 2,
      text: 'A longer line that should occupy more of the chapter timeline',
    },
    { id: 3, bookId: 'MAT', chapter: 1, verse: 3, text: 'Closing thought' },
  ];

  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 0,
      duration: 90000,
    }),
    1
  );
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 40000,
      duration: 90000,
    }),
    2
  );
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 88000,
      duration: 90000,
    }),
    3
  );
});

test('uses the focused verse as a graceful follow-along fallback when timing is unavailable', () => {
  const verses = [
    { id: 1, bookId: 'MAT', chapter: 1, verse: 1, text: 'Short intro' },
    { id: 2, bookId: 'MAT', chapter: 1, verse: 2, text: 'Second verse' },
  ];

  assert.equal(
    getEstimatedFollowAlongVerse({
      verses,
      currentPosition: 0,
      duration: 0,
      fallbackVerse: 2,
    }),
    2
  );
  assert.equal(
    getEstimatedFollowAlongVerse({
      verses: [],
      currentPosition: 0,
      duration: 0,
      fallbackVerse: 4,
    }),
    4
  );
});
