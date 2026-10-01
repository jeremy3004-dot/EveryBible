import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { act } from 'react-test-renderer';
import { gatherFoundations } from '../../data/gatherFoundations';
import { readingPlans as bundledReadingPlans } from '../../data/readingPlans.generated';
import type { ReadingPlan, UserReadingPlanProgress } from '../../services/plans/types';
import { getPlanCompletionEntryKey } from '../../services/plans/readingPlanModel';
import type { BibleTranslation, DailyScripture } from '../../types';
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
import { assertDefined } from '../../utils/assertDefined';

const harness = installRenderHarness(mock, { skip: ['@react-navigation/native'] });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// Home is the focused tab unless a test says otherwise.
let isFocused = true;
mockPackage(mock, '@react-navigation/native', {
  ...createReactNavigationFake(harness.navigation),
  useIsFocused: () => isFocused,
});

// ---- Stores: real Zustand stores holding only what Home selects -------------
const translationSwitches: string[] = [];
const bibleStore = create(() => ({
  translations: bibleTranslations as BibleTranslation[],
  currentTranslation: 'bsb',
  currentBook: 'JHN',
  currentChapter: 3,
  hasReaderHistory: true,
  setCurrentTranslation: (translationId: string) => {
    translationSwitches.push(translationId);
    bibleStore.setState({ currentTranslation: translationId });
  },
}));
const progressStore = create(() => ({
  chaptersRead: {} as Record<string, number>,
  chaptersListened: {} as Record<string, number>,
  listeningMsByDate: {} as Record<string, number>,
  chaptersByDate: {} as Record<string, number>,
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

// Share opens the reader's verse-picture editor; its extra faces load through expo-font's
// native module, and here they are ready at once.
mockModule(mock, sourcePath('screens/bible/reader/verseImage/verseImageFonts.ts'), {
  useVerseImageFonts: () => true,
  VERSE_IMAGE_FONT_SOURCES: {},
});

// ---- Services ----------------------------------------------------------------
// The plan catalog is the real bundled data; a test can empty it.
let catalog: ReadingPlan[] = bundledReadingPlans;
let catalogThrows = false;
mockModule(mock, sourcePath('services/plans/readingPlanService.ts'), {
  listReadingPlans: async () => {
    if (catalogThrows) throw new Error('catalog chunk failed to load');
    return { success: true, data: catalog };
  },
});
const reportedFailures: Array<{ source: string; error: unknown }> = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reportedFailures.push({ source, error });
  },
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
/** The translation id of every verse-of-the-day database read. */
const verseLoads: string[] = [];
// Home reaches the Bible database through a lazy import; this is what it loads.
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getDailyScripture: async (translation: { id: string }, audioAvailable: boolean) => {
    verseLoads.push(translation.id);
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
  availabilityImpl: null as (() => Promise<boolean>) | null,
  captureImpl: null as (() => Promise<string>) | null,
  releases: [] as string[],
  releaseError: null as Error | null,
  captureError: null as Error | null,
  shareError: null as Error | null,
  captures: [] as Array<{ ref: unknown; options: unknown }>,
  sheets: [] as Array<{ uri: string; options: unknown }>,
};
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: () => sharing.availabilityImpl?.() ?? Promise.resolve(sharing.available),
  shareAsync: async (uri: string, options: unknown) => {
    sharing.sheets.push({ uri, options });
    if (sharing.shareError) throw sharing.shareError;
  },
});
mockPackage(mock, 'react-native-view-shot', {
  releaseCapture: (uri: string) => {
    sharing.releases.push(uri);
    if (sharing.releaseError) throw sharing.releaseError;
  },
  captureRef: async (ref: unknown, options: unknown) => {
    sharing.captures.push({ ref, options });
    if (sharing.captureError) throw sharing.captureError;
    return sharing.captureImpl?.() ?? 'file:///tmp/verse-of-the-day.png';
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
  catalogThrows = false;
  reportedFailures.length = 0;
  dailyScripture = verseOf();
  remoteAudio.books = null;
  network.offline = false;
  audioAvailableArgs.length = 0;
  translationSwitches.length = 0;
  verseLoads.length = 0;
  sharing.available = true;
  sharing.captureError = null;
  sharing.shareError = null;
  sharing.availabilityImpl = null;
  sharing.captureImpl = null;
  sharing.releases.length = 0;
  sharing.releaseError = null;
  sharing.captures.length = 0;
  sharing.sheets.length = 0;
  bibleStore.setState(bibleStore.getInitialState(), true);
  progressStore.setState(progressStore.getInitialState(), true);
  readingPlansStore.setState(readingPlansStore.getInitialState(), true);
  gatherStore.setState({ completedLessons: {} });
});

afterEach(async () => {
  mock.timers.reset();
  // Loaded here, after the module mocks are installed.
  (await import('../bible/reader/useVerseImageShare')).forgetLastSharedVerseImage();
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

/** Start the visible native callback without keeping an act scope open across native work. */
/**
 * The editor's share action itself. Its Share button calls this without returning the
 * promise, so tests that race a share against navigation or a second tap hold it here.
 */
function editorShareAction(view: HomeView) {
  const [sheet] = view.root.findAll(
    (node) => typeof node.props.handleShareSelectedVerseImage === 'function'
  );
  assert.ok(sheet, 'the verse-picture editor is mounted');
  return sheet.props.handleShareSelectedVerseImage as () => Promise<void>;
}

async function beginHomeShare(view: HomeView) {
  const { editor } = await openShareEditor(view);
  // Read while the editor is mounted; a closed Modal's node cannot be read.
  const onDismiss = editor.props.onDismiss as () => void;
  const share = editorShareAction(view);
  let operation!: Promise<void>;
  await act(async () => {
    operation = share();
  });
  return { operation, onDismiss };
}

/** The editor Modal's iOS onDismiss, which the share waits for before presenting. */
async function finishEditorDismissal(view: HomeView, onDismiss: () => void) {
  await view.flush();
  await act(async () => {
    onDismiss();
  });
}

/** The on-screen hero lives in the ScrollView. */
function heroes(view: HomeView) {
  const scroll = assertDefined(view.queryAllByType('ScrollView')[0], 'scroll');
  return { screen: within(scroll) };
}

/** The open verse-picture editor, found by its title. */
const findShareEditor = (view: HomeView) =>
  view
    .queryAllByType('Modal')
    .find((node) => within(node).queryAllByText(t('bible.chooseVerseImageBackground')).length > 0);

/** Share opens the reader's verse-picture editor; returns it and the picture it will share. */
async function openShareEditor(view: HomeView) {
  await view.press(heroes(view).screen.getByRole('button', { name: t('home.shareVerseOfTheDay') }));
  const editor = findShareEditor(view);
  assert.ok(editor, 'the verse-picture editor is open');
  const picture = within(editor)
    .queryAllByType('View')
    .find((node) => node.props.collapsable === false);
  assert.ok(picture, 'the editor shows the picture it will share');
  return { editor, picture: within(picture), pictureNode: picture };
}

/** Presses the editor's Share and lets its close finish, as iOS reports it. */
async function shareFromEditor(view: HomeView, editor: ReactTestInstance) {
  const { onDismiss } = editor.props as { onDismiss?: () => void };
  await view.press(within(editor).getByRole('button', { name: t('groups.share') }));
  await view.flush();
  await act(async () => {
    onDismiss?.();
  });
  await view.flush();
}

/** The first line of the verse when it is shared as text. */
const shareTitle = t('home.verseOfTheDay');

/** On screen the weekday stands in for "Today's scripture" (TODAY is a Thursday). */
const screenEyebrow = (reference: string, weekday = 'Thursday') => `${weekday} · ${reference}`;

// ---- Verse of the day --------------------------------------------------------

/** Replace translation rows the way a download tick or catalog refresh does. */
async function replaceTranslations(ids: readonly string[], patch: Partial<BibleTranslation> = {}) {
  await act(async () => {
    bibleStore.setState((state) => ({
      translations: state.translations.map((translation) =>
        ids.includes(translation.id) ? { ...translation, ...patch } : translation
      ),
    }));
  });
}

test('a refreshed copy of the current translation does not reload or re-spin the verse', async () => {
  const view = await renderHome();
  assert.deepEqual(verseLoads, ['bsb']);

  // Download progress and catalog hydration rebuild the row without changing it.
  await replaceTranslations(['bsb'], { activeDownloadJob: null });
  await view.flush();
  await view.flush();

  assert.deepEqual(verseLoads, ['bsb'], 'no second database read');
  assert.ok(heroes(view).screen.getByText(JOHN_3_16), 'the verse stays up');
});

test('another translation changing does not re-render Home', async () => {
  const other = bibleTranslations.find((translation) => translation.id !== 'bsb');
  assert.ok(other);
  await renderHome();
  const mark = harness.renders.mark();

  await replaceTranslations([other.id], { downloadedAudioBooks: ['GEN'] });

  assert.equal(harness.renders.count(mark), 0);
});

test('switching the current translation still loads its verse', async () => {
  const other = bibleTranslations.find(
    (translation) => translation.id !== 'bsb' && translation.hasText
  );
  assert.ok(other);
  const view = await renderHome();

  await act(async () => {
    bibleStore.setState({ currentTranslation: other.id });
  });
  await view.flush();
  await view.flush();

  assert.deepEqual(verseLoads, ['bsb', other.id]);
});

test('installing the current translation’s text pack reloads its verse', async () => {
  const view = await renderHome();

  await replaceTranslations(['bsb'], { textPackLocalPath: 'file:///packs/bsb.sqlite' });
  await view.flush();
  await view.flush();

  assert.deepEqual(verseLoads, ['bsb', 'bsb']);
});

test('the hero shows the rotating daily verse and its reference, not a fixed passage', async () => {
  const first = await renderHome();
  assert.ok(heroes(first).screen.getByText(JOHN_3_16));
  assert.ok(heroes(first).screen.getByText(screenEyebrow('John 3:16')));
  await first.unmount();

  dailyScripture = verseOf({ bookId: 'PSA', chapter: 46, verse: 10, text: 'Be still, and know.' });
  const next = await renderHome();
  assert.ok(heroes(next).screen.getByText('Be still, and know.'));
  assert.ok(heroes(next).screen.getByText(/^Thursday · Psalms? 46:10$/));
  assert.equal(next.queryByText(JOHN_3_16), null);
});

test('returning to Home the next day shows the new weekday beside the reference', async () => {
  const view = await renderHome();
  assert.ok(heroes(view).screen.getByText(screenEyebrow('John 3:16')));

  harness.rn.AppState.emit('background');
  setToday(new Date(2026, 8, 18, 20, 30));
  harness.rn.AppState.emit('active');
  await view.flush();
  await view.flush();

  const { screen } = heroes(view);
  assert.ok(screen.getByText(screenEyebrow('John 3:16', 'Friday')));
  assert.equal(screen.queryByText(screenEyebrow('John 3:16')), null);
});

test('returning to Home on the same day does not rebuild the heatmap', async () => {
  progressStore.setState({ chaptersRead: { JHN_1: Date.now() } });
  const view = await renderHome();

  const since = harness.renders.mark();
  harness.rn.AppState.emit('background');
  setToday(new Date(2026, 8, 17, 20, 30));
  harness.rn.AppState.emit('active');
  await view.flush();
  await view.flush();

  const redrawn = harness.renders
    .since(since)
    .filter((entry) => String(entry.props.testID ?? '').startsWith('heatmap-day-'));
  assert.equal(redrawn.length, 0, 'no heatmap square is drawn again');
});

test('the weekday turns over at midnight while Home stays open', async () => {
  mock.timers.reset();
  mock.timers.enable({
    apis: ['Date', 'setTimeout'],
    now: new Date(2026, 8, 17, 23, 59).getTime(),
  });
  const view = await renderHome();
  assert.ok(heroes(view).screen.getByText(screenEyebrow('John 3:16')));

  mock.timers.tick(60_000);
  await view.flush();
  await view.flush();

  assert.ok(heroes(view).screen.getByText(screenEyebrow('John 3:16', 'Friday')));
  await view.unmount();
});

test('Scripture borrowed from the bundled BSB is attributed to it on the hero and in the share', async () => {
  bibleStore.setState({ currentTranslation: 'npiulb' });
  dailyScripture = verseOf({ fallbackTranslationId: 'bsb' });
  const view = await renderHome();
  const { screen } = heroes(view);

  assert.ok(screen.getByText(screenEyebrow('John 3:16 · BSB')));
  // Latin text keeps the Latin reading face even under a Devanagari translation.
  const { getReadingFontFamily } = await import('../../design/fonts');
  assert.equal(
    flattenStyle(screen.getByText(JOHN_3_16).props.style)?.fontFamily,
    getReadingFontFamily('en')
  );

  sharing.available = false;
  const { editor, picture } = await openShareEditor(view);
  assert.ok(picture.getByText('John 3:16 · BSB'));
  await shareFromEditor(view, editor);
  assert.deepEqual(harness.rn.__recorded.shares.at(-1), {
    message: `${shareTitle}\nJohn 3:16 · BSB\n\n${JOHN_3_16}`,
  });
});

test("Read opens today's chapter in the reader's own translation", async () => {
  const view = await renderHome();
  await view.press(
    heroes(view).screen.getByRole('button', { name: t('home.readPassage', { passage: 'John 3' }) })
  );

  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(translationSwitches, []);
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: [
      'Bible',
      // initial: false keeps the Bible browser under the reader, so back returns there
      // even when the Bible tab was never opened.
      {
        screen: 'BibleReader',
        params: { bookId: 'JHN', chapter: 3, focusVerse: 16 },
        initial: false,
      },
    ],
  });
});

test('Read on a verse borrowed from BSB asks first, then opens the chapter in BSB', async () => {
  bibleStore.setState({ currentTranslation: 'npiulb' });
  dailyScripture = verseOf({ fallbackTranslationId: 'bsb' });
  const view = await renderHome();
  const navigationsBefore = harness.navigation.calls.length;

  await view.press(
    heroes(view).screen.getByRole('button', { name: t('home.readPassage', { passage: 'John 3' }) })
  );

  // The reader follows the selected translation, which lacks this book.
  assert.equal(harness.navigation.calls.length, navigationsBefore, 'nothing opens yet');
  const alert = assertDefined(harness.rn.__recorded.alerts[0], 'alert');
  assert.equal(
    alert.title,
    t('home.borrowedPassageTitle', { passage: 'John 3', translation: 'Nepali Bible' })
  );
  assert.equal(alert.message, t('home.borrowedPassageBody', { fallback: 'BSB' }));
  const buttons = alert.buttons as Array<{ text: string; style?: string; onPress?: () => void }>;
  assert.deepEqual(
    buttons.map((button) => button.text),
    [t('common.cancel'), t('home.readInTranslation', { translation: 'BSB' })]
  );

  assertDefined(buttons[0], 'buttons[0]').onPress?.();
  assert.deepEqual(translationSwitches, [], 'Cancel keeps the reader in their translation');
  assert.equal(harness.navigation.calls.length, navigationsBefore);

  assertDefined(buttons[1], 'buttons[1]').onPress?.();
  assert.deepEqual(translationSwitches, ['bsb']);
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: [
      'Bible',
      // initial: false keeps the Bible browser under the reader, so back returns there
      // even when the Bible tab was never opened.
      {
        screen: 'BibleReader',
        params: { bookId: 'JHN', chapter: 3, focusVerse: 16 },
        initial: false,
      },
    ],
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

  assert.ok(heroes(view).screen.getByText(screenEyebrow('John 3:16')));
  assert.equal(view.queryByText(/· BSB$/), null);
});

test("Share opens the verse-picture editor on today's photograph, verse and reference", async () => {
  const view = await renderHome();
  const { editor, picture, pictureNode } = await openShareEditor(view);

  assert.ok(picture.getByText(`“${JOHN_3_16}”`));
  assert.ok(picture.getByText('John 3:16'));
  // Only the verse and its reference: no title or date line above it.
  assert.equal(picture.queryByText(/^Verse of the Day/), null);
  assert.equal(picture.queryByText(/Thursday/), null);
  // The same editor as the reader's: font, colour and size can be changed.
  for (const tab of ['font', 'color', 'size'] as const) {
    assert.ok(within(editor).getByText(t(`bible.verseImage.tabs.${tab}`)));
  }
  // It opens on the hero's own photograph.
  const { getHomeVerseBackground } = await import('../../data/homeVerseBackgrounds');
  const [photo] = within(pictureNode).queryAllByType('ImageBackground');
  assert.equal(photo?.props.source, getHomeVerseBackground(TODAY));
  assert.deepEqual(sharing.captures, [], 'nothing is shared until Share is pressed');
});

test('the hero share control is an icon-only button named for the verse of the day', async () => {
  const view = await renderHome();
  const { screen } = heroes(view);

  const shareButton = screen.getByRole('button', { name: t('home.shareVerseOfTheDay') });
  assert.equal(textContent(shareButton), '', 'icon only');
  assert.equal(within(shareButton).queryAllByType('LucideIcon').length, 1);
  // It closes the hero action row, after the read action.
  const actionRow = assertDefined(hostAncestors(shareButton)[0], 'actionRow');
  const actions = within(actionRow).getAllByRole('button');
  assert.equal(actions.at(-1), shareButton);
  assert.equal(view.getAllByRole('button', { name: t('home.shareVerseOfTheDay') }).length, 1);
});

test('sharing from the editor captures its picture as a JPEG and opens the share sheet', async () => {
  const view = await renderHome();
  const { editor } = await openShareEditor(view);
  await shareFromEditor(view, editor);

  assert.equal(sharing.captures.length, 1);
  const { options } = assertDefined(sharing.captures[0], 'the first capture');
  assert.deepEqual(options, {
    format: 'jpg',
    quality: 0.9,
    result: 'tmpfile',
    width: 1080,
    height: 1000,
  });
  assert.deepEqual(sharing.sheets, [
    {
      uri: 'file:///tmp/verse-of-the-day.png',
      options: { dialogTitle: t('groups.share'), mimeType: 'image/jpeg', UTI: 'public.jpeg' },
    },
  ]);
  assert.deepEqual(harness.rn.__recorded.shares, []);
  assert.equal(findShareEditor(view), undefined, 'the editor closes before the share sheet opens');
});

test('sharing falls back to the verse as text when images cannot be shared or captured', async () => {
  const expectedMessage = `${shareTitle}\nJohn 3:16\n\n${JOHN_3_16}`;

  sharing.available = false;
  const unavailable = await renderHome();
  await shareFromEditor(unavailable, (await openShareEditor(unavailable)).editor);
  assert.deepEqual(harness.rn.__recorded.shares, [{ message: expectedMessage }]);
  await unavailable.unmount();

  sharing.available = true;
  sharing.captureError = new Error('snapshot failed');
  const failing = await renderHome();
  await shareFromEditor(failing, (await openShareEditor(failing)).editor);
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

    const photo = assertDefined(screen.queryAllByType('ImageBackground')[0], 'photo');
    assert.equal(flattenStyle(photo.props.imageStyle)?.opacity, undefined);
    const scrim = assertDefined(screen.queryAllByType('LinearGradient')[0], 'scrim');
    assert.deepEqual(scrim.props.colors, [
      'rgba(12, 11, 9, 0.55)',
      'rgba(12, 11, 9, 0.1)',
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

test('the interaction-ready timing log is a development-only line', async (context) => {
  const lines: string[] = [];
  context.mock.method(console, 'log', (...args: unknown[]) => lines.push(String(args[0])));
  const globals = globalThis as {
    __DEV__?: boolean;
    requestAnimationFrame?: (cb: (time: number) => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  const rafBefore = globals.requestAnimationFrame;
  const cancelBefore = globals.cancelAnimationFrame;
  globals.cancelAnimationFrame = () => {};
  globals.requestAnimationFrame = (cb) => {
    cb(0);
    return 1;
  };
  const devBefore = globals.__DEV__;
  try {
    for (const dev of [false, true]) {
      globals.__DEV__ = dev;
      lines.length = 0;
      const view = await renderHome();
      const scroll = assertDefined(view.queryAllByType('ScrollView')[0], 'scroll');
      await view.fire(scroll, 'onLayout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } },
      });
      await view.flush();
      assert.equal(
        lines.some((line) => line.includes('Home:interaction-ready')),
        dev
      );
      await view.unmount();
    }
  } finally {
    globals.__DEV__ = devBefore;
    globals.requestAnimationFrame = rafBefore;
    globals.cancelAnimationFrame = cancelBefore;
  }
});

test('the scrim fades to the page below the verse text, wherever the hero grows to', async () => {
  const view = await renderHome();
  const { screen } = heroes(view);
  const eyebrow = screen.getByText(screenEyebrow('John 3:16'));
  const hero = hostAncestors(eyebrow).find((node) => node.props.onLayout) as ReactTestInstance;
  const actionRow = assertDefined(
    hostAncestors(screen.getByText(t('bible.read'))).find((node) => node.props.onLayout),
    'action row'
  );
  const locations = () =>
    assertDefined(screen.queryAllByType('LinearGradient')[0], 'scrim').props.locations as number[];
  const layout = (node: ReactTestInstance, height: number) =>
    view.fire(node, 'onLayout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });

  await layout(actionRow, 36);
  await layout(hero, 500);
  // 500 less the 9pt overhang is the photograph; the fade is the 36pt pills, the
  // 12pt gap above them, less the 9pt hanging past the photograph.
  const photo = 491;
  const fadeStart = (photo - (36 + 12 - 9)) / photo;
  assert.ok(Math.abs((locations()[3] ?? 0) - fadeStart) < 1e-9);

  // Large text: a much taller hero keeps the same point-sized fade at its foot.
  await layout(hero, 900);
  const tall = locations();
  assert.ok(Math.abs((tall[3] ?? 0) - (891 - 39) / 891) < 1e-9);
  assert.ok((tall[3] ?? 0) > 0.95, 'the fade no longer climbs behind the verse');

  // Wrapped pills push the verse up, and the fade with it.
  await layout(actionRow, 76);
  assert.ok(Math.abs((locations()[3] ?? 0) - (891 - 79) / 891) < 1e-9);
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
  const scroll = assertDefined(view.queryAllByType('ScrollView')[0], 'scroll');

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

test('the photograph bleeds under the status bar while the verse clears it', async () => {
  const view = await renderHome();
  const { screen } = heroes(view);

  assert.equal(view.queryAllByType('SafeAreaView').length, 0, 'no top inset on the photograph');
  const eyebrow = screen.getByText(screenEyebrow('John 3:16'));
  const heroContent = hostAncestors(eyebrow).find(
    (node) => flattenStyle(node.props.style)?.paddingTop !== undefined
  );
  assert.equal(flattenStyle(heroContent?.props.style)?.paddingTop, harness.insets.top + 14);

  const statusBar = assertDefined(view.queryAllByType('ExpoStatusBar')[0], 'statusBar');
  assert.equal(statusBar.props.style, 'light');
});

test('once the photograph scrolls out from under the status bar, the strip gets a backdrop', async () => {
  const view = await renderHome();
  const scroll = assertDefined(view.queryAllByType('ScrollView')[0], 'scroll');
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
  const statusBarStyle = () =>
    assertDefined(
      view.queryAllByType('ExpoStatusBar')[0],
      "view.queryAllByType('ExpoStatusBar')[0]"
    ).props.style;
  const scrollTo = (y: number) =>
    view.fire(scroll, 'onScroll', { nativeEvent: { contentOffset: { x: 0, y } } });

  // The hero grows with the text size, so its measured height sets the threshold.
  const eyebrow = heroes(view).screen.getByText(screenEyebrow('John 3:16'));
  const hero = hostAncestors(eyebrow).find((node) => node.props.onLayout) as ReactTestInstance;
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
    flattenStyle(
      assertDefined(
        view.root.findAllByType('View' as never)[0],
        "view.root.findAllByType('View' as never)[0]"
      ).props.style
    )?.backgroundColor
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

test('the hero has no greeting, date or welcome line, only the weekday beside the reference', async () => {
  const view = await renderHome();
  const { screen } = heroes(view);

  assert.equal(screen.queryByText(/^Good (morning|afternoon|evening)/), null);
  assert.equal(screen.queryByText('Thursday · September 17'), null);
  assert.equal(view.queryByText(t('home.welcome')), null);
  assert.ok(screen.getByText(screenEyebrow('John 3:16')));
});

// ---- Reading plans ------------------------------------------------------------

const planNamed = (id: string) => bundledReadingPlans.find((plan) => plan.id === id)!;
const titleOf = (plan: ReadingPlan) => t(plan.title_key);
const nodesWithTestId = (
  view: { queryAllByType: (type: string) => ReactTestInstance[] },
  id: string
) => view.queryAllByType('View').filter((node) => node.props.testID === id);
const shelfValue = (card: ReactTestInstance) =>
  (card.props.accessibilityValue as { text?: string } | undefined)?.text;

function joinPlan(plan: ReadingPlan, overrides: Partial<UserReadingPlanProgress> = {}) {
  const started_at = new Date(2026, 0, 1, 9).toISOString();
  readingPlansStore.setState({
    progressByPlanId: {
      ...readingPlansStore.getState().progressByPlanId,
      [plan.id]: {
        id: `progress-${plan.id}`,
        plan_id: plan.id,
        started_at,
        completed_entries: {},
        current_day: 1,
        is_completed: false,
        completed_at: null,
        synced_at: started_at,
        ...overrides,
      },
    },
  });
}

test('the reading card keeps Continue and Gather, and no longer a plan chip', async () => {
  const view = await renderHome();

  assert.equal(nodesWithTestId(view, 'reading-chip-progress').length, 2);
  assert.equal(view.queryByText(t('readingPlans.browsePlans')), null);
});

test('with no plan joined, the shelf suggests plans to start', async () => {
  const view = await renderHome();
  const proverbs = planNamed('proverbs-31-days');

  assert.ok(view.getByRole('button', { name: t('readingPlans.findPlans') }));
  assert.equal(view.queryByRole('button', { name: t('readingPlans.myPlans') }), null);
  const card = view.getByRole('button', { name: titleOf(proverbs) });
  assert.equal(shelfValue(card), t('readingPlans.daysCount', { count: 31 }));
  assert.equal(nodesWithTestId(view, 'plan-shelf-progress').length, 0);
});

test('tapping a cover opens that plan over the plans list', async () => {
  const view = await renderHome();
  await view.press(view.getByRole('button', { name: titleOf(planNamed('proverbs-31-days')) }));

  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: [
        'Plans',
        { screen: 'PlanDetail', params: { planId: 'proverbs-31-days' }, initial: false },
      ],
    },
  ]);
});

test('the shelf heading opens the plans list', async () => {
  const view = await renderHome();
  await view.press(view.getByRole('button', { name: t('readingPlans.findPlans') }));

  assert.deepEqual(harness.navigation.calls, [
    { method: 'navigate', args: ['Plans', { screen: 'PlansHome' }] },
  ]);
});

test('a joined plan shows its day and progress, then a tile to find more', async () => {
  const plan = planNamed('psalms-30-days');
  catalog = [plan, planNamed('proverbs-31-days')];
  joinPlan(plan, {
    current_day: 4,
    completed_entries: Object.fromEntries(
      [1, 2, 3].map((day) => [getPlanCompletionEntryKey(plan, day, TODAY), TODAY.toISOString()])
    ),
  });
  const view = await renderHome();

  assert.ok(view.getByRole('button', { name: t('readingPlans.myPlans') }));
  const card = view.getByRole('button', { name: titleOf(plan) });
  assert.equal(shelfValue(card), t('readingPlans.dayOf', { current: 4, total: 30 }));
  const bar = within(card).getByTestId('plan-shelf-progress');
  assert.equal(flattenStyle(bar.props.style)?.width, '10%');
  // Only joined plans are on the shelf; the suggestion is not.
  assert.equal(view.queryByRole('button', { name: titleOf(planNamed('proverbs-31-days')) }), null);

  await view.press(view.getByRole('button', { name: t('readingPlans.findPlans') }));
  assert.deepEqual(harness.navigation.calls, [
    { method: 'navigate', args: ['Plans', { screen: 'PlansHome' }] },
  ]);
});

for (const [year, month, total] of [
  [2026, 1, 28],
  [2028, 1, 29],
  [2026, 9, 31],
] as const) {
  test(`a joined monthly plan uses ${total} days for its label and progress`, async () => {
    const today = new Date(year, month, 17, 9);
    setToday(today);
    const plan = planNamed('proverbs-31-days');
    catalog = [plan];
    joinPlan(plan, {
      started_at: new Date(year, month, 1, 9).toISOString(),
      current_day: 15,
      completed_entries: Object.fromEntries(
        Array.from({ length: 14 }, (_, index) => [
          getPlanCompletionEntryKey(plan, index + 1, today),
          today.toISOString(),
        ])
      ),
    });
    const view = await renderHome();
    const card = view.getByRole('button', { name: titleOf(plan) });
    assert.equal(shelfValue(card), t('readingPlans.dayOf', { current: 17, total }));
    const bar = within(card).getByTestId('plan-shelf-progress');
    assert.equal(flattenStyle(bar.props.style)?.width, `${Math.round((14 / total) * 100)}%`);
  });
}

test('a joined weekly plan keeps its seven days in February', async () => {
  // Tuesday 17 February 2026: day 3 of a week that starts on Sunday.
  setToday(new Date(2026, 1, 17, 9));
  const plan = {
    ...planNamed('psalms-30-days'),
    scheduleMode: 'calendar-day-of-week' as const,
    duration_days: 7,
  };
  catalog = [plan];
  joinPlan(plan);
  const view = await renderHome();

  const card = view.getByRole('button', { name: titleOf(plan) });
  assert.equal(shelfValue(card), t('readingPlans.dayOf', { current: 3, total: 7 }));
});

test('with an empty catalogue there is no shelf', async () => {
  catalog = [];
  const view = await renderHome();

  assert.equal(view.queryByRole('button', { name: t('readingPlans.findPlans') }), null);
});

test('a plan catalog that rejects leaves Home without a shelf, reported and not unhandled', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    catalogThrows = true;
    const view = await renderHome();
    await view.flush();

    assert.equal(view.queryByRole('button', { name: t('readingPlans.findPlans') }), null);
    assert.deepEqual(
      reportedFailures.map((failure) => failure.source),
      ['home.readingPlans']
    );
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

// ---- Gather and the reading ledger ----------------------------------------------

test('the Gather chip names the active foundation, its lesson count and the next lesson', async () => {
  const first = assertDefined(gatherFoundations[0], 'the first foundation');
  const second = assertDefined(gatherFoundations[1], 'the second foundation');
  gatherStore.setState({
    completedLessons: { [second.id]: [assertDefined(second.lessons[0], 'second.lessons[0]').id] },
  });
  const view = await renderHome();

  const chip = view.getByRole('button', { name: new RegExp(`^${t('tabs.gather')} · `) });
  const label = String(chip.props.accessibilityLabel);
  assert.ok(
    label.includes(t('home.lessonsProgress', { completed: 1, total: second.lessons.length }))
  );
  assert.ok(
    label.includes(
      t('home.nextLesson', { title: assertDefined(second.lessons[1], 'second.lessons[1]').title })
    )
  );
  assert.ok(!label.includes(first.title), 'the in-progress foundation wins over the first');
  assert.ok(within(chip).getByText(t('home.lessonChip', { number: 2 })));
  const bar = within(chip).getByTestId('reading-chip-progress');
  assert.equal(
    flattenStyle(bar.props.style)?.width,
    `${Math.round((1 / second.lessons.length) * 100)}%`
  );

  await view.press(chip);
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

const heatmapButton = (view: HomeView) =>
  view.getByRole('button', { name: new RegExp(`^${t('more.readingActivity')} · `) });

test('one dark card holds the streak, the heatmap, Continue and Gather, then the plan shelf', async () => {
  const view = await renderHome();
  const scroll = assertDefined(view.queryAllByType('ScrollView')[0], 'scroll');
  const order = within(scroll)
    .queryAllByType('Pressable')
    .map((node) => String(node.props.accessibilityLabel ?? ''))
    .filter(Boolean);
  const indexOf = (prefix: string) => order.findIndex((label) => label.startsWith(prefix));
  const heatmap = indexOf(`${t('more.readingActivity')} · `);
  const resume = indexOf(`${t('common.continue')} John 3`);
  const gather = indexOf(`${t('tabs.gather')} · `);
  const shelf = indexOf(t('readingPlans.findPlans'));
  assert.ok(
    heatmap >= 0 && heatmap < resume && resume < gather && gather < shelf,
    order.join(' | ')
  );

  // The card is the dark scope even on vellum.
  const { darkColors } = await import('../../contexts/ThemeContext');
  const card = hostAncestors(heatmapButton(view)).find(
    (node) => flattenStyle(node.props.style)?.backgroundColor === darkColors.cardBackground
  );
  assert.ok(card, 'the reading card draws on the dark card colour');

  // The grid's key and day count are gone; the header keeps the chapter total.
  assert.equal(view.queryByText(t('home.heatmapLess')), null);
  assert.equal(view.queryByText(t('home.heatmapMore')), null);
  assert.ok(view.getByText(t('home.ledgerNoChapters')));
});

test('the heatmap shades each day by chapters read or heard, and outlines today', async () => {
  progressStore.setState({
    chaptersRead: { JHN_1: Date.now(), JHN_2: Date.now() },
    chaptersListened: { JHN_3: Date.now() },
    chaptersByDate: { '2026-09-15': 1 },
  });
  const view = await renderHome();

  const today = view.getByTestId('heatmap-day-2026-09-17');
  const tuesday = view.getByTestId('heatmap-day-2026-09-15');
  const friday = view.getByTestId('heatmap-day-2026-09-18');
  const monday = view.getByTestId('heatmap-day-2026-09-14');
  const fill = (node: ReactTestInstance) => flattenStyle(node.props.style)?.backgroundColor;

  assert.equal(flattenStyle(today.props.style)?.borderWidth, 1.5);
  assert.notEqual(fill(today), fill(tuesday), 'three chapters shade deeper than one');
  assert.notEqual(fill(tuesday), fill(monday), 'a read day differs from a rest day');
  assert.equal(fill(friday), 'transparent', 'later this week is left open');
  // Before layout the grid holds 15 weeks: 14 full ones plus Monday to Thursday.
  assert.equal(
    heatmapButton(view).props.accessibilityLabel,
    `${t('more.readingActivity')} · ${t('home.heatmapDays', { active: 2, count: 14 * 7 + 4 })}`
  );
});

// Listening time is banked every 30 seconds while audio plays, in any tab. Home stays
// mounted, so a tick too small to change a day's chapter count must not hand the
// heatmap new data (and rebuild its grid) every time.
test('banking a few seconds of listening does not rebuild the heatmap data', async () => {
  progressStore.setState({ listeningMsByDate: { '2026-09-16': 9 * 60_000 } });
  const view = await renderHome();
  const heatmapActivity = () => {
    const [node] = view.root.findAll(
      (candidate) => candidate.props.activity && candidate.props.nowMs !== undefined
    );
    assert.ok(node, 'the heatmap is mounted');
    return node.props.activity as unknown;
  };
  const before = heatmapActivity();

  await act(async () => {
    progressStore.setState({
      listeningMsByDate: { '2026-09-16': 9 * 60_000 + 5_000, '2026-09-17': 5_000 },
    });
  });
  await view.flush();
  assert.equal(heatmapActivity(), before);

  // Enough time to change a day's chapter count does reach it.
  await act(async () => {
    progressStore.setState({ listeningMsByDate: { '2026-09-16': 13 * 60_000 } });
  });
  await view.flush();
  assert.notEqual(heatmapActivity(), before);
});

test('the ledger totals chapters read and listened since the first one', async () => {
  progressStore.setState({
    chaptersRead: { JHN_1: Date.now(), JHN_2: Date.now() },
    chaptersListened: { JHN_3: Date.now() },
  });
  const view = await renderHome();

  assert.ok(view.getByText(t('readingPlans.chapterCount', { count: 3 })));
});

test('tapping the heatmap opens the reading calendar in More', async () => {
  const view = await renderHome();

  await view.press(heatmapButton(view));
  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: ['More', { screen: 'ReadingActivity', initial: false }],
    },
  ]);
});

test('Continue shows how far through the book the reader is', async () => {
  const view = await renderHome();
  const chip = view.getByRole('button', { name: `${t('common.continue')} John 3` });

  assert.ok(within(chip).getByText('John 3'));
  const bar = within(chip).getByTestId('reading-chip-progress');
  assert.equal(flattenStyle(bar.props.style)?.width, `${Math.round((3 / 21) * 100)}%`);
});

// At large text a third of the card held a word per line, so the chips stack
// and their values may take a second line.
test('at accessibility sizes the chips stack and their values may wrap', async () => {
  const { DISPLAY_TEXT_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  const layout = async () => {
    const view = await renderHome();
    const value = view.getByText('John 3');
    const chip = view.getByRole('button', { name: `${t('common.continue')} John 3` });
    const row = hostAncestors(chip).find(
      (node) => flattenStyle(node.props.style)?.flexDirection !== undefined
    );
    return {
      value: [value.props.maxFontSizeMultiplier, value.props.numberOfLines],
      direction: flattenStyle(row?.props.style)?.flexDirection,
    };
  };

  assert.deepEqual(await layout(), {
    value: [DISPLAY_TEXT_MAX_FONT_SCALE, 1],
    direction: 'row',
  });

  harness.setFontScale(2);
  assert.deepEqual(await layout(), {
    value: [DISPLAY_TEXT_MAX_FONT_SCALE, 2],
    direction: 'column',
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

for (const boundary of ['availability', 'capture', 'capture failure'] as const) {
  test(`navigating from Home during ${boundary} cannot present a stale share`, async () => {
    let settle: () => void = () => {};
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    if (boundary === 'availability')
      sharing.availabilityImpl = () =>
        new Promise<boolean>((resolve) => {
          settle = () => resolve(true);
          entered();
        });
    else
      sharing.captureImpl = () =>
        new Promise<string>((resolve, reject) => {
          settle =
            boundary === 'capture'
              ? () => resolve('file:///tmp/abandoned-home.png')
              : () => reject(new Error('snapshot failed'));
          entered();
        });
    const view = await renderHome();
    // The actual visible Share press starts before navigation, never after unmount.
    const { operation: press } = await beginHomeShare(view);
    try {
      await started;
      await view.press(
        heroes(view).screen.getByRole('button', {
          name: t('home.readPassage', { passage: 'John 3' }),
        })
      );
      assert.equal(harness.navigation.calls.at(-1)?.method, 'navigate');
      // Home stays mounted/frozen on tab changes; blur is delivered without a new render.
      isFocused = false;
      harness.navigation.emit('blur');
      await act(async () => {
        settle();
        await press;
      });
      assert.deepEqual(sharing.sheets, [], 'an abandoned Home action cannot open an image sheet');
      assert.deepEqual(
        harness.rn.__recorded.shares,
        [],
        'an abandoned action cannot fall back to text'
      );
    } finally {
      await act(async () => {
        settle();
        await press;
      });
      await view.unmount();
      sharing.availabilityImpl = null;
      sharing.captureImpl = null;
    }
  });
}

for (const releaseFails of [false, true]) {
  test(`a fresh Home share keeps ownership when the abandoned capture settles${releaseFails ? ' and release fails' : ''}`, async () => {
    let finishOld: () => void = () => {};
    let finishFresh: () => void = () => {};
    let oldStarted: () => void = () => {};
    let freshStarted: () => void = () => {};
    const oldEntry = new Promise<void>((resolve) => {
      oldStarted = resolve;
    });
    const freshEntry = new Promise<void>((resolve) => {
      freshStarted = resolve;
    });
    let captures = 0;
    sharing.captureImpl = () =>
      new Promise<string>((resolve) => {
        if (++captures === 1) {
          finishOld = () => resolve('file:///tmp/old-home.png');
          oldStarted();
        } else {
          finishFresh = () => resolve('file:///tmp/fresh-home.png');
          freshStarted();
        }
      });
    sharing.releaseError = releaseFails ? new Error('release failed') : null;
    const view = await renderHome();
    const { operation: first } = await beginHomeShare(view);
    let fresh: Promise<void> | undefined;
    let freshDismiss: () => void = () => {};
    try {
      await oldEntry;
      await act(async () => {
        harness.navigation.emit('blur');
        harness.navigation.emit('focus');
      });
      await view.flush();
      const button = heroes(view).screen.getByRole('button', {
        name: t('home.shareVerseOfTheDay'),
      });
      assert.notEqual(button.props.disabled, true, 'refocusing permits a fresh request');
      const freshShare = await beginHomeShare(view);
      fresh = freshShare.operation;
      freshDismiss = freshShare.onDismiss;
      await freshEntry;
      await act(async () => {
        finishOld();
        await first;
      });
      assert.equal(
        heroes(view).screen.getByRole('button', { name: t('home.shareVerseOfTheDay') }).props
          .disabled,
        true,
        'stale finally cannot clear the fresh pending request'
      );
      assert.deepEqual(sharing.releases, ['file:///tmp/old-home.png']);
      assert.deepEqual(sharing.sheets, []);
      await act(async () => {
        finishFresh();
      });
      await finishEditorDismissal(view, freshDismiss);
      await act(async () => {
        await fresh;
      });
      assert.deepEqual(
        sharing.sheets.map(({ uri }) => uri),
        ['file:///tmp/fresh-home.png']
      );
      assert.deepEqual(
        sharing.releases,
        ['file:///tmp/old-home.png'],
        'native-handed-off capture remains available'
      );
    } finally {
      finishOld();
      finishFresh();
      // Unmounting releases a share still waiting on the editor's close.
      await view.unmount();
      await first;
      await fresh;
    }
  });
}

test('two Home share taps before a render claim only one native preparation', async () => {
  let finish: () => void = () => {};
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let checks = 0;
  sharing.availabilityImpl = () => {
    checks += 1;
    entered();
    return new Promise<boolean>((resolve) => {
      finish = () => resolve(true);
    });
  };
  const view = await renderHome();
  const { editor } = await openShareEditor(view);
  const onDismiss = editor.props.onDismiss as () => void;
  const onPress = editorShareAction(view);
  let first: Promise<void> | undefined;
  let second: Promise<void> | undefined;
  try {
    // Both taps reach the real native control callback before React commits its disabled state.
    await act(async () => {
      first = onPress();
      second = onPress();
    });
    await started;
    assert.equal(checks, 1);
    await act(async () => {
      finish();
    });
    await finishEditorDismissal(view, onDismiss);
    await act(async () => {
      await first;
      await second;
    });
    await view.flush();
    assert.equal(sharing.sheets.length, 1);
    assert.deepEqual(sharing.releases, []);
  } finally {
    finish();
    await view.unmount();
    await first;
    await second;
  }
});

test('a Home capture completed after unmount is released without presenting', async () => {
  let finish: () => void = () => {};
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  sharing.captureImpl = () =>
    new Promise<string>((resolve) => {
      finish = () => resolve('file:///tmp/unmounted-home.png');
      entered();
    });
  const view = await renderHome();
  const { operation: press } = await beginHomeShare(view);
  await started;
  await view.unmount();
  finish();
  await press;
  assert.deepEqual(sharing.sheets, []);
  assert.deepEqual(harness.rn.__recorded.shares, []);
  assert.deepEqual(sharing.releases, ['file:///tmp/unmounted-home.png']);
});

test('a current image sharing error retains the handed-off file and falls back to text', async () => {
  sharing.shareError = new Error('native image share failed');
  const view = await renderHome();
  await shareFromEditor(view, (await openShareEditor(view)).editor);
  assert.equal(sharing.sheets.length, 1);
  assert.deepEqual(harness.rn.__recorded.shares, [
    {
      message: `${shareTitle}\nJohn 3:16\n\n${JOHN_3_16}`,
    },
  ]);
  assert.deepEqual(sharing.releases, [], 'the URI was already handed to native sharing');
  assert.notEqual(
    heroes(view).screen.getByRole('button', { name: t('home.shareVerseOfTheDay') }).props.disabled,
    true
  );
  await view.unmount();
});

test('a current text sharing failure leaves the Home share control ready for retry', async (context) => {
  sharing.available = false;
  context.mock.method(harness.rn.Share, 'share', async () => {
    throw new Error('native text share failed');
  });
  const view = await renderHome();
  await shareFromEditor(view, (await openShareEditor(view)).editor);
  assert.deepEqual(sharing.sheets, []);
  assert.deepEqual(sharing.releases, []);
  assert.notEqual(
    heroes(view).screen.getByRole('button', { name: t('home.shareVerseOfTheDay') }).props.disabled,
    true
  );
  await view.unmount();
});

test('current translation audio job ticks do not redraw Home cards', async () => {
  await renderHome();
  const mark = harness.renders.mark();
  for (let progress = 10; progress < 20; progress++) {
    await replaceTranslations(['bsb'], {
      activeDownloadJob: {
        id: 'audio-job',
        kind: 'translation-audio',
        state: 'running',
        progress,
        startedAt: 0,
        updatedAt: progress,
      },
    });
  }
  assert.equal(harness.renders.count(mark), 0);
  assert.deepEqual(verseLoads, ['bsb']);
});

test('current translation audio completion and catalog availability still update Listen', async () => {
  dailyScripture = await todaysVerse();
  network.offline = true;
  const view = await renderHome();
  assert.equal(listenButton(view), null);
  await replaceTranslations(['bsb'], { downloadedAudioBooks: [dailyScripture.bookId] });
  await view.flush();
  assert.ok(listenButton(view));
  await replaceTranslations(['bsb'], { hasAudio: false });
  await view.flush();
  assert.equal(listenButton(view), null);
  await replaceTranslations(['bsb'], { hasAudio: true });
  await view.flush();
  assert.ok(listenButton(view));
});

test('a current translation catalog rename updates the borrowed passage prompt', async () => {
  bibleStore.setState({ currentTranslation: 'npiulb' });
  dailyScripture = verseOf({ fallbackTranslationId: 'bsb' });
  const view = await renderHome();
  await replaceTranslations(['npiulb'], { name: 'Updated Nepali Bible' });
  await view.press(
    heroes(view).screen.getByRole('button', { name: t('home.readPassage', { passage: 'John 3' }) })
  );
  assert.equal(
    harness.rn.__recorded.alerts.at(-1)?.title,
    t('home.borrowedPassageTitle', { passage: 'John 3', translation: 'Updated Nepali Bible' })
  );
});

test('borrowed Scripture ignores fallback translation audio job ticks', async () => {
  bibleStore.setState({ currentTranslation: 'npiulb' });
  dailyScripture = verseOf({ fallbackTranslationId: 'bsb' });
  await renderHome();
  const mark = harness.renders.mark();
  for (let progress = 10; progress < 20; progress++) {
    await replaceTranslations(['bsb'], {
      activeDownloadJob: {
        id: 'fallback-audio',
        kind: 'translation-audio',
        state: 'running',
        progress,
        startedAt: 0,
        updatedAt: progress,
      },
    });
  }
  assert.equal(harness.renders.count(mark), 0);
  assert.deepEqual(verseLoads, ['npiulb']);
});

test('borrowed Scripture follows fallback abbreviation and language changes', async () => {
  bibleStore.setState({ currentTranslation: 'npiulb' });
  dailyScripture = verseOf({ fallbackTranslationId: 'bsb' });
  const view = await renderHome();
  await replaceTranslations(['bsb'], { abbreviation: 'NEW', language: 'Nepali' });
  const { screen } = heroes(view);
  assert.ok(screen.getByText(screenEyebrow('John 3:16 · NEW')));
  const { getReadingFontFamily } = await import('../../design/fonts');
  assert.equal(
    flattenStyle(screen.getByText(JOHN_3_16).props.style)?.fontFamily,
    getReadingFontFamily('Nepali')
  );
  sharing.available = false;
  const { editor, picture } = await openShareEditor(view);
  assert.ok(picture.getByText('John 3:16 · NEW'));
  await shareFromEditor(view, editor);
  assert.deepEqual(harness.rn.__recorded.shares.at(-1), {
    message: `${shareTitle}\nJohn 3:16 · NEW\n\n${JOHN_3_16}`,
  });
});

for (const fallbackId of ['bsb', 'unknown-source']) {
  test(`missing dynamic fallback ${fallbackId} retains its source attribution`, async () => {
    bibleStore.setState({
      currentTranslation: 'npiulb',
      translations: bibleTranslations.filter((row) => row.id !== fallbackId),
    });
    dailyScripture = verseOf({ fallbackTranslationId: fallbackId });
    const view = await renderHome();
    const label = fallbackId === 'bsb' ? 'BSB' : 'UNKNOWN-SOURCE';
    const { screen } = heroes(view);
    assert.ok(screen.getByText(screenEyebrow(`John 3:16 · ${label}`)));
    const { picture } = await openShareEditor(view);
    assert.ok(picture.getByText(`John 3:16 · ${label}`));
    const { getReadingFontFamily } = await import('../../design/fonts');
    assert.equal(
      flattenStyle(screen.getByText(JOHN_3_16).props.style)?.fontFamily,
      getReadingFontFamily(fallbackId === 'bsb' ? 'English' : undefined)
    );
  });
}
