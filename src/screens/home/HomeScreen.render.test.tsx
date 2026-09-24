import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { gatherFoundations } from '../../data/gatherFoundations';
import { readingPlans as bundledReadingPlans } from '../../data/readingPlans.generated';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';
import type { DailyScripture } from '../../types';
import { hostComponent } from '../../testing/reactNativeHost';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { createReactNavigationFake } from '../../testing/nativePackageFakes';
import {
  flattenStyle,
  hostAncestors,
  installRenderHarness,
  textContent,
  within,
} from '../../testing/render';
import { getHomeScreenLayout } from './homeLayoutModel';

const harness = installRenderHarness(mock, { skip: ['@react-navigation/native'] });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// Home is the focused tab unless a test says otherwise.
let isFocused = true;
mockPackage(mock, '@react-navigation/native', {
  ...createReactNavigationFake(harness.navigation),
  useIsFocused: () => isFocused,
});

// ---- Stores: real Zustand stores holding only what Home selects -------------
const bibleStore = create(() => ({
  currentTranslation: 'bsb',
  currentBook: 'JHN',
  currentChapter: 3,
  hasReaderHistory: true,
}));
const progressStore = create(() => ({
  chaptersRead: {} as Record<string, number>,
  chaptersListened: {} as Record<string, number>,
  listeningMsByDate: {} as Record<string, number>,
  streakDays: 0,
}));
const readingPlansStore = create(() => ({
  progressByPlanId: {} as Record<string, UserReadingPlanProgress>,
}));
const gatherStore = create(() => ({ completedLessons: {} as Record<string, string[]> }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore: progressStore,
  selectCurrentStreakDays: (state: { streakDays: number }) => state.streakDays,
});
mockModule(mock, sourcePath('stores/readingPlansStore.ts'), {
  useReadingPlansStore: readingPlansStore,
});
mockModule(mock, sourcePath('stores/gatherStore.ts'), { useGatherStore: gatherStore });
// The badge draws registry artwork; which artwork Home asks for is what matters here.
mockModule(mock, sourcePath('components/gather/GatherIconBadge.tsx'), {
  GatherIconBadge: hostComponent('GatherIconBadge'),
});

// ---- Services ----------------------------------------------------------------
// The plan catalog is the real bundled data; a test can empty it.
let catalog: ReadingPlan[] = bundledReadingPlans;
mockModule(mock, sourcePath('services/plans/readingPlanService.ts'), {
  listReadingPlans: async () => ({ success: true, data: catalog }),
});

const JOHN_3_16 = 'For God so loved the world that He gave His one and only Son.';
const verseOf = (overrides: Partial<DailyScripture> = {}) =>
  ({
    kind: 'verse-text',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: JOHN_3_16,
    playScope: 'chapter',
    ...overrides,
  }) as DailyScripture;
let dailyScripture = verseOf();
// Home reaches the Bible database through a lazy import; this is what it loads.
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getDailyScripture: async () => dailyScripture,
});
mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
  isRemoteAudioAvailable: () => false,
});
mockModule(mock, sourcePath('hooks/useTranslationContentSummary.ts'), {
  useTranslationContentSummary: () => undefined,
});

// ---- Native packages Home loads (eagerly or on the share press) ---------------
mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });
mockModule(mock, 'expo-status-bar', { StatusBar: hostComponent('ExpoStatusBar') });

const sharing = {
  available: true,
  captureError: null as Error | null,
  captures: [] as Array<{ ref: unknown; options: unknown }>,
  sheets: [] as Array<{ uri: string; options: unknown }>,
};
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: async () => sharing.available,
  shareAsync: async (uri: string, options: unknown) => {
    sharing.sheets.push({ uri, options });
  },
});
mockPackage(mock, 'react-native-view-shot', {
  captureRef: async (ref: unknown, options: unknown) => {
    sharing.captures.push({ ref, options });
    if (sharing.captureError) throw sharing.captureError;
    return 'file:///tmp/verse-of-the-day.png';
  },
});

// Thursday 17 September 2026, 09:00 local: a morning greeting, day 17 of a month.
const TODAY = new Date(2026, 8, 17, 9, 0, 0);

function setToday(date: Date) {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: date.getTime() });
}

beforeEach(() => {
  setToday(TODAY);
  isFocused = true;
  catalog = bundledReadingPlans;
  dailyScripture = verseOf();
  sharing.available = true;
  sharing.captureError = null;
  sharing.captures.length = 0;
  sharing.sheets.length = 0;
  bibleStore.setState(bibleStore.getInitialState(), true);
  progressStore.setState(progressStore.getInitialState(), true);
  readingPlansStore.setState(readingPlansStore.getInitialState(), true);
  gatherStore.setState({ completedLessons: {} });
});

afterEach(() => {
  mock.timers.reset();
});

async function renderHome() {
  const { HomeScreen } = await import('./HomeScreen');
  const view = await harness.render(<HomeScreen />);
  // Plans load in an effect; the verse loads after interactions settle.
  await view.flush();
  await view.flush();
  return view;
}

type HomeView = Awaited<ReturnType<typeof renderHome>>;

/** The on-screen hero lives in the ScrollView; the share capture is mounted beside it. */
function heroes(view: HomeView) {
  const [scroll] = view.queryAllByType('ScrollView');
  const capture = view
    .queryAllByType('View')
    .find((node) => node.props.collapsable === false) as ReactTestInstance;
  assert.ok(capture, 'the share capture target is mounted off-screen');
  return { screen: within(scroll), share: within(capture), capture };
}

const verseEyebrow = (reference: string) => `${t('home.todaysScripture')} · ${reference}`;

// ---- Verse of the day --------------------------------------------------------

test('the hero shows the rotating daily verse and its reference, not a fixed passage', async () => {
  const first = await renderHome();
  assert.ok(heroes(first).screen.getByText(JOHN_3_16));
  assert.ok(heroes(first).screen.getByText(verseEyebrow('John 3:16')));
  await first.unmount();

  dailyScripture = verseOf({ bookId: 'PSA', chapter: 46, verse: 10, text: 'Be still, and know.' });
  const next = await renderHome();
  assert.ok(heroes(next).screen.getByText('Be still, and know.'));
  assert.ok(
    heroes(next).screen.getByText(new RegExp(`^${t('home.todaysScripture')} · Psalms? 46:10$`))
  );
  assert.equal(next.queryByText(JOHN_3_16), null);
});

test('the shared verse image carries only the photograph and the Scripture', async () => {
  const view = await renderHome();
  const { screen, share } = heroes(view);

  assert.ok(screen.getByText('Thursday · September 17'));
  assert.ok(screen.getByText(/^Good morning/));
  assert.ok(share.getByText(JOHN_3_16));
  assert.ok(share.getByText(verseEyebrow('John 3:16')));
  assert.equal(share.queryByText('Thursday · September 17'), null, 'no date');
  assert.equal(share.queryByText(/^Good morning/), null, 'no personal greeting');
  assert.equal(share.queryAllByRole('button').length, 0, 'no controls');
});

test('the hero share control is an icon-only button named with the shared share label', async () => {
  const view = await renderHome();
  const { screen } = heroes(view);

  const shareButton = screen.getByRole('button', { name: t('groups.share') });
  assert.equal(textContent(shareButton), '', 'icon only');
  assert.equal(within(shareButton).queryAllByType('LucideIcon').length, 1);
  // It closes the hero action row, after the read action.
  const actionRow = hostAncestors(shareButton)[0];
  const actions = within(actionRow).getAllByRole('button');
  assert.equal(actions.at(-1), shareButton);
  assert.equal(view.getAllByRole('button', { name: t('groups.share') }).length, 1);
});

test('sharing captures the Scripture-only card as a PNG and opens the share sheet', async () => {
  const view = await renderHome();
  const { capture } = heroes(view);
  await view.press(view.getByRole('button', { name: t('groups.share') }));

  assert.equal(sharing.captures.length, 1);
  const [{ ref, options }] = sharing.captures;
  assert.ok((ref as { current: unknown }).current, 'the capture target is mounted');
  assert.deepEqual(options, { format: 'png', quality: 1, result: 'tmpfile' });
  assert.deepEqual(sharing.sheets, [
    {
      uri: 'file:///tmp/verse-of-the-day.png',
      options: { dialogTitle: t('groups.share'), mimeType: 'image/png' },
    },
  ]);
  assert.equal(capture.props.pointerEvents, 'none');
  assert.deepEqual(harness.rn.__recorded.shares, []);
});

test('sharing falls back to the verse as text when images cannot be shared or captured', async () => {
  const expectedMessage = `${t('home.verseOfTheDay')}\nJohn 3:16\n\n${JOHN_3_16}`;

  sharing.available = false;
  const unavailable = await renderHome();
  await unavailable.press(unavailable.getByRole('button', { name: t('groups.share') }));
  assert.deepEqual(harness.rn.__recorded.shares, [{ message: expectedMessage }]);
  await unavailable.unmount();

  sharing.available = true;
  sharing.captureError = new Error('snapshot failed');
  const failing = await renderHome();
  await failing.press(failing.getByRole('button', { name: t('groups.share') }));
  assert.deepEqual(harness.rn.__recorded.shares.at(-1), { message: expectedMessage });
  assert.deepEqual(sharing.sheets, []);
});

test('the hero photograph stays at full strength under a dark scrim that dissolves into the page', async () => {
  for (const theme of ['light', 'dark'] as const) {
    const { createThemeColors } = await import('../../contexts/ThemeContext');
    harness.authStore.getState().setPreferences({ theme });
    const background = createThemeColors(
      theme,
      harness.authStore.getState().preferences.appearancePalette as never
    ).background;
    const view = await renderHome();
    const { screen } = heroes(view);

    const [photo] = screen.queryAllByType('ImageBackground');
    assert.equal(flattenStyle(photo.props.imageStyle)?.opacity, undefined);
    const [scrim] = screen.queryAllByType('LinearGradient');
    assert.deepEqual(scrim.props.colors, [
      'rgba(12, 11, 9, 0.42)',
      'rgba(12, 11, 9, 0.05)',
      'rgba(12, 11, 9, 0.35)',
      'rgba(12, 11, 9, 0.72)',
      background,
    ]);
    assert.deepEqual(scrim.props.locations, [0, 0.28, 0.55, 0.78, 1]);
    // Light ink over the dark scrim in both scopes, never "light on light".
    assert.equal(flattenStyle(screen.getByText(JOHN_3_16).props.style)?.color, '#FDFAF5');
    await view.unmount();
  }
});

// ---- Layout -----------------------------------------------------------------

test('Home is a bouncing scroll shell that clears the floating tab bar, with no pull-to-refresh', async () => {
  const { resolveFloatingBottomOffset, TAB_BAR_CAPSULE_HEIGHT, TAB_BAR_CONTENT_GAP } =
    await import('../../hooks/useTabBarHeight');
  const view = await renderHome();
  const [scroll] = view.queryAllByType('ScrollView');

  assert.equal(scroll.props.bounces, true);
  assert.equal(scroll.props.alwaysBounceVertical, true);
  assert.equal(scroll.props.overScrollMode, 'always');
  assert.equal(scroll.props.refreshControl, undefined);
  const content = flattenStyle(scroll.props.contentContainerStyle);
  assert.equal(content?.flexGrow, 1);
  assert.equal(
    content?.paddingBottom,
    resolveFloatingBottomOffset('ios', harness.insets.bottom, 22) +
      TAB_BAR_CAPSULE_HEIGHT +
      TAB_BAR_CONTENT_GAP
  );
});

test('the photograph bleeds under the status bar while the greeting clears it', async () => {
  const view = await renderHome();
  const { screen } = heroes(view);

  assert.equal(view.queryAllByType('SafeAreaView').length, 0, 'no top inset on the photograph');
  const greeting = screen.getByText(/^Good morning/);
  const heroContent = hostAncestors(greeting)[2];
  assert.equal(flattenStyle(heroContent.props.style)?.paddingTop, harness.insets.top + 14);

  const [statusBar] = view.queryAllByType('ExpoStatusBar');
  assert.equal(statusBar.props.style, 'light');
});

test('the light status bar is only drawn while Home is the focused tab', async () => {
  isFocused = false;
  const view = await renderHome();

  assert.equal(view.queryAllByType('ExpoStatusBar').length, 0);
});

test('the greeting follows the layout model for the screen size, with no welcome subtitle', async () => {
  const { resolveFloatingBottomOffset, TAB_BAR_CAPSULE_HEIGHT } =
    await import('../../hooks/useTabBarHeight');
  const view = await renderHome();
  const tabBarHeight =
    resolveFloatingBottomOffset('ios', harness.insets.bottom, 22) + TAB_BAR_CAPSULE_HEIGHT;
  const layout = getHomeScreenLayout(390, 844, tabBarHeight, 1);

  const greeting = flattenStyle(heroes(view).screen.getByText(/^Good morning/).props.style);
  assert.equal(greeting?.fontSize, layout.greetingFontSize);
  assert.equal(greeting?.lineHeight, layout.greetingLineHeight);
  assert.equal(view.queryByText(t('home.welcome')), null);
});

// ---- Reading plans ------------------------------------------------------------

test('the plan card resolves the featured recurring plan against today', async () => {
  const onTheSeventeenth = await renderHome();
  const plan = onTheSeventeenth.getByRole('button', { name: /· Day 17 of 31$/ });
  assert.ok(within(plan).getByText('17'));
  assert.ok(within(plan).getByRole('progressbar', { name: t('readingPlans.progress') }));
  await onTheSeventeenth.unmount();

  setToday(new Date(2026, 8, 5, 9, 0, 0));
  const onTheFifth = await renderHome();
  assert.ok(onTheFifth.getByRole('button', { name: /· Day 5 of 31$/ }));
});

test('tapping the plan card opens that plan', async () => {
  const view = await renderHome();
  await view.press(view.getByRole('button', { name: /· Day 17 of 31$/ }));

  const [call] = harness.navigation.calls;
  assert.equal(call.method, 'navigate');
  assert.equal(call.args[0], 'Plans');
  const target = call.args[1] as { screen: string; params: { planId: string } };
  assert.equal(target.screen, 'PlanDetail');
  assert.ok(catalog.some((plan) => plan.id === target.params.planId));
});

test('with no plan to feature, the card offers to browse plans', async () => {
  catalog = [];
  const view = await renderHome();

  await view.press(view.getByRole('button', { name: t('readingPlans.browsePlans') }));
  assert.deepEqual(harness.navigation.calls, [
    { method: 'navigate', args: ['Plans', { screen: 'PlansHome' }] },
  ]);
});

// ---- Gather and the reading ledger ----------------------------------------------

test('one Gather card names the active foundation, its lesson count and the next lesson', async () => {
  const [first, second] = gatherFoundations;
  gatherStore.setState({ completedLessons: { [second.id]: [second.lessons[0].id] } });
  const view = await renderHome();

  const card = view.getByRole('button', { name: new RegExp(`^${t('tabs.gather')} · `) });
  const label = String(card.props.accessibilityLabel);
  assert.ok(
    label.includes(t('home.lessonsProgress', { completed: 1, total: second.lessons.length }))
  );
  assert.ok(label.includes(t('home.nextLesson', { title: second.lessons[1].title })));
  assert.ok(!label.includes(first.title), 'the in-progress foundation wins over the first');

  const badges = view.queryAllByType('GatherIconBadge');
  assert.equal(badges.length, 1, 'a single Gather card, not a foundations path');
  assert.deepEqual(
    { artworkKey: badges[0].props.artworkKey, size: badges[0].props.size },
    { artworkKey: second.iconImage, size: 28 }
  );

  await view.press(card);
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      // initial: false keeps Gather home under the foundation, so back returns there.
      args: [
        'Learn',
        { screen: 'FoundationDetail', params: { foundationId: second.id }, initial: false },
      ],
    },
  ]);
});

test('the reading ledger closes the sheet below the Gather card and opens on this week', async () => {
  const view = await renderHome();
  const [scroll] = view.queryAllByType('ScrollView');
  const order = within(scroll)
    .queryAllByType('Pressable')
    .map((node) => String(node.props.accessibilityLabel ?? ''));
  const gatherIndex = order.findIndex((label) => label.startsWith(`${t('tabs.gather')} · `));
  const ledgerIndex = order.indexOf(t('home.week'));
  assert.ok(gatherIndex >= 0 && ledgerIndex > gatherIndex);

  assert.ok(view.getByRole('tablist', { name: t('home.ledgerPeriodLabel') }));
  assert.ok(view.getByRole('tab', { name: t('home.week'), selected: true }));
  const rows = [
    t('home.ledgerChapters'),
    t('home.ledgerChaptersCaption'),
    t('home.ledgerBooksFinished'),
  ];
  const texts = within(scroll)
    .queryAllByType('Text')
    .map((node) => textContent(node));
  const positions = rows.map((row) => texts.indexOf(row));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
    'rows keep their order'
  );
});

test('the ledger counts chapters read and listened from the progress store', async () => {
  progressStore.setState({
    chaptersRead: { JHN_1: Date.now(), JHN_2: Date.now() },
    chaptersListened: { JHN_3: Date.now() },
  });
  const view = await renderHome();

  const chaptersRow = hostAncestors(view.getByText(t('home.ledgerChapters')))[1];
  assert.ok(within(chaptersRow).getByText('3'));
});

test('the streak unit keeps its two-line width at default size and loses the cap at large text', async () => {
  const unitStyle = async () => {
    const view = await renderHome();
    const unit = view.getByText(t('home.streakUnitLabel', { count: 0 }));
    return { style: flattenStyle(unit.props.style) ?? {}, lines: unit.props.numberOfLines };
  };

  const regular = await unitStyle();
  assert.equal(regular.style.maxWidth, 54);
  assert.equal(regular.lines, 2);

  harness.setFontScale(2);
  const large = await unitStyle();
  assert.equal(large.style.maxWidth, undefined, 'a fixed 54pt column fits only a word per line');
  assert.equal(large.lines, undefined, 'longer languages need a third line at 2.0');
});

// Release QA at iOS AX5 truncated the greeting to "Good afterno…"; Android at 2.0
// cut the date line ("THURSDAY · SEPTEMBER..") and the Gather card eyebrow.
test('at accessibility sizes the greeting is capped and the one-line eyebrows may wrap', async () => {
  const { DISPLAY_TEXT_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  const lines = async () => {
    const view = await renderHome();
    const { screen } = heroes(view);
    const greeting = screen.getByText(/^Good morning/);
    const date = screen.getByText('Thursday · September 17');
    const gatherEyebrow = view.getByText(new RegExp(`^${t('tabs.gather')} · `));
    const [foundation] = gatherFoundations;
    const gatherCount = view.getByText(
      t('home.lessonsProgress', { completed: 0, total: foundation.lessons.length })
    );
    return {
      greeting: [greeting.props.maxFontSizeMultiplier, greeting.props.numberOfLines],
      date: date.props.numberOfLines,
      gather: [gatherEyebrow.props.numberOfLines, gatherCount.props.numberOfLines],
    };
  };

  assert.deepEqual(await lines(), {
    greeting: [DISPLAY_TEXT_MAX_FONT_SCALE, 2],
    date: 1,
    gather: [1, 1],
  });

  harness.setFontScale(2);
  assert.deepEqual(await lines(), {
    greeting: [DISPLAY_TEXT_MAX_FONT_SCALE, 3],
    date: 2,
    gather: [2, 2],
  });
});

// Release QA in Arabic read "1 أيام": the unit beside the numeral was one string
// for every count. Arabic has six plural forms.
test('the streak unit agrees with the count in every plural form', async () => {
  const { ar } = await import('../../i18n/locales/ar');
  harness.i18n.addResourceBundle('ar', 'translation', ar, true, true);
  // The unit sits beside the numeral inside the one accessible streak element.
  const unitFor = async (count: number) => {
    progressStore.setState({ streakDays: count });
    const view = await renderHome();
    const streak = view
      .queryAllByType('View')
      .find(
        (node) =>
          node.props.accessible === true &&
          within(node).queryAllByType('LucideIcon')[0]?.props.name === 'Flame'
      ) as ReactTestInstance;
    const [numeral, unit] = within(streak)
      .queryAllByType('Text')
      .map((node) => textContent(node));
    view.unmount();
    assert.equal(numeral, String(count));
    return unit;
  };

  assert.equal(await unitFor(1), 'day streak');
  assert.equal(await unitFor(12), 'day streak');

  await harness.i18n.changeLanguage('ar');
  try {
    assert.equal(await unitFor(1), ar.home.streakUnitLabel_one);
    assert.equal(await unitFor(2), ar.home.streakUnitLabel_two);
    assert.equal(await unitFor(3), ar.home.streakUnitLabel_few);
    assert.equal(await unitFor(11), ar.home.streakUnitLabel_many);
    assert.notEqual(ar.home.streakUnitLabel_one, ar.home.streakUnitLabel_few);
  } finally {
    await harness.i18n.changeLanguage('en');
  }
});

test('Home draws its glyphs with Lucide only', async () => {
  const view = await renderHome();

  assert.equal(view.queryAllByType('Icon').length, 0);
  assert.ok(view.queryAllByType('LucideIcon').length > 0);
});
