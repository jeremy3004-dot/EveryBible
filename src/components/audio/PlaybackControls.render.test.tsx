import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness, within } from '../../testing/render';
import type { BackgroundMusicChoice, PlaybackRate, SleepTimerOption } from '../../types';

const harness = installRenderHarness(mock);
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

test('the utilities-only player shows the utility row and no transport', async () => {
  const { view } = await renderControls({ variant: 'utilities-only' });

  assert.equal(view.queryByRole('button', { name: t('interface.playChapterAudio') }), null);
  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }), null);
  assert.ok(view.getByRole('button', { name: t('audio.sleepTimer') }));
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
    width: 72,
    height: 72,
  });
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
