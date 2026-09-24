import test, { mock } from 'node:test';
import { act } from 'react';
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
  appleResult: { success: true, user: { id: 'user-1' } } as FakeAuthResult,
  session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
  calls: [] as string[],
  // While set, every auth call waits on it, so a test can look at the in-flight screen.
  gate: null as Promise<void> | null,
  // When set, the named call throws instead of answering.
  throwOn: null as string | null,
};

async function answer(call: string, result: FakeAuthResult): Promise<FakeAuthResult> {
  auth.calls.push(call);
  if (auth.gate) await auth.gate;
  if (auth.throwOn && call.startsWith(auth.throwOn)) throw new Error('network down');
  return result;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const pulls: string[] = [];

mockBarrel(mock, 'services/auth/index.ts', {
  real: ['isSilentAuthError'],
  provide: {
    signInWithEmail: (email: string) => answer(`email:${email}`, auth.emailResult),
    signUpWithEmail: (email: string) => answer(`signUp:${email}`, auth.signUpResult),
    signInWithGoogle: () => answer('google', auth.googleResult),
    signInWithApple: () => answer('apple', auth.appleResult),
    resetPassword: (email: string) => answer(`reset:${email}`, auth.resetResult),
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
  auth.appleResult = { success: true, user: { id: 'user-1' } };
  auth.session = { user: { id: 'user-1' } };
  auth.calls.length = 0;
  auth.gate = null;
  auth.throwOn = null;
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

// iOS QuickType inserts a suggested address followed by a space, and the auth
// server matches the address exactly, so an untrimmed address fails sign-in
// with "check your credentials" and sign-up with an invalid-address error.
test('an email address with surrounding spaces is sent without them', async () => {
  const view = await renderAuth();
  await view.changeText(view.getByLabelText(t('auth.email')), ' ruth@example.com ');
  await view.changeText(view.getByLabelText(t('auth.password')), 'secret-pass');
  await view.press(view.getByRole('button', { name: t('auth.signIn') }));
  await view.press(view.getByText(t('auth.forgotPassword')));

  const signUp = await renderAuth('signUp');
  await signUp.changeText(signUp.getByLabelText(t('auth.email')), 'ruth@example.com  ');
  await signUp.changeText(signUp.getByLabelText(t('auth.password')), 'secret-pass');
  await signUp.press(signUp.getByRole('button', { name: t('auth.createAccount') }));

  assert.deepEqual(auth.calls, [
    'email:ruth@example.com',
    'reset:ruth@example.com',
    'signUp:ruth@example.com',
  ]);
});

test('forgot password without an address asks for one instead of sending a reset', async () => {
  const view = await renderAuth();
  await view.changeText(view.getByLabelText(t('auth.email')), '   ');

  await view.press(view.getByText(t('auth.forgotPassword')));

  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: t('auth.emailRequired'), message: t('auth.emailRequiredForReset') }
  );
  assert.deepEqual(auth.calls, []);
});

test('a provider sign-in that succeeds restores the account and closes', async () => {
  auth.session = { user: { id: 'google-uid' } };
  const view = await renderAuth();

  await view.press(view.getByRole('button', { name: t('auth.continueWithGoogle') }));

  assert.deepEqual(auth.calls, ['google']);
  assert.deepEqual(pulls, ['google-uid']);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

const appleButton = (view: RenderResult) => {
  const [apple] = view.queryAllByType('AppleAuthenticationButton');
  assert.ok(apple, 'the Apple button is shown');
  return apple;
};

test('on iOS the Apple button says Continue to sign in and Sign up to create an account', async () => {
  const signIn = await renderAuth();
  assert.equal(appleButton(signIn).props.buttonType, 1);
  assert.equal(appleButton(signIn).props.cornerRadius, 25);
  await signIn.press(signIn.getByText(t('auth.createAnAccount')));
  assert.equal(appleButton(signIn).props.buttonType, 2);
});

test('the Apple button is black on the light theme and white on the dark theme', async () => {
  const light = await renderAuth();
  assert.equal(appleButton(light).props.buttonStyle, 2);
  await light.unmount();

  harness.authStore.getState().setPreferences({ theme: 'dark' });
  const dark = await renderAuth();
  assert.equal(appleButton(dark).props.buttonStyle, 0);
});

test('an Apple sign-in that succeeds restores the account and closes', async () => {
  auth.session = { user: { id: 'apple-uid' } };
  const view = await renderAuth();

  await view.press(appleButton(view));

  assert.deepEqual(auth.calls, ['apple']);
  assert.deepEqual(pulls, ['apple-uid']);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('a failed Apple sign-in falls back to the Apple failure message, and a cancel stays silent', async () => {
  auth.appleResult = { success: false, code: 'unknown', error: RAW_ERROR };
  const view = await renderAuth();
  await view.press(appleButton(view));
  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: t('auth.signInFailed'), message: t('auth.appleSignInFailed') }
  );
  assert.deepEqual(harness.haptics.at(-1), { kind: 'notification', style: 'error' });

  const alerts = harness.rn.__recorded.alerts.length;
  auth.appleResult = { success: false, code: 'cancelled', error: RAW_ERROR };
  await view.press(appleButton(view));
  assert.equal(harness.rn.__recorded.alerts.length, alerts);
});

test('a failed Google sign-in falls back to the Google failure message', async () => {
  auth.googleResult = { success: false, code: 'unknown', error: RAW_ERROR };
  const view = await renderAuth();
  await view.press(view.getByRole('button', { name: t('auth.continueWithGoogle') }));

  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: t('auth.signInFailed'), message: t('auth.googleSignInFailed') }
  );
  assert.deepEqual(pulls, []);
});

test('a sign-in call that throws shows the generic error and frees the form', async () => {
  for (const [press, call] of [
    [(view: RenderResult) => submitEmail(view), 'email'],
    [
      (view: RenderResult) =>
        view.press(view.getByRole('button', { name: t('auth.continueWithGoogle') })),
      'google',
    ],
    [(view: RenderResult) => view.press(appleButton(view)), 'apple'],
    [(view: RenderResult) => view.press(view.getByText(t('auth.forgotPassword'))), 'reset'],
  ] as const) {
    auth.throwOn = call;
    const view = await renderAuth();
    await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
    await press(view);

    assert.deepEqual(
      { title: lastAlert()?.title, message: lastAlert()?.message },
      { title: t('common.error'), message: t('auth.somethingWentWrong') },
      call
    );
    assert.ok(view.getByRole('button', { name: t('auth.signIn'), disabled: false }), call);
    await view.unmount();
  }
  assert.deepEqual(pulls, []);
});

test('while a sign-in is in flight the form is locked and the primary button is busy', async () => {
  const gate = deferred();
  auth.gate = gate.promise;
  const view = await renderAuth();
  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.changeText(view.getByLabelText(t('auth.password')), 'secret-pass');
  // Pressed outside act so the screen can be read while the call is pending.
  const pending = (
    view.getByRole('button', { name: t('auth.signIn') }).props.onPress as () => Promise<void>
  )();
  await view.flush();

  assert.ok(view.getByRole('button', { name: t('auth.signIn'), busy: true, disabled: true }));
  assert.ok(view.getByRole('button', { name: t('auth.continueWithGoogle'), disabled: true }));
  assert.equal(view.getByLabelText(t('auth.email')).props.editable, false);
  assert.equal(view.getByLabelText(t('auth.password')).props.editable, false);
  assert.ok(view.getByRole('button', { name: t('auth.showPassword'), disabled: true }));
  assert.ok(view.getByRole('button', { name: t('auth.forgotPassword'), disabled: true }));
  assert.ok(view.getByRole('button', { name: t('auth.createAnAccount'), disabled: true }));

  await act(async () => {
    gate.resolve();
    await pending;
  });
  assert.deepEqual(pulls, ['user-1']);
  assert.ok(view.getByRole('button', { name: t('auth.signIn'), busy: false }));
});

test('a reset link that was sent says to check the inbox', async () => {
  const view = await renderAuth();
  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.press(view.getByText(t('auth.forgotPassword')));

  assert.deepEqual(
    { title: lastAlert()?.title, message: lastAlert()?.message },
    { title: t('auth.checkYourEmail'), message: t('auth.resetLinkSent') }
  );
});

test('an empty form asks for both fields, and typing clears only that field error', async () => {
  const view = await renderAuth();
  await view.press(view.getByRole('button', { name: t('auth.signIn') }));

  assert.ok(view.getByText(t('auth.emailRequired')));
  assert.ok(view.getByText(t('auth.passwordRequired')));
  assert.equal(
    view.queryAllByType('LucideIcon').filter((icon) => icon.props.name === 'CircleAlert').length,
    2
  );

  await view.changeText(view.getByLabelText(`${t('auth.email')}, ${t('auth.emailRequired')}`), 'r');
  assert.equal(view.queryByText(t('auth.emailRequired')), null);
  assert.ok(view.getByText(t('auth.passwordRequired')));

  await view.changeText(
    view.getByLabelText(`${t('auth.password')}, ${t('auth.passwordRequired')}`),
    'x'
  );
  assert.equal(view.queryByText(t('auth.passwordRequired')), null);
});

test('switching between sign-in and sign-up clears field errors', async () => {
  const view = await renderAuth();
  await view.press(view.getByRole('button', { name: t('auth.signIn') }));
  assert.ok(view.getByText(t('auth.emailRequired')));

  await view.press(view.getByText(t('auth.createAnAccount')));
  assert.equal(view.queryByText(t('auth.emailRequired')), null);
  assert.equal(view.queryByText(t('auth.passwordRequired')), null);
});

test('sign-up mode hints the password rule and submits from the keyboard', async () => {
  const view = await renderAuth('signUp');
  const password = view.getByLabelText(t('auth.password'));
  assert.equal(password.props.placeholder, t('auth.passwordHint'));
  assert.equal(password.props.autoComplete, 'new-password');
  assert.equal(password.props.returnKeyType, 'next');
  assert.ok(view.getByText(t('auth.signUpSubtitle')));

  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.changeText(password, 'secret-pass');
  await view.fire(view.getByLabelText(t('auth.password')), 'onSubmitEditing');
  assert.deepEqual(auth.calls, ['signUp:ruth@example.com']);
});

test('sign-in mode submits from the password key and the email key moves to the password', async () => {
  const view = await renderAuth();
  assert.ok(view.getByText(t('auth.signInSubtitle')));
  const password = view.getByLabelText(t('auth.password'));
  assert.equal(password.props.placeholder, t('auth.passwordPlaceholder'));
  assert.equal(password.props.autoComplete, 'current-password');
  assert.equal(password.props.returnKeyType, 'go');

  await view.fire(view.getByLabelText(t('auth.email')), 'onSubmitEditing');
  assert.deepEqual(
    harness.refCalls.map((call) => [call.type, call.method, call.props.accessibilityLabel]),
    [['TextInput', 'focus', t('auth.password')]]
  );

  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.changeText(password, 'secret-pass');
  await view.fire(view.getByLabelText(t('auth.password')), 'onSubmitEditing');
  assert.deepEqual(auth.calls, ['email:ruth@example.com']);
});

test('a sign-up that is signed in at once restores the account and closes', async () => {
  auth.session = { user: { id: 'new-uid' } };
  const view = await renderAuth('signUp');
  await submitEmail(view);

  assert.deepEqual(pulls, ['new-uid']);
  assert.equal(view.queryByText(t('auth.accountCreated')), null);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('the verification notice offers sign-in, which switches mode and hides the notice', async () => {
  auth.session = null;
  const view = await renderAuth('signUp');
  await submitEmail(view);
  const notice = view.getByText(t('auth.accountCreated'));
  assert.ok(notice);

  const buttons = view.getAllByRole('button', { name: t('auth.signIn') });
  assert.equal(buttons.length, 2, 'the notice button and the footer link');
  await view.press(buttons[0]);

  assert.equal(view.queryByText(t('auth.accountCreated')), null);
  assert.ok(view.getByRole('header', { name: t('auth.welcomeBack') }));
  assert.equal(view.getByLabelText(t('auth.email')).props.value, 'ruth@example.com');
});

test('the app mark and the Google mark are decorative', async () => {
  const view = await renderAuth();
  const images = view.queryAllByType('Image');
  assert.equal(images.length, 2);
  for (const image of images) {
    assert.equal(image.props.accessible, false);
    assert.equal(image.props.importantForAccessibility, 'no-hide-descendants');
  }
});

test('iOS pads the keyboard avoider', async () => {
  const view = await renderAuth();
  const [avoider] = view.queryAllByType('KeyboardAvoidingView');
  assert.equal(avoider.props.behavior, 'padding');
});
