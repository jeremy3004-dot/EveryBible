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
  getChapter: async () => PASSAGE[0].verses,
});
mockModule(mock, sourcePath('services/gather/gatherBibleService.ts'), {
  getPassageText: async (
    references: BibleReference[],
    translationId: string,
    options: { bookNameResolver: (bookId: string) => string }
  ) => {
    passageCalls.push({ references, translationId, resolveBook: options.bookNameResolver });
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
const network = { offline: false };
mockModule(mock, sourcePath('utils/connectivity.ts'), {
  isDeviceOffline: async () => network.offline,
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
        const record =
          (method: string) =>
          async (...args: unknown[]) => {
            calls.push({ method, args });
          };
        const playing =
          (isPlaying: boolean) =>
          async (...args: unknown[]) => {
            await record(isPlaying ? 'playAsync' : 'pauseAsync')(...args);
            sound.isPlaying = isPlaying;
          };
        const sound = {
          calls,
          listener,
          isPlaying: initial.shouldPlay === true,
          playAsync: playing(true),
          pauseAsync: playing(false),
          unloadAsync: record('unloadAsync'),
          setRateAsync: record('setRateAsync'),
          setPositionAsync: record('setPositionAsync'),
        };
        sounds.push({ source, initial, sound });
        return { sound };
      },
    },
  },
});

beforeEach(() => {
  passageCalls.length = 0;
  audioUrlCalls.length = 0;
  sounds.length = 0;
  network.offline = false;
  audioUrl.value = 'https://audio.test/web/GEN/1.mp3';
  chapterTimestamps.value = null;
  fontScale.value = 1;
  bibleStore.setState({ currentTranslation: 'web' });
  gatherStore.setState({ completedLessons: {} });
});

const FIRST_LESSON = gatherFoundations[0].lessons[0];
const gatherWisdomLessons = (wisdomId: string) => {
  const wisdom = gatherWisdomCategories
    .flatMap((category) => category.wisdoms)
    .find((entry) => entry.id === wisdomId);
  assert.ok(wisdom, `wisdom ${wisdomId} exists`);
  return wisdom.lessons;
};
const gatherWisdomLesson = (wisdomId: string) => gatherWisdomLessons(wisdomId)[0];
const FIRST_LESSON_TITLE = () => t(FOUNDATION_LESSON_TITLE_KEYS[FIRST_LESSON.id]);
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

test('the story text and audio load in the reader’s current translation and locale', async () => {
  const view = await renderLesson();

  assert.equal(passageCalls.length, 1);
  assert.deepEqual(passageCalls[0].references, FIRST_LESSON.references);
  assert.equal(passageCalls[0].translationId, 'web');
  assert.equal(
    passageCalls[0].resolveBook('GEN'),
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
        total: gatherFoundations[0].lessons.length,
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
  const scroll = view.queryAllByType('ScrollView')[0];
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
  assert.deepEqual(sounds[0].source, { uri: 'https://audio.test/web/GEN/1.mp3' });
  assert.equal(sounds[0].sound.isPlaying, true, 'the chapter is playing');
  assert.equal(sounds[0].initial.rate, 1);

  await view.press(view.getByRole('button', { name: PAUSE() }));
  assert.equal(sounds[0].sound.isPlaying, false, 'the same control pauses it');
  assert.equal(sounds[0].sound.calls.at(-1)?.method, 'pauseAsync');
  assert.ok(view.getByRole('button', { name: PLAY() }));

  await view.press(view.getByRole('button', { name: PLAY() }));
  assert.equal(sounds.length, 1, 'the loaded sound is resumed, not reloaded');
  assert.equal(sounds[0].sound.isPlaying, true);
  assert.deepEqual(sounds[0].sound.calls.at(-1)?.method, 'playAsync');
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

  assert.deepEqual(sounds[0].sound.calls.at(-1), { method: 'setRateAsync', args: [1.5, true] });
  assert.ok(view.getByRole('tab', { name: '1.5×', selected: true }));
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
    sounds[0].sound.listener({
      isLoaded: true,
      positionMillis: 0,
      durationMillis: 60_000,
      isPlaying: true,
    });
  });

  const rule = view.getByRole('adjustable', { name: LISTEN() });
  await view.fire(rule, 'onLayout', { nativeEvent: { layout: { width: 200 } } });
  await view.fire(rule, 'onPress', { nativeEvent: { locationX: 50 } });

  assert.deepEqual(sounds[0].sound.calls.at(-1), { method: 'setPositionAsync', args: [15_000] });
});

/** The Text wrapping one verse's number and words, found by its words. */
function verseSpan(view: View, words: RegExp): ReactTestInstance {
  const span = view
    .queryAllByType('Text')
    .find((node) => node.children.length === 2 && words.test(textContent(node)));
  assert.ok(span, `the verse ${words} is rendered`);
  return span;
}

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
      sounds[0].sound.listener({
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
    sounds[0].sound.listener({ isLoaded: true, didJustFinish: true, durationMillis: 60_000 });
  });
  await view.flush();
  assert.equal(followed(/formless and void/), false);
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
  const [first, second] = PASSAGE[0].verses;
  await view.fire(paragraph, 'onTextLayout', {
    nativeEvent: {
      lines: [
        { y: 0, text: `${first.verse}\u2009${first.text} ` },
        { y: 400, text: `${second.verse}\u2009${second.text}` },
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
      sounds[0].sound.listener({
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
      sounds[0].sound.listener({
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
    sounds[0].sound.listener({
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
  assert.equal(sounds[0].sound.isPlaying, true);

  // The invitation has to carry somewhere to get the app: the message on its own
  // leaves the friend with nothing to tap.
  await view.press(view.getByRole('button', { name: t('learn.shareApp') }));
  assert.deepEqual(harness.rn.__recorded.shares, [
    { message: `${t('common.shareMessage')}\nhttps://everybible.app` },
  ]);
});

test('a wisdom lesson titles itself by the wisdom and draws the wisdom’s artwork', async () => {
  const courage = gatherWisdomLesson('topic-courage');
  const view = await renderLesson({
    parentId: 'topic-courage',
    lessonId: courage.id,
    parentType: 'wisdom',
  });

  const title = view.getByRole('header', { name: t(WISDOM_LESSON_TITLE_KEYS[courage.id]) });
  assert.ok(
    view.getByText(
      `${t(WISDOM_TITLE_KEYS['topic-courage'])} · ${t('gather.lessonOfCount', {
        number: 1,
        total: gatherWisdomLessons('topic-courage').length,
      })}`
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
