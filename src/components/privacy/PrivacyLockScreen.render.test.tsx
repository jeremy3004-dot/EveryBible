import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness, type RenderResult } from '../../testing/render';

const harness = installRenderHarness(mock);

// The lock screen is on the startup privacy path, so it must reach the privacy
// store directly. The stores barrel is replaced with one whose every export
// throws when used: if the screen took anything from it, these tests would fail.
mockBarrel(mock, 'stores/index.ts');
mockBarrel(mock, 'services/privacy/index.ts', { real: ['validatePrivacyPin'] });

const unlockAttempts: string[][] = [];
let unlockResult = false;
const privacyStore = create<{
  pinLockedUntil: number | null;
  unlock: (pin: string | string[]) => Promise<boolean>;
}>()(() => ({
  pinLockedUntil: null,
  unlock: async (pin) => {
    unlockAttempts.push(Array.isArray(pin) ? pin : [pin]);
    return unlockResult;
  },
}));
mockModule(mock, sourcePath('stores/privacyStore.ts'), { usePrivacyStore: privacyStore });

beforeEach(() => {
  unlockAttempts.length = 0;
  unlockResult = false;
  privacyStore.setState(privacyStore.getInitialState(), true);
});

async function renderLockScreen() {
  const { PrivacyLockScreen } = await import('./PrivacyLockScreen');
  return harness.render(<PrivacyLockScreen />);
}

async function tap(view: RenderResult, keys: string[]) {
  for (const key of keys) {
    await view.press(view.getByRole('button', { name: key }));
  }
}

/** The PIN check runs 50ms after '='; let it and the unlock promise settle. */
async function settlePinCheck() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

const display = (view: RenderResult) => view.getAllByText(/./)[0].props.accessibilityLabel;

test('the lock screen works as a plain calculator', async () => {
  const view = await renderLockScreen();

  await tap(view, ['1', '2', '+', '3', '=']);
  await settlePinCheck();
  assert.equal(display(view), '15');

  await tap(view, ['C']);
  assert.equal(display(view), '0');
});

test('a PIN typed before "=" goes to the privacy store directly, not via the stores barrel', async () => {
  const view = await renderLockScreen();

  await tap(view, ['1', '2', '3', '4', '=']);
  await settlePinCheck();

  assert.deepEqual(unlockAttempts, [['1234']]);
  assert.equal(display(view), '1234', 'a wrong code leaves the calculator as it was');
});

test('while unlock attempts are throttled, a wrong code shows only a generic Error', async () => {
  privacyStore.setState({ pinLockedUntil: Date.now() + 60_000 });
  const view = await renderLockScreen();

  await tap(view, ['5', '6', '7', '8', '=']);
  await settlePinCheck();

  assert.deepEqual(unlockAttempts, [['5678']]);
  assert.equal(display(view), 'Error');
});
