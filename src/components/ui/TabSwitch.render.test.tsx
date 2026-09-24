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
    const thumb = view.queryAllByType('View').find((node) => node.props.pointerEvents === 'none');
    assert.ok(thumb);
    const thumbStyle = flattenStyle(thumb.props.style);
    assert.equal(thumbStyle?.backgroundColor, palette.cardBackground);
    assert.equal(thumbStyle?.borderColor, palette.controlBorder);
  });
}

// At accessibility text sizes a hugging `sm` switch measured wider than the screen:
// Home's Week/Month/All time ran past its card and Gather's Wisdom tab off the edge.
test('a hugging switch is capped at its container and lets its labels wrap instead', async () => {
  const { view } = await renderSwitch('foundations', 'sm');

  const trackStyle = flattenStyle(view.getByRole('tablist').props.style);
  assert.equal(trackStyle?.maxWidth, '100%');
  for (const tab of view.getAllByRole('tab')) {
    assert.equal(flattenStyle(tab.props.style)?.flexShrink, 1, 'each segment can narrow');
  }
});

test('the tablist label is required by the component type', async () => {
  const { TabSwitch } = await import('./TabSwitch');
  // @ts-expect-error -- a tablist without a name announces as a bare group
  const element = <TabSwitch segments={segments} value="wisdom" onChange={() => {}} />;
  assert.ok(element);
});

// Release QA at iOS AX5 (fontScale ~3.1): segment labels grew until one word no
// longer fit its segment and iOS broke it mid-word ("We/ek", "My pla…"), and on
// Android at 2.0 the Plans switch showed "Complete / d".
const AX5 = 3.12;

async function renderFullWidth(value = 'foundations') {
  const { TabSwitch } = await import('./TabSwitch');
  const changes: string[] = [];
  const view = await harness.render(
    <TabSwitch
      segments={segments}
      value={value}
      fullWidth
      onChange={(key) => changes.push(key)}
      accessibilityLabel="Lesson track"
    />
  );
  return { view, changes };
}

test('segment labels cap their scaling so one word always fits its segment', async () => {
  const { CONTROL_LABEL_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  harness.setFontScale(AX5);
  for (const render of [() => renderSwitch('wisdom', 'sm'), () => renderFullWidth('wisdom')]) {
    const { view } = await render();
    for (const label of segments.map((segment) => segment.label)) {
      assert.equal(view.getByText(label).props.maxFontSizeMultiplier, CONTROL_LABEL_MAX_FONT_SCALE);
    }
    view.unmount();
  }
});

test('at default size a full-width switch keeps its equal segments in one row', async () => {
  const { view } = await renderFullWidth();

  assert.equal(flattenStyle(view.getByRole('tablist').props.style)?.flexDirection, 'row');
  for (const tab of view.getAllByRole('tab')) {
    assert.equal(flattenStyle(tab.props.style)?.flex, 1);
  }
  assert.equal(view.getByText('Foundations').props.numberOfLines, 2);
});

test('at large text a full-width switch stacks its segments, one full-width row each', async () => {
  harness.setFontScale(2);
  const { view, changes } = await renderFullWidth('wisdom');

  const track = flattenStyle(view.getByRole('tablist').props.style);
  assert.equal(track?.flexDirection, 'column');
  assert.equal(track?.alignSelf, 'stretch');
  for (const tab of view.getAllByRole('tab')) {
    const style = flattenStyle(tab.props.style);
    assert.equal(style?.flex, undefined, 'a stacked segment is as tall as its label, not a share');
    assert.equal(style?.alignSelf, 'stretch');
  }
  for (const label of segments.map((segment) => segment.label)) {
    assert.equal(view.getByText(label).props.numberOfLines, undefined, 'a full row never cuts');
  }
  assert.ok(view.getByRole('tab', { name: 'Wisdom', selected: true }));
  await view.press(view.getByRole('tab', { name: 'Stories' }));
  assert.deepEqual(changes, ['stories']);
});

test('a stacked switch slides its full-width thumb down by the measured segment heights', async () => {
  harness.setFontScale(2);
  const { view } = await renderFullWidth('stories');
  let index = 0;
  for (const tab of view.getAllByRole('tab')) {
    await view.fire(tab, 'onLayout', {
      nativeEvent: { layout: { width: 300, height: 40 + index * 10 } },
    });
    index += 1;
  }

  const thumb = view.queryAllByType('View').find((node) => node.props.pointerEvents === 'none');
  assert.ok(thumb);
  const style = flattenStyle(thumb.props.style);
  assert.equal(style?.left, 3);
  assert.equal(style?.right, 3, 'the thumb spans the track');
  assert.equal(style?.height, 60, 'as tall as the selected segment');
  assert.deepEqual(style?.transform, [{ translateY: 40 + 50 }]);
});

test('a hugging switch stays one row at large text: its labels wrap between words instead', async () => {
  harness.setFontScale(AX5);
  const { view } = await renderSwitch('foundations', 'sm');

  assert.equal(flattenStyle(view.getByRole('tablist').props.style)?.flexDirection, 'row');
});
