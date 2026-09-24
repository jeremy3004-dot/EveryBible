import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { isValidElement } from 'react';
import { act } from 'react-test-renderer';
import { installLocaleSetupFlowFakes } from './localeSetupFlowRenderFixtures';

// Android only: the hardware back button, and the keyboard overlap the flow
// measures against its own list surface (edge-to-edge keeps adjustResize from
// shrinking it, so the keyboard frame alone cannot say what is covered).
const fakes = installLocaleSetupFlowFakes(mock, { os: 'android' });
const { harness } = fakes;
const t = (key: string) => harness.i18n.t(key);

async function renderSettings() {
  const view = await fakes.renderFlow({ mode: 'settings' });
  await view.flush();
  return view;
}

async function pressHardwareBack(): Promise<boolean> {
  let handled = false;
  await act(async () => {
    handled = harness.rn.BackHandler.press();
  });
  return handled;
}

test('hardware back steps back through the flow and leaves the first step to the system', async () => {
  const view = await renderSettings();

  assert.equal(await pressHardwareBack(), false, 'on the first step the system handles back');

  await view.press(view.getByRole('button', { name: 'Continue with United States' }));
  assert.ok(view.getByTestId('onboarding-language-search'));

  assert.equal(await pressHardwareBack(), true, 'the flow consumed the press');
  assert.ok(view.getByRole('header', { name: t('onboarding.countryTitle') }));
});

test('first-run onboarding has one step, so hardware back is never swallowed', async () => {
  await fakes.renderFlow();

  assert.equal(await pressHardwareBack(), false);
});

test('unmounting the flow removes its hardware back subscription', async () => {
  const view = await renderSettings();
  await view.press(view.getByRole('button', { name: 'Continue with United States' }));
  assert.equal(harness.rn.BackHandler.listenerCount(), 1, 'the step change replaced its handler');

  await view.unmount();

  assert.equal(await pressHardwareBack(), false, 'no stale handler steps a gone flow back');
  assert.equal(harness.rn.BackHandler.listenerCount(), 0);
});

test('on keyboard show the flow measures its uncollapsed list wrapper, where the footer rests', async () => {
  await renderSettings();

  await act(async () => {
    harness.rn.Keyboard.emit('keyboardDidShow', {
      endCoordinates: { height: 320, screenY: 524, screenX: 0, width: 390 },
    });
  });

  const measured = harness.refCalls.filter((call) => call.method === 'measureInWindow');
  assert.equal(measured.length, 1);
  const [{ type, props }] = measured;
  assert.equal(type, 'View');
  assert.equal(props.collapsable, false, 'Android must not collapse the measured view away');
  assert.ok(
    isValidElement(props.children) &&
      (props.children.type as { name?: string }).name === 'LocaleSetupList',
    'the measured surface is the list wrapper'
  );
});
