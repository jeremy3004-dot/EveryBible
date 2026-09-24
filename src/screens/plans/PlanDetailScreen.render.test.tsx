import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Mutate } from 'zustand/vanilla';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import {
  mockMmkvStorage,
  mockModule,
  mockSupabaseModule,
  sourcePath,
} from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';
import {
  accessibilityLabelOf,
  flattenStyle,
  installRenderHarness,
  isHiddenFromAccessibility,
  within,
} from '../../testing/render';
import { readingPlanEntriesByPlanId } from '../../data/readingPlans.generated';
import { getPlanLedgerDotPaint } from './planLedgerGridModel';
import type { PlanDetailScreenProps } from '../../navigation/types';
import type { UserReadingPlanProgress } from '../../services/plans/types';
import type { ReadingPlansStoreApi } from '../../stores/readingPlansStore';

// Calendar logic (scheduled dates, day-of-month cycles) runs in a pinned zone and clock.
process.env.TZ = 'UTC';
const TODAY = '2026-09-24T12:00:00.000Z'; // a Thursday

// The real reading-plans store (behind an in-memory MMKV) and the bundled plan catalog.
mockMmkvStorage(mock);
const harness = installRenderHarness(mock);
const t = harness.i18n.t.bind(harness.i18n);

const rootCalls: Array<{ name: string; params: { screen: string; params: ReaderParams } }> = [];
type ReaderParams = Record<string, unknown> & {
  bookId: string;
  chapter: number;
  playbackSequenceEntries: Array<{ bookId: string; chapter: number }>;
};
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => true,
    navigate: (name: string, params: (typeof rootCalls)[number]['params']) =>
      rootCalls.push({ name, params }),
  },
});

const bibleStore = create(() => ({
  preferredChapterLaunchMode: 'listen' as 'listen' | 'read',
  translations: [{ id: 'bsb', hasAudio: true }],
  currentTranslation: 'bsb',
}));
const audioStore = create(() => ({ status: 'idle' as string }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });
mockModule(mock, sourcePath('stores/libraryStore.ts'), {
  useLibraryStore: create(() => ({ history: [] })),
});
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore: create(() => ({ chaptersRead: {} })),
});
// Scheduled day labels read the in-app language from the i18n singleton.
mockModule(mock, sourcePath('i18n/index.ts'), { default: harness.i18n });
mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });
// Plans are local-first; with no backend configured, enrolling stays on the device.
mockSupabaseModule(mock, createSupabaseFake(), { configured: false });
// Cover art is bundled PNGs, which Node cannot require.
mockModule(mock, sourcePath('services/plans/readingPlanAssets.ts'), {
  READING_PLAN_COVER_SOURCES: [],
  getReadingPlanCoverSource: (plan: { cover_key?: string }) =>
    plan.cover_key ? { uri: `cover:${plan.cover_key}` } : null,
});

const PSALMS = 'psalms-30-days';
const PROVERBS = 'proverbs-31-days';
const KATHISMA = 'kathisma-weekly';

type PersistedReadingPlansStore = Mutate<ReadingPlansStoreApi, [['zustand/persist', unknown]]>;

async function loadStore() {
  const { readingPlansStore } = await import('../../stores/readingPlansStore');
  // The store is built with zustand's persist middleware, which its exported API type omits.
  const { persist } = readingPlansStore as PersistedReadingPlansStore;
  // Let the start-up rehydration finish first, so it cannot overwrite what a test seeds.
  if (!persist.hasHydrated()) await persist.rehydrate();
  return readingPlansStore;
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: new Date(TODAY) });
});

afterEach(async () => {
  mock.timers.reset();
  const store = await loadStore();
  store.setState(store.getInitialState(), true);
  bibleStore.setState(bibleStore.getInitialState(), true);
  audioStore.setState(audioStore.getInitialState(), true);
  rootCalls.length = 0;
});

async function enroll(planId: string, overrides: Partial<UserReadingPlanProgress> = {}) {
  const store = await loadStore();
  const progress: UserReadingPlanProgress = {
    id: `progress-${planId}`,
    plan_id: planId,
    started_at: '2026-09-22T09:00:00.000Z',
    completed_entries: {},
    completed_sessions: {},
    current_day: 1,
    current_session: null,
    is_completed: false,
    completed_at: null,
    synced_at: '2026-09-22T09:00:00.000Z',
    ...overrides,
  };
  store.setState({ enrolledPlanIds: [planId], progressByPlanId: { [planId]: progress } });
  return store;
}

async function renderPlan(planId: string) {
  const { PlanDetailScreen } = await import('./PlanDetailScreen');
  const props = {
    navigation: harness.navigation.navigation,
    route: { key: 'plan', name: 'PlanDetail', params: { planId } },
  } as unknown as PlanDetailScreenProps;
  const view = await harness.render(<PlanDetailScreen {...props} />);
  await view.flush();
  return view;
}

type View = Awaited<ReturnType<typeof renderPlan>>;

/** Ledger rows are announced "Day N[, date]: passages". */
const ledgerRows = (view: View) =>
  view
    .getAllByRole('button')
    .filter((node) => /^Day \d+[,:]/.test(accessibilityLabelOf(node) ?? ''));
const ledgerRow = (view: View, day: number) => {
  const row = ledgerRows(view).find((node) =>
    new RegExp(`^Day ${day}[,:]`).test(accessibilityLabelOf(node) ?? '')
  );
  assert.ok(row, `ledger row for day ${day}`);
  return row;
};
const dayNumbers = (rows: ReactTestInstance[]) =>
  rows.map((node) => Number(/^Day (\d+)/.exec(accessibilityLabelOf(node) ?? '')![1]));

const chaptersOf = (planId: string, day: number) =>
  readingPlanEntriesByPlanId[planId]
    .filter((entry) => entry.day_number === day)
    .flatMap((entry) => {
      const chapters: number[] = [];
      for (let c = entry.chapter_start; c <= (entry.chapter_end ?? entry.chapter_start); c += 1) {
        chapters.push(c);
      }
      return chapters;
    });

const lastReaderLaunch = () => {
  const call = rootCalls.at(-1);
  assert.ok(call, 'the reader was opened');
  assert.equal(call.name, 'Bible');
  assert.equal(call.params.screen, 'BibleReader');
  return call.params.params;
};

// ---------------------------------------------------------------------------
// Opening a plan day in the reader
// ---------------------------------------------------------------------------

test("Read on today's card opens the reader on the day's first chapter with the day queued and the plan context", async () => {
  await enroll(PSALMS, { current_day: 3, completed_entries: { '1': 'x', '2': 'x' } });
  const view = await renderPlan(PSALMS);

  await view.press(view.getByRole('button', { name: t('bible.read') }));

  const reader = lastReaderLaunch();
  const chapters = chaptersOf(PSALMS, 3);
  assert.equal(reader.bookId, 'PSA');
  assert.equal(reader.chapter, chapters[0]);
  assert.deepEqual(
    reader.playbackSequenceEntries.map((entry) => entry.chapter),
    chapters
  );
  assert.equal(reader.planId, PSALMS);
  assert.equal(reader.planDayNumber, 3);
  assert.equal(reader.returnToPlanOnComplete, true);
  assert.equal(reader.preferredMode, 'listen');
  assert.equal(reader.autoplayAudio, true);
  assert.equal('planSessionKey' in reader, false);
});

test('a saved resume point reopens the day on that chapter, still queuing the whole day', async () => {
  const store = await enroll(PSALMS, { current_day: 3 });
  const chapters = chaptersOf(PSALMS, 3);
  store.getState().setPlanDayResume(PSALMS, 3, 'PSA', chapters[2]);
  const view = await renderPlan(PSALMS);

  await view.press(view.getByTestId('plan-detail-current-day-row'));

  const reader = lastReaderLaunch();
  assert.equal(reader.chapter, chapters[2]);
  assert.equal(reader.playbackSequenceEntries.length, chapters.length);
});

test('a reader who prefers reading opens the day without autoplay, while Listen always starts audio', async () => {
  bibleStore.setState({ preferredChapterLaunchMode: 'read' });
  await enroll(PSALMS, { current_day: 3 });
  const view = await renderPlan(PSALMS);

  await view.press(view.getByRole('button', { name: t('bible.read') }));
  let reader = lastReaderLaunch();
  assert.equal(reader.preferredMode, 'read');
  assert.equal('autoplayAudio' in reader, false);

  await view.press(view.getByRole('button', { name: t('bible.listen') }));
  reader = lastReaderLaunch();
  assert.equal(reader.preferredMode, 'listen');
  assert.equal(reader.autoplayAudio, true);
  assert.equal(reader.planDayNumber, 3);
});

test('tapping a day of a plan not started yet enrolls first, then opens that day', async () => {
  const store = await loadStore();
  const view = await renderPlan(PSALMS);
  assert.equal(store.getState().progressByPlanId[PSALMS], undefined);

  await view.press(ledgerRow(view, 4));

  assert.ok(store.getState().progressByPlanId[PSALMS], 'the plan was started');
  const reader = lastReaderLaunch();
  assert.equal(reader.planDayNumber, 4);
  assert.equal(reader.chapter, chaptersOf(PSALMS, 4)[0]);
});

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

test('before enrolling, the ledger lists every day of the plan without dates, under one Start plan action', async () => {
  const store = await loadStore();
  const view = await renderPlan(PSALMS);

  assert.deepEqual(
    dayNumbers(ledgerRows(view)),
    Array.from({ length: 30 }, (_, index) => index + 1)
  );
  assert.ok(ledgerRows(view).every((row) => /^Day \d+: /.test(accessibilityLabelOf(row)!)));
  assert.equal(view.queryByTestId('plan-detail-current-day-row'), null);
  assert.ok(view.getByText(t('readingPlans.ledger')));

  await view.press(view.getByRole('button', { name: t('readingPlans.startPlan') }));

  assert.ok(store.getState().progressByPlanId[PSALMS]);
  assert.equal(view.queryByRole('button', { name: t('readingPlans.startPlan') }), null);
  assert.ok(view.getByTestId('plan-detail-current-day-row'));
});

test('an enrolled plan dates each day from its start date, and today is the one current-day row', async () => {
  await enroll(PSALMS, { current_day: 3, started_at: '2026-09-22T09:00:00.000Z' });
  const view = await renderPlan(PSALMS);

  const current = view.getByTestId('plan-detail-current-day-row');
  assert.match(accessibilityLabelOf(current)!, /^Current plan day 3, Sep 24: Psalms/);
  assert.match(accessibilityLabelOf(ledgerRow(view, 5))!, /^Day 5, Sep 26: /);
  assert.match(accessibilityLabelOf(ledgerRow(view, 1))!, /^Day 1, Sep 22: /);
  assert.equal(
    view.root.findAll((node) => node.props.testID === 'plan-detail-current-day-row').length > 0,
    true
  );
  assert.ok(
    ledgerRows(view).every((row) => row.props.testID === undefined),
    'no other row carries the current-day test id'
  );
  assert.equal(dayNumbers(ledgerRows(view)).includes(3), false, 'today is not repeated below');
  // Tomorrow leads the ledger, then the days behind, newest first.
  assert.deepEqual(dayNumbers(ledgerRows(view)).slice(0, 3), [4, 2, 1]);
  assert.deepEqual(ledgerRow(view, 4).props.accessibilityValue, { text: 'Tomorrow' });
});

test('a day-of-month rhythm lists only this month’s real dates, and on its last day tomorrow wraps to day 1', async () => {
  mock.timers.setTime(new Date('2026-09-30T12:00:00.000Z').getTime());
  await enroll(PROVERBS, { started_at: '2026-09-01T09:00:00.000Z' });
  const view = await renderPlan(PROVERBS);

  assert.match(
    accessibilityLabelOf(view.getByTestId('plan-detail-current-day-row'))!,
    /^Current plan day 30, Sep 30: /
  );
  const days = dayNumbers(ledgerRows(view));
  assert.equal(days.includes(31), false, 'September has no 31st');
  assert.equal(days.length, 29);
  assert.equal(days[0], 1);
  assert.deepEqual(ledgerRow(view, 1).props.accessibilityValue, { text: 'Tomorrow' });
});

test('a recurring plan not started yet lists its whole cycle by date, and starting it lands on today', async () => {
  const store = await loadStore();
  const view = await renderPlan(PROVERBS);

  const days = dayNumbers(ledgerRows(view));
  assert.deepEqual(
    days,
    Array.from({ length: 30 }, (_, index) => index + 1)
  );
  assert.match(accessibilityLabelOf(ledgerRow(view, 24))!, /^Day 24, Sep 24: /);
  assert.match(accessibilityLabelOf(ledgerRow(view, 1))!, /^Day 1, Sep 1: /);

  await view.press(view.getByRole('button', { name: t('readingPlans.startPlan') }));

  assert.ok(store.getState().progressByPlanId[PROVERBS]);
  assert.match(
    accessibilityLabelOf(view.getByTestId('plan-detail-current-day-row'))!,
    /^Current plan day 24, Sep 24: /
  );
});

test('the dot grid and the ledger rows agree on a recurring day read by its date', async () => {
  await enroll(PROVERBS, {
    started_at: '2026-09-01T09:00:00.000Z',
    completed_entries: { '2026-09-10': '2026-09-10T08:00:00.000Z' },
  });
  const view = await renderPlan(PROVERBS);

  assert.deepEqual(ledgerRow(view, 10).props.accessibilityValue, { text: 'Completed' });
  assert.equal(ledgerRow(view, 9).props.accessibilityValue, undefined);
  // September has 30 days, so the month-long cycle does too; 23 are behind today,
  // one was read, the rest missed.
  assert.ok(view.getByText('1 of 30 days · 22 missed'));
});

test('cycle days that ran before the reader joined are neither missed nor completed', async () => {
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const { DEFAULT_APPEARANCE_PALETTE } = await import('../../constants/appearancePalettes');
  const palette = createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
  await enroll(PROVERBS, { started_at: '2026-09-20T09:00:00.000Z' });
  const view = await renderPlan(PROVERBS);

  // Only the 20th to the 23rd were due since joining.
  assert.ok(view.getByText('0 of 30 days · 4 missed'));
  const dayLabelColour = (day: number) =>
    flattenStyle(within(ledgerRow(view, day)).getByText(`Day ${day}`).props.style)?.color;
  assert.equal(dayLabelColour(5), palette.textTertiary, 'pre-enrolment day renders neutral');
  assert.equal(dayLabelColour(21), palette.secondaryText, 'a missed day keeps its weight');
  assert.equal(ledgerRow(view, 5).props.accessibilityValue, undefined);
});

// ---------------------------------------------------------------------------
// Multi-session days
// ---------------------------------------------------------------------------

test("a multi-session day offers a button per session, and each opens exactly that session's readings", async () => {
  await enroll(KATHISMA, { started_at: '2026-09-20T09:00:00.000Z' });
  const view = await renderPlan(KATHISMA);
  // Thursday is day 5 of the weekly cycle.
  const morning = view.getByRole('button', { name: 'Morning Kathismata for day 5' });
  const evening = view.getByRole('button', { name: 'Evening Kathismata for day 5' });
  assert.ok(morning);

  await view.press(evening);

  const reader = lastReaderLaunch();
  const eveningEntries = readingPlanEntriesByPlanId[KATHISMA].filter(
    (entry) => entry.day_number === 5 && entry.session_key === 'evening'
  );
  assert.equal(reader.planSessionKey, 'evening');
  assert.equal(reader.planDayNumber, 5);
  assert.equal(reader.chapter, eveningEntries[0].chapter_start);
  assert.ok(
    reader.playbackSequenceEntries.every((entry) =>
      eveningEntries.some(
        (session) =>
          entry.chapter >= session.chapter_start &&
          entry.chapter <= (session.chapter_end ?? session.chapter_start)
      )
    ),
    'only the evening readings are queued'
  );

  // A session spread over several passages queues every one of them, in order.
  await view.press(morning);
  const morningChapters = readingPlanEntriesByPlanId[KATHISMA].filter(
    (entry) => entry.day_number === 5 && entry.session_key === 'morning'
  ).flatMap((entry) =>
    Array.from(
      { length: (entry.chapter_end ?? entry.chapter_start) - entry.chapter_start + 1 },
      (_, index) => entry.chapter_start + index
    )
  );
  assert.ok(morningChapters.length > 10, 'fixture: two morning passages');
  assert.equal(lastReaderLaunch().planSessionKey, 'morning');
  assert.deepEqual(
    lastReaderLaunch().playbackSequenceEntries.map((entry) => entry.chapter),
    morningChapters
  );
});

test('a past multi-session day offers its sessions to VoiceOver as custom actions that open them', async () => {
  await enroll(KATHISMA, { started_at: '2026-09-20T09:00:00.000Z' });
  const view = await renderPlan(KATHISMA);
  const row = ledgerRow(view, 2);

  assert.deepEqual(
    (row.props.accessibilityActions as Array<{ label: string }>).map((action) => action.label),
    ['Morning Kathismata for day 2', 'Evening Kathismata for day 2']
  );
  await view.fire(row, 'onAccessibilityAction', {
    nativeEvent: { actionName: 'session:evening' },
  });
  assert.equal(lastReaderLaunch().planSessionKey, 'evening');
  assert.equal(lastReaderLaunch().planDayNumber, 2);
});

// ---------------------------------------------------------------------------
// Progress card and hero
// ---------------------------------------------------------------------------

test("the progress card announces the day and tally in one stop, today's target shows under it, and the dot grid is drawn on the first frame but hidden", async () => {
  await enroll(PSALMS, { current_day: 3, completed_entries: { '1': 'x', '2': 'x' } });
  const view = await renderPlan(PSALMS);

  assert.ok(view.getByLabelText('Day 3 of 30, Completed, 2 of 30 days'));
  assert.ok(
    view.getByText(
      t('readingPlans.todayTargetProgress', { completed: 0, target: chaptersOf(PSALMS, 3).length })
    )
  );

  // No onLayout has fired: the grid must already have one dot per plan day.
  const grid = view.root.find(
    (node) => typeof node.type === 'string' && node.props.accessibilityElementsHidden === true
  );
  assert.equal(isHiddenFromAccessibility(grid), true);
  const dots = grid.findAll(
    (node) =>
      typeof node.type === 'string' &&
      flattenStyle(node.props.style)?.aspectRatio === 1 &&
      flattenStyle(node.props.style)?.backgroundColor !== undefined
  );
  assert.equal(dots.length, 30);
  assert.equal(view.queryAllByType('Svg').length, 0, 'no ring gauge');

  // Every day state is painted from the shared, contrast-tested dot paint.
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const { DEFAULT_APPEARANCE_PALETTE } = await import('../../constants/appearancePalettes');
  const paint = getPlanLedgerDotPaint(createThemeColors('light', DEFAULT_APPEARANCE_PALETTE));
  const dotPaint = (dot: ReactTestInstance) => {
    const style = flattenStyle(dot.props.style)!;
    return { fill: style.backgroundColor, border: style.borderColor ?? null };
  };
  const expected = (state: keyof typeof paint) => ({
    fill: paint[state].fill,
    border: paint[state].border,
  });
  assert.deepEqual(dotPaint(dots[0]), expected('done'));
  assert.deepEqual(dotPaint(dots[1]), expected('done'));
  assert.deepEqual(dotPaint(dots[2]), expected('today'));
  assert.deepEqual(dotPaint(dots[29]), expected('future'));
});

test('the plan title is a heading set on the cover in the fixed on-photo colour, over a full-width cover', async () => {
  const view = await renderPlan(PSALMS);

  const title = view.getByRole('header', { name: t('readingPlans.psalms30.title') });
  assert.equal(flattenStyle(title.props.style)?.color, '#FDFAF5');
  // The cadence/length/book eyebrow is set over the photo too, in its fixed on-photo tint.
  const eyebrow = view.getByText('Book study · 30 days · Psalms');
  assert.equal(flattenStyle(eyebrow.props.style)?.color, 'rgba(253, 250, 245, 0.82)');
  // The length reads once, in the eyebrow: no duration badge row (related-plan cards aside).
  const insideRelatedPlans = (node: ReactTestInstance) => {
    for (let at: ReactTestInstance | null = node; at; at = at.parent) {
      if (at.props.horizontal === true) return true;
    }
    return false;
  };
  assert.deepEqual(
    view
      .getAllByText(/\b30 days\b/)
      .filter((node) => !insideRelatedPlans(node))
      .map((node) => node.props.children),
    ['Book study · 30 days · Psalms']
  );

  const [cover] = view.queryAllByType('Image');
  assert.deepEqual(cover.props.source, { uri: 'cover:river' });
  const frame = flattenStyle(cover.props.style)!;
  assert.equal(frame.width, '100%');
  assert.equal(frame.height, 360);
  assert.equal(isHiddenFromAccessibility(cover), true);
});

test('the plan offers no save-for-later, sample, public completion count or manual mark-complete control', async () => {
  for (const enrolled of [false, true]) {
    if (enrolled) await enroll(PSALMS, { current_day: 3 });
    const view = await renderPlan(PSALMS);

    for (const text of [
      t('readingPlans.saveForLater'),
      t('readingPlans.sample'),
      t('readingPlans.markComplete'),
      'Mark as Complete',
    ]) {
      assert.equal(view.queryByText(text), null, `${text} (enrolled: ${enrolled})`);
    }
    assert.equal(view.queryByText(/completions$/), null);
    await view.unmount();
  }
});
