import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrackedBibleExperienceEvents,
  resetTrackedBibleExperienceEvents,
  trackBibleExperienceEvent,
} from './bibleExperienceAnalytics';

test('trackBibleExperienceEvent records events through the local-first analytics seam', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'MAT',
    chapter: 5,
    source: 'book-hub',
    mode: 'read',
  });

  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'book_hub_chapter_opened',
      bookId: 'MAT',
      chapter: 5,
      source: 'book-hub',
      mode: 'read',
    },
  ]);
});

test('trackBibleExperienceEvent keeps chapter feedback analytics payloads intact', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({
    name: 'chapter_feedback_submitted',
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    sentiment: 'down',
    source: 'listener-feedback',
    detail: 'saved-not-exported',
  });

  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'chapter_feedback_submitted',
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'down',
      source: 'listener-feedback',
      detail: 'saved-not-exported',
    },
  ]);
});
