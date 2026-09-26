import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock);

async function renderSlider(value: number, overrides: { disabled?: boolean } = {}) {
  const { Slider } = await import('./Slider');
  const changes: number[] = [];
  const completions: number[] = [];
  const view = await harness.render(
    <Slider
      value={value}
      onValueChange={(next) => changes.push(next)}
      onSlidingComplete={(next) => completions.push(next)}
      accessibilityLabel="Voice"
      {...overrides}
    />
  );
  return { view, changes, completions };
}

const act = (actionName: string) => ({ nativeEvent: { actionName } });

test('the slider is one named adjustable element that speaks its value as a percentage', async () => {
  const { view } = await renderSlider(0.4);

  const slider = view.getByRole('adjustable', { name: 'Voice' });
  assert.deepEqual(slider.props.accessibilityValue, { min: 0, max: 100, now: 40, text: '40%' });
  assert.deepEqual(
    slider.props.accessibilityActions.map((action: { name: string }) => action.name),
    ['increment', 'decrement']
  );
});

test('screen-reader increment and decrement move it a tenth, in whole-percent steps', async () => {
  const { view, changes, completions } = await renderSlider(0.37);
  const slider = view.getByRole('adjustable', { name: 'Voice' });

  await view.fire(slider, 'onAccessibilityAction', act('increment'));
  await view.fire(slider, 'onAccessibilityAction', act('decrement'));
  assert.deepEqual(changes, [0.47, 0.27]);
  assert.deepEqual(completions, [0.47, 0.27]);
});

test('it stops at the ends instead of reporting a value past them', async () => {
  const full = await renderSlider(1);
  await full.view.fire(
    full.view.getByRole('adjustable', { name: 'Voice' }),
    'onAccessibilityAction',
    act('increment')
  );
  assert.deepEqual(full.changes, []);

  const nearlyEmpty = await renderSlider(0.04);
  await nearlyEmpty.view.fire(
    nearlyEmpty.view.getByRole('adjustable', { name: 'Voice' }),
    'onAccessibilityAction',
    act('decrement')
  );
  assert.deepEqual(nearlyEmpty.changes, [0]);
});

test('a disabled slider says so and ignores screen-reader adjustments', async () => {
  const { view, changes } = await renderSlider(0.5, { disabled: true });

  const slider = view.getByRole('adjustable', { name: 'Voice', disabled: true });
  await view.fire(slider, 'onAccessibilityAction', act('increment'));
  assert.deepEqual(changes, []);
});
