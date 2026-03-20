import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceAudioQueue,
  syncAudioQueueToTrack,
  type AudioQueueEntry,
} from './audioQueueModel';

test('syncAudioQueueToTrack reuses an existing queued chapter when available', () => {
  const queue: AudioQueueEntry[] = [
    { id: 'MAT:5', bookId: 'MAT', chapter: 5, addedAt: 1 },
    { id: 'JHN:3', bookId: 'JHN', chapter: 3, addedAt: 2 },
  ];

  assert.deepEqual(
    syncAudioQueueToTrack(queue, { bookId: 'JHN', chapter: 3, addedAt: 4 }),
    {
      queue,
      queueIndex: 1,
    }
  );
});

test('syncAudioQueueToTrack falls back to a single-track queue for direct playback', () => {
  assert.deepEqual(syncAudioQueueToTrack([], { bookId: 'GAL', chapter: 1, addedAt: 4 }), {
    queue: [{ id: 'GAL:1', bookId: 'GAL', chapter: 1, addedAt: 4 }],
    queueIndex: 0,
  });
});

test('advanceAudioQueue returns the next queued chapter when one exists', () => {
  const queue: AudioQueueEntry[] = [
    { id: 'MAT:5', bookId: 'MAT', chapter: 5, addedAt: 1 },
    { id: 'JHN:3', bookId: 'JHN', chapter: 3, addedAt: 2 },
  ];

  assert.deepEqual(advanceAudioQueue(queue, 0), {
    queueIndex: 1,
    entry: queue[1],
  });
  assert.equal(advanceAudioQueue(queue, 1), null);
});
