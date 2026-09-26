import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AudioPlaybackSequenceEntry } from '../../types';
import { readingPlanEntriesByPlanId } from '../../data/readingPlans.generated';
import { buildRhythmReaderSession } from '../../services/plans/readingPlanActivity';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

const reader = installReaderRenderFixture(mock);

async function audioSequenceForPlan(planId: string | undefined) {
  const planIds = ['gospels-60-days', 'gospels-30-days'];
  const session = buildRhythmReaderSession({
    rhythm: {
      id: 'overlapping-gospels',
      title: 'Gospels',
      items: planIds.map((planId) => ({ id: planId, type: 'plan' as const, planId })),
      createdAt: '2026-09-26T00:00:00.000Z',
      updatedAt: '2026-09-26T00:00:00.000Z',
    },
    planEntriesById: readingPlanEntriesByPlanId,
  });
  const sequences: AudioPlaybackSequenceEntry[][] = [];
  await reader.setAudio({
    setPlaybackSequence: (...args: unknown[]) => {
      sequences.push(args[0] as AudioPlaybackSequenceEntry[]);
    },
  });
  reader.chapters.set('MAT:1', [verseOf(1, 'The genealogy of Jesus.', {}, 'MAT', 1)]);

  await reader.renderReader({
    bookId: 'MAT',
    chapter: 1,
    planId,
    planDayNumber: 1,
    returnToPlanOnComplete: true,
    sessionContext: session.sessionContext,
    playbackSequenceEntries: session.playbackSequenceEntries,
  });

  return sequences.at(-1);
}

test('overlapping rhythm plans keep audio inside the selected plan day', async () => {
  assert.deepEqual(await audioSequenceForPlan('gospels-30-days'), [
    { bookId: 'MAT', chapter: 1 },
    { bookId: 'MAT', chapter: 2 },
    { bookId: 'MAT', chapter: 3 },
  ]);
});

test('choosing the first overlapping rhythm plan keeps its own chapter range', async () => {
  assert.deepEqual(await audioSequenceForPlan('gospels-60-days'), [
    { bookId: 'MAT', chapter: 1 },
    { bookId: 'MAT', chapter: 2 },
  ]);
});

test('a rhythm without an active plan falls back to the first matching chapter segment', async () => {
  assert.deepEqual(await audioSequenceForPlan(undefined), [
    { bookId: 'MAT', chapter: 1 },
    { bookId: 'MAT', chapter: 2 },
  ]);
});

test('a non-rhythm plan passes only its day chapters to audio even when the route includes more', async () => {
  const sequences: AudioPlaybackSequenceEntry[][] = [];
  await reader.setAudio({
    setPlaybackSequence: (...args: unknown[]) => {
      sequences.push(args[0] as AudioPlaybackSequenceEntry[]);
    },
  });
  reader.chapters.set('MAT:1', [verseOf(1, 'The genealogy of Jesus.', {}, 'MAT', 1)]);

  await reader.renderReader({
    bookId: 'MAT',
    chapter: 1,
    planId: 'gospels-60-days',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
    playbackSequenceEntries: [
      { bookId: 'MAT', chapter: 1 },
      { bookId: 'MAT', chapter: 2 },
      { bookId: 'MAT', chapter: 3 },
    ],
  });

  assert.deepEqual(sequences.at(-1), [
    { bookId: 'MAT', chapter: 1 },
    { bookId: 'MAT', chapter: 2 },
  ]);
});
