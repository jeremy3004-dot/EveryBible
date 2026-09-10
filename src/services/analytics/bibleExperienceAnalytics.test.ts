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

test('trackBibleExperienceEvent forwards library actions and keeps insertion order', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({ name: 'library_action', bookId: 'GEN', source: 'saved-library' });
  trackBibleExperienceEvent({ name: 'book_hub_chapter_opened', bookId: 'REV', source: 'book-hub' });

  assert.deepEqual(
    getTrackedBibleExperienceEvents().map((event) => event.name),
    ['library_action', 'book_hub_chapter_opened']
  );
});

test('trackBibleExperienceEvent drops companion opens, library reopens and feedback opens', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({ name: 'book_companion_opened', bookId: 'PSA', source: 'companion' });
  trackBibleExperienceEvent({ name: 'library_reopened', bookId: 'REV', source: 'saved-library' });
  trackBibleExperienceEvent({
    name: 'chapter_feedback_opened',
    bookId: 'JHN',
    source: 'reader-feedback',
  });

  assert.deepEqual(getTrackedBibleExperienceEvents(), []);
});

test('a forwarded event keeps every optional field it was given', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'HEB',
    chapter: 11,
    source: 'book-hub',
    mode: 'listen',
    detail: 'faith-chapter',
  });

  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'book_hub_chapter_opened',
      bookId: 'HEB',
      chapter: 11,
      source: 'book-hub',
      mode: 'listen',
      detail: 'faith-chapter',
    },
  ]);
});

test('an event with only the required fields is forwarded as-is', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({ name: 'book_hub_chapter_opened', bookId: 'PSA', source: 'book-hub' });

  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    { name: 'book_hub_chapter_opened', bookId: 'PSA', source: 'book-hub' },
  ]);
});

test('the local history is capped at 200 events and keeps the most recent one', () => {
  resetTrackedBibleExperienceEvents();

  for (let index = 0; index < 210; index += 1) {
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId: 'GEN',
      source: 'saved-library',
      detail: `fill-${index}`,
    });
  }
  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'REV',
    source: 'book-hub',
    detail: 'sentinel',
  });

  const events = getTrackedBibleExperienceEvents();
  assert.ok(events.length <= 200, `expected at most 200 events, got ${events.length}`);
  assert.equal(events.at(-1)?.detail, 'sentinel');
  assert.equal(
    events.some((event) => event.detail === 'fill-0'),
    false,
    'the oldest events are trimmed, not the newest'
  );
});

test('resetting empties the history completely', () => {
  trackBibleExperienceEvent({ name: 'library_action', bookId: 'PSA', source: 'saved-library' });

  resetTrackedBibleExperienceEvents();

  assert.deepEqual(getTrackedBibleExperienceEvents(), []);
});

test('reading the history returns a snapshot that cannot mutate the store', () => {
  resetTrackedBibleExperienceEvents();
  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'ROM',
    chapter: 8,
    source: 'book-hub',
  });

  const snapshot = getTrackedBibleExperienceEvents();
  snapshot.splice(0, snapshot.length);

  assert.equal(getTrackedBibleExperienceEvents().length, 1);
});
