import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrackedBibleExperienceEvents,
  resetTrackedBibleExperienceEvents,
  trackBibleExperienceEvent,
} from './bibleExperienceAnalytics';

test('trackBibleExperienceEvent forwards product-valuable events (book_hub_chapter_opened)', () => {
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

test('trackBibleExperienceEvent DROPS non-product events (chapter feedback has its own pipeline)', () => {
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

  assert.deepEqual(
    getTrackedBibleExperienceEvents(),
    [],
    'chapter feedback must not be analytics-forwarded (it has a dedicated submit pipeline)'
  );
});
