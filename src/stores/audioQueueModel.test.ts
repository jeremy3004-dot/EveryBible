import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceAudioQueue,
  syncAudioQueueToTrack,
  type AudioQueueEntry,
} from './audioQueueModel';

test('syncAudioQueueToTrack reuses an existing queued chapter when available', () => {
  const queue: AudioQueueEntry[] = [
    { id: 'bsb:MAT:5', translationId: 'bsb', bookId: 'MAT', chapter: 5, addedAt: 1 },
    { id: 'bsb:JHN:3', translationId: 'bsb', bookId: 'JHN', chapter: 3, addedAt: 2 },
  ];

  assert.deepEqual(
    syncAudioQueueToTrack(queue, { translationId: 'bsb', bookId: 'JHN', chapter: 3, addedAt: 4 }),
    {
      queue,
      queueIndex: 1,
    }
  );
});

test('syncAudioQueueToTrack falls back to a single-track queue for direct playback', () => {
  assert.deepEqual(syncAudioQueueToTrack([], { translationId: 'bsb', bookId: 'GAL', chapter: 1, addedAt: 4 }), {
    queue: [{ id: 'bsb:GAL:1', translationId: 'bsb', bookId: 'GAL', chapter: 1, addedAt: 4 }],
    queueIndex: 0,
  });
});

test('syncAudioQueueToTrack keeps same-book chapters distinct across translations', () => {
  const queue: AudioQueueEntry[] = [
    { id: 'web:JHN:3', translationId: 'web', bookId: 'JHN', chapter: 3, addedAt: 1 },
  ];

  assert.deepEqual(
    syncAudioQueueToTrack(queue, {
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      addedAt: 4,
    }),
    {
      queue: [{ id: 'bsb:JHN:3', translationId: 'bsb', bookId: 'JHN', chapter: 3, addedAt: 4 }],
      queueIndex: 0,
    }
  );
});

test('advanceAudioQueue returns the next queued chapter when one exists', () => {
  const queue: AudioQueueEntry[] = [
    { id: 'bsb:MAT:5', translationId: 'bsb', bookId: 'MAT', chapter: 5, addedAt: 1 },
    { id: 'web:JHN:3', translationId: 'web', bookId: 'JHN', chapter: 3, addedAt: 2 },
  ];

  assert.deepEqual(advanceAudioQueue(queue, 0), {
    queueIndex: 1,
    entry: queue[1],
  });
  assert.equal(advanceAudioQueue(queue, 1), null);
});
