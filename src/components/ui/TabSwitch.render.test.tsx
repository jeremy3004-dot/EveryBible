import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import { flattenStyle, installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);

const segments = [
  { key: 'foundations', label: 'Foundations' },
  { key: 'wisdom', label: 'Wisdom' },
  { key: 'stories', label: 'Stories' },
];

async function renderSwitch(value = 'foundations', size: 'sm' | 'md' = 'md') {
  const { TabSwitch } = await import('./TabSwitch');
  const changes: string[] = [];
  const view = await harness.render(
    <TabSwitch
      segments={segments}
      value={value}
      size={size}
      onChange={(key) => changes.push(key)}
      accessibilityLabel="Lesson track"
    />
  );
  return { view, changes };
}

test('TabSwitch is a named tablist of labelled tabs that publish which one is selected', async () => {
  const { view } = await renderSwitch('wisdom');

  assert.ok(view.getByRole('tablist', { name: 'Lesson track' }));
  assert.deepEqual(
    view.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    ['Foundations', 'Wisdom', 'Stories']
  );
  assert.ok(view.getByRole('tab', { name: 'Wisdom', selected: true }));
  assert.equal(view.getAllByRole('tab', { selected: false }).length, 2);
});

test('pressing another tab reports it with a selection haptic; pressing the current tab does nothing', async () => {
  const { view, changes } = await renderSwitch('foundations');

  await view.press(view.getByRole('tab', { name: 'Foundations' }));
  assert.deepEqual(changes, []);
  assert.deepEqual(harness.haptics, []);

  await view.press(view.getByRole('tab', { name: 'Stories' }));
  assert.deepEqual(changes, ['stories']);
  assert.deepEqual(harness.haptics, [{ kind: 'selection' }]);
});

test('each small segment reclaims the 44pt touch floor as vertical hit slop', async () => {
  const { view } = await renderSwitch('foundations', 'sm');

  for (const tab of view.getAllByRole('tab')) {
    assert.deepEqual(tab.props.hitSlop, { top: 10, bottom: 10, left: 0, right: 0 });
  }
});

async function measureSegments(view: Awaited<ReturnType<typeof renderSwitch>>['view']) {
  let index = 0;
  for (const tab of view.getAllByRole('tab')) {
    await view.fire(tab, 'onLayout', { nativeEvent: { layout: { width: 80 + index * 10 } } });
    index += 1;
  }
}

test('the thumb slides over the measured selected segment with the base duration', async () => {
  const { view } = await renderSwitch('stories');
  await measureSegments(view);

  const durations = harness.animations.map((call) => call.config?.duration);
  assert.ok(durations.length > 0);
  assert.ok(durations.every((duration) => typeof duration === 'number' && duration > 0));
  const translate = harness.animations.at(-1);
  assert.equal(translate?.toValue, 80 + 90, 'offset is the width of the segments before it');
});

test('with reduce motion on, the thumb moves without a transition', async () => {
  harness.setReduceMotion(true);
  const { view } = await renderSwitch('stories');
  await measureSegments(view);

  assert.ok(harness.animations.length > 0);
  assert.ok(harness.animations.every((call) => call.config?.duration === 0));
});

function renderedColors(root: ReactTestInstance): string[] {
  const colors: string[] = [];
  for (const node of root.findAll((entry) => typeof entry.type === 'string')) {
    const style = flattenStyle(node.props.style) ?? {};
    for (const key of ['color', 'backgroundColor', 'borderColor']) {
      if (typeof style[key] === 'string') colors.push(style[key] as string);
    }
  }
  return colors;
}

for (const theme of ['light', 'dark'] as const) {
  test(`TabSwitch takes every colour from the ${theme} theme`, async () => {
    const { createThemeColors } = await import('../../contexts/ThemeContext');
    harness.authStore.getState().setPreferences({ theme });
    const palette = createThemeColors(theme, DEFAULT_APPEARANCE_PALETTE);
    const { view } = await renderSwitch('wisdom');

    const used = renderedColors(view.root);
    assert.ok(used.length > 0);
    const allowed = new Set(Object.values(palette));
    assert.deepEqual(
      used.filter((color) => !allowed.has(color)),
      [],
      'no colour outside the theme'
    );
    assert.equal(flattenStyle(view.getByText('Wisdom').props.style)?.color, palette.primaryText);
    assert.equal(flattenStyle(view.getByText('Stories').props.style)?.color, palette.secondaryText);
    assert.equal(
      flattenStyle(view.getByRole('tablist').props.style)?.backgroundColor,
      palette.muted
    );
    // The thumb alone marks the selection, so it is lit paper outlined at the
    // 3:1 control boundary rather than the quieter card border.
    const thumb = view
      .queryAllByType('View')
      .find((node) => node.props.pointerEvents === 'none');
    assert.ok(thumb);
    const thumbStyle = flattenStyle(thumb.props.style);
    assert.equal(thumbStyle?.backgroundColor, palette.cardBackground);
    assert.equal(thumbStyle?.borderColor, palette.controlBorder);
  });
}

test('the tablist label is required by the component type', async () => {
  const { TabSwitch } = await import('./TabSwitch');
  // @ts-expect-error -- a tablist without a name announces as a bare group
  const element = <TabSwitch segments={segments} value="wisdom" onChange={() => {}} />;
  assert.ok(element);
});
