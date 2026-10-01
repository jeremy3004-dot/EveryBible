import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { useEffect } from 'react';
import { mockMmkvStorage, mockModule, sourcePath } from '../../../testing/mockModules';
import { installRenderHarness } from '../../../testing/render';
import { readingPlanEntriesByPlanId } from '../../../data/readingPlans.generated';
import { formatLocalDateKey } from '../../../services/progress/readingActivity';
import { assertDefined } from '../../../utils/assertDefined';

mockMmkvStorage(mock);
const harness = installRenderHarness(mock);
mockModule(mock, sourcePath('services/plans/index.ts'), {
  getPlanChapterFocusVerse: () => undefined,
});

for (const fixture of [
  {
    planId: 'kathisma-weekly',
    day: 7,
    today: new Date(2026, 8, 27, 0, 10),
    occurrence: '2026-09-26',
  },
  {
    planId: 'common-prayer-psalter',
    day: 30,
    today: new Date(2026, 9, 1, 0, 10),
    occurrence: '2026-09-30',
  },
  {
    planId: 'common-prayer-psalter',
    day: 30,
    today: new Date(2026, 9, 1, 0, 10),
    now: new Date(2026, 9, 1, 5),
    occurrence: '2026-10-30',
  },
  { planId: 'psalms-30-days', day: 2, today: new Date(2026, 8, 27, 12), occurrence: undefined },
]) {
  test(`${fixture.planId} reader saves its resume with the existing completion occurrence rules${fixture.now ? ' after the midnight grace expires' : ''}`, async (context) => {
    context.mock.timers.enable({ apis: ['Date'], now: fixture.now ?? fixture.today });
    const { createReadingPlansStore } = await import('../../../stores/readingPlansStore');
    const { useReaderPlanSession } = await import('./useReaderPlanSession');
    const store = createReadingPlansStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    const progress = store.getState().enrollPlan(fixture.planId);
    const entry = assertDefined(
      readingPlanEntriesByPlanId[fixture.planId]?.find(
        (candidate) => candidate.day_number === fixture.day
      ),
      'plan day entry'
    );
    function ReaderSession() {
      useReaderPlanSession({
        activeChapterKey: `${entry.book}_${entry.chapter_start}`,
        activePlanId: fixture.planId,
        activePlanProgress: progress,
        bookId: entry.book,
        chapter: entry.chapter_start,
        chaptersRead: {},
        getRootTabBarStyle: () => ({}),
        getRootTabNavigation: () => null,
        listeningHistory: [],
        planDayNumber: fixture.day,
        planSessionKey: entry.session_key ?? undefined,
        playbackSequenceEntries: [],
        requestedFocusVerse: undefined,
        returnToPlanOnComplete: true,
        sessionContext: undefined,
        setPlanDayResume: store.getState().setPlanDayResume,
        today: fixture.today,
        todayDateKey: formatLocalDateKey(fixture.today),
      });
      return null;
    }
    await harness.render(<ReaderSession />);

    assert.deepEqual(store.getState().getPlanDayResume(fixture.planId, fixture.day), {
      bookId: entry.book,
      chapter: entry.chapter_start,
      ...(fixture.occurrence ? { occurrenceKey: fixture.occurrence } : {}),
    });
  });
}

test('a reader left on one account plan session does not save a resume for the account that signed in', async (context) => {
  const today = new Date(2026, 8, 27, 12);
  context.mock.timers.enable({ apis: ['Date'], now: today });
  const { createReadingPlansStore } = await import('../../../stores/readingPlansStore');
  const { useReaderPlanSession } = await import('./useReaderPlanSession');
  // The signed-in account is not enrolled in the plan the open reader route names.
  const store = createReadingPlansStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const entry = assertDefined(
    readingPlanEntriesByPlanId['psalms-30-days']?.find((candidate) => candidate.day_number === 2),
    'plan day entry'
  );
  function ReaderSession() {
    useReaderPlanSession({
      activeChapterKey: `${entry.book}_${entry.chapter_start}`,
      activePlanId: 'psalms-30-days',
      activePlanProgress: null,
      bookId: entry.book,
      chapter: entry.chapter_start,
      chaptersRead: {},
      getRootTabBarStyle: () => ({}),
      getRootTabNavigation: () => null,
      listeningHistory: [],
      planDayNumber: 2,
      planSessionKey: undefined,
      playbackSequenceEntries: [],
      requestedFocusVerse: undefined,
      returnToPlanOnComplete: true,
      sessionContext: undefined,
      setPlanDayResume: store.getState().setPlanDayResume,
      today,
      todayDateKey: formatLocalDateKey(today),
    });
    return null;
  }
  await harness.render(<ReaderSession />);

  assert.equal(store.getState().getPlanDayResume('psalms-30-days', 2), null);
});

test('reader completion and counted-at refresh together from the completed listen ledger', async (context) => {
  const today = new Date(2026, 8, 27, 12);
  context.mock.timers.enable({ apis: ['Date'], now: today });
  const { createReadingPlansStore } = await import('../../../stores/readingPlansStore');
  const { useReaderPlanSession } = await import('./useReaderPlanSession');
  const store = createReadingPlansStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const progress = store.getState().enrollPlan('psalms-30-days');
  let ledger: Record<string, number> = {};
  let session: ReturnType<typeof useReaderPlanSession> | undefined;
  function ReaderSession() {
    const current = useReaderPlanSession({
      activeChapterKey: 'PSA_1',
      activePlanId: 'psalms-30-days',
      activePlanProgress: progress,
      bookId: 'PSA',
      chapter: 1,
      chaptersRead: {},
      chaptersListened: ledger,
      getRootTabBarStyle: () => ({}),
      getRootTabNavigation: () => null,
      listeningHistory: [
        { id: 'PSA:1', bookId: 'PSA', chapter: 1, listenedAt: today.getTime(), progress: 0.1 },
      ],
      planDayNumber: 1,
      planSessionKey: undefined,
      playbackSequenceEntries: [],
      requestedFocusVerse: undefined,
      returnToPlanOnComplete: true,
      sessionContext: undefined,
      setPlanDayResume: store.getState().setPlanDayResume,
      today,
      todayDateKey: formatLocalDateKey(today),
    });
    useEffect(() => {
      session = current;
    }, [current]);
    return null;
  }
  const view = await harness.render(<ReaderSession />);
  assert.equal(session?.activePlanDaySummary?.completedChapterCount, 0);
  const completedAt = today.getTime() - 60_000;
  ledger = { PSA_1: completedAt };
  await view.rerender(<ReaderSession />);
  assert.equal(session?.activePlanDaySummary?.completedChapterCount, 1);
  assert.equal(session?.currentChapterListenStatus?.currentChapterListenCountedAt, completedAt);
  assert.equal(session?.currentChapterListenStatus?.alreadyCountedForPlan, true);
});

for (const fixture of [
  {
    planId: 'proverbs-31-days',
    day: 30,
    now: new Date(2026, 9, 1, 0, 10),
    occurrence: '2026-10-30',
  },
  {
    planId: 'proverbs-31-days',
    day: 30,
    now: new Date(2026, 9, 1, 5, 10),
    occurrence: '2026-09-30',
  },
  {
    planId: 'kathisma-weekly',
    day: 7,
    now: new Date(2026, 8, 27, 5, 10),
    occurrence: '2026-09-26',
  },
]) {
  test(`${fixture.planId} reader resume and chapter routes remain bound to captured ${fixture.occurrence}`, async (context) => {
    context.mock.timers.enable({ apis: ['Date'], now: fixture.now });
    const { createReadingPlansStore } = await import('../../../stores/readingPlansStore');
    const { useReaderPlanSession } = await import('./useReaderPlanSession');
    const store = createReadingPlansStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    const progress = store.getState().enrollPlan(fixture.planId);
    const entry = assertDefined(
      readingPlanEntriesByPlanId[fixture.planId]?.find(
        (candidate) => candidate.day_number === fixture.day
      ),
      'plan day entry'
    );
    let session: ReturnType<typeof useReaderPlanSession> | undefined;
    function ReaderSession() {
      const current = useReaderPlanSession({
        activeChapterKey: `${entry.book}_${entry.chapter_start}`,
        activePlanId: fixture.planId,
        activePlanProgress: progress,
        bookId: entry.book,
        chapter: entry.chapter_start,
        chaptersRead: {},
        getRootTabBarStyle: () => ({}),
        getRootTabNavigation: () => null,
        listeningHistory: [],
        planDayNumber: fixture.day,
        planSessionKey: entry.session_key ?? undefined,
        playbackSequenceEntries: [],
        requestedFocusVerse: undefined,
        returnToPlanOnComplete: true,
        sessionContext: undefined,
        setPlanDayResume: store.getState().setPlanDayResume,
        today: fixture.now,
        todayDateKey: formatLocalDateKey(fixture.now),
        ...{ planOccurrenceKey: fixture.occurrence },
      });
      useEffect(() => {
        session = current;
      }, [current]);
      return null;
    }
    await harness.render(<ReaderSession />);
    assert.equal(
      store.getState().getPlanDayResume(fixture.planId, fixture.day)?.occurrenceKey,
      fixture.occurrence
    );
    const next = session?.resolvePlanSessionRouteParams(entry.book, entry.chapter_start);
    assert.equal((next as Record<string, unknown>).planOccurrenceKey, fixture.occurrence);
  });
}

test('a rhythm reader keeps the captured occurrence across midnight, chapter hops and a passage segment', async (context) => {
  const now = new Date(2026, 9, 1, 5, 10);
  context.mock.timers.enable({ apis: ['Date'], now });
  const { createReadingPlansStore } = await import('../../../stores/readingPlansStore');
  const { buildRhythmReaderSession } = await import('../../../services/plans/readingPlanActivity');
  const { useReaderPlanSession } = await import('./useReaderPlanSession');
  const store = createReadingPlansStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const planId = 'proverbs-31-days';
  const progress = store.getState().enrollPlan(planId);
  const captured = buildRhythmReaderSession({
    rhythm: {
      id: 'wisdom',
      title: 'Wisdom',
      createdAt: '',
      updatedAt: '',
      items: [
        { id: 'plan', type: 'plan', planId },
        {
          id: 'passage',
          type: 'passage',
          title: 'Psalm',
          bookId: 'PSA',
          startChapter: 1,
          endChapter: 1,
        },
      ],
    },
    planEntriesById: readingPlanEntriesByPlanId,
    progressByPlanId: { [planId]: progress },
    today: new Date(2026, 8, 30, 23, 55),
  });
  let session: ReturnType<typeof useReaderPlanSession> | undefined;
  function ReaderSession() {
    const current = useReaderPlanSession({
      activeChapterKey: 'PRO_30',
      activePlanId: planId,
      activePlanProgress: progress,
      bookId: 'PRO',
      chapter: 30,
      chaptersRead: {},
      getRootTabBarStyle: () => ({}),
      getRootTabNavigation: () => null,
      listeningHistory: [],
      planDayNumber: 30,
      planSessionKey: undefined,
      planOccurrenceKey: captured.startSegment?.occurrenceKey,
      playbackSequenceEntries: captured.playbackSequenceEntries,
      requestedFocusVerse: undefined,
      returnToPlanOnComplete: true,
      sessionContext: captured.sessionContext,
      setPlanDayResume: store.getState().setPlanDayResume,
      today: now,
      todayDateKey: formatLocalDateKey(now),
    });
    useEffect(() => {
      session = current;
    }, [current]);
    return null;
  }
  await harness.render(<ReaderSession />);
  assert.equal(store.getState().getPlanDayResume(planId, 30)?.occurrenceKey, '2026-09-30');
  assert.equal(session?.resolvePlanSessionRouteParams('PRO', 30).planOccurrenceKey, '2026-09-30');
  const passage = session?.resolvePlanSessionRouteParams('PSA', 1);
  assert.equal(passage?.planId, undefined);
  assert.equal(passage?.planOccurrenceKey, undefined);
  assert.equal(
    Object.hasOwn(passage!, 'planOccurrenceKey'),
    true,
    'setParams must clear the prior plan occurrence'
  );
});

// Owner-switch fixtures: the screen feeds the hook the active owner's progress for the route plan.
async function renderSessionWithProgress(
  context: { mock: { timers: { enable: (options: { apis: 'Date'[]; now: Date }) => void } } },
  today: Date
) {
  context.mock.timers.enable({ apis: ['Date'], now: today });
  const { createReadingPlansStore } = await import('../../../stores/readingPlansStore');
  const { useReaderPlanSession } = await import('./useReaderPlanSession');
  const store = createReadingPlansStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const enrolled = store.getState().enrollPlan('psalms-30-days');
  const state: {
    progress: typeof enrolled | null;
    session: ReturnType<typeof useReaderPlanSession> | undefined;
  } = { progress: enrolled, session: undefined };
  function ReaderSession() {
    const current = useReaderPlanSession({
      activeChapterKey: 'PSA_1',
      activePlanId: 'psalms-30-days',
      activePlanProgress: state.progress,
      bookId: 'PSA',
      chapter: 1,
      chaptersRead: {},
      getRootTabBarStyle: () => ({}),
      getRootTabNavigation: () => null,
      listeningHistory: [],
      planDayNumber: 1,
      planSessionKey: undefined,
      playbackSequenceEntries: [],
      requestedFocusVerse: undefined,
      returnToPlanOnComplete: true,
      sessionContext: undefined,
      setPlanDayResume: store.getState().setPlanDayResume,
      today,
      todayDateKey: formatLocalDateKey(today),
    });
    useEffect(() => {
      state.session = current;
    }, [current]);
    return null;
  }
  const view = await harness.render(<ReaderSession />);
  return { enrolled, rerender: () => view.rerender(<ReaderSession />), state };
}

test('the reader drops the plan-session chrome when the signed-in account is not enrolled in the route plan', async (context) => {
  const { rerender, state } = await renderSessionWithProgress(context, new Date(2026, 8, 27, 12));
  assert.equal(state.session?.showPlanSessionChrome, true);
  assert.deepEqual(state.session?.resolvePlanSessionRouteParams('PSA', 2), {
    planId: 'psalms-30-days',
    planDayNumber: 1,
    returnToPlanOnComplete: true,
  });

  // Account B signs in: the plans store now holds B's progress, which has no such plan.
  state.progress = null;
  await rerender();

  assert.equal(state.session?.showPlanSessionChrome, false);
  assert.equal(state.session?.activePlanDaySummary, null);
  assert.deepEqual(state.session?.resolvePlanSessionRouteParams('PSA', 2), {});
});

test('a guest plan session survives sign-in because adoption moves the plan into the account', async (context) => {
  const { enrolled, rerender, state } = await renderSessionWithProgress(
    context,
    new Date(2026, 8, 27, 12)
  );
  assert.equal(state.session?.showPlanSessionChrome, true);

  // Sign-in merges the guest bucket into the account: same plan, new progress object.
  state.progress = { ...enrolled };
  await rerender();

  assert.equal(state.session?.showPlanSessionChrome, true);
});
