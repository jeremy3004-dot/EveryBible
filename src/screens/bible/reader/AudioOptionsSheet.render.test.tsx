import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import {
  hostAncestors,
  installRenderHarness,
  isHiddenFromAccessibility,
  within,
} from '../../../testing/render';
import type {
  BackgroundMusicChoice,
  PlaybackRate,
  RepeatMode,
  RepeatPassage,
  SleepTimerOption,
} from '../../../types/audio';

const harness = installRenderHarness(mock, { width: 375, height: 667 });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// The sheet reads the new settings straight from the audio store; the fake holds just
// those fields, the position the now-playing row ticks with, and recording actions.
const storeCalls: Array<[string, ...unknown[]]> = [];
const audioStore = create(() => ({
  currentTranslationId: null as string | null,
  currentBookId: null as string | null,
  currentChapter: null as number | null,
  currentPosition: 0,
  duration: 0,
  narrationVolume: 1,
  backgroundMusicLevel: 0.5,
  sleepTimerMinutes: null as SleepTimerOption,
  repeatPassage: null as RepeatPassage | null,
  setNarrationVolume: (value: number) => {
    storeCalls.push(['setNarrationVolume', value]);
  },
  setBackgroundMusicLevel: (value: number) => {
    storeCalls.push(['setBackgroundMusicLevel', value]);
  },
  setRepeatMode: (mode: RepeatMode) => {
    storeCalls.push(['setRepeatMode', mode]);
  },
  setRepeatPassage: (passage: RepeatPassage) => {
    storeCalls.push(['setRepeatPassage', passage]);
    audioStore.setState({ repeatPassage: passage });
  },
}));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

// Verse counts come from the reader's own Bible text: Genesis 1 has 31 verses, 2 has 25.
const verseRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ verse: index + 1 }));
const chapterText: Record<string, Array<{ verse: number }>> = {
  'bsb:GEN:1': verseRows(31),
  'bsb:GEN:2': verseRows(25),
};
const chapterRequests: string[] = [];
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getChapter: async (translationId: string, bookId: string, chapter: number) => {
    const key = `${translationId}:${bookId}:${chapter}`;
    chapterRequests.push(key);
    return chapterText[key] ?? [];
  },
});

// Verse timings for the now-playing verse: none unless a test gives the chapter some.
const chapterTimings: Record<string, Record<number, number>> = {};
const timingRequests: string[] = [];
mockModule(mock, sourcePath('services/bible/verseTimestamps.ts'), {
  getChapterTimestamps: async (translationId: string, bookId: string, chapter: number) => {
    const key = `${translationId}:${bookId}:${chapter}`;
    timingRequests.push(key);
    return chapterTimings[key] ?? null;
  },
});

const availability: Partial<Record<BackgroundMusicChoice, string>> = {};
mockModule(mock, sourcePath('hooks/useBackgroundSoundAvailability.ts'), {
  useBackgroundSoundAvailability: () => availability,
});

type Props = ComponentProps<typeof import('./AudioOptionsSheet').AudioOptionsSheet>;

beforeEach(() => {
  audioStore.setState(audioStore.getInitialState(), true);
  storeCalls.length = 0;
  chapterRequests.length = 0;
  timingRequests.length = 0;
  for (const key of Object.keys(chapterTimings)) delete chapterTimings[key];
  for (const key of Object.keys(availability)) delete availability[key as BackgroundMusicChoice];
});

async function renderSheet(overrides: Partial<Props> = {}) {
  const { AudioOptionsSheet } = await import('./AudioOptionsSheet');
  const calls: Array<[string, ...unknown[]]> = [];
  const props: Props = {
    backgroundMusicChoice: 'off',
    changeBackgroundMusicChoice: (choice) => {
      calls.push(['changeBackgroundMusicChoice', choice]);
    },
    changePlaybackRate: async (rate) => {
      calls.push(['changePlaybackRate', rate]);
    },
    handleDownloadCurrentBookAudio: async () => {
      calls.push(['download']);
    },
    handleOpenChapterAudioShareSheet: () => {
      calls.push(['share']);
    },
    isCurrentAudioChapter: true,
    onOpenReadAlong: () => {
      calls.push(['readAlong']);
    },
    playbackRate: 1 as PlaybackRate,
    readerAudioTrack: { translationId: 'bsb', bookId: 'GEN', chapter: 1 },
    repeatMode: 'off',
    setShowAudioOptionsSheet: (next) => {
      calls.push(['setShowAudioOptionsSheet', typeof next === 'function' ? next(true) : next]);
    },
    showAudioOptionsSheet: true,
    sleepTimerRemaining: null,
    startSleepTimer: (option) => {
      calls.push(['startSleepTimer', option]);
    },
    ...overrides,
  };
  const view = await harness.render(<AudioOptionsSheet {...props} />);
  return { view, calls };
}

type View = Awaited<ReturnType<typeof renderSheet>>['view'];

/** The section a heading titles: its nearest ancestor that also holds controls. */
function sectionOf(view: View, heading: string): ReactTestInstance {
  let section: ReactTestInstance | null = view.getByRole('header', { name: heading });
  while (section && within(section).queryAllByRole('button').length === 0) {
    section = section.parent;
  }
  assert.ok(section, `a section under ${heading}`);
  return section;
}

/** The chips under one section heading, as [label, selected]. */
function chipsUnder(view: View, heading: string): Array<[string, boolean]> {
  return within(sectionOf(view, heading))
    .getAllByRole('button')
    .map((chip) => [
      String(chip.props.accessibilityLabel),
      Boolean(chip.props.accessibilityState?.selected),
    ]);
}

const selectedIn = (chips: Array<[string, boolean]>) =>
  chips.filter(([, selected]) => selected).map(([label]) => label);

// ---- Sections --------------------------------------------------------------------

test('the sheet lays out now playing, sound, speed, sleep timer, repeat and the footer', async () => {
  audioStore.setState({
    currentTranslationId: 'bsb',
    currentBookId: 'GEN',
    currentChapter: 1,
    currentPosition: 42_000,
    duration: 190_000,
  });
  const { view } = await renderSheet({ playbackRate: 1.25 as PlaybackRate });

  assert.ok(view.getByRole('header', { name: t('audio.sheetTitle') }));
  assert.ok(view.getByText('Genesis 1'));
  assert.ok(view.getByLabelText(t('audio.elapsedOfTotal', { elapsed: '0:42', total: '3:10' })));
  assert.deepEqual(
    view.getAllByRole('header').map((header) => header.props.children),
    [
      t('audio.sheetTitle'),
      t('audio.soundSection'),
      t('audio.speed'),
      t('audio.sleepTimer'),
      t('audio.repeat'),
    ]
  );

  const soundRow = view.getByRole('button', { name: t('audio.backgroundSound') });
  assert.deepEqual(soundRow.props.accessibilityValue, { text: t('interface.music.off.label') });
  assert.ok(view.getByRole('adjustable', { name: t('audio.voiceVolume'), disabled: false }));
  // Nothing to turn up while no background sound is chosen.
  assert.ok(view.getByRole('adjustable', { name: t('audio.soundVolume'), disabled: true }));

  const speeds = chipsUnder(view, t('audio.speed'));
  assert.deepEqual(
    speeds.map(([label]) => label),
    ['0.75x', '1x', '1.25x', '1.5x', '1.75x', '2x', '2.25x', '2.5x']
  );
  assert.deepEqual(selectedIn(speeds), ['1.25x']);

  assert.deepEqual(
    chipsUnder(view, t('audio.sleepTimer')).map(([label]) => label),
    [
      t('interface.music.off.label'),
      t('interface.minutesShort', { count: 5 }),
      t('interface.minutesShort', { count: 10 }),
      t('interface.minutesShort', { count: 15 }),
      t('interface.minutesShort', { count: 30 }),
      t('interface.minutesShort', { count: 60 }),
      t('audio.sleepTimerEndOfChapter'),
    ]
  );
  assert.deepEqual(chipsUnder(view, t('audio.repeat')), [
    [t('audio.repeatOptionOff'), true],
    [t('audio.repeatOptionChapter'), false],
    [t('audio.repeatOptionBook'), false],
    [t('audio.repeatOptionPassage'), false],
  ]);

  assert.ok(view.getByRole('button', { name: t('bible.shareChapterAudio') }));
  assert.ok(view.getByRole('button', { name: t('bible.downloadBookAudio') }));
});

test('a chapter that is not the one playing shows no clock', async () => {
  const { view } = await renderSheet({ isCurrentAudioChapter: false });

  assert.ok(view.getByText('Genesis 1'));
  assert.equal(view.queryByText(/\d:\d\d \/ /), null);
});

test('where the recording has verse timings, now playing names the verse being spoken', async () => {
  // Genesis 1: verse 9 starts at 40s, verse 10 at 44s.
  chapterTimings['bsb:GEN:1'] = { 1: 0, 9: 40, 10: 44, 11: 50 };
  audioStore.setState({
    currentTranslationId: 'bsb',
    currentBookId: 'GEN',
    currentChapter: 1,
    currentPosition: 45_000,
    duration: 190_000,
  });
  const { view } = await renderSheet();
  await view.flush();

  const reference = view.getByText('Genesis 1:10');
  const clock = view.getByLabelText(t('audio.elapsedOfTotal', { elapsed: '0:45', total: '3:10' }));
  // Above the clock, in the same column.
  const [column] = hostAncestors(reference);
  assert.ok(column);
  assert.deepEqual(within(column).queryAllByType('Text'), [reference, clock]);
  assert.deepEqual(timingRequests, ['bsb:GEN:1']);

  // The verse follows the position.
  await act(async () => {
    audioStore.setState({ currentPosition: 51_000 });
  });
  assert.ok(view.getByText('Genesis 1:11'));
});

test('a recording without verse timings names only the chapter', async () => {
  audioStore.setState({
    currentTranslationId: 'bsb',
    currentBookId: 'GEN',
    currentChapter: 1,
    currentPosition: 45_000,
    duration: 190_000,
  });
  const { view } = await renderSheet();
  await view.flush();

  assert.ok(view.getByText('Genesis 1'));
  assert.equal(view.queryByText(/^Genesis 1:/), null);
});

test('a chapter that is not playing names no verse and looks up no timings', async () => {
  chapterTimings['bsb:GEN:1'] = { 1: 0, 2: 5 };
  const { view } = await renderSheet({ isCurrentAudioChapter: false });
  await view.flush();

  assert.ok(view.getByText('Genesis 1'));
  assert.deepEqual(timingRequests, []);
});

test('position ticks redraw only the now-playing row', async () => {
  chapterTimings['bsb:GEN:1'] = { 1: 0, 9: 40, 10: 44 };
  audioStore.setState({
    currentTranslationId: 'bsb',
    currentBookId: 'GEN',
    currentChapter: 1,
    currentPosition: 45_000,
    duration: 190_000,
  });
  const { view } = await renderSheet();
  await view.flush();

  const mark = harness.renders.mark();
  await act(async () => {
    audioStore.setState({ currentPosition: 46_000 });
  });
  const redrawn = harness.renders.since(mark);
  assert.ok(redrawn.length > 0, 'the clock moved');
  assert.equal(
    redrawn.some((entry) => entry.type === 'TouchableOpacity'),
    false,
    'no control outside the row redrew'
  );
  assert.ok(view.getByText('Genesis 1:10'));
});

test('Read along closes the sheet and opens Read Along', async () => {
  const { view, calls } = await renderSheet();

  const button = view.getByRole('button', { name: t('audio.readAlong') });
  assert.equal(button.props.accessibilityHint, t('audio.readAlongHint'));
  await view.press(button);

  assert.deepEqual(calls, [['setShowAudioOptionsSheet', false], ['readAlong']]);
});

// ---- Chips -----------------------------------------------------------------------

test('speed, sleep timer and repeat chips call their actions', async () => {
  const { view, calls } = await renderSheet();

  await view.press(view.getByRole('button', { name: '1.5x' }));
  await view.press(view.getByRole('button', { name: t('audio.sleepTimerEndOfChapter') }));
  await view.press(view.getByRole('button', { name: t('interface.minutesShort', { count: 30 }) }));
  const repeat = within(sectionOf(view, t('audio.repeat')));
  await view.press(repeat.getByRole('button', { name: t('audio.repeatOptionBook') }));
  await view.press(repeat.getByRole('button', { name: t('audio.repeatOptionOff') }));

  assert.deepEqual(calls, [
    ['changePlaybackRate', 1.5],
    ['startSleepTimer', 'end-of-chapter'],
    ['startSleepTimer', 30],
  ]);
  assert.deepEqual(storeCalls, [
    ['setRepeatMode', 'book'],
    ['setRepeatMode', 'off'],
  ]);
});

test('a running countdown shows the minutes left on its chip', async () => {
  audioStore.setState({ sleepTimerMinutes: 15 });
  const { view } = await renderSheet({ sleepTimerRemaining: 12 });

  const chip = view.getByRole('button', {
    name: t('interface.minutesShort', { count: 15 }),
    selected: true,
  });
  assert.equal(within(chip).getByText(t('interface.minutesShort', { count: 12 })) != null, true);
  assert.deepEqual(chip.props.accessibilityValue, {
    text: t('interface.minutesShort', { count: 12 }),
  });
});

test('end of chapter reads as the active timer while it is set', async () => {
  audioStore.setState({ sleepTimerMinutes: 'end-of-chapter' });
  const { view } = await renderSheet();

  assert.deepEqual(selectedIn(chipsUnder(view, t('audio.sleepTimer'))), [
    t('audio.sleepTimerEndOfChapter'),
  ]);
});

// ---- Sliders ---------------------------------------------------------------------

test('the voice and sound sliders report through the store in whole percents', async () => {
  audioStore.setState({ narrationVolume: 0.8, backgroundMusicLevel: 0.5 });
  const { view } = await renderSheet({ backgroundMusicChoice: 'piano' });

  const voice = view.getByRole('adjustable', { name: t('audio.voiceVolume') });
  assert.equal(voice.props.accessibilityValue.text, '80%');
  await view.fire(voice, 'onAccessibilityAction', { nativeEvent: { actionName: 'increment' } });
  const sound = view.getByRole('adjustable', { name: t('audio.soundVolume'), disabled: false });
  await view.fire(sound, 'onAccessibilityAction', { nativeEvent: { actionName: 'decrement' } });

  assert.deepEqual(storeCalls, [
    ['setNarrationVolume', 0.9],
    ['setBackgroundMusicLevel', 0.4],
  ]);
});

// ---- Passage picker --------------------------------------------------------------

test('choosing Passage opens the picker on the chapter being read, and confirming stores it', async () => {
  const { view } = await renderSheet();

  await view.press(view.getByRole('button', { name: t('audio.repeatOptionPassage') }));
  assert.ok(view.getByRole('header', { name: t('audio.passagePickerTitle') }));
  await view.flush();
  // Opens on the whole chapter, its last verse read from the text.
  assert.ok(view.getByText('Genesis 1:1–31'));

  await view.press(
    view.getByLabelText(t('audio.passageIncrease', { name: t('audio.passageToChapter') }))
  );
  await view.flush();
  assert.ok(view.getByText('Genesis 1:1–2:25'));

  await view.press(
    view.getByLabelText(t('audio.passageIncrease', { name: t('audio.passageFromVerse') }))
  );
  await view.press(view.getByRole('button', { name: t('audio.passageConfirm') }));

  assert.deepEqual(storeCalls, [
    [
      'setRepeatPassage',
      { bookId: 'GEN', start: { chapter: 1, verse: 2 }, end: { chapter: 2, verse: 25 } },
    ],
  ]);
  // Back on the first page, the Passage chip now names the passage.
  assert.ok(view.getByRole('header', { name: t('audio.sheetTitle') }));
  const passageChip = view.getByRole('button', { name: t('audio.repeatOptionPassage') });
  assert.ok(within(passageChip).getByText('Genesis 1:2–2:25'));
  assert.deepEqual(passageChip.props.accessibilityValue, { text: 'Genesis 1:2–2:25' });
});

test('a stored passage reopens the picker where it was left', async () => {
  audioStore.setState({
    repeatPassage: {
      bookId: 'GEN',
      start: { chapter: 1, verse: 3 },
      end: { chapter: 1, verse: 13 },
    },
  });
  const { view } = await renderSheet({ repeatMode: 'passage' });

  const chip = view.getByRole('button', { name: t('audio.repeatOptionPassage'), selected: true });
  assert.ok(within(chip).getByText('Genesis 1:3–13'));
  await view.press(chip);
  await view.flush();
  assert.ok(view.getByText('Genesis 1:3–13'));
  const fromVerse = view.getByRole('adjustable', { name: t('audio.passageFromVerse') });
  assert.deepEqual(fromVerse.props.accessibilityValue, { min: 1, max: 31, now: 3, text: '3' });
});

test('an audio-only translation borrows the bundled text for its verse counts', async () => {
  const { view } = await renderSheet({
    readerAudioTrack: { translationId: 'audio-only', bookId: 'GEN', chapter: 2 },
  });

  await view.press(view.getByRole('button', { name: t('audio.repeatOptionPassage') }));
  await view.flush();
  assert.ok(view.getByText('Genesis 2:1–25'));
  assert.deepEqual(chapterRequests, ['audio-only:GEN:2', 'bsb:GEN:2']);
});

test('back leaves the picker without changing the passage', async () => {
  const { view } = await renderSheet();

  await view.press(view.getByRole('button', { name: t('audio.repeatOptionPassage') }));
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.ok(view.getByRole('header', { name: t('audio.sheetTitle') }));
  assert.deepEqual(storeCalls, []);
});

// ---- Sound library ---------------------------------------------------------------

test('the sound row opens the library: Off, Shuffle, then every catalog sound', async () => {
  const { BACKGROUND_MUSIC_OPTIONS } =
    await import('../../../services/audio/backgroundMusicCatalog');
  const { view } = await renderSheet({ backgroundMusicChoice: 'harp' });

  await view.press(view.getByRole('button', { name: t('audio.backgroundSound') }));
  assert.ok(view.getByRole('header', { name: t('audio.backgroundSound') }));

  const tiles = view
    .getAllByRole('button')
    .filter((button) => button.props.accessibilityState?.selected !== undefined);
  assert.deepEqual(
    tiles.map((tile) => tile.props.accessibilityLabel),
    [
      t('interface.music.off.label'),
      t('interface.music.shuffle.label'),
      ...BACKGROUND_MUSIC_OPTIONS.filter((option) => option.id !== 'off').map((option) =>
        t(`interface.music.${option.id}.label`)
      ),
    ]
  );
  const harp = view.getByRole('button', { name: t('interface.music.harp.label'), selected: true });
  assert.ok(within(harp).getByTestId('sound-tile-selected'));
  assert.ok(view.getByText(t('audio.soundLibraryFootnote')));
});

test('every sound id has an English name, including those not in the catalog yet', async () => {
  const { BACKGROUND_MUSIC_CHOICES } = await import('../../../types/audio');
  for (const choice of BACKGROUND_MUSIC_CHOICES) {
    const key = `interface.music.${choice}.label`;
    assert.notEqual(t(key), key, choice);
  }
});

test('tapping a tile selects that sound', async () => {
  const { view, calls } = await renderSheet();

  await view.press(view.getByRole('button', { name: t('audio.backgroundSound') }));
  await view.press(view.getByRole('button', { name: t('interface.music.shuffle.label') }));
  await view.press(view.getByRole('button', { name: t('interface.music.piano.label') }));

  assert.deepEqual(calls, [
    ['changeBackgroundMusicChoice', 'shuffle'],
    ['changeBackgroundMusicChoice', 'piano'],
  ]);
});

test('sounds still to download carry a cloud badge, and one downloading a spinner', async () => {
  availability.ambient = 'remote';
  availability.flute = 'failed';
  availability.sitar = 'downloading';
  availability.piano = 'cached';
  const { view } = await renderSheet();

  await view.press(view.getByRole('button', { name: t('audio.backgroundSound') }));
  const tile = (choice: BackgroundMusicChoice) =>
    view.getByRole('button', { name: t(`interface.music.${choice}.label`) });

  for (const choice of ['ambient', 'flute'] as const) {
    assert.ok(within(tile(choice)).getByTestId('sound-tile-download-badge'), choice);
    assert.deepEqual(tile(choice).props.accessibilityValue, {
      text: t('audio.soundNotDownloaded'),
    });
  }
  assert.ok(within(tile('sitar')).getByTestId('sound-tile-downloading'));
  assert.equal(tile('sitar').props.accessibilityState.busy, true);
  for (const choice of ['piano', 'harp'] as const) {
    assert.equal(within(tile(choice)).queryByTestId('sound-tile-download-badge'), null, choice);
    assert.equal(tile(choice).props.accessibilityValue, undefined, choice);
  }
});

// ---- Dismissal and footer --------------------------------------------------------

test('Android back leaves a pushed page first, then closes the sheet', async () => {
  const { view, calls } = await renderSheet();
  const [modal] = view.queryAllByType('Modal');

  await view.press(view.getByRole('button', { name: t('audio.backgroundSound') }));
  await view.fire(modal, 'onRequestClose');
  assert.ok(view.getByRole('header', { name: t('audio.sheetTitle') }));
  assert.deepEqual(calls, []);

  await view.fire(modal, 'onRequestClose');
  assert.deepEqual(calls, [['setShowAudioOptionsSheet', false]]);
});

test('Close and the backdrop dismiss it; the backdrop is hidden from the screen reader', async () => {
  const { view, calls } = await renderSheet();
  const [modal] = view.queryAllByType('Modal');
  const [backdrop] = within(modal).queryAllByType('TouchableOpacity');

  assert.equal(isHiddenFromAccessibility(backdrop), true);
  await view.press(backdrop);
  await view.press(view.getByRole('button', { name: t('interface.close') }));
  assert.deepEqual(calls, [
    ['setShowAudioOptionsSheet', false],
    ['setShowAudioOptionsSheet', false],
  ]);
});

test('Share clip opens the share sheet; Download closes the sheet before downloading', async () => {
  const { view, calls } = await renderSheet();

  await view.press(view.getByRole('button', { name: t('bible.shareChapterAudio') }));
  await view.press(view.getByRole('button', { name: t('bible.downloadBookAudio') }));
  assert.deepEqual(calls, [['share'], ['setShowAudioOptionsSheet', false], ['download']]);
});
