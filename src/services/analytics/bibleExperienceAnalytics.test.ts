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
