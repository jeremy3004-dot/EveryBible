import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement, useEffect, type ReactNode } from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import type { Mutate } from 'zustand/vanilla';
import { mockMmkvStorage, mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { createReactNavigationFake } from '../../testing/nativePackageFakes';
import {
  accessibilityLabelOf,
  flattenStyle,
  installRenderHarness,
  isHiddenFromAccessibility,
  textContent as textOf,
  within,
} from '../../testing/render';
import { readingPlanEntriesByPlanId, readingPlans } from '../../data/readingPlans.generated';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';
import type { ListeningHistoryEntry } from '../../stores/libraryModel';
import type { ReadingPlansStoreApi } from '../../stores/readingPlansStore';

// Recurring plans read their day from the calendar, so the zone and clock are pinned.
process.env.TZ = 'UTC';
const SWIPEABLE = 'react-native-gesture-handler/ReanimatedSwipeable';
const TODAY = '2026-09-24T12:00:00.000Z'; // a Thursday: day 24 of Proverbs, day 5 of the Kathisma week

// The real reading-plans store (behind an in-memory MMKV) and the bundled plan catalog.
mockMmkvStorage(mock);
const harness = installRenderHarness(mock, { skip: ['@react-navigation/native'] });
const t = harness.i18n.t.bind(harness.i18n);

// useFocusEffect as a screen gets it: it runs on mount, and again each time the
// test "returns" to the screen through refocus().
const focusEffects = new Set<() => void | (() => void)>();
mockPackage(mock, '@react-navigation/native', {
  ...createReactNavigationFake(harness.navigation),
  useFocusEffect: (effect: () => void | (() => void)) => {
    useEffect(() => {
      focusEffects.add(effect);
      const cleanup = effect();
      return () => {
        focusEffects.delete(effect);
        if (typeof cleanup === 'function') cleanup();
      };
    }, [effect]);
  },
});
async function refocus() {
  await act(async () => {
    for (const effect of focusEffects) effect();
  });
}

// The swipe-to-delete row: the gesture itself cannot run here, so the fake draws
// the revealed actions next to the row, the way a completed swipe shows them.
// The subpath's package.json points at a directory, which only the require
// resolver follows, so the mock goes on the file it resolves to.
const swipeCloses: number[] = [];
mockModule(mock, createRequire(import.meta.url).resolve(SWIPEABLE), {
  default: { __esModule: true, default: SwipeableFake },
});
function SwipeableFake({
  children,
  renderRightActions,
  ...props
}: {
  children?: ReactNode;
  renderRightActions?: (progress: unknown, drag: unknown, methods: object) => ReactNode;
}) {
  return createElement(
    'Swipeable',
    props,
    children,
    renderRightActions?.(null, null, { close: () => swipeCloses.push(1) })
  );
}

const libraryStore = create(() => ({ history: [] as ListeningHistoryEntry[] }));
const progressStore = create(() => ({ chaptersRead: {} as Record<string, number> }));
mockModule(mock, sourcePath('stores/libraryStore.ts'), { useLibraryStore: libraryStore });
mockModule(mock, sourcePath('stores/progressStore.ts'), { useProgressStore: progressStore });
// Cover art is bundled PNGs, which Node cannot require. Every plan row draws its
// cover each time it renders, so the lookups count row renders.
const plansWithoutArt = new Set<string>();
const coverLookups: string[] = [];
mockModule(mock, sourcePath('services/plans/readingPlanAssets.ts'), {
  READING_PLAN_COVER_SOURCES: [],
  getReadingPlanCoverSource: (plan: ReadingPlan) => {
    coverLookups.push(plan.id);
    return plansWithoutArt.has(plan.id) ? null : { uri: `cover:${plan.cover_key}` };
  },
});
/** Which plan rows render while `action` runs. */
async function rowRendersDuring(action: () => Promise<unknown>): Promise<string[]> {
  coverLookups.length = 0;
  await action();
  return [...coverLookups];
}

// The service boundary: the bundled catalog, the background progress hydration
// and the unenroll call, each controllable. Unenrolling edits the real store.
const CATALOG = [...readingPlans].sort((a, b) => a.sort_order - b.sort_order) as ReadingPlan[];
type Gate = { promise: Promise<void>; open: () => void };
const gate = (): Gate => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
};
const service = {
  catalogGate: null as Gate | null,
  progressGate: null as Gate | null,
  onHydrate: null as (() => void) | null,
  unenrollError: null as string | null,
  // A result the service can return without an error message, and a thrown
  // failure — both distinct from unenrollError, which always carries a message.
  unenrollFailsSilently: false,
  unenrollThrows: null as unknown,
  listCalls: 0,
  hydrateCalls: 0,
  unenrolled: [] as string[],
};
mockModule(mock, sourcePath('services/plans/readingPlanService.ts'), {
  listReadingPlans: async () => {
    service.listCalls += 1;
    await service.catalogGate?.promise;
    // A fresh array of the same plans each call, as the real service sorts a copy.
    return { success: true, data: [...CATALOG] };
  },
  getUserPlanProgress: async () => {
    service.hydrateCalls += 1;
    await service.progressGate?.promise;
    service.onHydrate?.();
    return { success: true, data: [] };
  },
  unenrollFromPlan: async (planId: string) => {
    service.unenrolled.push(planId);
    if (service.unenrollThrows) throw service.unenrollThrows;
    if (service.unenrollError) return { success: false, error: service.unenrollError };
    if (service.unenrollFailsSilently) return { success: false };
    (await loadStore()).getState().unenrollPlan(planId);
    return { success: true };
  },
});

const handledErrors: Array<{ source: string; error: unknown }> = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    handledErrors.push({ source, error });
  },
});

const PSALMS = 'psalms-30-days';
const PROVERBS = 'proverbs-31-days';
const KATHISMA = 'kathisma-weekly';
const GOSPELS = 'gospels-60-days';

const planById = (id: string) => CATALOG.find((plan) => plan.id === id)!;
const titleOf = (id: string) => t(planById(id).title_key);

type PersistedReadingPlansStore = Mutate<ReadingPlansStoreApi, [['zustand/persist', unknown]]>;

async function loadStore() {
  const { readingPlansStore } = await import('../../stores/readingPlansStore');
  // The store is built with zustand's persist middleware, which its exported API type omits.
  const { persist } = readingPlansStore as PersistedReadingPlansStore;
  // Let the start-up rehydration finish first, so it cannot overwrite what a test seeds.
  if (!persist.hasHydrated()) await persist.rehydrate();
  return readingPlansStore;
}

const progressRow = (
  planId: string,
  overrides: Partial<UserReadingPlanProgress> = {}
): UserReadingPlanProgress => ({
  id: `progress-${planId}`,
  plan_id: planId,
  started_at: '2026-09-20T09:00:00.000Z',
  completed_entries: {},
  completed_sessions: {},
  current_day: 1,
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-09-20T09:00:00.000Z',
  ...overrides,
});

async function seed(...rows: UserReadingPlanProgress[]) {
  const store = await loadStore();
  store.setState({
    enrolledPlanIds: rows.map((row) => row.plan_id),
    progressByPlanId: Object.fromEntries(rows.map((row) => [row.plan_id, row])),
  });
  return store;
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: new Date(TODAY) });
});

afterEach(async () => {
  mock.timers.reset();
  const store = await loadStore();
  store.setState(store.getInitialState(), true);
  Object.assign(service, {
    catalogGate: null,
    progressGate: null,
    onHydrate: null,
    unenrollError: null,
    unenrollFailsSilently: false,
    unenrollThrows: null,
    listCalls: 0,
    hydrateCalls: 0,
    unenrolled: [],
  });
  plansWithoutArt.clear();
  swipeCloses.length = 0;
  handledErrors.length = 0;
  progressStore.setState({ chaptersRead: {} });
  libraryStore.setState({ history: [] });
});

async function renderHome() {
  const { PlansHomeScreen } = await import('./PlansHomeScreen');
  const view = await harness.render(<PlansHomeScreen />);
  await view.flush();
  return view;
}

type View = Awaited<ReturnType<typeof renderHome>>;

const openTab = async (view: View, labelKey: string) => {
  await view.press(view.getByRole('tab', { name: t(labelKey) }));
};

async function skeletonCount(view: View) {
  const { Skeleton } = await import('../../components/skeleton/Skeleton');
  return view.root.findAllByType(Skeleton).length;
}

const navigateCalls = () =>
  harness.navigation.calls.filter((call) => call.method === 'navigate').map((call) => call.args);

async function palette() {
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const { DEFAULT_APPEARANCE_PALETTE } = await import('../../constants/appearancePalettes');
  return createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
}

/** The nearest host element above a node (its `.parent` may be the composite that drew it). */
function hostParent(node: ReactTestInstance): ReactTestInstance {
  let at = node.parent;
  while (at && typeof at.type !== 'string') at = at.parent;
  assert.ok(at, 'a host parent');
  return at;
}

/** The section a header heads: its widest ancestor holding no other heading. */
function sectionOf(view: View, title: string): ReactTestInstance {
  const headings = (node: ReactTestInstance) =>
    node.findAll(
      (child) => typeof child.type === 'string' && child.props.accessibilityRole === 'header'
    ).length;
  let section = view.getByRole('header', { name: title });
  while (section.parent && headings(section.parent) === 1) section = section.parent;
  return section;
}

// ---------------------------------------------------------------------------
// Header and tab switch
// ---------------------------------------------------------------------------

test('the title is the display-hero heading, and the eyebrow falls back to the catalog size when nothing is enrolled', async () => {
  const { typography } = await import('../../design/system');
  const view = await renderHome();

  const title = view.getByRole('header', { name: t('readingPlans.plans') });
  assert.equal(flattenStyle(title.props.style)?.fontSize, typography.displayHero.fontSize);
  assert.ok(view.getByText(t('readingPlans.plansCount', { count: CATALOG.length })));
  assert.equal(view.queryByText(/active/), null, 'never "0 active"');
});

test('the eyebrow counts the reader’s own active and completed plans, dropping a zero half', async () => {
  await seed(
    progressRow(PSALMS),
    progressRow(PROVERBS),
    progressRow(GOSPELS, { is_completed: true, completed_at: '2026-09-21T10:00:00.000Z' })
  );
  const view = await renderHome();

  assert.ok(
    view.getByText(
      `${t('readingPlans.activeCount', { count: 2 })} · ${t('readingPlans.completedCount', { count: 1 })}`
    )
  );
  await view.unmount();

  await seed(
    progressRow(GOSPELS, { is_completed: true, completed_at: '2026-09-21T10:00:00.000Z' })
  );
  const onlyCompleted = await renderHome();
  assert.ok(onlyCompleted.getByText(t('readingPlans.completedCount', { count: 1 })));
  assert.equal(onlyCompleted.queryByText(/active/), null);
});

// Progress can outlive its plan: a plan retired from the bundled catalog keeps its
// persisted row. Neither list shows it, so the header must not count it either.
test('the eyebrow counts only plans the catalog still has', async () => {
  await seed(
    progressRow(PSALMS),
    progressRow('retired-plan'),
    progressRow('retired-finished', {
      is_completed: true,
      completed_at: '2026-09-21T10:00:00.000Z',
    })
  );
  const view = await renderHome();

  assert.ok(view.getByText(t('readingPlans.activeCount', { count: 1 })));
  assert.equal(view.queryByText(/ · /), null, 'no completed half');
  await view.unmount();

  await seed(progressRow('retired-plan'));
  const onlyRetired = await renderHome();
  assert.ok(onlyRetired.getByText(t('readingPlans.noActivePlans')));
  assert.ok(onlyRetired.getByText(t('readingPlans.plansCount', { count: CATALOG.length })));
  assert.equal(onlyRetired.queryByText(/active/), null);
});

test('the three plan tabs are one full-width switch, pinned in the sticky header, with no Saved tab', async () => {
  const view = await renderHome();

  const tablist = view.getByRole('tablist', { name: t('readingPlans.plans') });
  const tabs = within(tablist).getAllByRole('tab');
  assert.deepEqual(
    tabs.map((tab) => accessibilityLabelOf(tab)),
    [t('readingPlans.myPlans'), t('readingPlans.findPlans'), t('readingPlans.completed')]
  );
  assert.equal(view.queryByRole('tab', { name: t('readingPlans.saved') }), null);
  assert.equal(flattenStyle(tablist.props.style)?.alignSelf, 'stretch');
  for (const tab of tabs) {
    // Three equal segments at the medium size: 13pt labels that wrap rather than truncate.
    const segment = flattenStyle(tab.props.style)!;
    assert.equal(segment.flex, 1);
    assert.equal(segment.paddingVertical, 7);
    const label = within(tab).getByText(accessibilityLabelOf(tab)!);
    assert.equal(label.props.numberOfLines, 2);
    assert.equal(flattenStyle(label.props.style)?.fontSize, 13);
  }
  assert.ok(view.getByRole('tab', { name: t('readingPlans.myPlans'), selected: true }));

  // The switch never sits in a sideways scroller, and it is the sticky child of the page.
  const [page] = view.queryAllByType('ScrollView');
  for (let at: ReactTestInstance | null = tablist; at; at = at.parent) {
    assert.notEqual(at.props.horizontal, true);
  }
  assert.deepEqual(page.props.stickyHeaderIndices, [1]);
  const pageChildren = page.children as ReactTestInstance[];
  assert.equal(
    within(pageChildren[1]).queryAllByRole('tablist').length,
    1,
    'child 1 is the tab strip'
  );
  assert.ok(within(pageChildren[0]).getByRole('header', { name: t('readingPlans.plans') }));
});

// Release QA: at iOS AX5 the title and "My pla…" were cut, and on Android at 2.0
// the Completed tab broke as "Complete / d".
test('at large text the plan tabs stack one per row and the title caps its scaling', async () => {
  const { DISPLAY_TEXT_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  harness.setFontScale(2);
  const view = await renderHome();

  const tablist = view.getByRole('tablist', { name: t('readingPlans.plans') });
  assert.equal(flattenStyle(tablist.props.style)?.flexDirection, 'column');
  for (const tab of within(tablist).getAllByRole('tab')) {
    const label = within(tab).getByText(accessibilityLabelOf(tab)!);
    assert.equal(label.props.numberOfLines, undefined, 'a full-width row never cuts a label');
  }
  const title = view.getByRole('header', { name: t('readingPlans.plans') });
  assert.equal(title.props.maxFontSizeMultiplier, DISPLAY_TEXT_MAX_FONT_SCALE);
});

test('the page scrolls clear of the floating tab bar', async () => {
  const { TAB_BAR_CAPSULE_HEIGHT, TAB_BAR_CONTENT_GAP } =
    await import('../../hooks/useTabBarHeight');
  const view = await renderHome();
  const [page] = view.queryAllByType('ScrollView');

  const padding = flattenStyle(page.props.contentContainerStyle)?.paddingBottom as number;
  assert.ok(padding >= TAB_BAR_CAPSULE_HEIGHT + TAB_BAR_CONTENT_GAP, `paddingBottom ${padding}`);
});

// ---------------------------------------------------------------------------
// Loading and refreshing
// ---------------------------------------------------------------------------

test('the bundled catalog renders without waiting for remote progress hydration', async () => {
  service.progressGate = gate(); // hydration never finishes during this test
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  assert.ok(service.hydrateCalls >= 1, 'hydration was started');
  assert.equal(await skeletonCount(view), 0);
  assert.ok(view.getByText(titleOf(PSALMS)));
});

// The mount effect and the focus effect both used to fire on first open, so the
// catalog loaded twice (and the progress hydration ran twice) before the reader
// ever left the screen.
test('the first open loads the catalog once, a later focus reloads once more, and so does pull to refresh', async () => {
  const view = await renderHome();

  assert.equal(service.listCalls, 1, 'first open');
  assert.equal(service.hydrateCalls, 1, 'first open');

  await refocus();
  assert.equal(service.listCalls, 2, 'a later focus');
  assert.equal(service.hydrateCalls, 2, 'a later focus');

  const [page] = view.queryAllByType('ScrollView');
  await act(async () => {
    await (page.props.refreshControl.props.onRefresh as () => Promise<void>)();
  });
  assert.equal(service.listCalls, 3, 'pull to refresh');
  assert.equal(service.hydrateCalls, 3, 'pull to refresh');
});

test('the skeleton shows only while the catalog itself is still loading', async () => {
  service.catalogGate = gate();
  const view = await renderHome();

  assert.ok((await skeletonCount(view)) > 0);
  assert.equal(view.queryByText(t('readingPlans.noActivePlans')), null);

  service.catalogGate.open();
  await view.flush();
  assert.equal(await skeletonCount(view), 0);
  assert.ok(view.getByText(t('readingPlans.noActivePlans')));
});

test('returning to the screen reloads quietly, so a plan started elsewhere appears in My Plans', async () => {
  const view = await renderHome();
  assert.ok(view.getByText(t('readingPlans.noActivePlans')));
  const { listCalls, hydrateCalls } = service;

  // Meanwhile the plan was started on another screen and synced down.
  service.catalogGate = gate();
  service.onHydrate = () => {
    void seed(progressRow(PSALMS, { current_day: 3 }));
  };
  await refocus();
  assert.equal(service.listCalls, listCalls + 1);
  assert.equal(await skeletonCount(view), 0, 'a focus reload keeps the current content up');

  service.catalogGate.open();
  await view.flush();
  await view.flush();
  assert.equal(service.hydrateCalls, hydrateCalls + 1);
  assert.ok(view.getByRole('button', { name: titleOf(PSALMS) }));
});

test('pull to refresh reloads the catalog and progress without the skeleton', async () => {
  const view = await renderHome();
  const [page] = view.queryAllByType('ScrollView');
  const { listCalls, hydrateCalls } = service;
  const refreshControl = () => view.queryAllByType('ScrollView')[0].props.refreshControl;
  service.catalogGate = gate();

  let refreshed!: Promise<void>;
  await act(async () => {
    refreshed = (page.props.refreshControl.props.onRefresh as () => Promise<void>)();
  });
  // While the reload is in flight the spinner shows over the content, not the skeleton.
  assert.equal(refreshControl().props.refreshing, true);
  assert.equal(await skeletonCount(view), 0);
  assert.ok(view.getByText(t('readingPlans.noActivePlans')));

  service.catalogGate.open();
  await act(async () => {
    await refreshed;
  });

  assert.equal(service.listCalls, listCalls + 1);
  assert.equal(service.hydrateCalls, hydrateCalls + 1);
  assert.equal(refreshControl().props.refreshing, false);
});

// ---------------------------------------------------------------------------
// My plans
// ---------------------------------------------------------------------------

test('with nothing started, My Plans is one empty state, no section headers, whose action opens Find plans', async () => {
  const view = await renderHome();

  assert.ok(view.getByRole('header', { name: t('readingPlans.noActivePlans') }));
  assert.ok(view.getByText(t('readingPlans.noActivePlansBody')));
  assert.notEqual(t('readingPlans.noActivePlansBody'), t('readingPlans.findPlans'));
  assert.deepEqual(
    view.getAllByRole('header').map((node) => accessibilityLabelOf(node) ?? node.props.children),
    [t('readingPlans.plans'), t('readingPlans.noActivePlans')]
  );
  // The empty state's own action is the only way forward: no extra add button.
  assert.deepEqual(
    view.getAllByRole('button').map((node) => accessibilityLabelOf(node) ?? textOf(node)),
    [t('readingPlans.addFirstPlan')]
  );

  await view.press(view.getByRole('button', { name: t('readingPlans.addFirstPlan') }));

  assert.ok(view.getByRole('tab', { name: t('readingPlans.findPlans'), selected: true }));
  assert.ok(view.getByLabelText(t('readingPlans.searchPlansCount', { count: CATALOG.length })));
});

test('active plans split into Daily readings and Daily rhythms, each card announcing its day and progress', async () => {
  await seed(
    progressRow(PSALMS, { current_day: 3, started_at: '2026-09-22T09:00:00.000Z' }),
    progressRow(PROVERBS, { started_at: '2026-09-21T09:00:00.000Z' }),
    progressRow(KATHISMA, { started_at: '2026-09-20T09:00:00.000Z' })
  );
  const view = await renderHome();

  const readings = sectionOf(view, t('readingPlans.dailyReadings'));
  const rhythms = sectionOf(view, t('readingPlans.dailyRhythms'));
  assert.ok(within(readings).getByText(t('readingPlans.plansCount', { count: 1 })));
  assert.ok(within(rhythms).getByText(t('readingPlans.plansCount', { count: 2 })));

  const psalms = within(readings).getByRole('button', { name: titleOf(PSALMS) });
  assert.deepEqual(psalms.props.accessibilityValue, {
    text: `${t('readingPlans.dayOf', { current: 3, total: 30 })}, 7%`,
  });
  assert.ok(within(psalms).getByText(t('common.continue')));
  assert.equal(within(readings).queryByRole('button', { name: titleOf(PROVERBS) }), null);

  // A recurring plan's day comes from the calendar: the 24th of the month.
  const proverbs = within(rhythms).getByRole('button', { name: titleOf(PROVERBS) });
  assert.deepEqual(proverbs.props.accessibilityValue, {
    text: `${t('readingPlans.dayOf', { current: 24, total: 31 })}, 77%`,
  });

  // A multi-session rhythm says which session is next and offers it.
  const kathisma = within(rhythms).getByRole('button', { name: titleOf(KATHISMA) });
  const sessions = `${t('readingPlans.morningLabel')} ${t('readingPlans.sessionNext')} • ${t('readingPlans.eveningLabel')} ${t('readingPlans.sessionUpcoming')}`;
  assert.deepEqual(kathisma.props.accessibilityValue, {
    text: `${t('readingPlans.dayOf', { current: 5, total: 7 })}, ${sessions}, 71%`,
  });
  assert.ok(within(kathisma).getByText(sessions));
  assert.ok(within(kathisma).getByText(t('readingPlans.morningLabel')));
});

test('within a section, the most recently started plan comes first', async () => {
  await seed(
    progressRow(GOSPELS, { started_at: '2026-09-19T09:00:00.000Z' }),
    progressRow(PSALMS, { started_at: '2026-09-22T09:00:00.000Z' }),
    progressRow('epistles-30-days', { started_at: '2026-09-21T09:00:00.000Z' })
  );
  const view = await renderHome();

  const readings = sectionOf(view, t('readingPlans.dailyReadings'));
  assert.deepEqual(
    within(readings)
      .getAllByRole('button')
      .map((node) => accessibilityLabelOf(node))
      .filter((label) => label !== t('common.delete')),
    [titleOf(PSALMS), titleOf('epistles-30-days'), titleOf(GOSPELS)]
  );
});

test('an active single-session rhythm offers Continue and shows its percentage', async () => {
  await seed(progressRow(PROVERBS, { started_at: '2026-09-21T09:00:00.000Z' }));
  const view = await renderHome();

  const proverbs = view.getByRole('button', { name: titleOf(PROVERBS) });
  assert.ok(within(proverbs).getByText(t('common.continue')));
  assert.ok(within(proverbs).getByText('77%'));
  assert.ok(within(proverbs).getByText(t('readingPlans.dayOf', { current: 24, total: 31 })));
  const bar = within(proverbs).getByLabelText(t('readingPlans.progress'));
  assert.ok(bar);
});

test('a rhythm left on screen overnight moves to the new day when the app comes back', async () => {
  await seed(progressRow(PROVERBS, { started_at: '2026-09-21T09:00:00.000Z' }));
  const view = await renderHome();
  const proverbsDay = () =>
    within(sectionOf(view, t('readingPlans.dailyRhythms'))).getByRole('button', {
      name: titleOf(PROVERBS),
    }).props.accessibilityValue;
  assert.deepEqual(proverbsDay(), {
    text: `${t('readingPlans.dayOf', { current: 24, total: 31 })}, 77%`,
  });

  // Suspended overnight with Plans still showing: the screen never loses focus.
  await act(async () => harness.rn.AppState.emit('background'));
  mock.timers.setTime(new Date('2026-09-25T07:00:00.000Z').getTime());
  await act(async () => harness.rn.AppState.emit('active'));
  await view.flush();

  assert.deepEqual(proverbsDay(), {
    text: `${t('readingPlans.dayOf', { current: 25, total: 31 })}, 81%`,
  });
});

test('only a section with plans gets a header', async () => {
  await seed(progressRow(PROVERBS));
  const view = await renderHome();

  assert.ok(view.getByRole('header', { name: t('readingPlans.dailyRhythms') }));
  assert.equal(view.queryByRole('header', { name: t('readingPlans.dailyReadings') }), null);
});

test('tapping an active plan opens its detail', async () => {
  await seed(progressRow(PSALMS));
  const view = await renderHome();

  await view.press(view.getByRole('button', { name: titleOf(PSALMS) }));

  assert.deepEqual(navigateCalls(), [['PlanDetail', { planId: PSALMS }]]);
  assert.ok(harness.haptics.length > 0);
});

test('swiping an active plan reveals Delete, which unenrolls it through the plan service', async () => {
  await seed(progressRow(PSALMS), progressRow(PROVERBS));
  const view = await renderHome();
  const card = view.getByRole('button', { name: titleOf(PSALMS) });
  const row = view
    .queryAllByType('Swipeable')
    .find((node) => within(node).queryByText(titleOf(PSALMS)))!;

  const { error } = await palette();
  const remove = within(row).getByRole('button', { name: t('common.delete') });
  assert.equal(flattenStyle(remove.props.style)?.backgroundColor, error);
  assert.ok(card);
  await view.press(remove);
  await view.flush();

  assert.deepEqual(service.unenrolled, [PSALMS]);
  assert.equal(swipeCloses.length, 1, 'the row closes');
  assert.equal(view.queryByRole('button', { name: titleOf(PSALMS) }), null);
  assert.ok(view.getByRole('button', { name: titleOf(PROVERBS) }));
  assert.deepEqual(harness.rn.__recorded.alerts, []);
});

test('VoiceOver users can delete an active plan with a custom action', async () => {
  await seed(progressRow(PSALMS));
  const view = await renderHome();
  const card = view.getByRole('button', { name: titleOf(PSALMS) });

  assert.deepEqual(card.props.accessibilityActions, [
    { name: 'delete', label: t('common.delete') },
  ]);
  await view.fire(card, 'onAccessibilityAction', { nativeEvent: { actionName: 'delete' } });
  await view.flush();

  assert.deepEqual(service.unenrolled, [PSALMS]);
  assert.ok(view.getByText(t('readingPlans.noActivePlans')));
});

test('a failed delete keeps the plan and tells the reader', async () => {
  await seed(progressRow(PSALMS));
  service.unenrollError = 'network';
  const view = await renderHome();

  const row = view.queryAllByType('Swipeable')[0];
  await view.press(within(row).getByRole('button', { name: t('common.delete') }));

  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert.title, t('common.error'));
  assert.equal(alert.message, t('common.unexpectedError'));
  assert.ok(view.getByRole('button', { name: titleOf(PSALMS) }));
});

// A failure with no error message used to fall through to the success haptic:
// `!result.success && result.error` is false when `error` is undefined.
test('a delete that fails without an error message still keeps the plan and tells the reader, not the success haptic', async () => {
  await seed(progressRow(PSALMS));
  service.unenrollFailsSilently = true;
  const view = await renderHome();
  const hapticsBefore = harness.haptics.length;

  const row = view.queryAllByType('Swipeable')[0];
  await view.press(within(row).getByRole('button', { name: t('common.delete') }));
  await view.flush();

  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert.title, t('common.error'));
  assert.equal(alert.message, t('common.unexpectedError'));
  assert.ok(view.getByRole('button', { name: titleOf(PSALMS) }), 'the row stays');
  assert.equal(harness.haptics.length, hapticsBefore, 'no success haptic played');
});

test('a delete that throws is treated as a failure, tells the reader, keeps the plan, and is reported', async () => {
  await seed(progressRow(PSALMS));
  const thrown = new Error('offline');
  service.unenrollThrows = thrown;
  const view = await renderHome();
  const hapticsBefore = harness.haptics.length;

  const row = view.queryAllByType('Swipeable')[0];
  await view.press(within(row).getByRole('button', { name: t('common.delete') }));
  await view.flush();

  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert.title, t('common.error'));
  assert.equal(alert.message, t('common.unexpectedError'));
  assert.ok(view.getByRole('button', { name: titleOf(PSALMS) }), 'the row stays');
  assert.equal(harness.haptics.length, hapticsBefore, 'no success haptic played');
  assert.deepEqual(handledErrors, [{ source: 'plans.delete', error: thrown }]);
});

// ---------------------------------------------------------------------------
// Find plans
// ---------------------------------------------------------------------------

test('Find plans leads with a 44pt search strip naming the catalog size', async () => {
  const { radius } = await import('../../design/system');
  const colors = await palette();
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const label = t('readingPlans.searchPlansCount', { count: CATALOG.length });
  const input = view.getByLabelText(label);
  assert.equal(input.props.placeholder, label);
  // The tab's content sits straight in the page's scroll surface.
  const [page] = view.queryAllByType('ScrollView');
  assert.equal(within(page).getByLabelText(label), input);
  const strip = hostParent(input);
  const frame = flattenStyle(strip.props.style)!;
  // A floor, not a fixed height, so a large text size is not clipped.
  assert.equal(frame.minHeight, 44);
  assert.equal(frame.height, undefined);
  assert.equal(frame.borderRadius, radius.lg);
  assert.equal(frame.borderColor, colors.controlBorder);
  const [glyph] = within(strip).queryAllByType('LucideIcon');
  assert.equal(glyph.props.name, 'Search');
  assert.equal(glyph.props.size, 17);
  assert.equal(glyph.props.color, colors.secondaryText);
});

test('recurring plans are the two-up Daily rhythms grid; every other plan is a row under its category', async () => {
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const rhythms = sectionOf(view, t('readingPlans.dailyRhythms'));
  const recurring = [PROVERBS, KATHISMA];
  assert.ok(within(rhythms).getByText(t('readingPlans.plansCount', { count: 2 })));
  for (const id of recurring) {
    assert.ok(within(rhythms).getByRole('button', { name: titleOf(id) }));
  }

  const categoryKeys: Record<string, string> = {
    chronological: 'readingPlans.categoryChronological',
    'book-study': 'readingPlans.categoryBookStudy',
    topical: 'readingPlans.categoryTopical',
    devotional: 'readingPlans.categoryDevotional',
  };
  const sequential = CATALOG.filter((plan) => !recurring.includes(plan.id));
  const categories = [...new Set(sequential.map((plan) => plan.category ?? 'other'))];
  assert.deepEqual(
    view
      .getAllByRole('header')
      .map((node) => node.props.children)
      .slice(2),
    categories.map((category) => t(categoryKeys[category]))
  );
  for (const category of categories) {
    const section = sectionOf(view, t(categoryKeys[category]));
    const plans = sequential.filter((plan) => plan.category === category);
    assert.ok(within(section).getByText(t('readingPlans.plansCount', { count: plans.length })));
    for (const plan of plans) {
      assert.ok(within(section).getByText(t(plan.title_key)), plan.id);
    }
    for (const id of recurring) {
      assert.equal(within(section).queryByText(titleOf(id)), null, `${id} is not a row`);
    }
  }
  // Glyphs are Lucide throughout; no Ionicons.
  assert.equal(view.queryAllByType('Icon').length, 0);
});

test('a rhythm card is a 16:10 framed cover; an enrolled one gets a success tick and says so', async () => {
  await seed(progressRow(PROVERBS));
  const colors = await palette();
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const proverbs = view.getByRole('button', { name: titleOf(PROVERBS) });
  const kathisma = view.getByRole('button', { name: titleOf(KATHISMA) });
  assert.deepEqual(proverbs.props.accessibilityValue, {
    text: `${t('readingPlans.dayOf', { current: 24, total: 31 })}, ${t('readingPlans.enrolled')}`,
  });
  const cadence = `${t('readingPlans.morningLabel')} + ${t('readingPlans.eveningLabel')}`;
  assert.deepEqual(kathisma.props.accessibilityValue, { text: cadence });
  assert.ok(within(kathisma).getByText(cadence));

  const [tick] = within(proverbs).queryAllByType('LucideIcon');
  assert.equal(tick.props.name, 'Check');
  assert.equal(tick.props.size, 12);
  assert.equal(tick.props.color, colors.success);
  assert.equal(within(kathisma).queryAllByType('LucideIcon').length, 0);

  assert.equal(flattenStyle(proverbs.props.style)?.flexBasis, '48%');
  const cover = within(proverbs).queryAllByType('Image')[0];
  assert.equal(isHiddenFromAccessibility(cover), true);
  const coverFrame = flattenStyle(hostParent(cover).props.style)!;
  assert.equal(coverFrame.aspectRatio, 16 / 10);
  assert.equal(coverFrame.borderWidth, 1);
  assert.equal(coverFrame.borderColor, colors.cardBorder);
  const grid = flattenStyle(hostParent(proverbs).props.style)!;
  assert.equal(grid.flexWrap, 'wrap');
  assert.equal(grid.gap, 10);
});

test('a browse row offers an outlined Start, or an Enrolled chip once started', async () => {
  await seed(progressRow(PSALMS, { current_day: 3 }));
  const colors = await palette();
  const { radius, typography } = await import('../../design/system');
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const psalms = view.getByRole('button', {
    name: `${titleOf(PSALMS)}, ${t('readingPlans.daysCount', { count: 30 })}, ${t('readingPlans.dayLabel', { day: 3 })}, ${t('readingPlans.enrolled')}`,
  });
  const chip = within(psalms).getByText(t('readingPlans.enrolled'));
  const chipText = flattenStyle(chip.props.style)!;
  assert.equal(chipText.color, colors.onSuccessSoft);
  assert.equal(chipText.fontSize, typography.monoSmall.fontSize, 'the small mono token');
  const chipFrame = flattenStyle(hostParent(chip).props.style)!;
  assert.equal(chipFrame.backgroundColor, colors.successSoft);
  assert.equal(chipFrame.borderRadius, radius.sm);
  assert.equal(chipFrame.flexShrink, 0);
  assert.equal(within(psalms).queryByText(t('readingPlans.start')), null);

  const gospels = view.getByRole('button', {
    name: `${titleOf(GOSPELS)}, ${t('readingPlans.daysCount', { count: 60 })}`,
  });
  const start = within(gospels).getByRole('button', {
    name: `${t('readingPlans.start')} — ${titleOf(GOSPELS)}`,
  });
  const outline = flattenStyle(start.props.style)!;
  assert.equal(outline.borderWidth, 1);
  assert.equal(outline.borderColor, colors.accentPrimary);
  assert.equal(outline.backgroundColor, undefined, 'an outline, never a filled pill');
  assert.equal(outline.flexShrink, 0);
  assert.equal(outline.borderRadius, radius.md);
  assert.equal(outline.paddingVertical, 6);
  assert.equal(outline.paddingHorizontal, 12);
  assert.equal(
    flattenStyle(within(start).getByText(t('readingPlans.start')).props.style)?.color,
    colors.accentPrimary
  );
  assert.equal(view.queryByText(/^\d+d$/), null, 'no "30d" pill');

  await view.press(start);
  assert.deepEqual(navigateCalls(), [['PlanDetail', { planId: GOSPELS }]]);
});

test('rows in a category card are split by strong hairlines, with 52pt framed covers', async () => {
  const colors = await palette();
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const section = sectionOf(view, t('readingPlans.categoryBookStudy'));
  const rows = within(section)
    .getAllByRole('button')
    .filter((node) => !String(accessibilityLabelOf(node)).startsWith(t('readingPlans.start')));
  assert.ok(rows.length > 1);
  const [first, second] = rows.map((row) => flattenStyle(row.props.style)!);
  assert.equal(first.borderTopWidth, undefined);
  assert.equal(second.borderTopWidth, 1);
  assert.equal(second.borderTopColor, colors.borderStrong);
  assert.equal(first.paddingVertical, 10);
  assert.equal(first.paddingHorizontal, 12);
  const coverFrame = flattenStyle(
    hostParent(within(rows[0]).queryAllByType('Image')[0]).props.style
  )!;
  assert.equal(coverFrame.width, 52);
  assert.equal(coverFrame.height, 52);
});

test('a plan without artwork gets a gradient cover with its initial', async () => {
  plansWithoutArt.add(GOSPELS);
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const row = view.getByRole('button', { name: new RegExp(`^${titleOf(GOSPELS)},`) });
  assert.equal(within(row).queryAllByType('Image').length, 0);
  const [gradient] = within(row).queryAllByType('LinearGradient');
  assert.ok(gradient);
  assert.equal(within(gradient).getByText(/^.$/).props.children, titleOf(GOSPELS).charAt(0));
});

test('search narrows the catalog by title, forgives typos, and has its own empty state', async () => {
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');
  const input = view.getByLabelText(t('readingPlans.searchPlansCount', { count: CATALOG.length }));

  await view.changeText(input, 'proverbs');
  assert.ok(view.getByText(titleOf(PROVERBS)));
  assert.equal(view.queryByText(titleOf(PSALMS)), null);
  assert.ok(view.getByRole('header', { name: t('readingPlans.dailyRhythms') }));

  await view.changeText(input, 'Epistels'); // a typo
  assert.ok(view.getByText(titleOf('epistles-30-days')));
  assert.equal(view.queryByRole('header', { name: t('readingPlans.dailyRhythms') }), null);

  await view.changeText(input, 'zzqxj');
  assert.ok(view.getByRole('header', { name: t('readingPlans.noPlanSearchResults') }));
  assert.equal(view.queryByText(t('readingPlans.noPlans')), null);

  await view.changeText(input, '   ');
  assert.ok(view.getByText(titleOf(PSALMS)), 'a blank query shows everything');
});

test('tapping a Daily rhythms card or the body of a browse row opens that plan', async () => {
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  await view.press(view.getByRole('button', { name: titleOf(KATHISMA) }));
  await view.press(
    view.getByRole('button', {
      name: `${titleOf(GOSPELS)}, ${t('readingPlans.daysCount', { count: 60 })}`,
    })
  );

  assert.deepEqual(navigateCalls(), [
    ['PlanDetail', { planId: KATHISMA }],
    ['PlanDetail', { planId: GOSPELS }],
  ]);
});

test('leaving Find plans and coming back starts a fresh search', async () => {
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');
  const label = t('readingPlans.searchPlansCount', { count: CATALOG.length });
  await view.changeText(view.getByLabelText(label), 'proverbs');
  assert.equal(view.queryByText(titleOf(PSALMS)), null);

  await openTab(view, 'readingPlans.myPlans');
  await openTab(view, 'readingPlans.findPlans');

  assert.equal(view.getByLabelText(label).props.value, '');
  assert.ok(view.getByText(titleOf(PSALMS)));
});

test('the plans surface has no featured hero, challenges, saved or rhythm-builder entry points', async () => {
  const view = await renderHome();
  for (const tab of ['readingPlans.myPlans', 'readingPlans.findPlans', 'readingPlans.completed']) {
    await openTab(view, tab);
    for (const key of [
      'readingPlans.featuredPlan',
      'readingPlans.saved',
      'readingPlans.rhythms',
      'readingPlans.createRhythm',
    ]) {
      assert.equal(view.queryByText(t(key)), null, `${key} on ${tab}`);
    }
    assert.equal(view.queryByText(/Reading Challenges/i), null);
  }
});

// ---------------------------------------------------------------------------
// Completed
// ---------------------------------------------------------------------------

test('with nothing finished, the Completed tab is just its empty state', async () => {
  await seed(progressRow(PSALMS));
  const view = await renderHome();
  await openTab(view, 'readingPlans.completed');

  assert.ok(view.getByRole('header', { name: t('readingPlans.noCompletedPlans') }));
  assert.equal(view.queryByRole('header', { name: t('readingPlans.completed') }), null);
  assert.equal(view.queryByText(titleOf(PSALMS)), null);
});

test('a finished plan is listed under Completed with its date and chip, opens its detail, and can be swiped away', async () => {
  await seed(
    progressRow(PSALMS),
    progressRow(GOSPELS, { is_completed: true, completed_at: '2026-09-20T10:00:00.000Z' })
  );
  const colors = await palette();
  const view = await renderHome();
  assert.equal(
    view.queryByRole('button', { name: titleOf(GOSPELS) }),
    null,
    'not among active plans'
  );
  await openTab(view, 'readingPlans.completed');

  const section = sectionOf(view, t('readingPlans.completed'));
  assert.ok(within(section).getByText(t('readingPlans.plansCount', { count: 1 })));
  const row = within(section).getByRole('button', { name: titleOf(GOSPELS) });
  assert.ok(within(row).getByText('Sep 20, 2026'));
  const chip = within(row).getByText(t('readingPlans.completed'));
  assert.equal(flattenStyle(hostParent(chip).props.style)?.backgroundColor, colors.successSoft);
  assert.equal(within(section).queryByText(titleOf(PSALMS)), null);

  await view.press(row);
  assert.deepEqual(navigateCalls(), [['PlanDetail', { planId: GOSPELS }]]);

  const swipe = view.queryAllByType('Swipeable')[0];
  await view.press(within(swipe).getByRole('button', { name: t('common.delete') }));
  await view.flush();
  assert.deepEqual(service.unenrolled, [GOSPELS]);
  assert.ok(view.getByRole('header', { name: t('readingPlans.noCompletedPlans') }));
});

test('completed plans list the most recently started first, and a row without a finish date shows none', async () => {
  await seed(
    progressRow(GOSPELS, {
      is_completed: true,
      completed_at: '2026-09-20T10:00:00.000Z',
      started_at: '2026-07-01T09:00:00.000Z',
    }),
    progressRow(PSALMS, {
      is_completed: true,
      completed_at: null,
      started_at: '2026-08-01T09:00:00.000Z',
    })
  );
  const view = await renderHome();
  await openTab(view, 'readingPlans.completed');

  const section = sectionOf(view, t('readingPlans.completed'));
  const rows = within(section)
    .getAllByRole('button')
    .filter((node) => accessibilityLabelOf(node) !== t('common.delete'));
  assert.deepEqual(
    rows.map((node) => accessibilityLabelOf(node)),
    [titleOf(PSALMS), titleOf(GOSPELS)]
  );
  assert.equal(within(rows[0]).queryByText(/\d{4}/), null);
  assert.ok(within(rows[1]).getByText('Sep 20, 2026'));
});

// ---- Large text ------------------------------------------------------------------

/** The column that holds a row's title. */
const titleColumnOf = (row: ReactTestInstance, title: string) =>
  hostParent(within(row).getByText(title));

test('at large text a browse row puts its Enrolled chip or Start button under the title', async () => {
  await seed(progressRow(PSALMS, { current_day: 3 }));
  harness.setFontScale(2);
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  const psalms = view.getByRole('button', { name: new RegExp(`^${titleOf(PSALMS)}, `) });
  assert.ok(within(titleColumnOf(psalms, titleOf(PSALMS))).getByText(t('readingPlans.enrolled')));
  const gospels = view.getByRole('button', { name: new RegExp(`^${titleOf(GOSPELS)}, `) });
  assert.ok(
    within(titleColumnOf(gospels, titleOf(GOSPELS))).getByRole('button', {
      name: `${t('readingPlans.start')} — ${titleOf(GOSPELS)}`,
    })
  );
});

test('at large text a completed row puts its chip under the title, and its date may wrap', async () => {
  await seed(
    progressRow(GOSPELS, { is_completed: true, completed_at: '2026-09-20T10:00:00.000Z' })
  );
  harness.setFontScale(2);
  const view = await renderHome();
  await openTab(view, 'readingPlans.completed');

  const row = view.getByRole('button', { name: titleOf(GOSPELS) });
  const column = titleColumnOf(row, titleOf(GOSPELS));
  assert.ok(within(column).getByText(t('readingPlans.completed')));
  assert.equal(within(column).getByText('Sep 20, 2026').props.numberOfLines, 2);
});

test('plan metadata that appears nowhere else may take two lines', async () => {
  await seed(
    progressRow(PSALMS, { current_day: 3, started_at: '2026-09-22T09:00:00.000Z' }),
    progressRow(KATHISMA, { started_at: '2026-09-20T09:00:00.000Z' })
  );
  const view = await renderHome();

  const dayOf = view.getByText(t('readingPlans.dayOf', { current: 3, total: 30 }));
  assert.equal(dayOf.props.numberOfLines, 2);
  const sessions = `${t('readingPlans.morningLabel')} ${t('readingPlans.sessionNext')} • ${t('readingPlans.eveningLabel')} ${t('readingPlans.sessionUpcoming')}`;
  assert.equal(view.getByText(sessions).props.numberOfLines, 2);
  const eyebrow = view.getByText(`${t('readingPlans.activeCount', { count: 2 })}`);
  assert.equal(eyebrow.props.numberOfLines, 2);
});

// ---------------------------------------------------------------------------
// Render cost
// ---------------------------------------------------------------------------

const kathismaMorningChapters = () =>
  readingPlanEntriesByPlanId[KATHISMA].filter(
    (entry) => entry.day_number === 5 && entry.session_key === 'morning'
  ).flatMap((entry) =>
    Array.from(
      { length: (entry.chapter_end ?? entry.chapter_start) - entry.chapter_start + 1 },
      (_, index) => `${entry.book}_${entry.chapter_start + index}`
    )
  );

test('reading a chapter moves an active rhythm on to its next session', async () => {
  await seed(progressRow(KATHISMA));
  const view = await renderHome();
  const kathisma = () => view.getByRole('button', { name: titleOf(KATHISMA) });
  assert.ok(within(kathisma()).getByText(t('readingPlans.morningLabel')));

  const now = Date.now();
  await act(async () => {
    progressStore.setState({
      chaptersRead: Object.fromEntries(kathismaMorningChapters().map((key) => [key, now])),
    });
  });

  const sessions = `${t('readingPlans.morningLabel')} ${t('readingPlans.sessionDone')} • ${t('readingPlans.eveningLabel')} ${t('readingPlans.sessionNext')}`;
  assert.ok(within(kathisma()).getByText(sessions));
  assert.ok(within(kathisma()).getByText(t('readingPlans.eveningLabel')));
});

test('reading or listening elsewhere does not re-render the catalog or completed rows', async () => {
  await seed(
    progressRow(PSALMS),
    progressRow(GOSPELS, { is_completed: true, completed_at: '2026-09-20T10:00:00.000Z' })
  );
  const view = await renderHome();
  const record = () =>
    rowRendersDuring(() =>
      act(async () => {
        progressStore.setState({ chaptersRead: { PSA_1: Date.now() } });
        libraryStore.setState({
          history: [
            { id: 'PSA_1', bookId: 'PSA', chapter: 1, listenedAt: Date.now(), progress: 1 },
          ],
        });
      })
    );

  await openTab(view, 'readingPlans.findPlans');
  assert.deepEqual(await record(), []);
  await openTab(view, 'readingPlans.completed');
  assert.deepEqual(await record(), []);
});

test('refining a search re-renders only the rows it changes', async () => {
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');
  const input = view.getByLabelText(t('readingPlans.searchPlansCount', { count: CATALOG.length }));
  /** Each catalog row on screen, and whether it leads its card (no divider above it). */
  const catalogRows = () =>
    new Map(
      CATALOG.flatMap((plan) => {
        const row = view.queryByRole('button', { name: new RegExp(`^${titleOf(plan.id)}, `) });
        return row ? [[plan.id, flattenStyle(row.props.style)?.borderTopWidth === undefined]] : [];
      })
    );
  // A rhythm card left in the results is not redrawn.
  await view.changeText(input, 'proverbs');
  assert.ok(view.getByRole('button', { name: titleOf(PROVERBS) }));
  assert.deepEqual(await rowRendersDuring(() => view.changeText(input, 'proverbs ')), []);

  await view.changeText(input, 'gospels');
  const shown = CATALOG.filter((plan) => view.queryByText(t(plan.title_key))).map(
    (plan) => plan.id
  );
  const rowsBefore = catalogRows();
  assert.ok(shown.includes(GOSPELS) && !shown.includes(PSALMS), shown.join());

  // The same results: nothing to redraw.
  assert.deepEqual(await rowRendersDuring(() => view.changeText(input, 'gospels ')), []);

  // Back to the whole catalog: the rows that were hidden are drawn, and of those already
  // shown only a row that stops leading its card, since it gains a divider.
  const drawn = await rowRendersDuring(() => view.changeText(input, ''));
  const rowsAfter = catalogRows();
  const hidden = CATALOG.map((plan) => plan.id).filter((id) => !shown.includes(id));
  const lostTheLead = [...rowsBefore].filter(([id, leads]) => leads !== rowsAfter.get(id));
  assert.ok(lostTheLead.length < rowsBefore.size, 'some shown rows keep their place');
  assert.deepEqual(
    drawn.filter((id) => !hidden.includes(id)).sort(),
    lostTheLead.map(([id]) => id).sort()
  );
  assert.deepEqual(drawn.filter((id) => hidden.includes(id)).sort(), [...hidden].sort());
});

test('progress on one active plan re-renders only that plan’s card', async () => {
  const store = await seed(progressRow(PSALMS), progressRow(GOSPELS));
  await renderHome();

  const drawn = await rowRendersDuring(() =>
    act(async () => {
      store.getState().upsertProgress(progressRow(PSALMS, { current_day: 2 }));
    })
  );

  assert.deepEqual(drawn, [PSALMS]);
});

// A background sync restamps synced_at on every synced row without changing anything
// the row shows. CatalogPlanRow used to take the whole progress object as a prop, so
// a fresh (but equal) progress object from the store still failed its memo comparison.
test('a sync that only stamps synced_at leaves the Find plans catalog row alone', async () => {
  const store = await seed(
    progressRow(PSALMS, { current_day: 3, started_at: '2026-09-22T09:00:00.000Z' })
  );
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');
  assert.ok(view.getByRole('button', { name: new RegExp(`^${titleOf(PSALMS)}, `) }), 'sanity');

  const drawn = await rowRendersDuring(() =>
    act(async () => {
      const psalms = store.getState().progressByPlanId[PSALMS];
      store.getState().upsertProgress({ ...psalms, synced_at: '2026-09-24T12:00:00.000Z' });
    })
  );

  assert.deepEqual(drawn, []);
});

test('the Find plans catalog row still redraws when the day it shows actually changes', async () => {
  const store = await seed(
    progressRow(PSALMS, { current_day: 3, started_at: '2026-09-22T09:00:00.000Z' })
  );
  const view = await renderHome();
  await openTab(view, 'readingPlans.findPlans');

  await act(async () => {
    store
      .getState()
      .upsertProgress({ ...store.getState().progressByPlanId[PSALMS], current_day: 4 });
  });

  assert.ok(
    view.getByRole('button', {
      name: `${titleOf(PSALMS)}, ${t('readingPlans.daysCount', { count: 30 })}, ${t('readingPlans.dayLabel', { day: 4 })}, ${t('readingPlans.enrolled')}`,
    }),
    'the row now reads day 4'
  );
});

test('pull to refresh does not redraw plan rows that did not change', async () => {
  await seed(progressRow(PSALMS), progressRow(PROVERBS));
  const view = await renderHome();
  const [page] = view.queryAllByType('ScrollView');
  const refreshing = () =>
    view.queryAllByType('ScrollView')[0].props.refreshControl.props.refreshing;
  service.catalogGate = gate();

  const drawn = await rowRendersDuring(async () => {
    let refreshed!: Promise<void>;
    await act(async () => {
      refreshed = (page.props.refreshControl.props.onRefresh as () => Promise<void>)();
    });
    assert.equal(refreshing(), true);
    service.catalogGate?.open();
    await act(async () => {
      await refreshed;
    });
    await view.flush();
  });

  assert.deepEqual(drawn, []);
  assert.equal(refreshing(), false);
});
