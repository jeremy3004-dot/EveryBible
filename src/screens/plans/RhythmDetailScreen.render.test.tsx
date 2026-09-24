import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Mutate } from 'zustand/vanilla';
import { create } from 'zustand';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { hostAncestors, installRenderHarness, textContent, within } from '../../testing/render';
import type { RhythmDetailScreenProps } from '../../navigation/types';
import type { ReadingPlanRhythmItem, UserReadingPlanProgress } from '../../services/plans/types';
import type { ReadingPlansStoreApi } from '../../stores/readingPlansStore';

// The real reading-plans store runs behind an in-memory MMKV; the plan catalog is the bundled one.
mockMmkvStorage(mock);
const harness = installRenderHarness(mock);
const t = harness.i18n.t.bind(harness.i18n);

const rootCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => true,
    navigate: (name: string, params: Record<string, unknown>) => rootCalls.push({ name, params }),
  },
});

const bibleStore = create(() => ({ preferredChapterLaunchMode: 'listen' as 'listen' | 'read' }));
const audioStore = create(() => ({ status: 'idle' as string }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });
mockModule(mock, sourcePath('stores/libraryStore.ts'), {
  useLibraryStore: create(() => ({ history: [] })),
});
const progressStore = create(() => ({ chaptersRead: {} as Record<string, number> }));
mockModule(mock, sourcePath('stores/progressStore.ts'), { useProgressStore: progressStore });

const PLAN_ID = 'psalms-30-days';

type PersistedReadingPlansStore = Mutate<ReadingPlansStoreApi, [['zustand/persist', unknown]]>;

async function loadStore() {
  const { readingPlansStore } = await import('../../stores/readingPlansStore');
  // The store is built with zustand's persist middleware, which its exported API type omits.
  const { persist } = readingPlansStore as PersistedReadingPlansStore;
  // Let the start-up rehydration finish first, so it cannot overwrite what a test seeds.
  if (!persist.hasHydrated()) await persist.rehydrate();
  return readingPlansStore;
}

afterEach(async () => {
  const store = await loadStore();
  store.setState(store.getInitialState(), true);
  bibleStore.setState(bibleStore.getInitialState(), true);
  audioStore.setState(audioStore.getInitialState(), true);
  progressStore.setState(progressStore.getInitialState(), true);
  rootCalls.length = 0;
});

const progress = (overrides: Partial<UserReadingPlanProgress> = {}): UserReadingPlanProgress => ({
  id: `progress-${PLAN_ID}`,
  plan_id: PLAN_ID,
  started_at: '2026-09-01T00:00:00.000Z',
  completed_entries: {},
  current_day: 1,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

async function seedRhythm(
  items: ReadingPlanRhythmItem[],
  planProgress: UserReadingPlanProgress | null = progress(),
  slot: 'morning' | 'afternoon' | 'evening' = 'morning'
) {
  const store = await loadStore();
  if (planProgress) {
    store.setState({
      enrolledPlanIds: [PLAN_ID],
      progressByPlanId: { [PLAN_ID]: planProgress },
    });
  }
  const result = store.getState().createRhythm({ title: 'Dawn office', slot, items });
  assert.ok(result.success, `fixture rhythm is valid: ${result.error}`);
  return result.rhythm!.id;
}

const psalm63: ReadingPlanRhythmItem = {
  id: '',
  type: 'passage',
  title: 'Evening psalm',
  bookId: 'PSA',
  startChapter: 63,
  endChapter: 63,
};
const psalmsPlan: ReadingPlanRhythmItem = { id: '', type: 'plan', planId: PLAN_ID };

async function renderDetail(rhythmId: string) {
  const { RhythmDetailScreen } = await import('./RhythmDetailScreen');
  const props = {
    navigation: harness.navigation.navigation,
    route: { key: 'rhythm', name: 'RhythmDetail', params: { rhythmId } },
  } as unknown as RhythmDetailScreenProps;
  const view = await harness.render(<RhythmDetailScreen {...props} />);
  await view.flush();
  return view;
}

test('the rhythm shows its slot, its ordered sequence and what comes next', async () => {
  const rhythmId = await seedRhythm([psalm63, psalmsPlan]);
  const view = await renderDetail(rhythmId);

  assert.ok(view.getByRole('header', { name: 'Dawn office' }));
  assert.ok(view.getByText(t('readingPlans.morningRhythm')));
  assert.ok(view.getByText(t('readingPlans.rhythmItemCount', { count: 2 })));
  assert.ok(view.getByRole('header', { name: t('readingPlans.rhythmSequence') }));
  assert.ok(view.getByText(t('readingPlans.nextUp', { value: 'Evening psalm' })));

  const titles = ['Evening psalm', t('readingPlans.psalms30.title')];
  const cards = titles.map((title) => view.getByText(title));
  assert.ok(within(cards[0].parent!.parent!).queryByText(t('readingPlans.repeatablePassage')));
  assert.ok(view.getByText(t('readingPlans.dayOf', { current: 1, total: 30 })));
});

test('Continue Rhythm opens the reader on the first chapter with the whole rhythm queued, in the preferred listen mode', async () => {
  const rhythmId = await seedRhythm([psalm63, psalmsPlan]);
  const view = await renderDetail(rhythmId);

  await view.press(
    view.getByRole('button', { name: t('readingPlans.continueRhythm'), disabled: false })
  );

  assert.equal(rootCalls.length, 1);
  const [{ name, params }] = rootCalls;
  assert.equal(name, 'Bible');
  assert.equal(params.screen, 'BibleReader');
  const reader = params.params as Record<string, unknown>;
  assert.equal(reader.bookId, 'PSA');
  assert.equal(reader.chapter, 63);
  assert.equal(reader.preferredMode, 'listen');
  assert.equal(reader.autoplayAudio, true);
  assert.equal(reader.returnToPlanOnComplete, true);
  assert.equal(reader.planId, undefined, 'the rhythm starts on a passage, not a plan day');

  const queue = reader.playbackSequenceEntries as Array<{ bookId: string; chapter: number }>;
  assert.deepEqual(
    queue.map((entry) => `${entry.bookId} ${entry.chapter}`),
    ['PSA 63', 'PSA 1', 'PSA 2', 'PSA 3', 'PSA 4', 'PSA 5']
  );
  const session = reader.sessionContext as {
    type: string;
    rhythmId: string;
    segments: Array<{ type: string; planId?: string }>;
  };
  assert.equal(session.type, 'rhythm');
  assert.equal(session.rhythmId, rhythmId);
  assert.deepEqual(
    session.segments.map((segment) => segment.type),
    ['passage', 'plan']
  );
});

test('a listener who paused audio is not restarted when continuing the rhythm', async () => {
  audioStore.setState({ status: 'paused' });
  const rhythmId = await seedRhythm([psalm63]);
  const view = await renderDetail(rhythmId);

  await view.press(view.getByRole('button', { name: t('readingPlans.continueRhythm') }));

  const reader = rootCalls[0].params.params as Record<string, unknown>;
  assert.equal(reader.preferredMode, 'listen');
  assert.equal('autoplayAudio' in reader, false);
});

test('a reader who prefers reading continues the rhythm in read mode without autoplay', async () => {
  bibleStore.setState({ preferredChapterLaunchMode: 'read' });
  const rhythmId = await seedRhythm([psalm63]);
  const view = await renderDetail(rhythmId);

  await view.press(view.getByRole('button', { name: t('readingPlans.continueRhythm') }));

  const reader = rootCalls[0].params.params as Record<string, unknown>;
  assert.equal(reader.preferredMode, 'read');
  assert.equal('autoplayAudio' in reader, false);
});

test('when every plan in the rhythm is finished, Continue is disabled and the sequence shows the completed state', async () => {
  const rhythmId = await seedRhythm(
    [psalmsPlan],
    progress({ is_completed: true, completed_at: '2026-09-20T00:00:00.000Z' })
  );
  const view = await renderDetail(rhythmId);

  const cont = view.getByRole('button', { name: t('readingPlans.continueRhythm'), disabled: true });
  await view.press(cont);
  assert.deepEqual(rootCalls, []);
  assert.equal(view.queryByText(/^Next up:/), null);
  assert.equal(
    view.queryByText(t('readingPlans.psalms30.title')),
    null,
    'the finished plan has no card'
  );
  // The summary falls back to the empty-rhythm copy, and the sequence shows its empty state.
  assert.equal(view.getAllByText(/^Build a repeatable flow/).length, 2);
});

test('the edit button opens the composer for this rhythm', async () => {
  const rhythmId = await seedRhythm([psalm63]);
  const view = await renderDetail(rhythmId);

  await view.press(view.getByRole('button', { name: t('readingPlans.editRhythm') }));

  assert.deepEqual(harness.navigation.calls, [
    { method: 'navigate', args: ['RhythmComposer', { rhythmId }] },
  ]);
});

test('each slot is named by the shared slot metadata', async () => {
  for (const [slot, key] of [
    ['afternoon', 'readingPlans.afternoonRhythm'],
    ['evening', 'readingPlans.eveningRhythm'],
  ] as const) {
    const rhythmId = await seedRhythm([psalm63], progress(), slot);
    const view = await renderDetail(rhythmId);
    assert.ok(view.getByText(t(key)), slot);
    assert.equal(view.queryByText(t('readingPlans.morningRhythm')), null);
    await view.unmount();
  }
});

test('a rhythm that no longer exists shows an error with a way back', async () => {
  const view = await renderDetail('missing-rhythm');

  assert.equal(view.queryByText(t('readingPlans.rhythmSequence')), null);
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.deepEqual(harness.navigation.calls, [{ method: 'goBack', args: [] }]);
});

test('at large text a sequence card moves its status pill under the title, and pills wrap', async () => {
  const rhythmId = await seedRhythm([psalm63]);
  harness.setFontScale(2);
  const view = await renderDetail(rhythmId);

  const titleColumn = hostAncestors(view.getByText('Evening psalm'))[0];
  const status = within(titleColumn).getByText(t('common.next'));
  assert.equal(status.props.numberOfLines, 2, 'a pill label wraps rather than truncates');
});

test('a rhythm left open overnight offers the new day of a calendar plan when the app comes back', async (context) => {
  context.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 24, 21, 0) });
  const PROVERBS = 'proverbs-31-days';
  const store = await loadStore();
  store.setState({
    enrolledPlanIds: [PROVERBS],
    progressByPlanId: { [PROVERBS]: progress({ id: 'progress-proverbs', plan_id: PROVERBS }) },
  });
  const result = store.getState().createRhythm({
    title: 'Wisdom',
    slot: 'evening',
    items: [{ id: '', type: 'plan', planId: PROVERBS }],
  });
  assert.ok(result.success);
  const view = await renderDetail(result.rhythm!.id);
  assert.ok(view.getByText(t('readingPlans.dayOf', { current: 24, total: 31 })));

  // Suspended overnight on this screen: nothing refocuses it.
  harness.rn.AppState.emit('background');
  mock.timers.setTime(new Date(2026, 8, 25, 7, 0).getTime());
  harness.rn.AppState.emit('active');
  await view.flush();

  assert.ok(view.getByText(t('readingPlans.dayOf', { current: 25, total: 31 })));
});

test("a plan card counts today's chapters already read against the day's target", async () => {
  const now = Date.now();
  progressStore.setState({ chaptersRead: { PSA_1: now, PSA_2: now } });
  const rhythmId = await seedRhythm([psalmsPlan]);
  const view = await renderDetail(rhythmId);

  const todayProgress = t('readingPlans.todayTargetProgress', { completed: 2, target: 5 });
  // Once as the card's progress pill and once as its body line.
  assert.equal(view.getAllByText(todayProgress).length, 2);
  assert.ok(view.getByText(t('readingPlans.chapterCount', { count: 5 })));
  assert.ok(view.getByText(t('common.next')));
});

test('the summary counts the items, and the finished and remaining plans', async () => {
  const PROVERBS = 'proverbs-31-days';
  const SERMON = 'sermon-on-the-mount-7-days';
  const finished = (planId: string) =>
    progress({
      id: `progress-${planId}`,
      plan_id: planId,
      is_completed: true,
      completed_at: '2026-09-20T00:00:00.000Z',
    });
  const store = await loadStore();
  store.setState({
    enrolledPlanIds: [PLAN_ID, PROVERBS, SERMON],
    progressByPlanId: {
      [PLAN_ID]: progress(),
      [PROVERBS]: finished(PROVERBS),
      [SERMON]: finished(SERMON),
    },
  });
  const result = store.getState().createRhythm({
    title: 'Full office',
    slot: 'morning',
    items: [
      psalm63,
      psalmsPlan,
      { id: '', type: 'plan', planId: PROVERBS },
      { id: '', type: 'plan', planId: SERMON },
    ],
  });
  assert.ok(result.success);
  const view = await renderDetail(result.rhythm!.id);

  const statValue = (label: string) =>
    textContent(within(hostAncestors(view.getByText(label))[0]).queryAllByType('Text')[0]);
  assert.equal(statValue(t('readingPlans.includedItems')), '4');
  assert.equal(statValue(t('readingPlans.completed')), '2');
  assert.equal(statValue(t('readingPlans.remaining')), '1');
  // With something left to read, the summary invites the reader on as the button does.
  assert.equal(view.getAllByText(t('readingPlans.continueRhythm')).length, 2);
});

test('a passage card names its chapter range', async () => {
  const rhythmId = await seedRhythm([
    { ...psalm63, title: 'Songs of ascent', startChapter: 120, endChapter: 122 },
  ]);
  const view = await renderDetail(rhythmId);

  assert.ok(view.getByText(t('interface.chapterRange', { start: 120, end: 122 })));
  // The chapter-count pill, and the progress pill a passage fills with the same count.
  assert.equal(view.getAllByText(t('readingPlans.chapterCount', { count: 3 })).length, 2);
});

test('a single-chapter passage card names its chapter', async () => {
  const rhythmId = await seedRhythm([psalm63]);
  const view = await renderDetail(rhythmId);

  assert.ok(view.getByText(t('interface.chapterNumber', { chapter: 63 })));
});

// The composer replaces itself with a fresh detail screen, leaving this one underneath;
// going back must not show the rhythm as it was before the edit.
test('an edit to the rhythm reaches a detail screen that is already open', async () => {
  const rhythmId = await seedRhythm([psalm63]);
  const view = await renderDetail(rhythmId);
  assert.ok(view.getByRole('header', { name: 'Dawn office' }));

  const store = await loadStore();
  const result = store.getState().updateRhythm(rhythmId, {
    title: 'Vespers',
    slot: 'evening',
    items: [{ ...psalm63, title: 'Psalm 141', startChapter: 141, endChapter: 141 }],
  });
  assert.ok(result.success);
  await view.flush();

  assert.ok(view.getByRole('header', { name: 'Vespers' }));
  assert.ok(view.getByText(t('readingPlans.eveningRhythm')));
  assert.ok(view.getByText(t('interface.chapterNumber', { chapter: 141 })));
  assert.equal(view.queryByText('Evening psalm'), null);
});
