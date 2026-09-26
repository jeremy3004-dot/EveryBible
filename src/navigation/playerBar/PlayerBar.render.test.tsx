import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  flattenStyle,
  hostAncestors,
  installRenderHarness,
  isHiddenFromAccessibility,
  within,
} from '../../testing/render';
import type { SharedValue } from 'react-native-reanimated';
import type { ReaderPlayerBarControls } from '../../stores/readerPlayerBarStore';
import type { AudioReturnTarget, AudioStatus, BackgroundMusicChoice } from '../../types/audio';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, values?: Record<string, unknown>) => harness.i18n.t(key, values);

// ---- Fakes -------------------------------------------------------------------
const audioStore = create(() => ({
  status: 'idle' as AudioStatus,
  currentTranslationId: null as string | null,
  currentBookId: null as string | null,
  currentChapter: null as number | null,
  currentPosition: 0,
  duration: 0,
  lastPlayedTranslationId: null as string | null,
  audioReturnTarget: null as AudioReturnTarget | null,
  backgroundMusicChoice: 'off' as BackgroundMusicChoice,
}));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

const translationChanges: string[] = [];
const bibleStore = create(() => ({
  currentTranslation: 'bsb',
  setCurrentTranslation: (id: string) => {
    translationChanges.push(id);
  },
}));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });

const navigationCalls: unknown[][] = [];
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => navigationCalls.push(args),
  },
});

let selahToggles = 0;
const selahStore = create(() => ({
  isSelahActive: false,
  canSelah: false,
  toggleSelah: () => {
    selahToggles += 1;
  },
}));
mockModule(mock, sourcePath('hooks/audioPlayer/useSelah.ts'), { useSelah: () => selahStore() });

const transportCalls: string[] = [];
const fakeTransport = {
  playFromRemote: async () => void transportCalls.push('playFromRemote'),
  pause: async () => void transportCalls.push('pause'),
  resume: async () => void transportCalls.push('resume'),
  stop: async () => void transportCalls.push('stop'),
  skipForward: async () => void transportCalls.push('skipForward'),
  skipBackward: async () => void transportCalls.push('skipBackward'),
  seekTo: async () => void transportCalls.push('seekTo'),
  nextChapter: async () => void transportCalls.push('nextChapter'),
  previousChapter: async () => void transportCalls.push('previousChapter'),
};

const readerCalls: string[] = [];
const readerActions = {
  playPause: () => void readerCalls.push('playPause'),
  previous: () => void readerCalls.push('previous'),
  next: () => void readerCalls.push('next'),
  openAudioSheet: () => void readerCalls.push('openAudioSheet'),
};
const readerControls: ReaderPlayerBarControls = {
  showsPlayer: true,
  showPlayButton: true,
  isPlaying: false,
  isLoading: false,
  errorMessage: null,
  hasPrevious: true,
  hasNext: true,
  nextIsCompletion: false,
  nextAccessibilityLabel: 'Goes to the next chapter',
  nextAccessibilityHint: null,
  showsProgress: true,
};

// The reader's shared collapse progress; the fake's shared values are plain boxes.
const progress = { value: 0 } as unknown as SharedValue<number>;

afterEach(async () => {
  const { resetPlayerTransport } = await import('../../hooks/audioPlayer/transportRegistry');
  const { useReaderPlayerBarStore } = await import('../../stores/readerPlayerBarStore');
  resetPlayerTransport();
  useReaderPlayerBarStore.setState(useReaderPlayerBarStore.getInitialState(), true);
  audioStore.setState(audioStore.getInitialState(), true);
  selahStore.setState(selahStore.getInitialState(), true);
  progress.value = 0;
  selahToggles = 0;
  navigationCalls.length = 0;
  translationChanges.length = 0;
  transportCalls.length = 0;
  readerCalls.length = 0;
});

// ---- Helpers -------------------------------------------------------------------
async function publishReader(overrides: Partial<ReaderPlayerBarControls> = {}) {
  const { publishReaderPlayerBar } = await import('../../stores/readerPlayerBarStore');
  await act(async () => {
    publishReaderPlayerBar('reader-route', { ...readerControls, ...overrides }, readerActions);
  });
}

const playingJohn3 = {
  status: 'playing' as AudioStatus,
  currentTranslationId: 'bsb',
  currentBookId: 'JHN',
  currentChapter: 3,
};

async function setAudio(patch: Partial<ReturnType<typeof audioStore.getState>>) {
  await act(async () => {
    audioStore.setState(patch);
  });
}

async function renderBar({
  scope = 'reader',
  followsScroll = true,
  withTabs = true,
}: { scope?: 'reader' | 'app'; followsScroll?: boolean; withTabs?: boolean } = {}) {
  const { PlayerBar } = await import('./PlayerBar');
  const { View, Pressable } = harness.rn;
  const element = () => (
    <PlayerBar
      scope={scope}
      progress={progress}
      followsScroll={followsScroll}
      bottomOffset={22}
      sideInset={16}
      background={<View testID="glass" />}
      tabRow={
        withTabs ? (
          <View testID="tab-row">
            <Pressable accessibilityRole="tab" accessibilityLabel="Home" onPress={() => {}} />
          </View>
        ) : undefined
      }
      tabRowHeight={64}
    />
  );
  const view = await harness.render(element());
  await view.flush();
  return { view, rerender: async () => view.rerender(element()) };
}

type View = Awaited<ReturnType<typeof renderBar>>['view'];

const playName = () => t('interface.playChapterAudio');
const pauseName = () => t('interface.pauseChapterAudio');
const capsuleOf = (view: View) => hostAncestors(view.getByTestId('glass'))[1] as ReactTestInstance;
const heightOf = (node: ReactTestInstance) => flattenStyle(node.props.style)?.height;

// ---- The row on the reader ---------------------------------------------------

test('on the reader the row is the reader’s own transport: play, chapters and the Audio sheet', async () => {
  await publishReader();
  const { view } = await renderBar();

  await view.press(view.getByRole('button', { name: playName() }));
  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));
  await view.press(view.getByRole('button', { name: 'Goes to the next chapter' }));
  await view.press(
    view.getByRole('button', {
      name: t('audio.playerBar.sound', { name: t('interface.music.off.label') }),
    })
  );

  assert.deepEqual(readerCalls, ['playPause', 'previous', 'next', 'openAudioSheet']);
  assert.deepEqual(harness.haptics, [{ kind: 'impact', style: 'medium' }], 'play gives a haptic');
  // No words on the bar: the chapter, verse and time are the screen's to show.
  assert.deepEqual(
    view.queryAllByType('Text').map((node) => node.props.children),
    []
  );
});

test('the capsule stacks the player row and its progress line on the tab row', async () => {
  await publishReader();
  const { view } = await renderBar();
  const { PLAYER_BAR_SECTION_HEIGHT } = await import('../readerTabBarMotion');

  assert.equal(heightOf(capsuleOf(view)), PLAYER_BAR_SECTION_HEIGHT + 64);
  const tabs = hostAncestors(view.getByTestId('tab-row'))[0];
  assert.equal(flattenStyle(tabs.props.style)?.top, PLAYER_BAR_SECTION_HEIGHT);
  // The row reads left to right: sound, previous, play, next (Selah's slot is empty).
  const row = view.getByTestId('player-bar-row');
  assert.deepEqual(
    within(row)
      .queryAllByRole('button')
      .map((node) => node.props.accessibilityLabel),
    [
      t('audio.playerBar.sound', { name: t('interface.music.off.label') }),
      t('audio.previousChapter'),
      playName(),
      'Goes to the next chapter',
    ]
  );
});

test('the play glyph is an outlined triangle or pair of bars on a soft tile, one stroke weight for both', async () => {
  await publishReader();
  const { view } = await renderBar();
  const { OUTLINED_GLYPH_STROKE_WIDTH } =
    await import('../../components/audio/OutlinedPlayPauseGlyph');

  const play = view.getByRole('button', { name: playName() });
  const playGlyph = within(play).getByTestId('outlined-glyph-play');
  const strokes = (glyph: ReactTestInstance) =>
    glyph
      .findAll((node) => typeof node.type === 'string' && node.props.strokeWidth != null)
      .map((node) => node.props.strokeWidth);
  assert.deepEqual(strokes(playGlyph), [OUTLINED_GLYPH_STROKE_WIDTH]);
  assert.equal(playGlyph.props.fill, 'none', 'hollow, not a filled disc');
  const tile = hostAncestors(playGlyph)[0];
  assert.equal(flattenStyle(tile.props.style)?.borderRadius, 12);
  assert.equal(flattenStyle(tile.props.style)?.width, 42);
  assert.equal(isHiddenFromAccessibility(playGlyph), true, 'the button carries the name');

  await publishReader({ isPlaying: true });
  const pause = view.getByRole('button', { name: pauseName() });
  const pauseGlyph = within(pause).getByTestId('outlined-glyph-pause');
  assert.deepEqual(strokes(pauseGlyph), [OUTLINED_GLYPH_STROKE_WIDTH, OUTLINED_GLYPH_STROKE_WIDTH]);
  assert.equal(view.queryByTestId('outlined-glyph-play'), null);
});

test('a loading chapter shows pause, busy and disabled, as the dock did', async () => {
  await publishReader({ isLoading: true });
  const { view } = await renderBar();

  const button = view.getByRole('button', { name: pauseName(), busy: true, disabled: true });
  await view.press(button);
  assert.deepEqual(readerCalls, []);
});

test('chevrons at the ends are announced as disabled, and the plan’s last chapter completes the day', async () => {
  await publishReader({
    hasPrevious: false,
    nextIsCompletion: true,
    nextAccessibilityLabel: t('readingPlans.completeDayCta'),
    nextAccessibilityHint: t('readingPlans.completeDayHint'),
  });
  const { view } = await renderBar();

  const previous = view.getByRole('button', { name: t('audio.previousChapter'), disabled: true });
  await view.press(previous);
  assert.deepEqual(readerCalls, []);

  const complete = view.getByRole('button', { name: t('readingPlans.completeDayCta') });
  assert.equal(complete.props.accessibilityHint, t('readingPlans.completeDayHint'));
  const check = within(complete).queryAllByType('LucideIcon')[0];
  assert.equal(check?.props.name, 'Check');
  // Drawn in the accent, like the play glyph's stroke.
  const accent = view
    .getByTestId('outlined-glyph-play')
    .findAll((node) => typeof node.type === 'string' && node.props.stroke != null)[0]?.props.stroke;
  assert.ok(accent);
  assert.equal(check?.props.color, accent, 'the completion step is drawn in the accent');
  const previousIcon = within(previous).queryAllByType('LucideIcon')[0];
  assert.notEqual(previousIcon?.props.color, accent, 'a plain chevron is ink, not accent');
  await view.press(complete);
  assert.deepEqual(readerCalls, ['next']);
});

test('the hide-play-button preference leaves the chevrons and an empty play slot', async () => {
  await publishReader({ showPlayButton: false });
  const { view } = await renderBar();

  assert.equal(view.queryByRole('button', { name: playName() }), null);
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
});

test('on the audio-only listen screen the bar is only the tab row', async () => {
  await publishReader({ showsPlayer: false });
  const { view } = await renderBar();

  assert.equal(view.queryByTestId('player-bar-row'), null);
  assert.equal(heightOf(capsuleOf(view)), 64);
  assert.equal(flattenStyle(hostAncestors(view.getByTestId('tab-row'))[0].props.style)?.top, 0);
});

test('a failure on the displayed chapter floats above the capsule', async () => {
  const failed = t('interface.audioPlayFailed');
  await publishReader({ errorMessage: failed });
  const { view } = await renderBar();

  assert.ok(view.getByText(failed));
  assert.equal(
    hostAncestors(view.getByText(failed)).some((node) => node === capsuleOf(view)),
    false
  );
});

// ---- The row away from the reader ------------------------------------------------

test('away from the reader the row appears only while a chapter is playing, loading or paused', async () => {
  const { view } = await renderBar({ scope: 'app', followsScroll: false });
  assert.equal(view.queryByTestId('player-bar-row'), null);

  for (const status of ['playing', 'loading', 'paused'] as const) {
    await setAudio({ ...playingJohn3, status });
    assert.ok(view.getByTestId('player-bar-row'), `${status} shows the row`);
  }
  for (const status of ['idle', 'error'] as const) {
    await setAudio({ status });
    assert.equal(view.queryByTestId('player-bar-row'), null, `${status} hides it`);
  }
});

test('away from the reader play/pause and the chevrons drive the playing session', async () => {
  const { registerPlayerTransport } = await import('../../hooks/audioPlayer/transportRegistry');
  registerPlayerTransport(fakeTransport);
  await setAudio(playingJohn3);
  const { view } = await renderBar({ scope: 'app', followsScroll: false });

  await view.press(view.getByRole('button', { name: pauseName() }));
  await setAudio({ status: 'paused' });
  await view.press(view.getByRole('button', { name: playName() }));
  await view.press(view.getByRole('button', { name: t('audio.nextChapter') }));
  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));

  assert.deepEqual(transportCalls, ['pause', 'playFromRemote', 'nextChapter', 'previousChapter']);
});

test('Genesis 1 has no chapter before it, so previous is disabled away from the reader', async () => {
  await setAudio({ ...playingJohn3, currentBookId: 'GEN', currentChapter: 1 });
  const { view } = await renderBar({ scope: 'app', followsScroll: false });

  assert.ok(view.getByRole('button', { name: t('audio.previousChapter'), disabled: true }));
  assert.ok(view.getByRole('button', { name: t('audio.nextChapter'), disabled: false }));
});

test('the sound button and the row’s empty space go back to the playing chapter and its plan', async () => {
  await setAudio({
    ...playingJohn3,
    currentTranslationId: 'web',
    audioReturnTarget: {
      translationId: 'web',
      bookId: 'JHN',
      chapter: 3,
      preferredMode: 'listen',
      planId: 'plan-1',
      planDayNumber: 4,
      returnToPlanOnComplete: true,
    },
  });
  const { view } = await renderBar({ scope: 'app', followsScroll: false });

  const sound = view.getByRole('button', {
    name: t('audio.playerBar.nowPlaying', { reference: 'John 3' }),
  });
  assert.equal(sound.props.accessibilityHint, t('audio.playerBar.returnHint'));
  await view.press(sound);
  const expected = [
    'Bible',
    {
      screen: 'BibleReader',
      params: {
        bookId: 'JHN',
        chapter: 3,
        preferredMode: 'listen',
        planId: 'plan-1',
        planDayNumber: 4,
        returnToPlanOnComplete: true,
      },
    },
  ];
  assert.deepEqual(navigationCalls, [expected]);
  assert.deepEqual(translationChanges, ['web'], 'the reader switches to the playing translation');

  // The row itself (not a screen-reader element) does the same.
  const row = view.getByTestId('player-bar-row');
  const rowPress = row.findAll(
    (node) => typeof node.type === 'string' && node.props.accessible === false
  )[0];
  assert.ok(rowPress);
  await view.press(rowPress);
  assert.deepEqual(navigationCalls, [expected, expected]);
});

// ---- Selah ---------------------------------------------------------------------

test('Selah is offered only while a background sound can carry on under a loaded chapter', async () => {
  await publishReader();
  const { view } = await renderBar();
  assert.equal(view.queryByRole('button', { name: t('audio.playerBar.selah') }), null);

  await act(async () => {
    selahStore.setState({ canSelah: true });
  });
  const selah = view.getByRole('button', { name: t('audio.playerBar.selah'), selected: false });
  assert.equal(selah.props.accessibilityHint, t('audio.playerBar.selahHint'));
  await view.press(selah);
  assert.equal(selahToggles, 1);
});

test('while Selah is on its button is selected, Play leaves Selah and the chip names the sound', async () => {
  await publishReader({ isPlaying: false });
  await setAudio({ ...playingJohn3, status: 'paused', backgroundMusicChoice: 'piano' });
  await act(async () => {
    selahStore.setState({ canSelah: true, isSelahActive: true });
  });
  const { view } = await renderBar();

  assert.ok(view.getByRole('button', { name: t('audio.playerBar.selah'), selected: true }));
  assert.ok(
    view.getByText(t('audio.playerBar.selahChip', { sound: t('interface.music.piano.label') }))
  );
  await view.press(view.getByRole('button', { name: playName() }));
  assert.equal(selahToggles, 1, 'Play fades the reading back in through Selah');
  assert.deepEqual(readerCalls, []);
});

test('the Selah chip belongs to the reader, not the bar on other tabs', async () => {
  await setAudio({ ...playingJohn3, status: 'paused', backgroundMusicChoice: 'piano' });
  await act(async () => {
    selahStore.setState({ canSelah: true, isSelahActive: true });
  });
  const { view } = await renderBar({ scope: 'app', followsScroll: false });

  assert.equal(view.queryByTestId('selah-chip'), null);
});

// ---- Progress line ---------------------------------------------------------------

test('the progress line fills with the chapter and position ticks redraw nothing else', async () => {
  await publishReader({ isPlaying: true });
  await setAudio({ ...playingJohn3, currentPosition: 30_000, duration: 120_000 });
  const { view } = await renderBar();
  const fill = () => flattenStyle(view.getByTestId('player-bar-progress-fill').props.style);
  assert.equal(fill()?.width, '25%');

  const mark = harness.renders.mark();
  await setAudio({ currentPosition: 60_000 });
  assert.equal(fill()?.width, '50%');
  assert.deepEqual(
    [...new Set(harness.renders.since(mark).map((entry) => String(entry.props.testID)))].sort(),
    ['player-bar-progress', 'player-bar-progress-fill']
  );
});

test('another chapter’s progress is not drawn on the reader’s bar', async () => {
  await publishReader({ showsProgress: false });
  await setAudio({ ...playingJohn3, currentPosition: 30_000, duration: 120_000 });
  const { view } = await renderBar();

  assert.equal(flattenStyle(view.getByTestId('player-bar-progress-fill').props.style)?.width, '0%');
});

// ---- Collapse ----------------------------------------------------------------------

test('with audio loaded, scrolling down shrinks the bar into a 38pt strip that keeps the transport', async () => {
  await publishReader({ isPlaying: true });
  await setAudio(playingJohn3);
  progress.value = 1;
  const { view } = await renderBar();
  await view.flush();

  assert.equal(heightOf(capsuleOf(view)), 38);
  assert.equal(flattenStyle(capsuleOf(view).props.style)?.borderRadius, 19);
  // The expanded row and the tabs give up touch and focus; the strip takes them.
  for (const id of ['player-bar-row', 'player-bar-tabs']) {
    const node = view.getByTestId(id);
    assert.equal(isHiddenFromAccessibility(node), true, `${id} hidden`);
    assert.equal(node.props.pointerEvents, 'none');
  }
  assert.equal(view.queryAllByRole('tab').length, 0);
  const strip = view.getByTestId('player-bar-strip');
  assert.equal(isHiddenFromAccessibility(strip), false);
  const buttons = within(strip).queryAllByRole('button');
  assert.deepEqual(
    buttons.map((node) => node.props.accessibilityLabel),
    [
      t('audio.playerBar.sound', { name: t('interface.music.off.label') }),
      t('audio.previousChapter'),
      pauseName(),
      'Goes to the next chapter',
    ]
  );
  for (const button of buttons) {
    const style = flattenStyle(button.props.style) ?? {};
    const slop = button.props.hitSlop as { top: number; bottom: number };
    assert.ok(Number(style.width) >= 44, 'at least 44pt wide');
    assert.ok(Number(style.height) + slop.top + slop.bottom >= 44, 'at least 44pt tall with slop');
  }
  // The glyph sits bare in the strip, without its tile.
  const glyph = within(strip).getByTestId('outlined-glyph-pause');
  assert.equal(hostAncestors(glyph)[0].props.accessibilityRole, 'button');
  // The progress line is the strip's bottom edge.
  const line = hostAncestors(view.getByTestId('player-bar-progress'))[0];
  assert.equal(flattenStyle(line.props.style)?.top, 36);

  await view.press(within(strip).getByRole('button', { name: pauseName() }));
  assert.deepEqual(readerCalls, ['playPause']);
});

test('with nothing loaded, scrolling down hides the whole bar but a hairline that brings it back', async () => {
  await publishReader();
  progress.value = 1;
  const { view } = await renderBar();
  await view.flush();

  const bar = view.getByTestId('player-bar');
  assert.equal(isHiddenFromAccessibility(bar), true);
  assert.equal(bar.props.pointerEvents, 'none');
  assert.deepEqual(flattenStyle(bar.props.style)?.transform, [{ translateY: 58 + 64 + 22 + 4 }]);
  assert.equal(view.queryByRole('button', { name: playName() }), null);
  assert.equal(view.queryAllByRole('tab').length, 0);

  const hairline = view.getByRole('button', { name: t('audio.playerBar.showControls') });
  assert.equal(hairline.props.accessibilityHint, t('audio.playerBar.showControlsHint'));
  assert.ok(Number(flattenStyle(hairline.props.style)?.height) >= 44);
  await view.press(hairline);
  assert.equal(progress.value, 0);
  assert.equal(harness.animations.at(-1)?.kind, 'timing');
});

test('with reduce motion the hairline brings the bar back without animating', async () => {
  harness.setReduceMotion(true);
  await publishReader();
  progress.value = 1;
  const { view } = await renderBar();
  await view.flush();

  await view.press(view.getByRole('button', { name: t('audio.playerBar.showControls') }));
  assert.equal(progress.value, 0);
  assert.deepEqual(harness.animations, []);
});

test('an expanded bar keeps its hairline out of reach', async () => {
  await publishReader();
  const { view } = await renderBar();

  assert.equal(view.queryByRole('button', { name: t('audio.playerBar.showControls') }), null);
  assert.ok(view.getByRole('button', { name: playName() }));
  assert.equal(view.getAllByRole('tab').length, 1);
});

test('a bar that does not follow the reader ignores its scroll', async () => {
  await setAudio(playingJohn3);
  progress.value = 1;
  const { view } = await renderBar({ scope: 'app', followsScroll: false });
  await view.flush();

  assert.equal(heightOf(capsuleOf(view)), 58 + 64);
  assert.equal(isHiddenFromAccessibility(view.getByTestId('player-bar-row')), false);
  assert.equal(view.queryByTestId('player-bar-strip') != null, true);
  assert.equal(isHiddenFromAccessibility(view.getByTestId('player-bar-strip')), true);
});
