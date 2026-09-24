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
import { bibleTranslations } from '../../constants/translations';
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
// What Home told the service about today's audio, newest last.
const audioAvailableArgs: boolean[] = [];
// Home reaches the Bible database through a lazy import; this is what it loads.
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getDailyScripture: async (_translation: unknown, audioAvailable: boolean) => {
    audioAvailableArgs.push(audioAvailable);
    return dailyScripture;
  },
});
// Which books the translation can stream; null when it has no remote audio at all.
const remoteAudio = { books: null as string[] | null };
mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
  isRemoteAudioAvailable: (_translationId: string, bookId?: string | null) =>
    remoteAudio.books !== null && (bookId == null || remoteAudio.books.includes(bookId)),
});
// NetInfo, as Home's offline hook hears it.
const network = { offline: false, listeners: new Set<(offline: boolean) => void>() };
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => network.offline,
  subscribeToDeviceOffline: (listener: (offline: boolean) => void) => {
    network.listeners.add(listener);
    listener(network.offline);
    return () => network.listeners.delete(listener);
  },
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
  remoteAudio.books = null;
  network.offline = false;
  audioAvailableArgs.length = 0;
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

test('returning to Home the next evening shows the new date and an evening greeting', async () => {
  const view = await renderHome();
  assert.ok(heroes(view).screen.getByText('Thursday · September 17'));
  assert.ok(heroes(view).screen.getByText(/^Good morning/));

  harness.rn.AppState.emit('background');
  setToday(new Date(2026, 8, 18, 20, 30));
  harness.rn.AppState.emit('active');
  await view.flush();
  await view.flush();

  const { screen } = heroes(view);
  assert.ok(screen.getByText('Friday · September 18'));
  assert.ok(screen.getByText(/^Good evening/));
  assert.equal(screen.queryByText(/^Good morning/), null);
});

test('the greeting turns to afternoon at noon while Home stays open', async () => {
  mock.timers.reset();
  mock.timers.enable({
    apis: ['Date', 'setTimeout'],
    now: new Date(2026, 8, 17, 11, 59).getTime(),
  });
  const view = await renderHome();
  assert.ok(heroes(view).screen.getByText(/^Good morning/));

  mock.timers.tick(60_000);
  await view.flush();

  assert.ok(heroes(view).screen.getByText(/^Good afternoon/));
  await view.unmount();
});

test('Scripture borrowed from the bundled BSB is attributed to it on the hero and in the share', async () => {
  bibleStore.setState({ currentTranslation: 'npiulb' });
  dailyScripture = verseOf({ fallbackTranslationId: 'bsb' });
  const view = await renderHome();
  const { screen, share } = heroes(view);

  assert.ok(screen.getByText(verseEyebrow('John 3:16 · BSB')));
  assert.ok(share.getByText(verseEyebrow('John 3:16 · BSB')));
  // Latin text keeps the Latin reading face even under a Devanagari translation.
  const { getReadingFontFamily } = await import('../../design/fonts');
  assert.equal(
    flattenStyle(screen.getByText(JOHN_3_16).props.style)?.fontFamily,
    getReadingFontFamily('en')
  );

  await view.press(view.getByRole('button', { name: t('groups.share') }));
  sharing.available = false;
  await view.press(view.getByRole('button', { name: t('groups.share') }));
  assert.deepEqual(harness.rn.__recorded.shares.at(-1), {
    message: `${t('home.verseOfTheDay')}\nJohn 3:16 · BSB\n\n${JOHN_3_16}`,
  });
});

test('the whole daily passage is drawn, never clipped mid-sentence, at default and large text', async () => {
  // Real BSB text: today's passage (Romans 12:12) and the longest in the roster.
  const { DatabaseSync } = await import('node:sqlite');
  const { fileURLToPath, URL: NodeURL } = await import('node:url');
  const database = new DatabaseSync(
    fileURLToPath(new NodeURL('../../../assets/databases/bible-bsb-v2.db', import.meta.url)),
    { readOnly: true }
  );
  const passage = (bookId: string, chapter: number, verse: number, verseEnd: number) =>
    (
      database
        .prepare(
          "SELECT text FROM verses WHERE translation_id = 'bsb' AND book_id = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse"
        )
        .all(bookId, chapter, verse, verseEnd) as { text: string }[]
    )
      .map((row) => row.text.trim())
      .join(' ');
  const cases = [
    { bookId: 'ROM', chapter: 12, verse: 12, verseEnd: 12 },
    { bookId: 'DEU', chapter: 30, verse: 19, verseEnd: 20 },
  ];
  try {
    for (const scale of [1, 2]) {
      for (const readingSize of ['medium', 'large'] as const) {
        for (const reference of cases) {
          const text = passage(
            reference.bookId,
            reference.chapter,
            reference.verse,
            reference.verseEnd
          );
          assert.match(text, /[.!?]['’"”]?$/);
          dailyScripture = verseOf({ ...reference, text });
          harness.setFontScale(scale);
          harness.authStore.getState().setPreferences({ fontSize: readingSize });
          const view = await renderHome();

          const verse = heroes(view).screen.getByText(text);
          assert.equal(verse.props.numberOfLines, undefined);
          for (const host of [verse, ...hostAncestors(verse)]) {
            const style = flattenStyle(host.props.style) ?? {};
            assert.equal(style.height, undefined, `${host.type} fixes a height`);
            assert.equal(style.maxHeight, undefined, `${host.type} caps its height`);
          }
          await view.unmount();
        }
      }
    }
  } finally {
    database.close();
    harness.authStore.getState().setPreferences({ fontSize: 'medium' });
  }
});

test("the reader's own text carries no attribution", async () => {
  const view = await renderHome();

  assert.ok(heroes(view).screen.getByText(verseEyebrow('John 3:16')));
  assert.equal(view.queryByText(/· BSB$/), null);
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

// ---- Listen -------------------------------------------------------------------

/** Today's passage, as the service would return it: the real daily reference. */
async function todaysVerse(overrides: Partial<DailyScripture> = {}) {
  const { getDailyScriptureReference } = await import('../../services/bible/dailyScripture');
  const reference = getDailyScriptureReference(new Date());
  return verseOf({
    bookId: reference.bookId,
    chapter: reference.chapter,
    verse: reference.verse,
    ...overrides,
  });
}
const listenButton = (view: HomeView) =>
  heroes(view).screen.queryByRole('button', { name: t('bible.listen') });

test("Listen is offered online when the translation streams today's book", async () => {
  dailyScripture = await todaysVerse();
  remoteAudio.books = [dailyScripture.bookId];
  const view = await renderHome();

  assert.ok(listenButton(view));
});

test('offline, Listen is hidden unless the chapter audio is on the device', async () => {
  dailyScripture = await todaysVerse();
  remoteAudio.books = [dailyScripture.bookId];
  network.offline = true;
  const view = await renderHome();
  assert.equal(listenButton(view), null, 'streaming cannot play offline');
  await view.unmount();

  bibleStore.setState({
    translations: bibleTranslations.map((translation) =>
      translation.id === 'bsb'
        ? { ...translation, downloadedAudioBooks: [dailyScripture.bookId] }
        : translation
    ),
  } as never);
  const downloaded = await renderHome();
  assert.ok(listenButton(downloaded), 'downloaded audio plays offline');
  // So an audio-only set keeps its audio card offline instead of borrowing BSB text.
  assert.equal(audioAvailableArgs.at(-1), true);
});

test('losing the connection while Home is open hides Listen, and reconnecting brings it back', async () => {
  dailyScripture = await todaysVerse();
  remoteAudio.books = [dailyScripture.bookId];
  const view = await renderHome();
  assert.ok(listenButton(view));

  network.offline = true;
  for (const listener of network.listeners) listener(true);
  await view.flush();
  await view.flush();
  assert.equal(listenButton(view), null);

  network.offline = false;
  for (const listener of network.listeners) listener(false);
  await view.flush();
  await view.flush();
  assert.ok(listenButton(view));
});

test("Listen is hidden when the translation's stream does not include today's book", async () => {
  dailyScripture = await todaysVerse();
  remoteAudio.books = ['NOT-TODAYS-BOOK'];
  const view = await renderHome();

  assert.equal(listenButton(view), null);
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

test('once the photograph scrolls out from under the status bar, the strip gets a backdrop', async () => {
  const view = await renderHome();
  const [scroll] = view.queryAllByType('ScrollView');
  const isStatusMask = (node: ReactTestInstance) => {
    const style = flattenStyle(node.props.style) ?? {};
    return (
      node.props.pointerEvents === 'none' &&
      node.props.collapsable !== false && // not the off-screen share capture
      style.position === 'absolute' &&
      style.top === 0
    );
  };
  const masks = () => view.queryAllByType('View').filter(isStatusMask);
  const statusBarStyle = () => view.queryAllByType('ExpoStatusBar')[0].props.style;
  const scrollTo = (y: number) =>
    view.fire(scroll, 'onScroll', { nativeEvent: { contentOffset: { x: 0, y } } });

  // The hero grows with the text size, so its measured height sets the threshold.
  const greeting = heroes(view).screen.getByText(/^Good morning/);
  const hero = hostAncestors(greeting).find((node) => node.props.onLayout) as ReactTestInstance;
  assert.ok(hero, 'the on-screen hero reports its height');
  await view.fire(hero, 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 900 } },
  });
  // The photograph ends 9 pt above the hero's bottom edge (the pills hang past it).
  const photoLeavesStatusBarAt = 900 - 9 - harness.insets.top;

  assert.equal(masks().length, 0, 'the photograph bleeds under the status bar at rest');
  await scrollTo(photoLeavesStatusBarAt - 1);
  assert.equal(masks().length, 0);
  assert.equal(statusBarStyle(), 'light');

  await scrollTo(photoLeavesStatusBarAt + 1);
  const [mask] = masks();
  assert.ok(mask, 'page content no longer runs under the status-bar glyphs');
  const style = flattenStyle(mask.props.style) ?? {};
  assert.equal(style.height, harness.insets.top);
  assert.equal(style.left, 0);
  assert.equal(style.right, 0);
  assert.equal(
    style.backgroundColor,
    flattenStyle(view.root.findAllByType('View' as never)[0].props.style)?.backgroundColor
  );
  assert.equal(statusBarStyle(), 'dark', 'glyphs follow the page, not the photograph');

  await scrollTo(0);
  assert.equal(masks().length, 0);
  assert.equal(statusBarStyle(), 'light');
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
    const unit = view.getByText(t('home.streakUnitLabel'));
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

test('Home draws its glyphs with Lucide only', async () => {
  const view = await renderHome();

  assert.equal(view.queryAllByType('Icon').length, 0);
  assert.ok(view.queryAllByType('LucideIcon').length > 0);
});
