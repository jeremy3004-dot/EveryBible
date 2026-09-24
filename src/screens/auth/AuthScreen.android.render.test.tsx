import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hostComponent } from '../../testing/reactNativeHost';
import { mockBarrel, mockModule } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

// Platform.OS is read at render, but the harness fixes it per file: Android gets its own.
const harness = installRenderHarness(mock, { os: 'android' });
const t = (key: string) => harness.i18n.t(key);
const calls: string[] = [];

mockBarrel(mock, 'services/auth/index.ts', {
  real: ['isSilentAuthError'],
  provide: {
    signInWithGoogle: async () => {
      calls.push('google');
      return { success: false, code: 'cancelled', error: 'raw' };
    },
  },
});
mockBarrel(mock, 'services/sync/index.ts', { provide: {} });
mockModule(mock, 'expo-apple-authentication', {
  AppleAuthenticationButton: hostComponent('AppleAuthenticationButton'),
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
});

test('Android offers Google sign-in only; there is no Apple button', async () => {
  const { AuthScreen } = await import('./AuthScreen');
  const view = await harness.render(<AuthScreen />);

  assert.equal(view.queryAllByType('AppleAuthenticationButton').length, 0);
  await view.press(view.getByRole('button', { name: t('auth.continueWithGoogle') }));
  assert.deepEqual(calls, ['google']);
  assert.equal(harness.rn.__recorded.alerts.length, 0, 'a cancelled Google sign-in stays silent');
});

test('Android pads the keyboard avoider by height, not padding', async () => {
  const { AuthScreen } = await import('./AuthScreen');
  const view = await harness.render(<AuthScreen />);

  const [avoider] = view.queryAllByType('KeyboardAvoidingView');
  assert.equal(avoider.props.behavior, 'height');
});
