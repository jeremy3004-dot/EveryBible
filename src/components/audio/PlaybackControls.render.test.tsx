import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../testing/render';
import type { BackgroundMusicChoice, PlaybackRate, SleepTimerOption } from '../../types';

// A small phone (iPhone SE: 375x667pt, 20pt status bar, no home indicator), where
// the option dialogs are likeliest to outgrow the screen at large text.
const WINDOW = { width: 375, height: 667 };
const harness = installRenderHarness(mock, { ...WINDOW, insets: { top: 20, bottom: 0 } });
// The audio and utils barrels pull in the player, downloads and storage; the
// controls only need the bundled music catalogue and the haptic helper.
mockBarrel(mock, 'services/audio/index.ts', { real: ['BACKGROUND_MUSIC_OPTIONS'] });
mockBarrel(mock, 'utils/index.ts', { real: ['mediumHaptic'] });
// The sleep-timer sheet marks the chosen duration from the audio store.
const audioStore = create(() => ({ sleepTimerMinutes: null as number | null }));
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });

const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

type Props = ComponentProps<typeof import('./PlaybackControls').PlaybackControls>;

function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  // Press handlers receive the press event; only the fact of the call matters.
  const on = (name: string) => () => {
    calls.push([name]);
  };
  // Choice handlers receive the chosen value.
  const onValue = (name: string) => (value: unknown) => {
    calls.push([name, value]);
  };
  return { calls, on, onValue };
}

async function renderControls(overrides: Partial<Props> = {}) {
  const { PlaybackControls } = await import('./PlaybackControls');
  const { calls, on, onValue } = recorder();
  const props: Props = {
    status: 'paused',
    playbackRate: 1.0 as PlaybackRate,
    repeatMode: 'off',
    sleepTimerRemaining: null,
    backgroundMusicChoice: 'off',
    hasPreviousChapter: true,
    hasNextChapter: true,
    onPlayPause: on('playPause'),
    onPreviousChapter: on('previous'),
    onNextChapter: on('next'),
    onSkipBackward: on('skipBackward'),
    onSkipForward: on('skipForward'),
    onChangePlaybackRate: onValue('rate') as (rate: PlaybackRate) => void,
    onCycleRepeatMode: on('repeat'),
    onSetSleepTimer: onValue('sleepTimer') as (minutes: SleepTimerOption) => void,
    onChangeBackgroundMusicChoice: onValue('music') as (choice: BackgroundMusicChoice) => void,
    ...overrides,
  };
  const view = await harness.render(<PlaybackControls {...props} />);
  return { view, calls };
}

/** The nearest host element above `node` (skipping the composite wrappers). */
function hostParent(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  assert.ok(current, 'node has a host parent');
  return current;
}

const size = (node: ReactTestInstance) => {
  const style = flattenStyle(node.props.style) ?? {};
  return { width: style.width, height: style.height };
};

test('the default player offers 10-second skips; the chapter-only player drops them', async () => {
  const full = await renderControls();
  await full.view.press(full.view.getByRole('button', { name: t('audio.skipBackward') }));
  await full.view.press(full.view.getByRole('button', { name: t('audio.skipForward') }));
  assert.deepEqual(full.calls, [['skipBackward'], ['skipForward']]);
  await full.view.unmount();

  const chapterOnly = await renderControls({ variant: 'chapter-only' });
  assert.equal(chapterOnly.view.queryByRole('button', { name: t('audio.skipBackward') }), null);
  assert.equal(chapterOnly.view.queryByRole('button', { name: t('audio.skipForward') }), null);
  assert.ok(chapterOnly.view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.ok(chapterOnly.view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.ok(chapterOnly.view.getByRole('button', { name: t('audio.nextChapter') }));
});

test('the chapter-only transport can hide its utility row and keep play, previous and next', async () => {
  const { view } = await renderControls({ variant: 'chapter-only', showUtilityRow: false });

  assert.ok(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.ok(view.getByRole('button', { name: t('audio.nextChapter') }));
  assert.equal(view.queryByRole('button', { name: t('audio.sleepTimer') }), null);
  assert.equal(view.queryByRole('button', { name: t('audio.playbackSpeed') }), null);
});

test('the repeat utility announces the current mode and cycles it when pressed', async () => {
  const off = await renderControls({ repeatMode: 'off' });
  const repeatOff = off.view.getByRole('button', { name: t('audio.repeatOff') });
  // A 38pt icon-only pill widened to the 44pt touch floor.
  assert.deepEqual(repeatOff.props.hitSlop, { top: 4, bottom: 4, left: 3, right: 3 });
  assert.equal(repeatOff.props.accessibilityHint, t('interface.repeatHint'));
  assert.equal(within(repeatOff).queryByText('1'), null);
  await off.view.press(repeatOff);
  assert.deepEqual(off.calls, [['repeat']]);
  await off.view.unmount();

  const chapter = await renderControls({ repeatMode: 'chapter' });
  const repeatChapter = chapter.view.getByRole('button', { name: t('audio.repeatChapter') });
  assert.ok(within(repeatChapter).getByText('1'), 'repeat-one shows a "1" badge');
  await chapter.view.unmount();

  const book = await renderControls({ repeatMode: 'book' });
  assert.ok(book.view.getByRole('button', { name: t('audio.repeatBook') }));
});

test('text and share utilities appear only when their callbacks are given', async () => {
  const { view } = await renderControls();

  assert.equal(view.queryByRole('button', { name: t('audio.showText') }), null);
  assert.equal(view.queryByRole('button', { name: t('bible.shareChapterAudio') }), null);
});

test('the text utility is an icon-only button with a localized fallback label and a hint', async () => {
  const fallback = await renderControls({ onShowText: () => fallback.calls.push(['showText']) });
  const textButton = fallback.view.getByRole('button', { name: t('audio.showText') });
  assert.equal(textButton.props.accessibilityHint, t('audio.showTextHint'));
  assert.equal(within(textButton).queryAllByType('Text').length, 0, 'icon only, no visible text');
  await fallback.view.press(textButton);
  assert.deepEqual(fallback.calls, [['showText']]);
  await fallback.view.unmount();

  const custom = await renderControls({ onShowText: () => {}, showTextLabel: 'Read John 3' });
  assert.ok(custom.view.getByRole('button', { name: 'Read John 3' }));
});

test('the share utility is a labelled share icon in the same centred group as the other utilities', async () => {
  let shared = 0;
  const { view } = await renderControls({
    variant: 'chapter-only',
    onShowText: () => {},
    onShareAudio: () => (shared += 1),
  });

  const share = view.getByRole('button', { name: t('bible.shareChapterAudio') });
  assert.equal(share.props.accessibilityHint, t('interface.shareAudioHint'));
  const [icon] = within(share).queryAllByType('Icon');
  assert.equal(icon.props.name, 'share-outline');
  assert.equal(within(share).queryAllByType('Text').length, 0);

  const sleepTimer = view.getByRole('button', { name: t('audio.sleepTimer') });
  assert.ok(
    hostParent(share) === hostParent(sleepTimer),
    'share sits in the utility group, not beside it'
  );

  await view.press(share);
  assert.equal(shared, 1);
});

test('the six-button utility cluster wraps within the player width on compact screens', async () => {
  const { view } = await renderControls({
    variant: 'chapter-only',
    onShowText: () => {},
    onShareAudio: () => {},
  });

  const sleepTimer = view.getByRole('button', { name: t('audio.sleepTimer') });
  const group = hostParent(sleepTimer);
  const groupStyle = flattenStyle(group.props.style) ?? {};
  assert.equal(groupStyle.flexWrap, 'wrap');
  assert.equal(groupStyle.width, '100%');

  const buttons = group.findAll(
    (node) => typeof node.type === 'string' && hostParent(node) === group
  );
  assert.equal(buttons.length, 6);
  const minimumWidth =
    buttons.reduce((sum, button) => sum + Number(flattenStyle(button.props.style)?.minWidth), 0) +
    Number(groupStyle.gap) * (buttons.length - 1);
  assert.ok(minimumWidth > 320, 'one row would overflow a 320pt phone, so wrapping is needed');
});

test('the background-music utility names the current choice and opens a picker that changes it', async () => {
  const { view, calls } = await renderControls({ backgroundMusicChoice: 'off' });

  const offLabel = t('interface.backgroundMusicLabel', {
    name: t('interface.music.off.label'),
  });
  const musicButton = view.getByRole('button', { name: offLabel });
  assert.equal(musicButton.props.accessibilityHint, t('interface.backgroundMusicHint'));
  assert.equal(within(musicButton).queryAllByType('Icon')[0].props.name, 'musical-notes-outline');
  assert.equal(view.queryByRole('header', { name: t('audio.musicAndSounds') }), null);

  await view.press(musicButton);
  assert.ok(view.getByRole('header', { name: t('audio.musicAndSounds') }));
  assert.ok(view.getByRole('button', { name: /^Off/, selected: true }));

  await view.press(view.getByText(t('interface.music.piano.label')));
  assert.deepEqual(calls, [['music', 'piano']]);
  assert.equal(view.queryByRole('header', { name: t('audio.musicAndSounds') }), null);
});

test('an active background-music choice fills the music icon', async () => {
  const { view } = await renderControls({ backgroundMusicChoice: 'piano' });

  const musicButton = view.getByRole('button', {
    name: t('interface.backgroundMusicLabel', { name: t('interface.music.piano.label') }),
  });
  assert.equal(within(musicButton).queryAllByType('Icon')[0].props.name, 'musical-notes');
});

test('the chapter-only transport enlarges the chapter buttons and makes play dominant', async () => {
  const full = await renderControls();
  assert.deepEqual(size(full.view.getByRole('button', { name: t('audio.previousChapter') })), {
    width: 36,
    height: 36,
  });
  assert.deepEqual(size(full.view.getByRole('button', { name: t('interface.playChapterAudio') })), {
    width: 56,
    height: 56,
  });
  await full.view.unmount();

  const { view } = await renderControls({ variant: 'chapter-only' });
  for (const name of [t('audio.previousChapter'), t('audio.nextChapter')]) {
    assert.deepEqual(size(view.getByRole('button', { name })), { width: 52, height: 52 });
  }
  assert.deepEqual(size(view.getByRole('button', { name: t('interface.playChapterAudio') })), {
    width: 76,
    height: 76,
  });
});

// The listen screen's big control matches the player bar's: an outlined glyph in the
// accent on a soft rounded tile, not a filled disc.
test('the chapter-only play control is the outlined glyph on a tile, switching to pause', async () => {
  const paused = await renderControls({ variant: 'chapter-only' });
  const play = paused.view.getByRole('button', { name: t('interface.playChapterAudio') });
  const style = flattenStyle(play.props.style) ?? {};
  assert.equal(style.borderRadius, 20, 'a rounded tile, not a 38pt-radius disc');
  assert.ok(within(play).getByTestId('outlined-glyph-play'));
  assert.equal(within(play).queryAllByType('Icon').length, 0);
  await paused.view.unmount();

  const playing = await renderControls({ variant: 'chapter-only', status: 'playing' });
  const pause = playing.view.getByRole('button', { name: t('interface.pauseChapterAudio') });
  assert.ok(within(pause).getByTestId('outlined-glyph-pause'));
});

test('a control beside the chapter-only transport gets a mirrored slot, so play stays centred', async () => {
  const { Text } = harness.rn;
  const { view } = await renderControls({
    variant: 'chapter-only',
    transportAccessory: <Text>Selah</Text>,
  });
  const play = view.getByRole('button', { name: t('interface.playChapterAudio') });
  const row = hostAncestors(play)[0];
  const slots = row.children.filter(
    (child): child is ReactTestInstance =>
      typeof child !== 'string' && flattenStyle(child.props.style)?.width === 44
  );
  assert.equal(slots.length, 2);
  assert.equal(row.children[0], slots[0], 'an empty slot leads');
  assert.equal(row.children.at(-1), slots[1], 'the accessory trails');
  assert.ok(within(slots[1]).getByText('Selah'));

  // A slot is kept even when the accessory draws nothing (Selah unavailable).
  await view.unmount();
  const empty = await renderControls({ variant: 'chapter-only', transportAccessory: null });
  const emptyRow = hostAncestors(
    empty.view.getByRole('button', { name: t('interface.playChapterAudio') })
  )[0];
  assert.equal(
    emptyRow.children.filter(
      (child) => typeof child !== 'string' && flattenStyle(child.props.style)?.width === 44
    ).length,
    2
  );
});

test('the transport buttons are named for the screen reader and do what they say', async () => {
  const paused = await renderControls({ status: 'paused' });
  await paused.view.press(paused.view.getByRole('button', { name: t('audio.previousChapter') }));
  await paused.view.press(
    paused.view.getByRole('button', { name: t('interface.playChapterAudio') })
  );
  await paused.view.press(paused.view.getByRole('button', { name: t('audio.nextChapter') }));
  assert.deepEqual(paused.calls, [['previous'], ['playPause'], ['next']]);
  assert.deepEqual(harness.haptics, [{ kind: 'impact', style: 'medium' }]);
  await paused.view.unmount();

  const playing = await renderControls({ status: 'playing' });
  assert.ok(playing.view.getByRole('button', { name: t('interface.pauseChapterAudio') }));
  assert.equal(playing.view.queryByRole('button', { name: t('interface.playChapterAudio') }), null);
});

test('chapter buttons at the ends of the book are announced as disabled and ignore presses', async () => {
  const { view, calls } = await renderControls({
    hasPreviousChapter: false,
    hasNextChapter: false,
  });

  const previous = view.getByRole('button', { name: t('audio.previousChapter'), disabled: true });
  const next = view.getByRole('button', { name: t('audio.nextChapter'), disabled: true });
  await view.press(previous);
  await view.press(next);
  assert.deepEqual(calls, []);
});

test('every option sheet draws under the Android system bars', async () => {
  const { view, calls } = await renderControls();
  const sheets: Array<[string, string]> = [
    [t('audio.sleepTimer'), t('audio.sleepTimer')],
    [t('audio.playbackSpeed'), t('audio.playbackSpeed')],
    [
      t('interface.backgroundMusicLabel', { name: t('interface.music.off.label') }),
      t('audio.musicAndSounds'),
    ],
  ];

  for (const [button, header] of sheets) {
    assert.equal(view.queryAllByType('Modal').length, 0);
    await view.press(view.getByRole('button', { name: button }));
    const [modal] = view.queryAllByType('Modal');
    assert.ok(within(modal).getByRole('header', { name: header }));
    assert.equal(modal.props.statusBarTranslucent, true);
    assert.equal(modal.props.navigationBarTranslucent, true);
    await view.fire(modal, 'onRequestClose');
  }
  assert.deepEqual(calls, []);
});

test('the speed and sleep-timer sheets report the chosen option', async () => {
  const { view, calls } = await renderControls({ playbackRate: 1.0 as PlaybackRate });

  await view.press(view.getByRole('button', { name: t('audio.playbackSpeed') }));
  assert.ok(view.getByRole('button', { name: '1x', selected: true }));
  await view.press(view.getByText('1.5x'));

  await view.press(view.getByRole('button', { name: t('audio.sleepTimer') }));
  await view.press(view.getByText(t('interface.minutesShort', { count: 10 })));

  assert.deepEqual(calls, [
    ['rate', 1.5],
    ['sleepTimer', 10],
  ]);
  assert.equal(view.queryAllByType('Modal').length, 0);
});

// Without an explicit label Android derives a row's name from all of its
// children, and the selected row's Ionicons checkmark is a private-use icon-font
// glyph, so TalkBack heard e.g. "Off, " (seen on the Android release build).
test('option rows in the speed, sleep-timer and music sheets are named by their label alone', async () => {
  const { view } = await renderControls({ playbackRate: 1.0 as PlaybackRate });

  await view.press(view.getByRole('button', { name: t('audio.playbackSpeed') }));
  const speed = view.getAllByRole('button', { selected: true });
  assert.deepEqual(
    speed.map((row) => row.props.accessibilityLabel),
    ['1x']
  );
  await view.press(view.getByText('1.5x'));

  await view.press(view.getByRole('button', { name: t('audio.sleepTimer') }));
  const timer = view.getAllByRole('button', { selected: true });
  assert.deepEqual(
    timer.map((row) => row.props.accessibilityLabel),
    [t('interface.music.off.label')]
  );
  await view.press(view.getByText(t('interface.minutesShort', { count: 10 })));

  await view.press(
    view.getByRole('button', {
      name: t('interface.backgroundMusicLabel', { name: t('interface.music.off.label') }),
    })
  );
  const music = view.getAllByRole('button', { selected: true });
  assert.deepEqual(
    music.map((row) => row.props.accessibilityLabel),
    [`${t('interface.music.off.label')}, ${t('interface.music.off.description')}`]
  );
});

const isScrollView = (node: ReactTestInstance) => (node.type as unknown) === 'ScrollView';

/** Open the dialog behind `button` and return its surface and title. */
async function openDialog(
  view: Awaited<ReturnType<typeof renderControls>>['view'],
  button: string,
  header: string
) {
  await view.press(view.getByRole('button', { name: button }));
  const title = view.getByRole('header', { name: header });
  const surface = hostAncestors(title).find((node) => node.props.accessibilityViewIsModal);
  assert.ok(surface, 'the dialog surface scopes the screen reader');
  return { title, surface };
}

test('at large text on a small phone the sleep-timer dialog fits the safe area and scrolls its options', async () => {
  harness.setFontScale(2);
  const { view, calls } = await renderControls({ sleepTimerRemaining: null });
  const { title, surface } = await openDialog(view, t('audio.sleepTimer'), t('audio.sleepTimer'));

  const style = flattenStyle(surface.props.style) ?? {};
  const maxHeight = Number(style.maxHeight);
  const safeHeight = WINDOW.height - harness.insets.top - harness.insets.bottom;
  assert.ok(maxHeight > safeHeight / 2 && maxHeight < safeHeight, `cap ${maxHeight}`);

  // The dialog is centred inside the safe area, not the whole window.
  const [modal] = view.queryAllByType('Modal');
  const centred = hostAncestors(surface).find(
    (node) => flattenStyle(node.props.style)?.justifyContent === 'center'
  );
  assert.ok(centred && hostAncestors(centred).includes(modal));
  assert.equal(flattenStyle(centred.props.style)?.paddingTop, harness.insets.top + 20);

  // Every option scrolls under a fixed title, and the last one is still pressable.
  const lastOption = view.getByText(t('interface.minutesShort', { count: 60 }));
  const scroll = hostAncestors(lastOption).find(isScrollView);
  assert.ok(scroll, 'the options sit in a scroll view');
  assert.ok(hostAncestors(scroll).includes(surface));
  assert.equal(flattenStyle(scroll.props.style)?.flexShrink, 1);
  assert.equal(hostAncestors(title).find(isScrollView), undefined, 'the title stays put');

  await view.press(lastOption);
  assert.deepEqual(calls, [['sleepTimer', 60]]);
});

test('at large text the speed and music dialogs are bounded and scroll the same way', async () => {
  harness.setFontScale(2);
  const { view } = await renderControls();
  const dialogs: Array<[string, string, string]> = [
    [t('audio.playbackSpeed'), t('audio.playbackSpeed'), '2.5x'],
    [
      t('interface.backgroundMusicLabel', { name: t('interface.music.off.label') }),
      t('audio.musicAndSounds'),
      t('interface.music.ocean-waves.description'),
    ],
  ];

  for (const [button, header, lastText] of dialogs) {
    const { surface } = await openDialog(view, button, header);
    assert.ok(Number(flattenStyle(surface.props.style)?.maxHeight) < WINDOW.height, header);
    const scroll = hostAncestors(view.getByText(lastText)).find(isScrollView);
    assert.ok(scroll && hostAncestors(scroll).includes(surface), `${header} scrolls`);
    await view.fire(view.queryAllByType('Modal')[0], 'onRequestClose');
  }
});

test('while audio loads the play button is busy with a spinner, and the transport ignores presses', async () => {
  const { view, calls } = await renderControls({ status: 'loading' });

  const play = view.getByRole('button', {
    name: t('interface.playChapterAudio'),
    busy: true,
    disabled: true,
  });
  assert.equal(within(play).queryAllByType('ActivityIndicator').length, 1);
  assert.equal(within(play).queryAllByType('Icon').length, 0);
  for (const name of [
    t('audio.previousChapter'),
    t('audio.skipBackward'),
    t('audio.skipForward'),
    t('audio.nextChapter'),
  ]) {
    await view.press(view.getByRole('button', { name, disabled: true }));
  }
  await view.press(play);
  assert.deepEqual(calls, []);
  assert.deepEqual(harness.haptics, []);

  // The utilities stay usable while loading.
  await view.press(view.getByRole('button', { name: t('audio.repeatOff') }));
  assert.deepEqual(calls, [['repeat']]);
});

// A chapter that would not load used to drop back to Play with nothing said: the
// store held the message, but no transport rendered it.
test('a failed load shows why under the transport, announces it once, and Play tries again', async () => {
  const { PlaybackControls } = await import('./PlaybackControls');
  const failed = t('interface.audioPlayFailed');
  const calls: string[] = [];
  const noop = () => {};
  const props: Props = {
    variant: 'chapter-only',
    status: 'error',
    errorMessage: failed,
    playbackRate: 1.0 as PlaybackRate,
    repeatMode: 'off',
    sleepTimerRemaining: null,
    backgroundMusicChoice: 'off',
    hasPreviousChapter: true,
    hasNextChapter: true,
    onPlayPause: () => calls.push('playPause'),
    onPreviousChapter: noop,
    onNextChapter: noop,
    onSkipBackward: noop,
    onSkipForward: noop,
    onChangePlaybackRate: noop,
    onCycleRepeatMode: noop,
    onSetSleepTimer: noop,
    onChangeBackgroundMusicChoice: noop,
  };
  const view = await harness.render(<PlaybackControls {...props} />);

  const notice = view.getByText(failed);
  assert.ok(hostAncestors(notice).some((node) => node.props.accessibilityRole === 'alert'));
  assert.deepEqual(harness.rn.__recorded.announcements, [failed]);
  await view.press(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.deepEqual(calls, ['playPause']);

  // Unrelated redraws do not repeat the announcement.
  await view.rerender(<PlaybackControls {...props} sleepTimerRemaining={5} />);
  assert.deepEqual(harness.rn.__recorded.announcements, [failed]);
});

test('no failure notice is drawn without a message', async () => {
  const failed = t('interface.audioPlayFailed');
  const plain = await renderControls({ status: 'error', errorMessage: null });
  assert.equal(plain.view.queryByText(failed), null);
  assert.deepEqual(harness.rn.__recorded.announcements, []);
});

test('the play icon switches to pause while playing and is nudged right only as play', async () => {
  const paused = await renderControls({ status: 'paused' });
  const [playIcon] = within(
    paused.view.getByRole('button', { name: t('interface.playChapterAudio') })
  ).queryAllByType('Icon');
  assert.equal(playIcon.props.name, 'play');
  assert.equal(flattenStyle(playIcon.props.style)?.marginLeft, 2);
  await paused.view.unmount();

  const playing = await renderControls({ status: 'playing' });
  const [pauseIcon] = within(
    playing.view.getByRole('button', { name: t('interface.pauseChapterAudio') })
  ).queryAllByType('Icon');
  assert.equal(pauseIcon.props.name, 'pause');
  assert.equal(pauseIcon.props.style, undefined);
});

const isGlyphOrText = (node: ReactTestInstance) => ['Icon', 'Text'].includes(String(node.type));

test('the skip buttons show "10" beside their direction arrow', async () => {
  const { view } = await renderControls();
  const back = view.getByRole('button', { name: t('audio.skipBackward') });
  const forward = view.getByRole('button', { name: t('audio.skipForward') });
  assert.deepEqual(
    back.findAll((node) => isGlyphOrText(node)).map((node) => String(node.type)),
    ['Icon', 'Text']
  );
  assert.equal(within(back).queryAllByType('Icon')[0].props.name, 'play-back');
  assert.ok(within(back).getByText('10'));
  assert.deepEqual(
    forward.findAll((node) => isGlyphOrText(node)).map((node) => String(node.type)),
    ['Text', 'Icon']
  );
  assert.equal(within(forward).queryAllByType('Icon')[0].props.name, 'play-forward');
});

test('the chapter-only transport can drop its chapter buttons and keep play', async () => {
  const { view } = await renderControls({ variant: 'chapter-only', showChapterNavigation: false });

  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }), null);
  assert.equal(view.queryByRole('button', { name: t('audio.nextChapter') }), null);
  assert.ok(view.getByRole('button', { name: t('interface.playChapterAudio') }));
});

test('the default transport ignores showChapterNavigation=false', async () => {
  const { view } = await renderControls({ showChapterNavigation: false });
  assert.ok(view.getByRole('button', { name: t('audio.previousChapter') }));
  assert.ok(view.getByRole('button', { name: t('audio.nextChapter') }));
});

test('a running sleep timer shows and announces the minutes left', async () => {
  const { view } = await renderControls({ sleepTimerRemaining: 12 });

  const timer = view.getByRole('button', { name: t('audio.sleepTimer') });
  const minutes = t('interface.minutesShort', { count: 12 });
  assert.deepEqual(timer.props.accessibilityValue, { text: minutes });
  assert.ok(within(timer).getByText(minutes));
  assert.equal(within(timer).queryAllByType('Icon')[0].props.name, 'timer');
});

test('without a sleep timer the button is icon-only with no value', async () => {
  const { view } = await renderControls({ sleepTimerRemaining: null });

  const timer = view.getByRole('button', { name: t('audio.sleepTimer') });
  assert.equal(timer.props.accessibilityValue, undefined);
  assert.equal(within(timer).queryAllByType('Text').length, 0);
  assert.equal(within(timer).queryAllByType('Icon')[0].props.name, 'timer-outline');
});

test('the sleep-timer sheet marks the remembered length while a countdown runs, else Off', async () => {
  audioStore.setState({ sleepTimerMinutes: 30 });
  try {
    const running = await renderControls({ sleepTimerRemaining: 7 });
    await running.view.press(running.view.getByRole('button', { name: t('audio.sleepTimer') }));
    assert.deepEqual(
      running.view
        .getAllByRole('button', { selected: true })
        .map((row) => row.props.accessibilityLabel),
      [t('interface.minutesShort', { count: 30 })]
    );
    await running.view.press(running.view.getByText(t('interface.music.off.label')));
    assert.deepEqual(running.calls, [['sleepTimer', null]]);
    await running.view.unmount();

    const stopped = await renderControls({ sleepTimerRemaining: null });
    await stopped.view.press(stopped.view.getByRole('button', { name: t('audio.sleepTimer') }));
    assert.deepEqual(
      stopped.view
        .getAllByRole('button', { selected: true })
        .map((row) => row.props.accessibilityLabel),
      [t('interface.music.off.label')]
    );
  } finally {
    audioStore.setState({ sleepTimerMinutes: null });
  }
});

test('the speed button shows and announces the current rate', async () => {
  const { view } = await renderControls({ playbackRate: 1.25 as PlaybackRate });

  const speed = view.getByRole('button', { name: t('audio.playbackSpeed') });
  assert.deepEqual(speed.props.accessibilityValue, { text: '1.25x' });
  assert.ok(within(speed).getByText('1.25x'));
  await view.press(speed);
  assert.deepEqual(
    view.getAllByRole('button', { selected: true }).map((row) => row.props.accessibilityLabel),
    ['1.25x']
  );
});

test('the music sheet lists every background layer with its description', async () => {
  const { BACKGROUND_MUSIC_OPTIONS } = await import('../../services/audio/backgroundMusicCatalog');
  const { view } = await renderControls({ backgroundMusicChoice: 'piano' });
  await view.press(
    view.getByRole('button', {
      name: t('interface.backgroundMusicLabel', { name: t('interface.music.piano.label') }),
    })
  );

  assert.ok(view.getByText(t('audio.chooseBackgroundLayer')));
  for (const option of BACKGROUND_MUSIC_OPTIONS) {
    const row = view.getByRole('button', {
      name: `${t(`interface.music.${option.id}.label`)}, ${t(`interface.music.${option.id}.description`)}`,
    });
    assert.equal(row.props.accessibilityState.selected, option.id === 'piano', option.id);
    assert.equal(within(row).queryAllByType('Icon').length, option.id === 'piano' ? 1 : 0);
  }
});

test('the repeat utility press passes no press event through', async () => {
  const received: unknown[][] = [];
  const { view } = await renderControls({
    onCycleRepeatMode: (...args: unknown[]) => {
      received.push(args);
    },
  });
  await view.press(view.getByRole('button', { name: t('audio.repeatOff') }));
  assert.deepEqual(received, [[]]);
});

test('an unknown background-music choice reads as the first option', async () => {
  const { view } = await renderControls({
    backgroundMusicChoice: 'retired-track' as BackgroundMusicChoice,
  });
  assert.ok(
    view.getByRole('button', {
      name: t('interface.backgroundMusicLabel', { name: t('interface.music.off.label') }),
    })
  );
});

// The reader redraws its listen page whenever a position tick crosses into a new
// verse, and both callers hand the controls fresh inline callbacks each time.
// Only the controls whose own values changed may redraw.
test('re-render reach: fresh callbacks redraw nothing, and each change redraws only its control', async () => {
  const { PlaybackControls } = await import('./PlaybackControls');
  const noop = () => {};
  const make = (overrides: Partial<Props> = {}): Props => ({
    status: 'paused',
    playbackRate: 1.0 as PlaybackRate,
    repeatMode: 'off',
    sleepTimerRemaining: null,
    backgroundMusicChoice: 'off',
    hasPreviousChapter: true,
    hasNextChapter: true,
    onPlayPause: () => noop(),
    onPreviousChapter: () => noop(),
    onNextChapter: () => noop(),
    onSkipBackward: () => noop(),
    onSkipForward: () => noop(),
    onChangePlaybackRate: () => noop(),
    onCycleRepeatMode: () => noop(),
    onSetSleepTimer: () => noop(),
    onChangeBackgroundMusicChoice: () => noop(),
    onShowText: () => noop(),
    onShareAudio: () => noop(),
    ...overrides,
  });
  const view = await harness.render(<PlaybackControls {...make()} />);
  const redrawn = async (overrides: Partial<Props>) => {
    const mark = harness.renders.mark();
    await view.rerender(<PlaybackControls {...make(overrides)} />);
    return harness.renders
      .since(mark)
      .filter((entry) => entry.type === 'TouchableOpacity')
      .map((entry) => String(entry.props.accessibilityLabel));
  };

  assert.deepEqual(await redrawn({}), []);
  assert.deepEqual(await redrawn({ sleepTimerRemaining: 5 }), [t('audio.sleepTimer')]);
  assert.deepEqual(await redrawn({ sleepTimerRemaining: 4 }), [t('audio.sleepTimer')]);
  assert.deepEqual(await redrawn({ sleepTimerRemaining: 4, status: 'playing' }), [
    t('interface.pauseChapterAudio'),
  ]);
  assert.deepEqual(
    await redrawn({ sleepTimerRemaining: 4, status: 'playing', playbackRate: 1.5 as PlaybackRate }),
    [t('audio.playbackSpeed')]
  );
  assert.deepEqual(
    await redrawn({
      sleepTimerRemaining: 4,
      status: 'loading',
      playbackRate: 1.5 as PlaybackRate,
    }),
    [
      t('audio.previousChapter'),
      t('audio.skipBackward'),
      t('interface.playChapterAudio'),
      t('audio.skipForward'),
      t('audio.nextChapter'),
    ]
  );

  // The stable handlers still reach the latest callbacks.
  const calls: string[] = [];
  await view.rerender(
    <PlaybackControls
      {...make({ sleepTimerRemaining: 4, playbackRate: 1.5 as PlaybackRate })}
      onPreviousChapter={() => calls.push('previous')}
      onCycleRepeatMode={() => calls.push('repeat')}
    />
  );
  await view.press(view.getByRole('button', { name: t('audio.previousChapter') }));
  await view.press(view.getByRole('button', { name: t('audio.repeatOff') }));
  assert.deepEqual(calls, ['previous', 'repeat']);
});
