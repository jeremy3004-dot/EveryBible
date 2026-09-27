import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness } from '../../testing/render';
import type { RenderResult } from '../../testing/render';

const harness = installRenderHarness(mock);

// The harness's PanResponder hands back no handlers. Wire the responder
// callbacks to the view the way RN's does, so a test can drag the scrubber.
// (The mocked module holds the same PanResponder object, so patch its method.)
type PanConfig = Record<string, ((...args: unknown[]) => unknown) | undefined>;
const panResponder = harness.rn.PanResponder as unknown as {
  create: (config: PanConfig) => { panHandlers: PanConfig };
};
panResponder.create = (config) => ({
  panHandlers: {
    onStartShouldSetResponder: config.onStartShouldSetPanResponder,
    onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
    onResponderGrant: config.onPanResponderGrant,
    onResponderMove: config.onPanResponderMove,
    onResponderRelease: config.onPanResponderRelease,
    onResponderTerminate: config.onPanResponderTerminate,
    onResponderTerminationRequest: config.onPanResponderTerminationRequest,
  },
});
mockBarrel(mock, 'utils/index.ts', { real: ['formatPlaybackTime'] });

// The reader's listen surface reads the live position from the audio store.
const livePosition = { currentPosition: 30_000, duration: 120_000 };
mockModule(mock, sourcePath('hooks/useAudioPosition.ts'), {
  useAudioPosition: () => livePosition,
});

const touch = (locationX: number) => ({ nativeEvent: { locationX, locationY: 0 } });

async function renderScrubber(position = 30_000, duration = 120_000) {
  const { AudioProgressScrubber } = await import('./AudioProgressScrubber');
  const seeks: number[] = [];
  const view = await harness.render(
    <AudioProgressScrubber
      position={position}
      duration={duration}
      onSeek={(ms) => seeks.push(ms)}
      trackColor="#111111"
      fillColor="#222222"
      accessibilityLabel="Chapter progress"
    />
  );
  const slider = view.getByRole('adjustable', { name: 'Chapter progress' });
  await view.fire(slider, 'onLayout', { nativeEvent: { layout: { width: 200, height: 32 } } });
  return { view, seeks, slider: () => view.getByRole('adjustable', { name: 'Chapter progress' }) };
}

const fillWidth = (view: RenderResult) => {
  const fill = view.root.findAll(
    (node: ReactTestInstance) =>
      typeof node.type === 'string' && flattenStyle(node.props.style)?.backgroundColor === '#222222'
  )[0];
  return flattenStyle(fill.props.style)?.width;
};

test('the scrubber is a named slider that announces elapsed and total time', async () => {
  const { slider } = await renderScrubber(30_000, 120_000);

  assert.deepEqual(slider().props.accessibilityValue, {
    min: 0,
    max: 120,
    now: 30,
    text: '0:30 / 2:00',
  });
});

test('dragging previews the position without seeking, and releasing commits the seek', async () => {
  const { view, seeks, slider } = await renderScrubber(30_000, 120_000);

  assert.equal(slider().props.onStartShouldSetResponder(), true, 'a touch claims the drag');
  assert.equal(slider().props.onResponderTerminationRequest(), false, 'a drag is not stolen');

  await view.fire(slider(), 'onResponderGrant', touch(50));
  await view.fire(slider(), 'onResponderMove', touch(100));
  assert.deepEqual(seeks, [], 'no seek while the finger is down');
  assert.equal(slider().props.accessibilityValue.now, 60, 'the thumb follows the finger');
  assert.equal(fillWidth(view), '50%');

  await view.fire(slider(), 'onResponderRelease', touch(150));
  assert.deepEqual(seeks, [90_000]);
});

test('a drag past either end clamps to the chapter', async () => {
  const { view, seeks, slider } = await renderScrubber(30_000, 120_000);

  await view.fire(slider(), 'onResponderGrant', touch(-40));
  await view.fire(slider(), 'onResponderRelease', touch(-40));
  await view.fire(slider(), 'onResponderGrant', touch(500));
  await view.fire(slider(), 'onResponderRelease', touch(500));
  assert.deepEqual(seeks, [0, 120_000]);
});

test('an interrupted drag discards the preview without seeking', async () => {
  const { view, seeks, slider } = await renderScrubber();
  await view.fire(slider(), 'onResponderGrant', touch(100));
  await view.fire(slider(), 'onResponderTerminate', touch(100));
  assert.deepEqual(seeks, []);
  assert.equal(slider().props.accessibilityValue.now, 30);
});

test('screen-reader increment and decrement step ten seconds', async () => {
  const { view, seeks, slider } = await renderScrubber(30_000, 120_000);

  await view.fire(slider(), 'onAccessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await view.fire(slider(), 'onAccessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  assert.deepEqual(seeks, [40_000, 20_000]);
});

test('drag handlers stay stable through preview and playback updates', async () => {
  const { AudioProgressScrubber } = await import('./AudioProgressScrubber');
  const { view, seeks, slider } = await renderScrubber();
  const latestSeeks: number[] = [];
  const move = slider().props.onResponderMove;
  await view.fire(slider(), 'onResponderGrant', touch(50));
  assert.equal(slider().props.onResponderMove, move);
  await view.rerender(
    <AudioProgressScrubber
      position={35_000}
      duration={120_000}
      onSeek={(ms) => latestSeeks.push(ms)}
      trackColor="#111111"
      fillColor="#222222"
      accessibilityLabel="Chapter progress"
    />
  );
  assert.equal(slider().props.accessibilityValue.now, 30, 'playback cannot overwrite the preview');
  await view.fire(slider(), 'onResponderMove', touch(100));
  assert.equal(slider().props.onResponderMove, move);
  await view.fire(slider(), 'onResponderRelease', touch(100));
  assert.deepEqual(latestSeeks, [60_000], 'release uses the current seek callback');
  assert.deepEqual(seeks, []);
});

test('an unloaded chapter does not capture touches or seek to zero', async () => {
  const { view, seeks, slider } = await renderScrubber(0, 0);
  assert.equal(slider().props.onStartShouldSetResponder(), false);
  await view.fire(slider(), 'onResponderRelease', touch(100));
  assert.deepEqual(seeks, []);
});

test('the Bible reader listen progress drags through the same scrubber to seek', async () => {
  const { ReaderListenProgress } = await import('../../screens/bible/ReaderAudioPositionParts');
  const seeks: number[] = [];
  const view = await harness.render(
    <ReaderListenProgress
      track={{ translationId: 'bsb', bookId: 'JHN', chapter: 3 }}
      isCurrentAudioChapter
      onSeek={(ms) => seeks.push(ms)}
      trackColor="#111111"
      fillColor="#222222"
      timeTextColor="#333333"
    />
  );

  const slider = () =>
    view.getByRole('adjustable', { name: harness.i18n.t('readingPlans.progress') });
  await view.fire(slider(), 'onLayout', { nativeEvent: { layout: { width: 200, height: 32 } } });
  await view.fire(slider(), 'onResponderGrant', touch(100));
  await view.fire(slider(), 'onResponderRelease', touch(100));
  assert.deepEqual(seeks, [60_000]);
});

/** The round dot that rides the line, if one is drawn. */
const thumbOf = (view: RenderResult) =>
  view.root.findAll(
    (node: ReactTestInstance) =>
      typeof node.type === 'string' &&
      flattenStyle(node.props.style)?.position === 'absolute' &&
      flattenStyle(node.props.style)?.borderRadius === 999
  )[0];

test('by default the dot rides the line at rest and grows while dragging', async () => {
  const { view, slider } = await renderScrubber(30_000, 120_000);

  assert.equal(flattenStyle(thumbOf(view)?.props.style)?.width, 12);
  await view.fire(slider(), 'onResponderGrant', touch(50));
  assert.equal(flattenStyle(thumbOf(view)?.props.style)?.width, 16);
});

// Read Along asked for a quieter line: no dot until a finger is on it.
test('a scrubber that shows its dot only while dragging has none at rest', async () => {
  const { AudioProgressScrubber } = await import('./AudioProgressScrubber');
  const view = await harness.render(
    <AudioProgressScrubber
      position={30_000}
      duration={120_000}
      onSeek={() => {}}
      trackColor="#111111"
      fillColor="#222222"
      accessibilityLabel="Chapter progress"
      thumb="whileScrubbing"
    />
  );
  const slider = () => view.getByRole('adjustable', { name: 'Chapter progress' });
  await view.fire(slider(), 'onLayout', { nativeEvent: { layout: { width: 200, height: 32 } } });

  assert.equal(thumbOf(view), undefined, 'no dot at rest');
  await view.fire(slider(), 'onResponderGrant', touch(50));
  assert.equal(flattenStyle(thumbOf(view)?.props.style)?.width, 16, 'a dot under the finger');
  await view.fire(slider(), 'onResponderRelease', touch(50));
  assert.equal(thumbOf(view), undefined, 'gone again once released');
});
