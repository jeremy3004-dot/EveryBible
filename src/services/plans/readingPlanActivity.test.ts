import test from 'node:test';
import assert from 'node:assert/strict';

import type { ListeningHistoryEntry } from '../../stores/libraryModel';
import type { ReadingPlanEntry } from './types';
import {
  buildPlanDayPlaybackSequenceEntries,
  buildPlanDayCompletionSummary,
  formatScheduledPlanDayLabel,
  getCurrentPlanDaySummary,
  getPlanChapterListenStatus,
  getPlanDayTargetChapterKeys,
  getScheduledPlanDayDateKey,
  isPlanDaySatisfied,
  mergeTodayCompletedChapterActivity,
} from './readingPlanActivity';

const makeEntry = (
  overrides: Partial<ReadingPlanEntry> &
    Pick<ReadingPlanEntry, 'id' | 'day_number' | 'book' | 'chapter_start'>
): ReadingPlanEntry => ({
  chapter_end: null,
  plan_id: 'plan-1',
  ...overrides,
});

const makeListeningHistoryEntry = (
  overrides: Partial<ListeningHistoryEntry> &
    Pick<ListeningHistoryEntry, 'id' | 'bookId' | 'chapter' | 'listenedAt' | 'progress'>
): ListeningHistoryEntry => ({
  ...overrides,
});

const dayEntries: ReadingPlanEntry[] = [
  makeEntry({ id: 'day-1-a', day_number: 1, book: 'GEN', chapter_start: 1, chapter_end: 4 }),
  makeEntry({ id: 'day-1-b', day_number: 1, book: 'EXO', chapter_start: 1, chapter_end: null }),
  makeEntry({ id: 'day-2-a', day_number: 2, book: 'GEN', chapter_start: 5, chapter_end: 8 }),
];

test('getPlanDayTargetChapterKeys expands ranges into individual chapter keys', () => {
  assert.deepEqual(getPlanDayTargetChapterKeys(dayEntries, 1), [
    'GEN_1',
    'GEN_2',
    'GEN_3',
    'GEN_4',
    'EXO_1',
  ]);

  assert.deepEqual(getPlanDayTargetChapterKeys(dayEntries, 2), [
    'GEN_5',
    'GEN_6',
    'GEN_7',
    'GEN_8',
  ]);
});

test('buildPlanDayPlaybackSequenceEntries expands ranges into chapter-by-chapter playback targets', () => {
  const playbackEntries = buildPlanDayPlaybackSequenceEntries(dayEntries);

  assert.deepEqual(playbackEntries, [
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'GEN', chapter: 2 },
    { bookId: 'GEN', chapter: 3 },
    { bookId: 'GEN', chapter: 4 },
    { bookId: 'EXO', chapter: 1 },
    { bookId: 'GEN', chapter: 5 },
    { bookId: 'GEN', chapter: 6 },
    { bookId: 'GEN', chapter: 7 },
    { bookId: 'GEN', chapter: 8 },
  ]);
});

test('getScheduledPlanDayDateKey offsets each scheduled day from the plan start date', () => {
  const startedAt = new Date(2026, 11, 16, 12, 0, 0).toISOString();

  assert.equal(getScheduledPlanDayDateKey(startedAt, 1), '2026-12-16');
  assert.equal(getScheduledPlanDayDateKey(startedAt, 2), '2026-12-17');
  assert.equal(getScheduledPlanDayDateKey(startedAt, 3), '2026-12-18');
});

test('formatScheduledPlanDayLabel renders the scheduled day as a short calendar label', () => {
  const startedAt = new Date(2026, 11, 16, 12, 0, 0).toISOString();

  assert.equal(formatScheduledPlanDayLabel(startedAt, 1), 'Dec 16');
  assert.equal(formatScheduledPlanDayLabel(startedAt, 2), 'Dec 17');
  assert.equal(formatScheduledPlanDayLabel(startedAt, 3), 'Dec 18');
});

test('mergeTodayCompletedChapterActivity merges todays read and listen activity and filters partial listens', () => {
  const today = new Date(2026, 3, 7, 12, 0, 0);
  const yesterday = new Date(2026, 3, 6, 12, 0, 0);

  const merged = mergeTodayCompletedChapterActivity({
    chaptersRead: {
      GEN_1: new Date(2026, 3, 7, 8, 0, 0).getTime(),
      GEN_2: new Date(2026, 3, 6, 8, 0, 0).getTime(),
    },
    listeningHistory: [
      makeListeningHistoryEntry({
        id: 'GEN:1',
        bookId: 'GEN',
        chapter: 1,
        listenedAt: new Date(2026, 3, 7, 9, 0, 0).getTime(),
        progress: 0.99,
      }),
      makeListeningHistoryEntry({
        id: 'GEN:3',
        bookId: 'GEN',
        chapter: 3,
        listenedAt: new Date(2026, 3, 7, 10, 0, 0).getTime(),
        progress: 0.97,
      }),
      makeListeningHistoryEntry({
        id: 'EXO:1',
        bookId: 'EXO',
        chapter: 1,
        listenedAt: yesterday.getTime(),
        progress: 1,
      }),
      makeListeningHistoryEntry({
        id: 'EXO:2',
        bookId: 'EXO',
        chapter: 2,
        listenedAt: new Date(2026, 3, 7, 11, 0, 0).getTime(),
        progress: 1,
      }),
    ],
    now: today,
  });

  assert.deepEqual(new Set(merged), new Set(['GEN_1', 'EXO_2']));
});

test('isPlanDaySatisfied only returns true when every target key is completed', () => {
  assert.equal(isPlanDaySatisfied(['GEN_1', 'GEN_2'], ['GEN_1', 'GEN_2']), true);
  assert.equal(isPlanDaySatisfied(['GEN_1', 'GEN_2'], ['GEN_1']), false);
});

test('buildPlanDayCompletionSummary combines target chapters and todays activity into a completion state', () => {
  const summary = buildPlanDayCompletionSummary(dayEntries, 1, {
    chaptersRead: {
      GEN_1: new Date(2026, 3, 7, 8, 0, 0).getTime(),
    },
    listeningHistory: [
      makeListeningHistoryEntry({
        id: 'GEN:2',
        bookId: 'GEN',
        chapter: 2,
        listenedAt: new Date(2026, 3, 7, 9, 0, 0).getTime(),
        progress: 1,
      }),
      makeListeningHistoryEntry({
        id: 'GEN:3',
        bookId: 'GEN',
        chapter: 3,
        listenedAt: new Date(2026, 3, 7, 10, 0, 0).getTime(),
        progress: 1,
      }),
      makeListeningHistoryEntry({
        id: 'GEN:4',
        bookId: 'GEN',
        chapter: 4,
        listenedAt: new Date(2026, 3, 7, 11, 0, 0).getTime(),
        progress: 0.5,
      }),
      makeListeningHistoryEntry({
        id: 'EXO:1',
        bookId: 'EXO',
        chapter: 1,
        listenedAt: new Date(2026, 3, 7, 12, 0, 0).getTime(),
        progress: 1,
      }),
    ],
    now: new Date(2026, 3, 7, 12, 30, 0),
  });

  assert.deepEqual(summary.targetChapterKeys, ['GEN_1', 'GEN_2', 'GEN_3', 'GEN_4', 'EXO_1']);
  assert.deepEqual(new Set(summary.completedChapterKeys), new Set(['GEN_1', 'GEN_2', 'GEN_3', 'EXO_1']));
  assert.equal(summary.completedChapters, 4);
  assert.equal(summary.totalChapters, 5);
  assert.equal(summary.isComplete, false);
});

test('buildPlanDayCompletionSummary marks the day complete once every target chapter is read or listened to', () => {
  const summary = buildPlanDayCompletionSummary(dayEntries, 1, {
    chaptersRead: {
      GEN_1: new Date(2026, 3, 7, 8, 0, 0).getTime(),
      GEN_2: new Date(2026, 3, 7, 8, 15, 0).getTime(),
    },
    listeningHistory: [
      makeListeningHistoryEntry({
        id: 'GEN:3',
        bookId: 'GEN',
        chapter: 3,
        listenedAt: new Date(2026, 3, 7, 9, 0, 0).getTime(),
        progress: 1,
      }),
      makeListeningHistoryEntry({
        id: 'GEN:4',
        bookId: 'GEN',
        chapter: 4,
        listenedAt: new Date(2026, 3, 7, 10, 0, 0).getTime(),
        progress: 1,
      }),
      makeListeningHistoryEntry({
        id: 'EXO:1',
        bookId: 'EXO',
        chapter: 1,
        listenedAt: new Date(2026, 3, 7, 11, 0, 0).getTime(),
        progress: 0.98,
      }),
    ],
    now: new Date(2026, 3, 7, 12, 30, 0),
  });

  assert.equal(summary.isComplete, true);
  assert.deepEqual(new Set(summary.completedChapterKeys), new Set(['GEN_1', 'GEN_2', 'GEN_3', 'GEN_4', 'EXO_1']));
  assert.equal(summary.completedChapters, 5);
});

test('getCurrentPlanDaySummary can target an explicit plan day instead of the store current_day', () => {
  const summary = getCurrentPlanDaySummary({
    entries: dayEntries,
    progress: {
      id: 'progress-1',
      plan_id: 'plan-1',
      started_at: new Date(2026, 3, 7, 7, 0, 0).toISOString(),
      completed_entries: {},
      current_day: 1,
      is_completed: false,
      completed_at: null,
      synced_at: new Date(2026, 3, 7, 7, 0, 0).toISOString(),
    },
    chaptersRead: {
      GEN_5: new Date(2026, 3, 7, 8, 0, 0).getTime(),
      GEN_6: new Date(2026, 3, 7, 8, 15, 0).getTime(),
    },
    listeningHistory: [
      makeListeningHistoryEntry({
        id: 'GEN:7',
        bookId: 'GEN',
        chapter: 7,
        listenedAt: new Date(2026, 3, 7, 9, 0, 0).getTime(),
        progress: 1,
      }),
      makeListeningHistoryEntry({
        id: 'GEN:8',
        bookId: 'GEN',
        chapter: 8,
        listenedAt: new Date(2026, 3, 7, 9, 30, 0).getTime(),
        progress: 1,
      }),
    ],
    dayNumber: 2,
    today: new Date(2026, 3, 7, 12, 0, 0),
  });

  assert.equal(summary.dayNumber, 2);
  assert.deepEqual(summary.targetChapterKeys, ['GEN_5', 'GEN_6', 'GEN_7', 'GEN_8']);
  assert.equal(summary.completedChapterCount, 4);
  assert.equal(summary.isComplete, true);
});

test('getPlanChapterListenStatus suppresses listen-counted credit when the chapter was already completed by reading', () => {
  const status = getPlanChapterListenStatus({
    chapterKey: 'GEN_1',
    bookId: 'GEN',
    chapter: 1,
    targetChapterKeys: ['GEN_1', 'GEN_2'],
    completedChapterKeys: ['GEN_1'],
    listeningHistory: [],
    dateKey: '2026-04-07',
  });

  assert.equal(status.alreadyCountedForPlan, true);
  assert.equal(status.currentChapterListenCountedAt, null);
});

test('getPlanChapterListenStatus returns the listen timestamp when the active chapter is newly counted by listening', () => {
  const listenedAt = new Date(2026, 3, 7, 9, 30, 0).getTime();
  const status = getPlanChapterListenStatus({
    chapterKey: 'GEN_2',
    bookId: 'GEN',
    chapter: 2,
    targetChapterKeys: ['GEN_1', 'GEN_2'],
    completedChapterKeys: ['GEN_1'],
    listeningHistory: [
      makeListeningHistoryEntry({
        id: 'GEN:2',
        bookId: 'GEN',
        chapter: 2,
        listenedAt,
        progress: 1,
      }),
    ],
    dateKey: '2026-04-07',
  });

  assert.equal(status.alreadyCountedForPlan, false);
  assert.equal(status.currentChapterListenCountedAt, listenedAt);
});
