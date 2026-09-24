import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import { flattenStyle, installRenderHarness } from '../testing/render';

const harness = installRenderHarness(mock);
const styleOf = (style: unknown) => flattenStyle(style) ?? {};

const PILL_COLOR = '#1A19141A';
// A 390pt screen less the capsule's 16pt side insets.
const CAPSULE_WIDTH = 358;
// 6pt of paper on each side of the row, split across five tabs.
const ITEM_WIDTH = (CAPSULE_WIDTH - 12) / 5;

afterEach(() => {
  harness.rn.I18nManager.isRTL = false;
});

// The reanimated fake evaluates animated styles during render, so the value an
// effect animates to shows up on the following render.
async function settle(
  view: { rerender: (element: ReactElement) => Promise<void> },
  element: () => ReactElement
) {
  await view.rerender(element());
  await view.rerender(element());
}

async function renderSelection(selectedIndex: number) {
  const { TabBarSelection } = await import('./TabBarSelection');
  const view = await harness.render(
    <TabBarSelection selectedIndex={selectedIndex} count={5} color={PILL_COLOR} />
  );
  const layer = view.queryAllByType('View')[0];
  const pill = () => view.queryAllByType('View')[1];
  const layout = () =>
    view.fire(layer, 'onLayout', { nativeEvent: { layout: { width: CAPSULE_WIDTH, height: 64 } } });
  return { view, layer, pill, layout, TabBarSelection };
}

test('the pill waits for the capsule to be measured and never takes touches', async () => {
  const { layer, pill, layout } = await renderSelection(0);

  assert.equal(layer.props.pointerEvents, 'none');
  assert.equal(pill(), undefined, 'no pill before the capsule width is known');

  await layout();
  assert.ok(pill());
});

test('the pill is a 52pt neutral wash inset by the capsule padding, radius 26', async () => {
  const { pill, layout } = await renderSelection(2);
  await layout();
  const style = styleOf(pill().props.style);

  assert.equal(style.backgroundColor, PILL_COLOR);
  assert.equal(style.position, 'absolute');
  assert.equal(style.top, 6);
  assert.equal(style.bottom, 6);
  assert.equal(style.start, 6);
  assert.equal(style.borderRadius, 26);
  assert.equal(style.width, ITEM_WIDTH, 'one tab slot wide');
  assert.deepEqual(style.transform, [{ translateX: 2 * ITEM_WIDTH }]);
});

test('changing tabs springs the pill to the new slot', async () => {
  const { view, pill, layout, TabBarSelection } = await renderSelection(0);
  await layout();
  harness.animations.length = 0;

  await settle(view, () => <TabBarSelection selectedIndex={3} count={5} color={PILL_COLOR} />);

  const { motion } = await import('../design/system');
  assert.deepEqual(harness.animations, [{ kind: 'spring', toValue: 3, config: motion.spring }]);
  assert.deepEqual(styleOf(pill().props.style).transform, [{ translateX: 3 * ITEM_WIDTH }]);
});

test('with Reduce Motion on, the pill jumps to the new slot without a spring', async () => {
  harness.setReduceMotion(true);
  const { view, pill, layout, TabBarSelection } = await renderSelection(0);
  await layout();

  await settle(view, () => <TabBarSelection selectedIndex={4} count={5} color={PILL_COLOR} />);

  assert.deepEqual(harness.animations, []);
  assert.deepEqual(styleOf(pill().props.style).transform, [{ translateX: 4 * ITEM_WIDTH }]);
});

test('in right-to-left layouts the pill slides the other way', async () => {
  harness.rn.I18nManager.isRTL = true;
  const { pill, layout } = await renderSelection(1);
  await layout();

  assert.deepEqual(styleOf(pill().props.style).transform, [{ translateX: -ITEM_WIDTH }]);
});
