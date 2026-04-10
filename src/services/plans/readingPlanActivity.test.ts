import test from 'node:test';
import assert from 'node:assert/strict';

import type { ListeningHistoryEntry } from '../../stores/libraryModel';
import type { ReadingPlan, ReadingPlanEntry, ReadingPlanRhythm, UserReadingPlanProgress } from './types';
import {
  buildPlanDayPlaybackSequenceEntries,
  buildPlanDayCompletionSummary,
  buildRhythmReaderSession,
  formatScheduledPlanDayLabel,
  getCurrentPlanDaySummary,
  getReadingPlanRhythmSummary,
  getPlanChapterListenStatus,
  getPlanDayTargetChapterKeys,
  getRhythmSessionSegmentAtIndex,
  getScheduledPlanDayDateKey,
  isPlanDaySatisfied,
  mergeTodayCompletedChapterActivity,
  resolvePlanDayPlaybackStartEntry,
  resolvePlaybackSequenceIndex,
  resolveFirstIncompleteRhythmSessionSegment,
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

const makeProgress = (
  planId: string,
  overrides: Partial<UserReadingPlanProgress> = {}
): UserReadingPlanProgress => ({
  id: `progress-${planId}`,
  plan_id: planId,
  started_at: '2026-04-07T08:00:00.000Z',
  completed_entries: {},
  current_day: 1,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-04-07T08:00:00.000Z',
  ...overrides,
});

const makePlan = (overrides: Partial<ReadingPlan> = {}): ReadingPlan => ({
  id: 'plan-1',
  slug: 'plan-1',
  title_key: 'readingPlans.plan1.title',
  description_key: 'readingPlans.plan1.description',
  duration_days: 31,
  category: 'devotional',
  is_active: true,
  sort_order: 1,
  coverKey: 'desert',
  ...overrides,
});

const rhythm: ReadingPlanRhythm = {
  id: 'rhythm-1',
  title: 'Morning rhythm',
  items: [
    { id: 'item-plan-a', type: 'plan', planId: 'plan-a' },
    {
      id: 'item-passage',
      type: 'passage',
      title: 'Psalm pairing',
      bookId: 'PSA',
      startChapter: 23,
      endChapter: 24,
    },
    { id: 'item-plan-b', type: 'plan', planId: 'plan-b' },
    { id: 'item-plan-c', type: 'plan', planId: 'plan-c' },
  ],
  createdAt: '2026-04-07T08:00:00.000Z',
  updatedAt: '2026-04-07T08:00:00.000Z',
};

const rhythmPlanEntriesById: Record<string, ReadingPlanEntry[]> = {
  'plan-a': [
    makeEntry({ id: 'plan-a-day-1', plan_id: 'plan-a', day_number: 1, book: 'GEN', chapter_start: 1, chapter_end: 1 }),
    makeEntry({ id: 'plan-a-day-2', plan_id: 'plan-a', day_number: 2, book: 'GEN', chapter_start: 2, chapter_end: 3 }),
  ],
  'plan-b': [
    makeEntry({ id: 'plan-b-day-1', plan_id: 'plan-b', day_number: 1, book: 'EXO', chapter_start: 1, chapter_end: 1 }),
  ],
  'plan-c': [
    makeEntry({ id: 'plan-c-day-1', plan_id: 'plan-c', day_number: 1, book: 'PSA', chapter_start: 1, chapter_end: 1 }),
    makeEntry({ id: 'plan-c-day-2', plan_id: 'plan-c', day_number: 2, book: 'PSA', chapter_start: 2, chapter_end: 3 }),
  ],
};

const rhythmProgressByPlanId: Record<string, UserReadingPlanProgress> = {
  'plan-a': makeProgress('plan-a', { current_day: 2, is_completed: false }),
  'plan-b': makeProgress('plan-b', { current_day: 2, is_completed: true, completed_at: '2026-04-07T09:00:00.000Z' }),
  'plan-c': makeProgress('plan-c', { current_day: 2, is_completed: false }),
};

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

test('resolvePlanDayPlaybackStartEntry resumes from the saved chapter when it belongs to the active day', () => {
  const dayOneEntries = dayEntries.filter((entry) => entry.day_number === 1);

  assert.deepEqual(resolvePlanDayPlaybackStartEntry(dayOneEntries, { bookId: 'GEN', chapter: 3 }), {
    bookId: 'GEN',
    chapter: 3,
  });

  assert.deepEqual(resolvePlanDayPlaybackStartEntry(dayOneEntries, { bookId: 'PSA', chapter: 1 }), {
    bookId: 'GEN',
    chapter: 1,
  });
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

test('getCurrentPlanDaySummary anchors recurring day-of-month plans to today for activity matching', () => {
  const recurringPlan = makePlan({
    id: 'proverbs-31-days',
    slug: 'proverbs-31-days',
    scheduleMode: 'calendar-day-of-month',
  });

  const summary = getCurrentPlanDaySummary({
    plan: recurringPlan,
    entries: [
      makeEntry({
        id: 'day-5',
        plan_id: 'proverbs-31-days',
        day_number: 5,
        book: 'PRO',
        chapter_start: 5,
      }),
    ],
    progress: makeProgress('proverbs-31-days', {
      started_at: new Date(2026, 3, 1, 7, 0, 0).toISOString(),
      current_day: 1,
    }),
    chaptersRead: {
      PRO_5: new Date(2026, 3, 5, 8, 0, 0).getTime(),
    },
    listeningHistory: [],
    dayNumber: 5,
    today: new Date(2026, 3, 5, 12, 0, 0),
  });

  assert.equal(summary.dayNumber, 5);
  assert.equal(summary.dateKey, '2026-04-05');
  assert.equal(summary.completedChapterCount, 1);
  assert.equal(summary.isComplete, true);
});

test('getCurrentPlanDaySummary builds ordered session summaries for multi-session plans', () => {
  const summary = getCurrentPlanDaySummary({
    plan: makePlan({
      format: 'multi-session',
      sessionOrder: ['morning', 'evening'],
    }),
    entries: [
      makeEntry({
        id: 'day-1-morning',
        plan_id: 'plan-1',
        day_number: 1,
        session_key: 'morning',
        session_title: 'Morning',
        session_order: 1,
        book: 'PSA',
        chapter_start: 63,
      }),
      makeEntry({
        id: 'day-1-evening',
        plan_id: 'plan-1',
        day_number: 1,
        session_key: 'evening',
        session_title: 'Evening',
        session_order: 2,
        book: 'LUK',
        chapter_start: 1,
      }),
    ],
    progress: makeProgress('plan-1', {
      started_at: new Date(2026, 3, 7, 7, 0, 0).toISOString(),
      current_day: 1,
    }),
    chaptersRead: {
      PSA_63: new Date(2026, 3, 7, 8, 0, 0).getTime(),
    },
    listeningHistory: [],
    dayNumber: 1,
    today: new Date(2026, 3, 7, 12, 0, 0),
  });

  assert.equal(summary.totalSessionCount, 2);
  assert.equal(summary.completedSessionCount, 1);
  assert.equal(summary.nextIncompleteSessionKey, 'evening');
  assert.deepEqual(
    summary.sessionSummaries.map((session) => ({
      key: session.sessionKey,
      title: session.title,
      complete: session.isComplete,
      completed: session.completedChapterCount,
      target: session.targetChapterCount,
    })),
    [
      { key: 'morning', title: 'Morning', complete: true, completed: 1, target: 1 },
      { key: 'evening', title: 'Evening', complete: false, completed: 0, target: 1 },
    ]
  );
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

test('buildRhythmReaderSession flattens each included plan current day into ordered segments', () => {
  const session = buildRhythmReaderSession({
    rhythm,
    planEntriesById: rhythmPlanEntriesById,
    progressByPlanId: rhythmProgressByPlanId,
  });

  assert.deepEqual(session.playbackSequenceEntries, [
    { bookId: 'GEN', chapter: 2 },
    { bookId: 'GEN', chapter: 3 },
    { bookId: 'PSA', chapter: 23 },
    { bookId: 'PSA', chapter: 24 },
    { bookId: 'PSA', chapter: 2 },
    { bookId: 'PSA', chapter: 3 },
  ]);
  assert.deepEqual(session.sessionContext.chapterKeys, [
    'GEN_2',
    'GEN_3',
    'PSA_23',
    'PSA_24',
    'PSA_2',
    'PSA_3',
  ]);
  assert.deepEqual(session.sessionContext.segments, [
    {
      itemId: 'item-plan-a',
      type: 'plan',
      title: 'plan-a',
      planId: 'plan-a',
      dayNumber: 2,
      startIndex: 0,
      endIndex: 2,
      chapterKeys: ['GEN_2', 'GEN_3'],
      isComplete: false,
    },
    {
      itemId: 'item-passage',
      type: 'passage',
      title: 'Psalm pairing',
      startIndex: 2,
      endIndex: 4,
      chapterKeys: ['PSA_23', 'PSA_24'],
      isComplete: false,
      bookId: 'PSA',
      startChapter: 23,
      endChapter: 24,
    },
    {
      itemId: 'item-plan-c',
      type: 'plan',
      title: 'plan-c',
      planId: 'plan-c',
      dayNumber: 2,
      startIndex: 4,
      endIndex: 6,
      chapterKeys: ['PSA_2', 'PSA_3'],
      isComplete: false,
    },
  ]);
  assert.deepEqual(session.startEntry, { bookId: 'GEN', chapter: 2 });
  assert.equal(session.startSegment?.planId, 'plan-a');
});

test('buildRhythmReaderSession can start from a passage item before any plan segments', () => {
  const session = buildRhythmReaderSession({
    rhythm: {
      ...rhythm,
      items: [
        {
          id: 'item-passage-first',
          type: 'passage',
          title: 'Morning Psalms',
          bookId: 'PSA',
          startChapter: 1,
          endChapter: 2,
        },
        { id: 'item-plan-c', type: 'plan', planId: 'plan-c' },
      ],
    },
    planEntriesById: rhythmPlanEntriesById,
    progressByPlanId: rhythmProgressByPlanId,
  });

  assert.deepEqual(session.startEntry, { bookId: 'PSA', chapter: 1 });
  assert.equal(session.startSegment?.type, 'passage');
  assert.equal(session.startSegment?.itemId, 'item-passage-first');
});

test('resolveFirstIncompleteRhythmSessionSegment prefers a resumable plan before falling back to the first incomplete segment', () => {
  const session = buildRhythmReaderSession({
    rhythm,
    planEntriesById: rhythmPlanEntriesById,
    progressByPlanId: rhythmProgressByPlanId,
  });

  assert.equal(
    resolveFirstIncompleteRhythmSessionSegment(session.sessionContext, rhythmProgressByPlanId)?.planId,
    'plan-a'
  );
  assert.equal(
    resolveFirstIncompleteRhythmSessionSegment(
      session.sessionContext,
      rhythmProgressByPlanId,
      'plan-c'
    )?.planId,
    'plan-c'
  );
  assert.equal(
    resolveFirstIncompleteRhythmSessionSegment(
      session.sessionContext,
      rhythmProgressByPlanId,
      'plan-b'
    )?.planId,
    'plan-a'
  );
});

test('rhythm session helpers resolve playback indexes and segment ownership within the flattened sequence', () => {
  const session = buildRhythmReaderSession({
    rhythm,
    planEntriesById: rhythmPlanEntriesById,
    progressByPlanId: rhythmProgressByPlanId,
  });

  const psaIndex = resolvePlaybackSequenceIndex({
    playbackSequenceEntries: session.playbackSequenceEntries,
    bookId: 'PSA',
    chapter: 3,
    session: session.sessionContext,
    preferredPlanId: 'plan-c',
    preferredDayNumber: 2,
  });

  assert.equal(psaIndex, 5);
  assert.equal(
    getRhythmSessionSegmentAtIndex(session.sessionContext, psaIndex)?.planId,
    'plan-c'
  );
});

test('reading plan rhythm summary reports completed and remaining plans from existing progress', () => {
  assert.deepEqual(
    getReadingPlanRhythmSummary({
      rhythm,
      progressByPlanId: rhythmProgressByPlanId,
    }),
    {
      planCount: 3,
      completedPlanCount: 1,
      remainingPlanCount: 2,
    }
  );
});
