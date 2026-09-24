import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { hostComponent } from '../../testing/reactNativeHost';
import { mockBarrel, mockModule } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness, type RenderResult } from '../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string) => harness.i18n.t(key);

interface FakeAuthResult {
  success: boolean;
  user?: { id: string };
  code?: string;
  error?: string;
}

const RAW_ERROR = 'raw untranslated service error';
const auth = {
  emailResult: { success: true, user: { id: 'user-1' } } as FakeAuthResult,
  signUpResult: { success: true, user: { id: 'user-1' } } as FakeAuthResult,
  googleResult: { success: true, user: { id: 'user-1' } } as FakeAuthResult,
  resetResult: { success: true } as FakeAuthResult,
  session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
  calls: [] as string[],
};
const pulls: string[] = [];

mockBarrel(mock, 'services/auth/index.ts', {
  real: ['isSilentAuthError'],
  provide: {
    signInWithEmail: async (email: string) => {
      auth.calls.push(`email:${email}`);
      return auth.emailResult;
    },
    signUpWithEmail: async (email: string) => {
      auth.calls.push(`signUp:${email}`);
      return auth.signUpResult;
    },
    signInWithGoogle: async () => {
      auth.calls.push('google');
      return auth.googleResult;
    },
    signInWithApple: async () => {
      auth.calls.push('apple');
      return auth.emailResult;
    },
    resetPassword: async (email: string) => {
      auth.calls.push(`reset:${email}`);
      return auth.resetResult;
    },
    getCurrentSession: async () => ({ session: auth.session }),
  },
});
mockBarrel(mock, 'services/sync/index.ts', {
  provide: {
    pullFromCloud: async (userId: string) => {
      pulls.push(userId);
    },
  },
});
mockModule(mock, 'expo-apple-authentication', {
  AppleAuthenticationButton: hostComponent('AppleAuthenticationButton'),
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
});

test.beforeEach(() => {
  auth.emailResult = { success: true, user: { id: 'user-1' } };
  auth.signUpResult = { success: true, user: { id: 'user-1' } };
  auth.googleResult = { success: true, user: { id: 'user-1' } };
  auth.resetResult = { success: true };
  auth.session = { user: { id: 'user-1' } };
  auth.calls.length = 0;
  pulls.length = 0;
});

async function renderAuth(initialMode?: 'signIn' | 'signUp') {
  harness.navigation.route.params = initialMode ? { initialMode } : {};
  const { AuthScreen } = await import('./AuthScreen');
  return harness.render(<AuthScreen />);
}

async function submitEmail(view: RenderResult, password = 'secret-pass') {
  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.changeText(view.getByLabelText(t('auth.password')), password);
  const signUp = view.queryByRole('button', { name: t('auth.createAccount') });
  await view.press(signUp ?? view.getByRole('button', { name: t('auth.signIn') }));
}

const lastAlert = () => harness.rn.__recorded.alerts.at(-1);

for (const [code, key] of [
  ['in_progress', 'auth.signInAlreadyInProgress'],
  ['provider_unavailable', 'auth.providerUnavailable'],
  ['service_unavailable', 'auth.serviceUnavailable'],
  ['configuration', 'auth.backendNotConfigured'],
  ['unmapped_code', 'auth.checkCredentials'],
] as const) {
  test(`a failed sign-in with code ${code} shows a translated message, never the raw error`, async () => {
    auth.emailResult = { success: false, code, error: RAW_ERROR };
    const view = await renderAuth();
    await submitEmail(view);

    assert.deepEqual(
      { title: lastAlert()?.title, message: lastAlert()?.message },
      { title: t('auth.signInFailed'), message: t(key) }
    );
    assert.equal(pulls.length, 0);
  });
}

test('a failed sign-up is titled as a sign-up failure', async () => {
  auth.signUpResult = { success: false, code: 'unknown', error: RAW_ERROR };
  const view = await renderAuth('signUp');
  await submitEmail(view);

  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: t('auth.signUpFailed'), message: t('auth.somethingWentWrong') }
  );
});

test('a cancelled provider sign-in stays silent', async () => {
  auth.googleResult = { success: false, code: 'cancelled', error: RAW_ERROR };
  const view = await renderAuth();
  await view.press(view.getByRole('button', { name: t('auth.continueWithGoogle') }));

  assert.deepEqual(auth.calls, ['google']);
  assert.equal(harness.rn.__recorded.alerts.length, 0);
});

test('a failed reset email maps its code too, and falls back to the translated reset error', async () => {
  const view = await renderAuth();
  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');

  auth.resetResult = { success: false, code: 'configuration', error: RAW_ERROR };
  await view.press(view.getByText(t('auth.forgotPassword')));
  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: t('common.error'), message: t('auth.backendNotConfigured') }
  );

  auth.resetResult = { success: false, code: 'unknown', error: RAW_ERROR };
  await view.press(view.getByText(t('auth.forgotPassword')));
  assert.equal(lastAlert()?.message, t('auth.resetEmailError'));
  assert.deepEqual(auth.calls, ['reset:ruth@example.com', 'reset:ruth@example.com']);
});

test('a successful sign-in stores the live session, restores that user from the cloud and closes', async () => {
  auth.session = { user: { id: 'live-uid' } };
  const view = await renderAuth();
  await submitEmail(view);

  assert.deepEqual(harness.authStore.getState().session, { user: { id: 'live-uid' } });
  assert.deepEqual(pulls, ['live-uid']);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('a sign-in that leaves no live session reports an error instead of closing', async () => {
  auth.session = null;
  const view = await renderAuth();
  await submitEmail(view);

  assert.equal(lastAlert()?.message, t('auth.somethingWentWrong'));
  assert.deepEqual(pulls, []);
  assert.deepEqual(harness.navigation.calls, []);
});

test('a sign-up awaiting email verification shows the notice and clears the password', async () => {
  auth.session = null;
  const view = await renderAuth('signUp');
  await submitEmail(view);

  assert.ok(view.getByText(t('auth.accountCreated')));
  assert.ok(view.getByText(t('auth.verifyEmailMessage')));
  assert.equal(view.getByLabelText(t('auth.password')).props.value, '');
  assert.deepEqual(pulls, []);
});

test('invalid input shows field errors that are part of each field label', async () => {
  const view = await renderAuth();
  await submitEmail(view, '123');
  await view.changeText(view.getByLabelText(t('auth.email')), 'not-an-email');
  await view.press(view.getByRole('button', { name: t('auth.signIn') }));

  assert.ok(view.getByLabelText(`${t('auth.email')}, ${t('auth.emailInvalid')}`));
  assert.ok(view.getByLabelText(`${t('auth.password')}, ${t('auth.passwordMinLength')}`));
  assert.ok(view.getByText(t('auth.emailInvalid')));
  assert.deepEqual(auth.calls, []);
});

test('sign-in mode welcomes back and offers account creation; the switch keeps one surface', async () => {
  const view = await renderAuth();

  assert.ok(view.getByRole('header', { name: t('auth.welcomeBack') }));
  assert.ok(view.getByText(`${t('auth.newHere')} `));
  assert.ok(view.getByText(t('auth.forgotPassword')));

  await view.press(view.getByText(t('auth.createAnAccount')));

  assert.ok(view.getByRole('header', { name: t('auth.createAnAccount') }));
  assert.ok(view.getByRole('button', { name: t('auth.createAccount') }));
  assert.ok(view.getByText(`${t('auth.alreadyHaveAccount')} `));
  assert.equal(view.queryByText(t('auth.forgotPassword')), null);
});

test('the password field keeps its autofill hint per mode and the reveal toggle names its state', async () => {
  const view = await renderAuth();
  const password = () => view.getByLabelText(t('auth.password'));
  assert.equal(password().props.textContentType, 'password');
  assert.equal(password().props.secureTextEntry, true);

  await view.press(view.getByRole('button', { name: t('auth.showPassword') }));
  assert.equal(password().props.secureTextEntry, false);
  assert.ok(view.getByRole('button', { name: t('auth.hidePassword') }));

  await view.press(view.getByText(t('auth.createAnAccount')));
  assert.equal(password().props.textContentType, 'newPassword');
});

test('the Every Language surface: close button, eyebrow, email divider, tagline and 50pt provider pills', async () => {
  const { layout } = await import('../../design/system');
  const view = await renderAuth();

  assert.ok(view.getByText(t('auth.accountEyebrow')));
  assert.ok(view.getByText(t('auth.orWithEmail')));
  assert.ok(view.getByText(t('auth.tagline')));
  assert.equal(view.queryAllByType('Icon').length, 0, 'glyphs are Lucide, not Ionicons');

  const [apple] = view.queryAllByType('AppleAuthenticationButton');
  assert.equal(flattenStyle(apple.props.style)?.height, layout.pillHeight);
  const google = view.getByRole('button', { name: t('auth.continueWithGoogle') });
  assert.equal(flattenStyle(google.props.style)?.minHeight, layout.pillHeight);

  await view.press(view.getByRole('button', { name: t('interface.close') }));
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});
