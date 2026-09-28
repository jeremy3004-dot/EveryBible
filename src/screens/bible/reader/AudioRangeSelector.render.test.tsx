import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { useState } from 'react';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { flattenStyle, installRenderHarness } from '../../../testing/render';
import { assertDefined } from '../../../utils/assertDefined';

const harness = installRenderHarness(mock);
type PanConfig = Record<string, ((...args: unknown[]) => unknown) | undefined>;
const panResponder = harness.rn.PanResponder as unknown as {
  create: (config: PanConfig) => { panHandlers: PanConfig };
};
panResponder.create = (config) => ({
  panHandlers: {
    onResponderGrant: config.onPanResponderGrant,
    onResponderMove: config.onPanResponderMove,
    onResponderRelease: config.onPanResponderRelease,
  },
});
mockModule(mock, sourcePath('hooks/useAudioPosition.ts'), {
  useAudioPosition: () => ({ currentPosition: 0, duration: 0 }),
});

async function renderRange() {
  const { AudioRangeSelector } = await import('./AudioRangeSelector');
  const changes = { start: [] as number[], end: [] as number[] };
  function ControlledRange({ previewPositionMs = 0 }: { previewPositionMs?: number }) {
    const [startMs, setStartMs] = useState(30_000);
    const [endMs, setEndMs] = useState(90_000);
    return (
      <AudioRangeSelector
        durationMs={120_000}
        startMs={startMs}
        endMs={endMs}
        minRangeMs={10_000}
        previewPositionMs={previewPositionMs}
        trackColor="#111"
        selectionColor="#222"
        waveColor="#333"
        selectedWaveColor="#444"
        playedWaveColor="#555"
        handleColor="#666"
        handleGripColor="#777"
        onStartChange={(value) => {
          changes.start.push(value);
          setStartMs(Math.max(0, Math.min(endMs - 10_000, value)));
        }}
        onEndChange={(value) => {
          changes.end.push(value);
          setEndMs(Math.min(120_000, Math.max(startMs + 10_000, value)));
        }}
        startLabel="Clip start"
        endLabel="Clip end"
      />
    );
  }
  const view = await harness.render(<ControlledRange />);
  const track = assertDefined(
    view.root.findAll((node) => typeof node.type === 'string' && !!node.props.onLayout)[0],
    'range track'
  );
  await view.fire(track, 'onLayout', { nativeEvent: { layout: { width: 240, height: 72 } } });
  const handle = (edge: 'start' | 'end') =>
    view.getByRole('adjustable', { name: edge === 'start' ? 'Clip start' : 'Clip end' });
  const grant = async (edge: 'start' | 'end') => {
    if (handle(edge).props.onResponderGrant) {
      await view.fire(handle(edge), 'onResponderGrant', {}, { dx: 0 });
    }
  };
  return {
    view,
    changes,
    handle,
    grant,
    playbackTick: () => view.rerender(<ControlledRange previewPositionMs={45_000} />),
  };
}

for (const edge of ['start', 'end'] as const) {
  test(`${edge} handle measures cumulative drag movement from its initial position through parent updates`, async () => {
    const { view, changes, handle, grant, playbackTick } = await renderRange();
    const direction = edge === 'start' ? 1 : -1;
    const move = handle(edge).props.onResponderMove;
    const grantHandler = handle(edge).props.onResponderGrant;
    await grant(edge);
    await view.fire(handle(edge), 'onResponderMove', {}, { dx: direction * 20 });
    assert.equal(handle(edge).props.onResponderMove, move);
    await playbackTick();
    assert.equal(handle(edge).props.onResponderGrant, grantHandler);
    assert.equal(handle(edge).props.onResponderMove, move);
    await view.fire(handle(edge), 'onResponderMove', {}, { dx: direction * 40 });

    assert.deepEqual(changes[edge], edge === 'start' ? [40_000, 50_000] : [80_000, 70_000]);
    assert.equal(flattenStyle(handle(edge).props.style)?.left, edge === 'start' ? 90 : 130);

    await grant(edge);
    await view.fire(handle(edge), 'onResponderMove', {}, { dx: direction * 20 });
    assert.equal(changes[edge].at(-1), 60_000, 'the next drag starts from the updated handle');
  });

  test(`${edge} handle keeps its minimum gap and chapter bounds during a drag`, async () => {
    const { view, changes, handle, grant } = await renderRange();
    const direction = edge === 'start' ? 1 : -1;
    await grant(edge);
    await view.fire(handle(edge), 'onResponderMove', {}, { dx: direction * 300 });
    await view.fire(handle(edge), 'onResponderMove', {}, { dx: direction * -300 });

    assert.deepEqual(changes[edge], edge === 'start' ? [80_000, 0] : [40_000, 120_000]);
  });

  test(`${edge} handle remains adjustable in five-second accessibility steps`, async () => {
    const { view, changes, handle } = await renderRange();
    await view.fire(handle(edge), 'onAccessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await view.fire(handle(edge), 'onAccessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    assert.deepEqual(changes[edge], edge === 'start' ? [35_000, 30_000] : [95_000, 90_000]);
    assert.equal(handle(edge).props.accessibilityValue.text, edge === 'start' ? '0:30' : '1:30');
  });
}
