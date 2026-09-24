import assert from 'node:assert/strict';
import test from 'node:test';
import type { TFunction } from 'i18next';
import type { BuildRhythmReaderSessionResult } from '../../../services/plans/readingPlanActivity';
import type {
  ReadingPlanRhythm,
  ReadingPlanRhythmSessionSegment,
  UserReadingPlanProgress,
} from '../../../services/plans/types';
import {
  buildRhythmReaderParams,
  buildRhythmSegmentViewModels,
  getRhythmPlanIds,
  getRhythmSegmentCardCopy,
  getRhythmSlotPresentation,
  hasActiveRhythmSegments,
  tallyRhythmPlans,
  type RhythmSegmentViewModel,
} from './rhythmDetailModel';

// A t that shows which key was asked for with which values, minus the English fallback.
const t = ((key: string, options?: Record<string, unknown>) => {
  const values = Object.entries(options ?? {}).filter(([name]) => name !== 'defaultValue');
  return values.length ? `${key} ${JSON.stringify(Object.fromEntries(values))}` : key;
}) as unknown as TFunction;

const rhythm = (overrides: Partial<ReadingPlanRhythm> = {}): ReadingPlanRhythm => ({
  id: 'rhythm-1',
  title: 'Dawn office',
  items: [
    {
      id: 'a',
      type: 'passage',
      title: 'Psalm 63',
      bookId: 'PSA',
      startChapter: 63,
      endChapter: 63,
    },
    { id: 'b', type: 'plan', planId: 'psalms-30-days' },
    { id: 'c', type: 'plan', planId: 'proverbs-31-days' },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const progress = (planId: string, isCompleted: boolean): UserReadingPlanProgress => ({
  id: `progress-${planId}`,
  plan_id: planId,
  started_at: '2026-09-01T00:00:00.000Z',
  completed_entries: {},
  current_day: 1,
  is_completed: isCompleted,
  completed_at: isCompleted ? '2026-09-20T00:00:00.000Z' : null,
  synced_at: '2026-09-01T00:00:00.000Z',
});

const passageSegment: ReadingPlanRhythmSessionSegment = {
  itemId: 'a',
  type: 'passage',
  title: 'Psalm 63',
  startIndex: 0,
  endIndex: 0,
  chapterKeys: ['PSA_63'],
  isComplete: false,
  bookId: 'PSA',
  startChapter: 63,
  endChapter: 63,
};
const planSegment: ReadingPlanRhythmSessionSegment = {
  itemId: 'b',
  type: 'plan',
  title: 'Psalms in 30 days',
  startIndex: 1,
  endIndex: 5,
  chapterKeys: ['PSA_1', 'PSA_2', 'PSA_3', 'PSA_4', 'PSA_5'],
  isComplete: false,
  planId: 'psalms-30-days',
  dayNumber: 3,
};

const session = (
  startSegment: ReadingPlanRhythmSessionSegment | null
): BuildRhythmReaderSessionResult => ({
  sessionContext: {
    type: 'rhythm',
    rhythmId: 'rhythm-1',
    title: 'Dawn office',
    itemIds: ['a', 'b'],
    planIds: ['psalms-30-days'],
    chapterKeys: ['PSA_63', 'PSA_1'],
    segments: [passageSegment, planSegment],
  },
  playbackSequenceEntries: startSegment ? [{ bookId: 'PSA', chapter: 63 }] : [],
  startEntry: startSegment ? { bookId: 'PSA', chapter: 63 } : null,
  startSegment,
});

const viewModel = (overrides: Partial<RhythmSegmentViewModel>): RhythmSegmentViewModel => ({
  segment: passageSegment,
  plan: null,
  entries: [],
  progress: null,
  currentDaySummary: null,
  title: 'Psalm 63',
  ...overrides,
});

test('a rhythm’s plan ids come out in sequence order, without its passages', () => {
  assert.deepEqual(getRhythmPlanIds(rhythm()), ['psalms-30-days', 'proverbs-31-days']);
  assert.deepEqual(getRhythmPlanIds(null), []);
});

test('the plan tally counts finished plans and never reports negative remaining', () => {
  const ids = ['psalms-30-days', 'proverbs-31-days', 'gospels-60-days'];
  assert.deepEqual(
    tallyRhythmPlans(ids, {
      'psalms-30-days': progress('psalms-30-days', true),
      'proverbs-31-days': progress('proverbs-31-days', false),
    }),
    { completed: 1, remaining: 2 }
  );
  assert.deepEqual(tallyRhythmPlans([], {}), { completed: 0, remaining: 0 });
});

test('Continue Rhythm is available only when the session has a first chapter to open', () => {
  assert.equal(hasActiveRhythmSegments(null), false);
  assert.equal(hasActiveRhythmSegments(session(null)), false);
  assert.equal(hasActiveRhythmSegments(session(passageSegment)), true);
});

test('the reader opens on the first chapter with the rhythm queued, autoplaying for an idle listener', () => {
  const current = session(passageSegment);
  assert.deepEqual(buildRhythmReaderParams(current, 'listen', 'idle'), {
    bookId: 'PSA',
    chapter: 63,
    autoplayAudio: true,
    preferredMode: 'listen',
    playbackSequenceEntries: [{ bookId: 'PSA', chapter: 63 }],
    planId: undefined,
    planDayNumber: undefined,
    returnToPlanOnComplete: true,
    sessionContext: current.sessionContext,
  });
});

test('a paused listener or a reader in read mode is not autoplayed', () => {
  const current = session(passageSegment);
  assert.equal('autoplayAudio' in buildRhythmReaderParams(current, 'listen', 'paused')!, false);
  assert.equal('autoplayAudio' in buildRhythmReaderParams(current, 'read', 'idle')!, false);
});

test('a session that starts on a plan day carries that plan and day to the reader', () => {
  const params = buildRhythmReaderParams(session(planSegment), 'read', 'idle')!;
  assert.equal(params.planId, 'psalms-30-days');
  assert.equal(params.planDayNumber, 3);
  assert.equal(buildRhythmReaderParams(session(null), 'read', 'idle'), null);
  assert.equal(buildRhythmReaderParams(null, 'read', 'idle'), null);
});

test('a rhythm’s slot is its own, else read from a default slot title, else none', () => {
  assert.equal(
    getRhythmSlotPresentation(rhythm({ slot: 'evening' }))?.labelKey,
    'readingPlans.eveningRhythm'
  );
  assert.equal(
    getRhythmSlotPresentation(rhythm({ title: 'Morning Rhythm' }))?.labelKey,
    'readingPlans.morningRhythm'
  );
  assert.equal(getRhythmSlotPresentation(rhythm()), null);
  assert.equal(getRhythmSlotPresentation(null), null);
});

test('a single-chapter passage card names its chapter and counts one chapter', () => {
  assert.deepEqual(getRhythmSegmentCardCopy(viewModel({}), t), {
    statusLabel: 'common.next',
    statusVariant: 'accent',
    meta: 'readingPlans.repeatablePassage',
    chapterCountLabel: 'readingPlans.chapterCount {"count":1}',
    progressLabel: 'readingPlans.chapterCount {"count":1}',
    body: 'interface.chapterNumber {"chapter":63}',
  });
});

test('a passage over several chapters names the range', () => {
  const copy = getRhythmSegmentCardCopy(
    viewModel({ segment: { ...passageSegment, startChapter: 120, endChapter: 122 } }),
    t
  );
  assert.equal(copy.body, 'interface.chapterRange {"start":120,"end":122}');
});

test('a plan card reports today’s target and which day of the plan it is', () => {
  const copy = getRhythmSegmentCardCopy(
    viewModel({
      segment: planSegment,
      progress: progress('psalms-30-days', false),
      plan: {
        id: 'psalms-30-days',
        slug: 'psalms-30-days',
        title_key: 'readingPlans.psalms30.title',
        description_key: null,
        duration_days: 30,
        category: null,
        is_active: true,
        sort_order: 1,
        coverKey: 'dunes',
      },
      currentDaySummary: {
        completedChapterCount: 2,
        targetChapterCount: 5,
      } as RhythmSegmentViewModel['currentDaySummary'],
    }),
    t
  );
  assert.equal(copy.meta, 'readingPlans.dayOf {"current":3,"total":30}');
  assert.equal(copy.progressLabel, 'readingPlans.todayTargetProgress {"completed":2,"target":5}');
  assert.equal(copy.body, copy.progressLabel);
  assert.equal(copy.chapterCountLabel, 'readingPlans.chapterCount {"count":5}');
  assert.equal(copy.statusVariant, 'accent');
});

test('a finished plan card is marked completed in the success style', () => {
  const copy = getRhythmSegmentCardCopy(
    viewModel({ segment: planSegment, progress: progress('psalms-30-days', true) }),
    t
  );
  assert.equal(copy.statusLabel, 'readingPlans.completed');
  assert.equal(copy.statusVariant, 'success');
  assert.equal(copy.progressLabel, 'readingPlans.completed');
  // Without a plan or a day summary the card falls back to the segment’s own day.
  assert.equal(copy.meta, 'readingPlans.dayOf {"current":3,"total":3}');
  assert.equal(copy.body, null);
});

test('sequence cards take a plan’s translated title and a passage’s localized reference', () => {
  const cards = buildRhythmSegmentViewModels({
    session: session(passageSegment),
    allPlans: [],
    planEntriesById: {},
    progressByPlanId: {},
    planTitleById: { 'psalms-30-days': 'Psalms in a Month' },
    chaptersRead: {},
    listeningHistory: [],
    today: new Date(2026, 8, 24),
    t,
  });

  assert.deepEqual(
    cards.map((card) => [card.segment.itemId, card.title, card.currentDaySummary]),
    [
      ['a', 'Psalms 63', null],
      ['b', 'Psalms in a Month', null],
    ]
  );
});
