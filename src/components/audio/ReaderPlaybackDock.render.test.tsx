import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import {
  flattenStyle,
  installRenderHarness,
  isHiddenFromAccessibility,
} from '../../testing/render';

const harness = installRenderHarness(mock);

const t = (key: string) => harness.i18n.t(key);

type Props = ComponentProps<typeof import('./ReaderPlaybackDock').ReaderPlaybackDock>;

async function renderDock(overrides: Partial<Props> = {}) {
  const { ReaderPlaybackDock } = await import('./ReaderPlaybackDock');
  const calls: string[] = [];
  const props = {
    collapseProgress: { value: 0 },
    isCollapsed: false,
    isPlaying: false,
    isLoading: false,
    hasPreviousChapter: true,
    hasNextChapter: true,
    onPreviousChapter: () => calls.push('previous'),
    onNextChapter: () => calls.push('next'),
    onPlayPause: () => calls.push('playPause'),
    ...overrides,
  } as Props;
  const view = await harness.render(<ReaderPlaybackDock {...props} />);
  return { view, calls };
}

const size = (node: ReactTestInstance) => {
  const style = flattenStyle(node.props.style) ?? {};
  return { width: style.width, height: style.height };
};

/** The animated wrapper around a chapter button: the nearest host ancestor. */
function wrapperOf(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  assert.ok(current);
  return current;
}

const translateYOf = (node: ReactTestInstance) => {
  const transform = (flattenStyle(node.props.style)?.transform ?? []) as Array<
    Record<string, number>
  >;
  return transform.find((entry) => 'translateY' in entry)?.translateY;
};

test('the dock draws fixed reference-sized discs and no progress ring', async () => {
  const { READER_PLAY_BUTTON_SIZE, READER_CHAPTER_BUTTON_SIZE } =
    await import('../../screens/bible/readerChromeMotion');
  assert.equal(READER_PLAY_BUTTON_SIZE, 64);
  assert.equal(READER_CHAPTER_BUTTON_SIZE, 40);

  const { view } = await renderDock({ isPlaying: true });

  assert.deepEqual(size(view.getByRole('button', { name: t('interface.pauseChapterAudio') })), {
    width: 64,
    height: 64,
  });
  for (const name of [t('audio.previousChapter'), t('audio.nextChapter')]) {
    assert.deepEqual(size(view.getByRole('button', { name })), { width: 40, height: 40 });
  }
  for (const svgPart of ['Svg', 'Circle', 'Path']) {
    assert.equal(view.queryAllByType(svgPart).length, 0, `no ${svgPart} ring`);
  }
});

test('the play disc announces play or pause, fires a haptic and toggles playback', async () => {
  const paused = await renderDock();
  const play = paused.view.getByRole('button', { name: t('interface.playChapterAudio') });
  await paused.view.press(play);
  assert.deepEqual(paused.calls, ['playPause']);
  assert.deepEqual(harness.haptics, [{ kind: 'impact', style: 'medium' }]);
  await paused.view.unmount();

  const loading = await renderDock({ isLoading: true });
  const busy = loading.view.getByRole('button', {
    name: t('interface.pauseChapterAudio'),
    busy: true,
    disabled: true,
  });
  await loading.view.press(busy);
  assert.deepEqual(loading.calls, []);
});

test('the chapter arrows travel the rest of the collapse distance with the tab capsule', async () => {
  const { READER_TAB_BAR_COLLAPSE_DISTANCE } = await import('../../navigation/readerTabBarMotion');
  const { READER_PLAY_COLLAPSE_TRAVEL } = await import('../../screens/bible/readerChromeMotion');

  const open = await renderDock({ collapseProgress: { value: 0 } as Props['collapseProgress'] });
  for (const name of [t('audio.previousChapter'), t('audio.nextChapter')]) {
    assert.equal(translateYOf(wrapperOf(open.view.getByRole('button', { name }))), 0);
  }
  await open.view.unmount();

  const collapsed = await renderDock({
    collapseProgress: { value: 1 } as Props['collapseProgress'],
    isCollapsed: true,
  });
  const arrows = collapsed.view
    .getAllByRole('button', { includeHidden: true })
    .filter((button) =>
      [t('audio.previousChapter'), t('audio.nextChapter')].includes(button.props.accessibilityLabel)
    );
  assert.equal(arrows.length, 2);
  for (const arrow of arrows) {
    assert.equal(
      translateYOf(wrapperOf(arrow)),
      READER_TAB_BAR_COLLAPSE_DISTANCE - READER_PLAY_COLLAPSE_TRAVEL
    );
  }
});

test('once collapsed the arrows ignore taps and leave the screen reader, while play stays', async () => {
  const { view, calls } = await renderDock({
    collapseProgress: { value: 1 } as Props['collapseProgress'],
    isCollapsed: true,
  });

  assert.equal(view.queryByRole('button', { name: t('audio.previousChapter') }), null);
  assert.equal(view.queryByRole('button', { name: t('audio.nextChapter') }), null);
  const arrows = view
    .getAllByRole('button', { includeHidden: true })
    .filter((button) =>
      [t('audio.previousChapter'), t('audio.nextChapter')].includes(button.props.accessibilityLabel)
    );
  for (const arrow of arrows) {
    assert.equal(isHiddenFromAccessibility(arrow), true);
    assert.equal(wrapperOf(arrow).props.pointerEvents, 'none');
    await view.press(arrow);
  }
  assert.deepEqual(calls, []);

  await view.press(view.getByRole('button', { name: t('interface.playChapterAudio') }));
  assert.deepEqual(calls, ['playPause']);
});

test('an expanded dock lets the arrows take taps', async () => {
  const { view, calls } = await renderDock();

  const previous = view.getByRole('button', { name: t('audio.previousChapter') });
  assert.equal(wrapperOf(previous).props.pointerEvents, 'auto');
  await view.press(previous);
  await view.press(view.getByRole('button', { name: t('audio.nextChapter') }));
  assert.deepEqual(calls, ['previous', 'next']);
});

test('the dock has no floating share button above the play control', async () => {
  const { view } = await renderDock();

  assert.deepEqual(
    view.getAllByRole('button').map((button) => button.props.accessibilityLabel),
    [t('audio.previousChapter'), t('interface.playChapterAudio'), t('audio.nextChapter')]
  );
  assert.equal(
    view.queryAllByType('Icon').filter((icon) => icon.props.name === 'share-outline').length,
    0
  );
});

test('hidePlayButton leaves only the chapter arrows', async () => {
  const { view } = await renderDock({ hidePlayButton: true });

  assert.equal(view.queryByTestId('reader-play-pause'), null);
  assert.equal(view.getAllByRole('button').length, 2);
});
