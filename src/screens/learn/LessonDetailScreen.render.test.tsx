import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import { FOUNDATION_LESSON_TITLE_KEYS, gatherFoundations } from '../../data/gatherFoundations';
import {
  gatherWisdomCategories,
  WISDOM_LESSON_TITLE_KEYS,
  WISDOM_TITLE_KEYS,
} from '../../data/gatherWisdom';
import type { LessonDetailScreenProps } from '../../navigation/types';
import type { BibleReference } from '../../types/gather';
import { mockBarrel, mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import {
  flattenStyle,
  hostAncestors,
  installRenderHarness,
  textContent,
  within,
} from '../../testing/render';
import {
  createFakeGatherStore,
  distinguishTranslatedCopy,
  drawsArtwork,
  mockSvgForCommonJs,
} from './gatherRenderFixtures';
import { assertDefined } from '../../utils/assertDefined';

const harness = installRenderHarness(mock, { skip: ['react-native-svg'] });
mockSvgForCommonJs(mock);
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);
distinguishTranslatedCopy(harness.i18n, [
  ...Object.values(FOUNDATION_LESSON_TITLE_KEYS),
  ...Object.values(WISDOM_LESSON_TITLE_KEYS),
  ...Object.values(WISDOM_TITLE_KEYS),
]);

const gatherStore = createFakeGatherStore();
mockModule(mock, sourcePath('stores/gatherStore.ts'), { useGatherStore: gatherStore });

const TRANSLATIONS = [
  { id: 'bsb', name: 'Berean Standard Bible', language: 'en' },
  { id: 'web', name: 'World English Bible', language: 'en' },
  { id: 'hincv', name: 'Hindi Contemporary Version', language: 'hi' },
];
const bibleStore = create(() => ({ currentTranslation: 'web', translations: TRANSLATIONS }));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });

const fontScale = { value: 1 };
mockModule(mock, sourcePath('hooks/useFontSize.ts'), {
  useFontSize: () => ({ scale: fontScale.value }),
});

interface PassageCall {
  references: BibleReference[];
  translationId: string;
  resolveBook: (bookId: string) => string;
}
const passageCalls: PassageCall[] = [];
let failPassageLoad = false;
const PASSAGE = [
  {
    label: 'Genesis 1',
    verses: [
      {
        id: 'gen-1-1',
        bookId: 'GEN',
        chapter: 1,
        verse: 1,
        text: 'In the beginning God created the heavens and the earth.',
      },
      {
        id: 'gen-1-2',
        bookId: 'GEN',
        chapter: 1,
        verse: 2,
        text: 'Now the earth was formless and void.',
      },
    ],
  },
];
// The story follows the recording through the whole chapter, as the reader does.
const chapterTimestamps = { value: null as Record<number, number> | null };
mockModule(mock, sourcePath('services/bible/verseTimestamps.ts'), {
  getChapterTimestamps: async () => chapterTimestamps.value,
});
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getChapter: async () => assertDefined(PASSAGE[0], 'PASSAGE[0]').verses,
});
mockModule(mock, sourcePath('services/gather/gatherBibleService.ts'), {
  getPassageText: async (
    references: BibleReference[],
    translationId: string,
    options: { bookNameResolver: (bookId: string) => string }
  ) => {
    passageCalls.push({ references, translationId, resolveBook: options.bookNameResolver });
    if (failPassageLoad) throw new Error('passage unavailable');
    // Blocks name the translation they were read from, as the real service does.
    return PASSAGE.map((block) => ({ ...block, translationId }));
  },
  getPrimaryAudioReference: (references: BibleReference[]) =>
    references[0] ? { bookId: references[0].bookId, chapter: references[0].chapter } : null,
});

const audioUrlCalls: unknown[][] = [];
const audioUrl = { value: 'https://audio.test/web/GEN/1.mp3' as string | null };
mockModule(mock, sourcePath('services/audio/audioService.ts'), {
  getChapterAudioUrl: async (...args: unknown[]) => {
    audioUrlCalls.push(args);
    return audioUrl.value ? { url: audioUrl.value } : null;
  },
});

type StatusListener = (status: Record<string, unknown>) => void;
interface FakeSound {
  calls: { method: string; args: unknown[] }[];
  listener: StatusListener;
  /** Like expo-av: starts as `shouldPlay` asked, then follows playAsync/pauseAsync. */
  isPlaying: boolean;
}
const sounds: { source: unknown; initial: Record<string, unknown>; sound: FakeSound }[] = [];
// Streaming a chapter the device has not downloaded fails when it is offline.
const network = { offline: false, offlineCheck: null as Promise<void> | null };
const initialStatus = { value: null as Record<string, unknown> | null };
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => {
    if (network.offlineCheck) await network.offlineCheck;
    return network.offline;
  },
});
mockPackage(mock, 'expo-av', {
  Audio: {
    setAudioModeAsync: async () => {},
    Sound: {
      createAsync: async (
        source: unknown,
        initial: Record<string, unknown>,
        listener: StatusListener
      ) => {
        if (network.offline) {
          throw new Error('The Internet connection appears to be offline.');
        }
        const calls: FakeSound['calls'] = [];
        let shouldPlay = initial.shouldPlay === true;
        const record =
          (method: string) =>
          async (...args: unknown[]) => {
            calls.push({ method, args });
          };
        const playing =
          (isPlaying: boolean) =>
          async (...args: unknown[]) => {
            await record(isPlaying ? 'playAsync' : 'pauseAsync')(...args);
            shouldPlay = isPlaying;
            sound.isPlaying = isPlaying;
          };
        const sound = {
          calls,
          listener,
          isPlaying: initial.shouldPlay === true,
          playAsync: playing(true),
          pauseAsync: playing(false),
          unloadAsync: async () => {
            await record('unloadAsync')();
            sound.isPlaying = false;
          },
          setRateAsync: record('setRateAsync'),
          setPositionAsync: async (positionMillis: number) => {
            await record('setPositionAsync')(positionMillis);
            // Expo keeps shouldPlay at EOF and reapplies it after a position-only seek.
            sound.isPlaying = shouldPlay;
            listener({
              isLoaded: true,
              isPlaying: shouldPlay,
              shouldPlay,
              positionMillis,
              durationMillis: 60_000,
            });
          },
          stopAsync: async () => {
            await record('stopAsync')();
            shouldPlay = false;
            sound.isPlaying = false;
            listener({
              isLoaded: true,
              isPlaying: false,
              shouldPlay: false,
              positionMillis: 0,
              durationMillis: 60_000,
            });
          },
        };
        sounds.push({ source, initial, sound });
        if (initialStatus.value) listener(initialStatus.value);
        return { sound };
      },
    },
  },
});

beforeEach(() => {
  passageCalls.length = 0;
  failPassageLoad = false;
  audioUrlCalls.length = 0;
  sounds.length = 0;
  network.offline = false;
  network.offlineCheck = null;
  initialStatus.value = null;
  audioUrl.value = 'https://audio.test/web/GEN/1.mp3';
  chapterTimestamps.value = null;
  fontScale.value = 1;
  bibleStore.setState({ currentTranslation: 'web' });
  gatherStore.setState({ completedLessons: {} });
});

const FIRST_LESSON = assertDefined(
  assertDefined(gatherFoundations[0], 'gatherFoundations[0]').lessons[0],
  'gatherFoundations[0].lessons[0]'
);
const gatherWisdomLessons = (wisdomId: string) => {
  const wisdom = gatherWisdomCategories
    .flatMap((category) => category.wisdoms)
    .find((entry) => entry.id === wisdomId);
  assert.ok(wisdom, `wisdom ${wisdomId} exists`);
  return wisdom.lessons;
};
const gatherWisdomLesson = (wisdomId: string) => gatherWisdomLessons(wisdomId)[0];
const FIRST_LESSON_TITLE = () =>
  t(
    assertDefined(
      FOUNDATION_LESSON_TITLE_KEYS[FIRST_LESSON.id],
      'FOUNDATION_LESSON_TITLE_KEYS[FIRST_LESSON.id]'
    )
  );
const PLAY = () => t('interface.playChapterAudio');
const PAUSE = () => t('interface.pauseChapterAudio');
const SETTINGS = () => t('learn.playbackAndText');
const LISTEN = () => t('bible.listen');

async function renderLesson(
  params: LessonDetailScreenProps['route']['params'] = {
    parentId: 'foundation-1',
    lessonId: FIRST_LESSON.id,
    parentType: 'foundation',
  }
) {
  const { LessonDetailScreen } = await import('./LessonDetailScreen');
  const route = { key: 'lesson', name: 'LessonDetail', params };
  const view = await harness.render(
    <LessonDetailScreen
      navigation={harness.navigation.navigation as unknown as LessonDetailScreenProps['navigation']}
      route={route as LessonDetailScreenProps['route']}
    />
  );
  await view.flush();
  return view;
}

type View = Awaited<ReturnType<typeof renderLesson>>;

async function lightPalette() {
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  return createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
}

/** The nearest host View that contains `node`. */
function enclosingView(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && (current.type as unknown) !== 'View') current = current.parent;
  assert.ok(current, 'the element sits inside a View');
  return current;
}

/** The story paragraph: the outermost Text holding every verse. */
function passageParagraph(view: View): ReactTestInstance {
  const paragraph = view
    .queryAllByType('Text')
    .find((node) => /In the beginning[\s\S]*formless and void/.test(textContent(node)));
  assert.ok(paragraph, 'the passage is rendered');
  return paragraph;
}

/** The hero row: display numeral, lesson title and badge. */
const heroRow = (view: View) =>
  enclosingView(enclosingView(view.getByRole('header', { name: FIRST_LESSON_TITLE() })));

test('each verse number is followed by a plain space so it never touches the words', async () => {
  const view = await renderLesson();

  const numbers = view
    .queryAllByType('Text')
    .map((node) => textContent(node))
    .filter((text) => /^\d+\s$/.test(text));
  assert.ok(numbers.length >= 2, 'the story shows its verse numbers');
  // A thin space (U+2009) collapses to nothing in the mono face on device.
  for (const number of numbers) assert.match(number, /^\d+ $/);
});

test('the story text and audio load in the reader’s current translation and locale', async () => {
  const view = await renderLesson();

  assert.equal(passageCalls.length, 1);
  assert.deepEqual(
    assertDefined(passageCalls[0], 'passageCalls[0]').references,
    FIRST_LESSON.references
  );
  assert.equal(assertDefined(passageCalls[0], 'passageCalls[0]').translationId, 'web');
  assert.equal(
    assertDefined(passageCalls[0], 'passageCalls[0]').resolveBook('GEN'),
    t('bible.books.GEN'),
    'book names come from i18n'
  );
  assert.deepEqual(audioUrlCalls, [['web', 'GEN', 1]]);

  assert.ok(view.getByText(`${t('bible.books.GEN')} 1 · World English Bible`));
  assert.ok(view.getByText('In the beginning God created the heavens and the earth.'));
  assert.ok(view.getByText(t('bible.verseCount', { count: 2 })));

  await act(async () => {
    bibleStore.setState({ currentTranslation: 'bsb' });
  });
  await view.flush();
  assert.deepEqual(
    passageCalls.map((call) => call.translationId),
    ['web', 'bsb']
  );
  assert.deepEqual(audioUrlCalls.at(-1), ['bsb', 'GEN', 1]);
  assert.ok(view.getByText(`${t('bible.books.GEN')} 1 · Berean Standard Bible`));
});

test('the header offers only back and the playback sheet: no share button, no read-the-story link', async () => {
  const view = await renderLesson();

  const back = view.getByRole('button', { name: t('common.back') });
  const header = enclosingView(back);
  const headerButtons = within(header)
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel);
  assert.deepEqual(headerButtons, [t('common.back'), SETTINGS()]);

  assert.equal(view.queryByText(t('gather.readTheStory')), null);
  assert.equal(
    view.queryAllByType('Icon').filter((icon) => /share/.test(String(icon.props.name))).length,
    0,
    'no share glyph anywhere in the chrome'
  );

  await view.press(back);
  assert.deepEqual(harness.navigation.calls, [{ method: 'goBack', args: [] }]);
});

test('the lesson chrome draws Lucide glyphs only and leads with the display numeral', async () => {
  const view = await renderLesson();

  assert.equal(view.queryAllByType('Icon').length, 0, 'no Ionicons glyphs');
  const glyphs = new Set(view.queryAllByType('LucideIcon').map((icon) => icon.props.name));
  for (const name of ['Type', 'Play', 'Check']) {
    assert.ok(glyphs.has(name), `${name} glyph`);
  }

  const { typography } = await import('../../design/system');
  const numeral = within(heroRow(view)).getByText('01');
  const numeralStyle = flattenStyle(numeral.props.style);
  assert.equal(numeralStyle?.fontSize, typography.numeralHero.fontSize);
  assert.equal(numeralStyle?.fontFamily, typography.numeralHero.fontFamily);
  assert.ok(view.getByRole('header', { name: FIRST_LESSON_TITLE() }));
  assert.ok(
    view.getByText(
      `${t('gather.foundationLabel', { number: 1 })} · ${t('gather.lessonOfCount', {
        number: 1,
        total: assertDefined(gatherFoundations[0], 'gatherFoundations[0]').lessons.length,
      })}`
    )
  );
});

test('the hero badge draws the parent foundation’s artwork', async () => {
  const view = await renderLesson();
  const hero = heroRow(view);
  assert.ok(within(hero).getByText('01'), 'the row holds the numeral and title');
  assert.ok(drawsArtwork(hero, 'foundation-1'));
});

test('the sections are a shared tablist that scrolls to the section chosen', async () => {
  const view = await renderLesson();

  assert.ok(view.getByRole('tablist', { name: t('learn.sectionTabs') }));
  assert.deepEqual(
    view.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    [t('gather.fellowship'), t('gather.story'), t('gather.application')]
  );
  assert.ok(view.getByRole('tab', { name: t('gather.fellowship'), selected: true }));

  // React 19 hands the screen's ref to the ScrollView fake as a prop; patch the
  // node it resolved to so the scroll command is observable.
  const scroll = assertDefined(
    view.queryAllByType('ScrollView')[0],
    "view.queryAllByType('ScrollView')[0]"
  );
  const scrollRef = view.root.find((node) => node.type === harness.rn.ScrollView).props.ref as {
    current: { scrollTo: (args: unknown) => void };
  };
  const scrolls: unknown[] = [];
  scrollRef.current.scrollTo = (args) => scrolls.push(args);

  const storySection = scroll
    .findAll(
      (node) => (node.type as unknown) === 'View' && typeof node.props.onLayout === 'function'
    )
    .filter(
      (node) =>
        within(node).queryByText(`${t('gather.story')} · ${t('bible.books.GEN')} 1`) !== null
    )
    .at(-1) as ReactTestInstance;
  await view.fire(storySection, 'onLayout', { nativeEvent: { layout: { y: 840 } } });

  await view.press(view.getByRole('tab', { name: t('gather.story') }));
  assert.deepEqual(scrolls, [{ y: 840, animated: true }]);
  assert.ok(view.getByRole('tab', { name: t('gather.story'), selected: true }));
});

test('the floating listen capsule carries the floating shadow and a scrubbable progress rule', async () => {
  const { shadows } = await import('../../design/system');
  const view = await renderLesson();

  const play = view.getByRole('button', { name: PLAY() });
  let capsule = play.parent;
  while (capsule && flattenStyle(capsule.props.style)?.shadowRadius === undefined) {
    capsule = capsule.parent;
  }
  assert.ok(capsule, 'the capsule casts a shadow');
  const style = flattenStyle(capsule.props.style) ?? {};
  for (const [key, value] of Object.entries(shadows.floating)) {
    assert.deepEqual(style[key], value, `floating shadow ${key}`);
  }
  assert.ok(within(capsule).getByRole('progressbar', { name: LISTEN() }));
  assert.ok(within(capsule).getByRole('adjustable', { name: LISTEN() }));
});

test('play starts the chapter at the chosen speed and the same control pauses it', async () => {
  const view = await renderLesson();

  await view.press(view.getByRole('button', { name: PLAY() }));
  assert.equal(sounds.length, 1);
  assert.deepEqual(assertDefined(sounds[0], 'sounds[0]').source, {
    uri: 'https://audio.test/web/GEN/1.mp3',
  });
  assert.equal(
    assertDefined(sounds[0], 'sounds[0]').sound.isPlaying,
    true,
    'the chapter is playing'
  );
  assert.equal(assertDefined(sounds[0], 'sounds[0]').initial.rate, 1);

  await view.press(view.getByRole('button', { name: PAUSE() }));
  assert.equal(
    assertDefined(sounds[0], 'sounds[0]').sound.isPlaying,
    false,
    'the same control pauses it'
  );
  assert.equal(assertDefined(sounds[0], 'sounds[0]').sound.calls.at(-1)?.method, 'pauseAsync');
  assert.ok(view.getByRole('button', { name: PLAY() }));

  await view.press(view.getByRole('button', { name: PLAY() }));
  assert.equal(sounds.length, 1, 'the loaded sound is resumed, not reloaded');
  assert.equal(assertDefined(sounds[0], 'sounds[0]').sound.isPlaying, true);
  assert.deepEqual(assertDefined(sounds[0], 'sounds[0]').sound.calls.at(-1)?.method, 'playAsync');
});

test('natural story completion stays paused at zero until explicit Play restarts it', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const sound = assertDefined(sounds[0], 'sounds[0]').sound;
  assert.equal(sound.isPlaying, true);

  await act(async () => {
    // Native STATE_ENDED stops playback without clearing its shouldPlay intent.
    sound.isPlaying = false;
    sound.listener({
      isLoaded: true,
      isPlaying: false,
      shouldPlay: true,
      didJustFinish: true,
      positionMillis: 60_000,
      durationMillis: 60_000,
    });
  });
  await view.flush();

  assert.equal(sound.isPlaying, false, 'completion must not automatically replay the story');
  assert.deepEqual(sound.calls.at(-1), { method: 'stopAsync', args: [] });
  assert.ok(view.getByRole('button', { name: PLAY() }));
  assert.equal(view.getByRole('progressbar', { name: LISTEN() }).props.accessibilityValue.now, 0);

  await view.press(view.getByRole('button', { name: PLAY() }));
  assert.equal(sounds.length, 1, 'explicit replay uses the recording already rewound to zero');
  assert.equal(sound.isPlaying, true);
  assert.deepEqual(sound.calls.at(-1), { method: 'playAsync', args: [] });
  assert.ok(view.getByRole('button', { name: PAUSE() }));
});

test('offline, play on streamed audio says the reader is offline instead of doing nothing', async () => {
  network.offline = true;
  const view = await renderLesson();

  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();

  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert?.message, t('common.offlineTryAgain'));
  assert.ok(view.getByRole('button', { name: PLAY() }), 'the control stays ready for a retry');
});

test('a failed lesson Play whose offline check settles after source change cannot alert', async () => {
  network.offline = true;
  let releaseOfflineCheck!: () => void;
  network.offlineCheck = new Promise<void>((resolve) => {
    releaseOfflineCheck = resolve;
  });
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await act(async () => bibleStore.setState({ currentTranslation: 'bsb' }));
  await view.flush();
  releaseOfflineCheck();
  await view.flush();
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.ok(view.getByRole('button', { name: PLAY() }));
});

test('a failed lesson Play whose offline check settles after Bible takeover cannot alert', async () => {
  network.offline = true;
  let releaseOfflineCheck!: () => void;
  network.offlineCheck = new Promise<void>((resolve) => {
    releaseOfflineCheck = resolve;
  });
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const { bibleNarrationOwner, claimNarration } =
    await import('../../services/audio/narrationOwnership');
  await act(async () => {
    const bible = claimNarration('bible', bibleNarrationOwner, async () => {});
    await bible.ready;
  });
  releaseOfflineCheck();
  await view.flush();
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.ok(view.getByRole('button', { name: PLAY() }));
});

test('a failed lesson Play whose offline check settles after an explicit Pause cannot alert', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.press(view.getByRole('button', { name: PAUSE() }));
  const sound = assertDefined(sounds[0], 'sounds[0]').sound;
  Object.assign(sound, {
    playAsync: async () => {
      sound.isPlaying = true;
      sound.listener({
        isLoaded: true,
        isPlaying: true,
        positionMillis: 0,
        durationMillis: 60_000,
      });
      throw new Error('play failed');
    },
  });
  network.offline = true;
  let releaseOfflineCheck!: () => void;
  network.offlineCheck = new Promise<void>((resolve) => {
    releaseOfflineCheck = resolve;
  });
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  await view.press(view.getByRole('button', { name: PAUSE() }));
  releaseOfflineCheck();
  await view.flush();
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.ok(view.getByRole('button', { name: PLAY() }));
});

test('without chapter audio the play control and the progress rule are disabled', async () => {
  audioUrl.value = null;
  const view = await renderLesson();

  const play = view.getByRole('button', { name: PLAY(), disabled: true });
  await view.press(play);
  assert.equal(sounds.length, 0);
  assert.equal(view.getByRole('adjustable', { name: LISTEN() }).props.disabled, true);
});

test('choosing a playback speed in the sheet reaches the loaded sound', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));

  await view.press(view.getByRole('button', { name: SETTINGS() }));
  assert.ok(view.getByRole('tablist', { name: t('learn.playbackSpeed') }));
  await view.press(view.getByRole('tab', { name: '1.5×' }));

  assert.deepEqual(assertDefined(sounds[0], 'sounds[0]').sound.calls.at(-1), {
    method: 'setRateAsync',
    args: [1.5, true],
  });
  assert.ok(view.getByRole('tab', { name: '1.5×', selected: true }));
});

test('a released translation recording cannot rewind or pause the new lesson recording', async () => {
  chapterTimestamps.value = { 1: 0, 2: 4 };
  const palette = await lightPalette();
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const previous = assertDefined(sounds[0], 'sounds[0]').sound;

  await act(async () => bibleStore.setState({ currentTranslation: 'bsb' }));
  await view.flush();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const current = assertDefined(sounds[1], 'sounds[1]').sound;
  assert.ok(view.getByRole('button', { name: PAUSE() }));

  await act(async () =>
    current.listener({
      isLoaded: true,
      isPlaying: true,
      positionMillis: 5_000,
      durationMillis: 60_000,
    })
  );
  const currentTime = view.getByRole('progressbar', { name: LISTEN() }).props.accessibilityValue;
  await act(async () =>
    previous.listener({
      isLoaded: true,
      isPlaying: true,
      positionMillis: 1_000,
      durationMillis: 120_000,
    })
  );
  assert.deepEqual(
    view.getByRole('progressbar', { name: LISTEN() }).props.accessibilityValue,
    currentTime
  );
  assert.equal(
    flattenStyle(verseSpan(view, /formless and void/).props.style)?.backgroundColor,
    palette.bibleFollowHighlight
  );

  // A native status callback from the old sound can arrive after it is released.
  await act(async () =>
    previous.listener({
      isLoaded: true,
      isPlaying: false,
      didJustFinish: true,
      positionMillis: 60000,
      durationMillis: 60000,
    })
  );

  assert.deepEqual(
    current.calls.filter((call) => ['setPositionAsync', 'stopAsync'].includes(call.method)),
    []
  );
  assert.ok(view.getByRole('button', { name: PAUSE() }));
  assert.deepEqual(
    view.getByRole('progressbar', { name: LISTEN() }).props.accessibilityValue,
    currentTime
  );
  assert.equal(
    flattenStyle(verseSpan(view, /formless and void/).props.style)?.backgroundColor,
    palette.bibleFollowHighlight
  );
});

test('status emitted during initial load establishes the recording duration', async () => {
  initialStatus.value = {
    isLoaded: true,
    isPlaying: false,
    positionMillis: 0,
    durationMillis: 60_000,
  };
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const rule = view.getByRole('adjustable', { name: LISTEN() });
  await view.fire(rule, 'onLayout', { nativeEvent: { layout: { width: 200 } } });
  await view.fire(rule, 'onPress', { nativeEvent: { locationX: 100 } });
  assert.deepEqual(assertDefined(sounds[0], 'sounds[0]').sound.calls.at(-1), {
    method: 'setPositionAsync',
    args: [30_000],
  });
});

test('a pause finishing for a released recording cannot clear the new recording play state', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  let finishPause!: () => void;
  const paused = new Promise<void>((resolve) => {
    finishPause = resolve;
  });
  Object.assign(assertDefined(sounds[0], 'sounds[0]').sound, { pauseAsync: () => paused });
  await view.press(view.getByRole('button', { name: PAUSE() }));

  await act(async () => bibleStore.setState({ currentTranslation: 'bsb' }));
  await view.flush();
  await view.press(view.getByRole('button', { name: PLAY() }));
  assert.ok(view.getByRole('button', { name: PAUSE() }));

  await act(async () => finishPause());
  assert.ok(view.getByRole('button', { name: PAUSE() }));
});

test('at large text the playback sheet scrolls inside its height cap', async () => {
  harness.setFontScale(2);
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: SETTINGS() }));

  // Speed, text size and the rest stack tall at 2.0; the last control must stay
  // reachable rather than being cut off below the screen.
  const speed = view.getByRole('tablist', { name: t('learn.playbackSpeed') });
  const scroll = hostAncestors(speed).find((node) => (node.type as unknown) === 'ScrollView');
  assert.ok(scroll, 'the sheet body scrolls');
  const surface = hostAncestors(scroll).find((node) => node.props.accessibilityViewIsModal);
  assert.ok(surface, 'inside the sheet surface');
  const maxHeight = Number(flattenStyle(surface.props.style)?.maxHeight);
  assert.ok(maxHeight > 0 && maxHeight < 844 - harness.insets.top, `capped (${maxHeight})`);
});

test('tapping along the progress rule seeks to that point in the chapter', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  await act(async () => {
    assertDefined(sounds[0], 'sounds[0]').sound.listener({
      isLoaded: true,
      positionMillis: 0,
      durationMillis: 60_000,
      isPlaying: true,
    });
  });

  const rule = view.getByRole('adjustable', { name: LISTEN() });
  await view.fire(rule, 'onLayout', { nativeEvent: { layout: { width: 200 } } });
  await view.fire(rule, 'onPress', { nativeEvent: { locationX: 50 } });

  assert.deepEqual(assertDefined(sounds[0], 'sounds[0]').sound.calls.at(-1), {
    method: 'setPositionAsync',
    args: [15_000],
  });
});

/** The Text wrapping one verse's number and words, found by its words. */
function verseSpan(view: View, words: RegExp): ReactTestInstance {
  const span = view
    .queryAllByType('Text')
    .find((node) => node.children.length === 2 && words.test(textContent(node)));
  assert.ok(span, `the verse ${words} is rendered`);
  return span;
}

test('story progress within one verse redraws no story text while highlight changes stay live', async () => {
  chapterTimestamps.value = { 1: 0, 2: 4 };
  const palette = await lightPalette();
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  const tick = async (positionMillis: number, didJustFinish = false) => {
    await act(async () => {
      assertDefined(sounds[0], 'sounds[0]').sound.listener({
        isLoaded: true,
        positionMillis,
        durationMillis: 60_000,
        isPlaying: !didJustFinish,
        didJustFinish,
      });
    });
    await view.flush();
  };
  const highlighted = (words: RegExp) =>
    flattenStyle(verseSpan(view, words).props.style)?.backgroundColor ===
    palette.bibleFollowHighlight;

  await tick(1_000);
  assert.equal(highlighted(/In the beginning/), true);
  const mark = harness.renders.mark();
  await tick(2_000);
  assert.equal(
    harness.renders
      .since(mark)
      .filter(
        (entry) =>
          entry.type === 'Text' &&
          assertDefined(PASSAGE[0], 'PASSAGE[0]').verses.some(
            (verse) => entry.props.children === verse.text
          )
      ).length,
    0
  );

  await tick(5_000);
  assert.equal(highlighted(/In the beginning/), false);
  assert.equal(
    flattenStyle(verseSpan(view, /In the beginning/).props.style)?.backgroundColor,
    'transparent'
  );
  assert.equal(highlighted(/formless/), true);
  await tick(60_000, true);
  assert.equal(highlighted(/formless/), false);
  assert.equal(
    flattenStyle(verseSpan(view, /formless/).props.style)?.backgroundColor,
    'transparent'
  );
});

test('same-verse audio progress redraws none of the question text', async () => {
  chapterTimestamps.value = { 1: 0, 2: 4 };
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  const tick = async (positionMillis: number) => {
    await act(async () =>
      assertDefined(sounds[0], 'sounds[0]').sound.listener({
        isLoaded: true,
        positionMillis,
        durationMillis: 60_000,
        isPlaying: true,
      })
    );
    await view.flush();
  };
  await tick(1_000);
  const mark = harness.renders.mark();
  await tick(2_000);
  const questions = [
    ...[1, 2, 3, 4].map((number) => t(`gather.fellowshipQ${number}`)),
    ...[1, 2, 3, 4, 5, 6, 7].map((number) => t(`gather.applicationQ${number}`)),
  ];
  assert.equal(
    harness.renders
      .since(mark)
      .filter(
        (entry) => entry.type === 'Text' && questions.includes(entry.props.children as string)
      ).length,
    0
  );
});

test('isolated questions retain live theme, locale and replay source', async () => {
  const view = await renderLesson();
  await act(async () => harness.authStore.getState().setPreferences({ theme: 'dark' }));
  await view.flush();
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  assert.equal(
    flattenStyle(view.getByText(t('gather.fellowshipQ1')).props.style)?.color,
    createThemeColors('dark', DEFAULT_APPEARANCE_PALETTE).primaryText
  );

  harness.i18n.addResourceBundle(
    'ne',
    'translation',
    {
      gather: { fellowshipQ1: 'Localized fellowship question' },
      learn: { listenToStoryAgain: 'Localized replay', shareApp: 'Localized share' },
      common: { shareMessage: 'Localized invitation' },
    },
    true,
    true
  );
  await act(async () => {
    await harness.i18n.changeLanguage('ne');
  });
  await view.flush();
  assert.ok(view.getByText('Localized fellowship question'));
  await view.press(view.getByRole('button', { name: 'Localized share' }));
  assert.deepEqual(harness.rn.__recorded.shares.at(-1), {
    message: 'Localized invitation\nhttps://everybible.app',
  });

  audioUrl.value = 'https://audio.test/hincv/GEN/1.mp3';
  await act(async () => bibleStore.setState({ currentTranslation: 'hincv' }));
  await view.flush();
  await view.press(view.getByRole('button', { name: 'Localized replay' }));
  await view.flush();
  assert.deepEqual(sounds.at(-1)?.source, { uri: audioUrl.value });
});

test('the isolated story follows live theme and translation changes', async () => {
  const view = await renderLesson();
  const words = () =>
    view.getByText(
      assertDefined(assertDefined(PASSAGE[0], 'PASSAGE[0]').verses[0], 'PASSAGE[0].verses[0]').text
    );
  const originalColor = flattenStyle(words().props.style)?.color;
  await act(async () => harness.authStore.getState().setPreferences({ theme: 'dark' }));
  await view.flush();
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const dark = createThemeColors('dark', DEFAULT_APPEARANCE_PALETTE);
  assert.equal(flattenStyle(words().props.style)?.color, dark.primaryText);
  assert.notEqual(dark.primaryText, originalColor);

  await act(async () => bibleStore.setState({ currentTranslation: 'hincv' }));
  await view.flush();
  assert.equal(passageCalls.at(-1)?.translationId, 'hincv');
  assert.equal(flattenStyle(passageParagraph(view).props.style)?.fontFamily, undefined);
});

test('the isolated story retries a failed passage load', async () => {
  failPassageLoad = true;
  const view = await renderLesson();
  assert.ok(view.getByText(t('learn.passageLoadFailed')));
  failPassageLoad = false;
  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();
  assert.ok(
    view.getByText(
      assertDefined(assertDefined(PASSAGE[0], 'PASSAGE[0]').verses[0], 'PASSAGE[0].verses[0]').text
    )
  );
  assert.equal(view.queryByText(t('learn.passageLoadFailed')), null);
  assert.equal(passageCalls.length, 2);
});

test('the story highlights the verse the audio is on, following it through the chapter', async () => {
  // Verse 2 starts 4 s in (timings are in seconds).
  chapterTimestamps.value = { 1: 0, 2: 4 };
  const palette = await lightPalette();
  const view = await renderLesson();
  const followed = (words: RegExp) =>
    flattenStyle(verseSpan(view, words).props.style)?.backgroundColor ===
    palette.bibleFollowHighlight;

  assert.equal(followed(/In the beginning/), false, 'nothing is highlighted before playing');

  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  const tick = async (positionMillis: number) => {
    await act(async () => {
      assertDefined(sounds[0], 'sounds[0]').sound.listener({
        isLoaded: true,
        positionMillis,
        durationMillis: 60_000,
        isPlaying: true,
      });
    });
    await view.flush();
  };

  await tick(1_000);
  assert.equal(followed(/In the beginning/), true);
  assert.equal(followed(/formless and void/), false);

  await tick(5_000);
  assert.equal(followed(/In the beginning/), false);
  assert.equal(followed(/formless and void/), true, 'the highlight moves with the audio');

  // The story ends: the sound rewinds and stops, and the highlight clears.
  await act(async () => {
    assertDefined(sounds[0], 'sounds[0]').sound.listener({
      isLoaded: true,
      didJustFinish: true,
      durationMillis: 60_000,
    });
  });
  await view.flush();
  assert.equal(followed(/formless and void/), false);
  assert.deepEqual(assertDefined(sounds[0], 'sounds[0]').sound.calls.at(-1), {
    method: 'stopAsync',
    args: [],
  });
  assert.ok(view.getByRole('button', { name: PLAY() }));
});

/** The section block (fellowship, story, application) holding `node`. */
function sectionOf(node: ReactTestInstance): ReactTestInstance {
  const ancestors = hostAncestors(node);
  const scrollIndex = ancestors.findIndex((entry) => entry.type === harness.rn.ScrollView);
  const section = ancestors
    .slice(0, scrollIndex)
    .filter((entry) => (entry.type as unknown) === 'View' && entry.props.onLayout)
    .at(-1);
  assert.ok(section, 'the node sits in a laid-out section');
  return section;
}

async function layoutStoryForFollowing(view: View) {
  const scrollViewComponent = view.root.find((node) => node.type === harness.rn.ScrollView);
  // Events are delivered to the host element; the ref lives on the component.
  const scrollView = scrollViewComponent.find((node) => (node.type as unknown) === 'ScrollView');
  const scrolls: { y: number }[] = [];
  (
    scrollViewComponent.props.ref as { current: { scrollTo: (args: { y: number }) => void } }
  ).current.scrollTo = (args) => scrolls.push(args);
  const layout = (node: ReactTestInstance, y: number, height = 0) =>
    view.fire(node, 'onLayout', { nativeEvent: { layout: { x: 0, y, width: 390, height } } });

  const paragraph = passageParagraph(view);
  const [block, storyRoot] = hostAncestors(paragraph).filter(
    (entry) => (entry.type as unknown) === 'View' && entry.props.onLayout
  );
  assert.ok(block && storyRoot);
  await layout(sectionOf(paragraph), 1000);
  await layout(sectionOf(view.getByText(t('gather.applicationQ1'))), 5000);
  await layout(storyRoot, 60);
  await layout(block, 0);
  await layout(paragraph, 20);
  // Verse 1 on the first line, verse 2 on a line 400pt further down.
  const [first, second] = assertDefined(PASSAGE[0], 'PASSAGE[0]').verses;
  await view.fire(paragraph, 'onTextLayout', {
    nativeEvent: {
      lines: [
        {
          y: 0,
          text: `${assertDefined(first, 'first').verse}\u2009${assertDefined(first, 'first').text} `,
        },
        {
          y: 400,
          text: `${assertDefined(second, 'second').verse}\u2009${assertDefined(second, 'second').text}`,
        },
      ],
    },
  });
  await layout(scrollView, 0, 800);
  await view.fire(scrollView, 'onScroll', { nativeEvent: { contentOffset: { x: 0, y: 900 } } });
  return { scrollView, scrolls };
}

test('the page scrolls to keep the followed verse in view while the story is on screen', async () => {
  chapterTimestamps.value = { 1: 0, 2: 4 };
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  const { scrolls } = await layoutStoryForFollowing(view);
  const tick = async (positionMillis: number) => {
    await act(async () => {
      assertDefined(sounds[0], 'sounds[0]').sound.listener({
        isLoaded: true,
        positionMillis,
        durationMillis: 60_000,
        isPlaying: true,
      });
    });
    await view.flush();
  };

  await tick(1_000);
  assert.deepEqual(scrolls, [], 'verse 1 is already comfortably in view');

  await tick(5_000);
  // Verse 2 sits at 1000 + 60 + 20 + 400 = 1480, below the band; it is brought up to a third of
  // the 800pt viewport.
  assert.deepEqual(scrolls, [{ y: 1480 - 240, animated: true }]);
});

test('the page stays put while the reader holds it or reads the questions', async () => {
  chapterTimestamps.value = { 1: 0, 2: 4, 3: 8 };
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  const { scrollView, scrolls } = await layoutStoryForFollowing(view);
  const tick = async (positionMillis: number) => {
    await act(async () => {
      assertDefined(sounds[0], 'sounds[0]').sound.listener({
        isLoaded: true,
        positionMillis,
        durationMillis: 60_000,
        isPlaying: true,
      });
    });
    await view.flush();
  };

  await view.fire(scrollView, 'onScrollBeginDrag');
  await tick(5_000);
  assert.deepEqual(scrolls, [], 'no tug-of-war with a finger on the page');
  await view.fire(scrollView, 'onScrollEndDrag');

  // Scrolled down to the application questions: the story no longer fills the screen.
  await tick(1_000);
  await view.fire(scrollView, 'onScroll', { nativeEvent: { contentOffset: { x: 0, y: 4800 } } });
  await tick(5_000);
  assert.deepEqual(scrolls, []);
});

test('without verse timings the highlight is estimated from the length of each verse', async () => {
  const palette = await lightPalette();
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.flush();
  await act(async () => {
    assertDefined(sounds[0], 'sounds[0]').sound.listener({
      isLoaded: true,
      positionMillis: 59_000,
      durationMillis: 60_000,
      isPlaying: true,
    });
  });
  await view.flush();

  assert.equal(
    flattenStyle(verseSpan(view, /formless and void/).props.style)?.backgroundColor,
    palette.bibleFollowHighlight
  );
});

test('the completion pill toggles the lesson in the gather store and fills when complete', async () => {
  const colors = await lightPalette();
  const view = await renderLesson();

  const pill = () => view.getByRole('checkbox', { name: t('gather.markComplete') });
  assert.equal(pill().props.accessibilityState.checked, false);
  assert.ok(within(pill()).getByText(t('gather.complete')));

  await view.press(pill());
  assert.deepEqual(gatherStore.getState().completedLessons['foundation-1'], [FIRST_LESSON.id]);
  assert.equal(pill().props.accessibilityState.checked, true);
  assert.ok(within(pill()).getByText(t('gather.completed')));
  assert.equal(flattenStyle(pill().props.style)?.backgroundColor, colors.successSoft);

  await view.press(pill());
  assert.deepEqual(gatherStore.getState().completedLessons['foundation-1'], []);
  assert.equal(pill().props.accessibilityState.checked, false);
});

test('the story text starts at the global text size and the sheet stepper adjusts it', async () => {
  fontScale.value = 1.2;
  const view = await renderLesson();

  assert.equal(flattenStyle(passageParagraph(view).props.style)?.fontSize, 17 * 1.2);

  await view.press(view.getByRole('button', { name: SETTINGS() }));
  assert.ok(view.getByText('120%'));
  await view.press(view.getByRole('button', { name: t('learn.decreaseTextSize') }));
  assert.ok(view.getByText('110%'), 'steps in tens of percent');
  assert.equal(flattenStyle(passageParagraph(view).props.style)?.fontSize, 17 * 1.1);
  await view.press(view.getByRole('button', { name: t('learn.increaseTextSize') }));
  assert.ok(view.getByText('120%'));
  assert.ok(view.getByRole('button', { name: t('learn.increaseTextSize'), disabled: false }));
  await view.press(view.getByRole('button', { name: t('learn.increaseTextSize') }));
  assert.ok(view.getByText('130%'));
  assert.ok(view.getByRole('button', { name: t('learn.increaseTextSize'), disabled: true }));
  assert.equal(flattenStyle(passageParagraph(view).props.style)?.fontSize, 17 * 1.3);
});

test('Latin-script translations read in the serif; other scripts fall back to the platform face', async () => {
  const latin = await renderLesson();
  const latinFamily = flattenStyle(passageParagraph(latin).props.style)?.fontFamily;
  assert.equal(typeof latinFamily, 'string');
  await latin.unmount();

  bibleStore.setState({ currentTranslation: 'hincv' });
  const hindi = await renderLesson();
  assert.equal(flattenStyle(passageParagraph(hindi).props.style)?.fontFamily, undefined);
});

test('fellowship and application questions are numbered panels in the order a meeting asks them', async () => {
  const view = await renderLesson();
  const questionKeys = [
    ...[1, 2, 3, 4].map((n) => `gather.fellowshipQ${n}`),
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => `gather.applicationQ${n}`),
  ];
  const rendered = view
    .queryAllByType('Text')
    .map((node) => textContent(node))
    .filter((text) => questionKeys.some((key) => t(key) === text));
  assert.deepEqual(
    rendered,
    questionKeys.map((key) => t(key))
  );

  const fellowshipRow = enclosingView(enclosingView(view.getByText(t('gather.fellowshipQ2'))));
  assert.ok(within(fellowshipRow).getByText('02'), 'each question carries its ordinal');
  const applicationRow = enclosingView(enclosingView(view.getByText(t('gather.applicationQ7'))));
  assert.ok(within(applicationRow).getByText('07'), 'application numbering restarts at 01');
});

test('the application prompts offer to replay the story and to share the app', async () => {
  const view = await renderLesson();

  const scrollRef = view.root.find((node) => node.type === harness.rn.ScrollView).props.ref as {
    current: { scrollTo: (args: unknown) => void };
  };
  const scrolls: unknown[] = [];
  scrollRef.current.scrollTo = (args) => scrolls.push(args);

  await view.press(view.getByRole('button', { name: t('learn.listenToStoryAgain') }));
  await view.flush();
  assert.equal(scrolls.length, 1, 'jumps back to the story');
  assert.equal(sounds.length, 1, 'and starts the chapter audio');
  assert.equal(assertDefined(sounds[0], 'sounds[0]').sound.isPlaying, true);

  // The invitation has to carry somewhere to get the app: the message on its own
  // leaves the friend with nothing to tap.
  await view.press(view.getByRole('button', { name: t('learn.shareApp') }));
  assert.deepEqual(harness.rn.__recorded.shares, [
    { message: `${t('common.shareMessage')}\nhttps://everybible.app` },
  ]);
});

test('a wisdom lesson titles itself by the wisdom and draws the wisdom’s artwork', async () => {
  const courage = assertDefined(
    gatherWisdomLesson('topic-courage'),
    "gatherWisdomLesson('topic-courage')"
  );
  const view = await renderLesson({
    parentId: 'topic-courage',
    lessonId: courage.id,
    parentType: 'wisdom',
  });

  const title = view.getByRole('header', {
    name: t(
      assertDefined(WISDOM_LESSON_TITLE_KEYS[courage.id], 'WISDOM_LESSON_TITLE_KEYS[courage.id]')
    ),
  });
  assert.ok(
    view.getByText(
      `${t(assertDefined(WISDOM_TITLE_KEYS['topic-courage'], "WISDOM_TITLE_KEYS['topic-courage']"))} · ${t(
        'gather.lessonOfCount',
        {
          number: 1,
          total: gatherWisdomLessons('topic-courage').length,
        }
      )}`
    )
  );
  assert.ok(drawsArtwork(enclosingView(enclosingView(title)), 'topic-courage'));
  assert.equal(drawsArtwork(enclosingView(enclosingView(title)), 'foundation-1'), false);
});

test('an unknown lesson says so and still offers the way back', async () => {
  const view = await renderLesson({
    parentId: 'foundation-1',
    lessonId: 'no-such-lesson',
    parentType: 'foundation',
  });

  assert.ok(view.getByText(t('harvest.lessonNotFound')));
  assert.equal(passageCalls.length, 0);
  assert.equal(audioUrlCalls.length, 0);
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.deepEqual(harness.navigation.calls, [{ method: 'goBack', args: [] }]);
});

test('a Bible playback takeover releases the visible lesson sound and restores its Play control', async () => {
  const { bibleNarrationOwner, claimNarration } =
    await import('../../services/audio/narrationOwnership');
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const lesson = assertDefined(sounds[0], 'sounds[0]').sound;
  assert.equal(lesson.isPlaying, true);

  await act(async () => {
    const bible = claimNarration('bible', bibleNarrationOwner, async () => {});
    await bible.ready;
  });
  await view.flush();
  assert.equal(lesson.isPlaying, false);
  assert.ok(lesson.calls.some((call) => call.method === 'unloadAsync'));
  assert.ok(view.getByRole('button', { name: PLAY() }));
});

test('a delayed lesson Play result cannot restore Pause after a newer Pause', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  await view.press(view.getByRole('button', { name: PAUSE() }));
  const sound = assertDefined(sounds[0], 'sounds[0]').sound;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started!: () => void;
  const observed = new Promise<void>((resolve) => {
    started = resolve;
  });
  Object.assign(sound, {
    playAsync: async () => {
      sound.isPlaying = true;
      sound.listener({
        isLoaded: true,
        isPlaying: true,
        positionMillis: 0,
        durationMillis: 60_000,
      });
      started();
      await pending;
    },
  });
  await view.press(view.getByRole('button', { name: PLAY() }));
  await observed;
  await view.flush();
  assert.ok(view.getByRole('button', { name: PAUSE() }));
  await view.press(view.getByRole('button', { name: PAUSE() }));
  assert.equal(sound.isPlaying, false);
  assert.ok(view.getByRole('button', { name: PLAY() }));
  await act(async () => finish());
  await view.flush();
  assert.ok(view.getByRole('button', { name: PLAY() }), 'old Play cannot rewrite the newer Pause');
});

test('a delayed lesson Pause result cannot hide a newer Play', async () => {
  const view = await renderLesson();
  await view.press(view.getByRole('button', { name: PLAY() }));
  const sound = assertDefined(sounds[0], 'sounds[0]').sound;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let paused!: () => void;
  const observed = new Promise<void>((resolve) => {
    paused = resolve;
  });
  Object.assign(sound, {
    pauseAsync: async () => {
      sound.isPlaying = false;
      sound.listener({
        isLoaded: true,
        isPlaying: false,
        positionMillis: 0,
        durationMillis: 60_000,
      });
      paused();
      await pending;
    },
  });
  await view.press(view.getByRole('button', { name: PAUSE() }));
  await observed;
  await view.flush();
  assert.ok(view.getByRole('button', { name: PLAY() }));
  await view.press(view.getByRole('button', { name: PLAY() }));
  assert.equal(sound.isPlaying, true);
  assert.ok(view.getByRole('button', { name: PAUSE() }));
  await act(async () => finish());
  await view.flush();
  assert.ok(view.getByRole('button', { name: PAUSE() }), 'old Pause cannot rewrite the newer Play');
});
