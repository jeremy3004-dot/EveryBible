import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import type { BibleTranslation, Verse } from '../../../types';
import { mockBarrel, mockModule, sourcePath } from '../../../testing/mockModules';
import { flattenStyle, installRenderHarness, within } from '../../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// The position Read Along follows, as the player writes it.
const audioStore = create(() => ({
  currentTranslationId: null as string | null,
  currentBookId: null as string | null,
  currentChapter: null as number | null,
  currentPosition: 0,
  duration: 0,
}));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

// John 3's recording: verse 1 at 0s, 2 at 5s, 3 at 12s.
const JOHN_3_TIMINGS = { 1: 0, 2: 5, 3: 12 };
const chapterTimings: Record<string, Record<number, number>> = {};
mockModule(mock, sourcePath('services/bible/verseTimestamps.ts'), {
  getChapterTimestamps: async (translationId: string, bookId: string, chapter: number) =>
    chapterTimings[`${translationId}:${bookId}:${chapter}`] ?? null,
});

const verse = (number: number, text: string): Verse => ({
  id: 43_003_000 + number,
  bookId: 'JHN',
  chapter: 3,
  verse: number,
  text,
});
const JOHN_3 = [
  verse(1, 'Now there was a Pharisee named Nicodemus.'),
  verse(2, 'He came to Jesus at night.'),
  verse(3, 'Jesus replied, “Truly, truly, I tell you.”'),
];
const chapterText: Record<string, Verse[]> = {};
const chapterRequests: string[] = [];
// A test that holds chapter loads releases them itself.
const chapterGate: { held: boolean; release: Array<() => void> } = { held: false, release: [] };
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getChapter: async (translationId: string, bookId: string, chapter: number) => {
    const key = `${translationId}:${bookId}:${chapter}`;
    chapterRequests.push(key);
    if (chapterGate.held) await new Promise<void>((resolve) => chapterGate.release.push(resolve));
    return chapterText[key] ?? [];
  },
});
// useFontSize saves a size change through the sync barrel, which Read Along never does.
mockBarrel(mock, 'services/sync/index.ts', {
  provide: { syncPreferences: async () => ({ success: true }) },
});

const BSB: BibleTranslation = {
  id: 'bsb',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  language: 'English',
  description: '',
  copyright: '',
  isDownloaded: true,
  downloadedBooks: [],
  downloadedAudioBooks: [],
  totalBooks: 66,
  sizeInMB: 0,
  hasText: true,
  hasAudio: true,
  audioGranularity: 'chapter',
};

type Props = ComponentProps<typeof import('./FollowAlongTextSheet').FollowAlongTextSheet>;

beforeEach(() => {
  audioStore.setState(audioStore.getInitialState(), true);
  for (const key of Object.keys(chapterTimings)) delete chapterTimings[key];
  for (const key of Object.keys(chapterText)) delete chapterText[key];
  chapterRequests.length = 0;
  chapterGate.held = false;
  chapterGate.release.length = 0;
});

const playJohn3At = (positionMs: number) =>
  act(async () => {
    audioStore.setState({
      currentTranslationId: 'bsb',
      currentBookId: 'JHN',
      currentChapter: 3,
      currentPosition: positionMs,
      duration: 60_000,
    });
  });

async function renderReadAlong(overrides: Partial<Props> = {}) {
  const { FollowAlongTextSheet } = await import('./FollowAlongTextSheet');
  const calls: string[] = [];
  const props: Props = {
    visible: true,
    onClose: () => calls.push('close'),
    track: { translationId: 'bsb', bookId: 'JHN', chapter: 3 },
    isCurrentAudioChapter: true,
    readerVerses: JOHN_3,
    translation: BSB,
    isPlaying: true,
    hasPreviousChapter: true,
    hasNextChapter: true,
    onPreviousChapter: () => calls.push('previous'),
    onNextChapter: () => calls.push('next'),
    onPlayPause: () => calls.push('playPause'),
    ...overrides,
  };
  const view = await harness.render(<FollowAlongTextSheet {...props} />);
  await view.flush();
  return { view, calls, props };
}

type View = Awaited<ReturnType<typeof renderReadAlong>>['view'];

/** The Text that carries a verse's words (the outer one, around its number). */
function verseText(view: View, number: number): ReactTestInstance {
  const row = view.getByTestId(`read-along-verse-${number}`);
  const texts = within(row).queryAllByType('Text');
  const words = texts.find((node) => node.props.accessibilityRole !== 'header');
  assert.ok(words, `verse ${number} text`);
  return words;
}

const colorOf = (node: ReactTestInstance) => flattenStyle(node.props.style)?.color;
const familyOf = (node: ReactTestInstance) => flattenStyle(node.props.style)?.fontFamily;
const isCurrent = (node: ReactTestInstance) => node.props.accessibilityState?.selected === true;

async function colors() {
  const { createThemeColors } = await import('../../../contexts/ThemeContext');
  const { DEFAULT_APPEARANCE_PALETTE } = await import('../../../constants/appearancePalettes');
  return createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
}

// ---- Highlight -------------------------------------------------------------------

test('the verse being spoken is bright and bolder, the others dimmed', async () => {
  chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
  await playJohn3At(6_000);
  const { view } = await renderReadAlong();
  const palette = await colors();

  const current = verseText(view, 2);
  assert.equal(isCurrent(current), true);
  assert.equal(colorOf(current), palette.biblePrimaryText);
  assert.equal(familyOf(current), 'Lora_600SemiBold');
  for (const other of [1, 3]) {
    const node = verseText(view, other);
    assert.equal(isCurrent(node), false);
    assert.equal(colorOf(node), palette.bibleSecondaryText);
    assert.equal(familyOf(node), 'Lora_400Regular');
  }
  // Each verse carries its number, small, before its words.
  assert.ok(within(view.getByTestId('read-along-verse-2')).getByText('2 '));
  assert.equal(view.queryByText(t('audio.readAlongNoTimings')), null);
});

test('the highlight moves with the position, redrawing only the two verses that change', async () => {
  chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
  await playJohn3At(6_000);
  const { view } = await renderReadAlong();

  const mark = harness.renders.mark();
  await playJohn3At(12_500);
  assert.equal(isCurrent(verseText(view, 3)), true);
  assert.equal(isCurrent(verseText(view, 2)), false);
  const redrawnRows = new Set(
    harness.renders
      .since(mark)
      .filter(
        (entry) =>
          entry.type === 'View' && String(entry.props.testID ?? '').startsWith('read-along-verse')
      )
      .map((entry) => String(entry.props.testID))
  );
  assert.deepEqual([...redrawnRows].sort(), ['read-along-verse-2', 'read-along-verse-3']);

  // A tick inside the same verse redraws no verse at all.
  const tick = harness.renders.mark();
  await playJohn3At(13_000);
  assert.equal(
    harness.renders
      .since(tick)
      .some((entry) => String(entry.props.testID ?? '').startsWith('read-along-verse')),
    false
  );
});

test('a chapter that is not the one playing shows its text without a highlight', async () => {
  chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
  await playJohn3At(6_000);
  const { view } = await renderReadAlong({ isCurrentAudioChapter: false });
  const palette = await colors();

  for (const number of [1, 2, 3]) {
    assert.equal(isCurrent(verseText(view, number)), false);
    assert.equal(colorOf(verseText(view, number)), palette.biblePrimaryText);
  }
});

test('without verse timings the text is shown plain, with a one-line note', async () => {
  await playJohn3At(6_000);
  const { view } = await renderReadAlong();
  const palette = await colors();

  assert.ok(view.getByText(t('audio.readAlongNoTimings')));
  for (const number of [1, 2, 3]) {
    const node = verseText(view, number);
    assert.equal(isCurrent(node), false);
    assert.equal(colorOf(node), palette.biblePrimaryText, 'nothing is dimmed');
  }
});

// ---- Auto-scroll -------------------------------------------------------------------

async function layOut(view: View) {
  const [scroll] = view.queryAllByType('ScrollView');
  assert.ok(scroll);
  await view.fire(scroll, 'onLayout', { nativeEvent: { layout: { height: 600, width: 390 } } });
  for (const [number, y] of [
    [1, 0],
    [2, 900],
    [3, 1_800],
  ] as const) {
    await view.fire(view.getByTestId(`read-along-verse-${number}`), 'onLayout', {
      nativeEvent: { layout: { y, height: 400, width: 390 } },
    });
  }
  return scroll;
}

const scrollCalls = () =>
  harness.refCalls
    .filter((call) => call.type === 'ScrollView' && call.method === 'scrollTo')
    .map((call) => call.args[0] as { y: number; animated: boolean });

test('the current verse is kept in view, a third of the way down', async () => {
  chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
  await playJohn3At(1_000);
  const { view } = await renderReadAlong();
  await layOut(view);
  harness.refCalls.length = 0;

  await playJohn3At(6_000);
  assert.deepEqual(scrollCalls(), [{ y: 900 - 180, animated: true }]);
});

test('with reduce motion the text jumps to the verse instead of gliding', async () => {
  harness.setReduceMotion(true);
  try {
    chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
    await playJohn3At(1_000);
    const { view } = await renderReadAlong();
    await layOut(view);
    harness.refCalls.length = 0;

    await playJohn3At(6_000);
    assert.deepEqual(scrollCalls(), [{ y: 720, animated: false }]);
  } finally {
    harness.setReduceMotion(false);
  }
});

test('a listener who scrolls is left there for a few seconds, then followed again', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { READ_ALONG_MANUAL_SCROLL_PAUSE_MS } = await import('./readAlong/readAlongModel');
  chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
  await playJohn3At(1_000);
  const { view } = await renderReadAlong();
  const scroll = await layOut(view);
  harness.refCalls.length = 0;

  await view.fire(scroll, 'onScrollBeginDrag', {});
  // While the finger is down, nothing moves the text.
  await playJohn3At(6_000);
  assert.deepEqual(scrollCalls(), []);
  await view.fire(scroll, 'onScrollEndDrag', {});

  // Just released: still paused.
  t.mock.timers.setTime(1_000_000 + READ_ALONG_MANUAL_SCROLL_PAUSE_MS - 1);
  await playJohn3At(12_500);
  assert.deepEqual(scrollCalls(), []);

  // The pause has passed: the next verse change brings the reading back into view.
  await playJohn3At(1_000);
  t.mock.timers.setTime(1_000_000 + 2 * READ_ALONG_MANUAL_SCROLL_PAUSE_MS);
  await playJohn3At(6_000);
  assert.deepEqual(scrollCalls(), [{ y: 720, animated: true }]);
});

// ---- Text ------------------------------------------------------------------------

test('an audio-only recording reads along in BSB and says so', async () => {
  chapterText['bsb:JHN:3'] = JOHN_3;
  const audioOnly = { ...BSB, id: 'npi', abbreviation: 'NPI', language: 'Nepali', hasText: false };
  const { view } = await renderReadAlong({
    track: { translationId: 'npi', bookId: 'JHN', chapter: 3 },
    readerVerses: [],
    translation: audioOnly,
  });

  assert.deepEqual(chapterRequests, ['bsb:JHN:3']);
  assert.ok(view.getByText(t('audio.readAlongOtherTranslation', { translation: 'BSB' })));
  assert.ok(view.getByText(/Nicodemus/));
  // BSB is Latin text, so it keeps the reading serif even for a Nepali recording.
  assert.equal(familyOf(verseText(view, 1)), 'Lora_400Regular');
});

test('moving to the next chapter keeps the last text on screen, unfollowed, until the new one loads', async () => {
  chapterTimings['bsb:JHN:3'] = JOHN_3_TIMINGS;
  chapterTimings['bsb:JHN:4'] = { 1: 0 };
  await playJohn3At(6_000);
  const { view, props } = await renderReadAlong();
  assert.equal(isCurrent(verseText(view, 2)), true);

  // The reader moves to John 4 and has no text for it yet.
  chapterGate.held = true;
  chapterText['bsb:JHN:4'] = [
    { ...verse(1, 'Now Jesus learned that the Pharisees had heard.'), chapter: 4 },
  ];
  await act(async () => {
    audioStore.setState({ currentChapter: 4, currentPosition: 0 });
  });
  const { FollowAlongTextSheet } = await import('./FollowAlongTextSheet');
  await view.rerender(
    <FollowAlongTextSheet
      {...props}
      track={{ translationId: 'bsb', bookId: 'JHN', chapter: 4 }}
      readerVerses={[]}
    />
  );
  await view.flush();

  assert.ok(view.getByRole('header', { name: 'John 4' }));
  assert.ok(view.getByText(/Nicodemus/), 'John 3 stays until John 4 arrives');
  for (const number of [1, 2, 3]) assert.equal(isCurrent(verseText(view, number)), false);
  assert.equal(view.queryByText(t('audio.readAlongNoText')), null);

  await act(async () => {
    chapterGate.release.forEach((release) => release());
  });
  await view.flush();
  assert.ok(view.getByText(/Pharisees had heard/));
  assert.equal(view.queryByText(/Nicodemus/), null);
});

test('a chapter with no text anywhere says so instead of showing an empty page', async () => {
  const { view } = await renderReadAlong({ readerVerses: [] });

  assert.ok(view.getByText(t('audio.readAlongNoText')));
});

test('text in a non-Latin script falls back to the platform serif', async () => {
  const hindi = { ...BSB, id: 'hincv', abbreviation: 'HINCV', language: 'Hindi' };
  const { view } = await renderReadAlong({
    track: { translationId: 'hincv', bookId: 'JHN', chapter: 3 },
    translation: hindi,
  });

  assert.equal(familyOf(verseText(view, 1)), undefined);
});

test('the text follows the reader font size', async () => {
  const { view: medium } = await renderReadAlong();
  const mediumSize = flattenStyle(verseText(medium, 1).props.style)?.fontSize as number;
  await medium.unmount();

  harness.authStore.getState().setPreferences({ fontSize: 'large' });
  const { view: large } = await renderReadAlong();
  const largeSize = flattenStyle(verseText(large, 1).props.style)?.fontSize as number;

  assert.ok(mediumSize > 18, 'larger than the reader body text');
  assert.ok(largeSize > mediumSize);
});

// ---- Chrome and controls -------------------------------------------------------------

test('it is a full-screen modal with the chapter title, and Close closes it', async () => {
  const { view, calls } = await renderReadAlong();

  const [modal] = view.queryAllByType('Modal');
  assert.ok(modal);
  assert.equal(modal.props.transparent, undefined, 'full screen, not a sheet over the reader');
  assert.equal(modal.props.animationType, 'slide');
  assert.ok(view.getByRole('header', { name: 'John 3' }));
  assert.ok(view.getByText('BSB'));

  await view.press(view.getByRole('button', { name: t('interface.close') }));
  assert.deepEqual(calls, ['close']);
});

test('Android back and the VoiceOver escape gesture close it too', async () => {
  const { view, calls } = await renderReadAlong();
  const [modal] = view.queryAllByType('Modal');
  assert.ok(modal);

  await act(async () => {
    modal.props.onRequestClose();
  });
  assert.deepEqual(calls, ['close']);
});

test('nothing is drawn while it is closed', async () => {
  const { view } = await renderReadAlong({ visible: false });

  assert.equal(view.queryByRole('header', { name: 'John 3' }), null);
});

test('the controls step chapters and play or pause', async () => {
  const { view, calls, props } = await renderReadAlong();

  assert.ok(view.getByRole('button', { name: t('interface.pauseChapterAudio') }));
  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));
  await view.press(view.getByRole('button', { name: t('interface.pauseChapterAudio') }));
  await view.press(view.getByRole('button', { name: t('audio.nextChapter') }));
  assert.deepEqual(calls, ['previous', 'playPause', 'next']);

  const { FollowAlongTextSheet } = await import('./FollowAlongTextSheet');
  await view.rerender(
    <FollowAlongTextSheet {...props} isPlaying={false} hasPreviousChapter={false} />
  );
  assert.ok(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  const previous = view.getByRole('button', { name: t('audio.previousChapter'), disabled: true });
  await view.press(previous);
  assert.deepEqual(calls, ['previous', 'playPause', 'next']);
});

test('the progress line fills with the played share of the chapter', async () => {
  await playJohn3At(15_000);
  const { view } = await renderReadAlong();

  const line = view.getByTestId('read-along-progress');
  const fill = within(line)
    .queryAllByType('View')
    .find((node) => node !== line);
  assert.equal(flattenStyle(fill?.props.style)?.width, '25%');
});
