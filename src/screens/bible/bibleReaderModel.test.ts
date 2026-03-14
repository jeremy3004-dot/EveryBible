import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextFontSizeSheetVisibility,
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
