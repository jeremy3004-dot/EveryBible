import test, { mock } from 'node:test';
import { act } from 'react';
import assert from 'node:assert/strict';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

type Activation =
  | { status: 'activated' }
  | { status: 'failed'; problem: 'wrong-device' | 'expired' | 'network' | 'configuration' };

const recovery = {
  pending: { kind: 'code', subject: 'recovery-uid' } as { kind: string; subject: string } | null,
  activation: { status: 'activated' } as Activation,
  updateResult: { success: true } as { success: boolean; code?: string; error?: string },
  resetResult: { success: true } as { success: boolean },
  session: { user: { id: 'recovery-uid' } } as { user: { id: string } } | null,
  resets: [] as string[],
  signOuts: 0,
  activations: [] as Array<string | null>,
  // While set, activation and the password update wait on it.
  gate: null as Promise<void> | null,
  throwOnUpdate: false,
  throwOnReset: false,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const pulls: string[] = [];

mockBarrel(mock, 'services/auth/index.ts', {
  provide: {
    updatePassword: async () => {
      if (recovery.gate) await recovery.gate;
      if (recovery.throwOnUpdate) throw new Error('network down');
      return recovery.updateResult;
    },
    getCurrentSession: async () => ({ session: recovery.session }),
    resetPassword: async (email: string) => {
      recovery.resets.push(email);
      if (recovery.throwOnReset) throw new Error('network down');
      return recovery.resetResult;
    },
    signOut: async () => {
      recovery.signOuts += 1;
    },
  },
});
mockModule(mock, sourcePath('services/auth/authDeepLink.ts'), {
  getPendingPasswordRecovery: () => recovery.pending,
  activatePendingPasswordRecovery: async (options: { signedInUserId: string | null }) => {
    recovery.activations.push(options.signedInUserId);
    if (recovery.gate) await recovery.gate;
    return recovery.activation;
  },
  clearPendingPasswordRecovery: () => {},
});
mockBarrel(mock, 'services/sync/index.ts', {
  provide: {
    pullFromCloud: async (userId: string) => {
      pulls.push(userId);
    },
  },
});

test.beforeEach(() => {
  recovery.pending = { kind: 'code', subject: 'recovery-uid' };
  recovery.activation = { status: 'activated' };
  recovery.updateResult = { success: true };
  recovery.resetResult = { success: true };
  recovery.session = { user: { id: 'recovery-uid' } };
  recovery.resets.length = 0;
  recovery.signOuts = 0;
  recovery.activations.length = 0;
  recovery.gate = null;
  recovery.throwOnUpdate = false;
  recovery.throwOnReset = false;
  pulls.length = 0;
  harness.authStore.setState({ user: null, session: null });
});

async function renderReset() {
  const { ResetPasswordScreen } = await import('./ResetPasswordScreen');
  return harness.render(<ResetPasswordScreen />);
}

type View = Awaited<ReturnType<typeof renderReset>>;

async function continueToForm(view: View) {
  assert.ok(view.getByText(t('auth.resetLinkConfirmTitle')));
  await view.press(view.getByRole('button', { name: t('common.continue') }));
}

async function submitNewPassword(view: View) {
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
}

test('a reset link asks before exchanging its code, then shows the new-password form', async () => {
  const view = await renderReset();
  assert.equal(view.queryByLabelText(t('auth.newPassword')), null);

  await continueToForm(view);
  assert.ok(view.getByLabelText(t('auth.newPassword')));
  assert.ok(view.getByLabelText(t('auth.confirmNewPassword')));
});

test('a new password stores the recovery session and restores that user from the cloud', async () => {
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);

  assert.deepEqual(harness.authStore.getState().session, { user: { id: 'recovery-uid' } });
  assert.deepEqual(pulls, ['recovery-uid']);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.title, t('auth.resetPasswordSuccess'));
});

test('an expired recovery session shows the translated message instead of the raw error', async () => {
  recovery.updateResult = { success: false, code: 'unknown', error: 'raw service error' };
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);

  assert.ok(view.getByText(t('auth.resetPasswordInvalidSession')));
  assert.equal(view.queryByText('raw service error'), null);
  assert.deepEqual(pulls, []);
});

test('leaving after activating on a signed-out device signs the recovery session out', async () => {
  const view = await renderReset();
  await continueToForm(view);
  await view.unmount();

  assert.equal(recovery.signOuts, 1);
});

test('a link that cannot be used explains why and offers to email a new one', async () => {
  recovery.activation = { status: 'failed', problem: 'wrong-device' };
  const view = await renderReset();
  await continueToForm(view);

  assert.ok(view.getByText(t('auth.resetLinkWrongDevice')));
  await view.changeText(view.getByLabelText(t('auth.email')), ' ruth@example.com ');
  await view.press(view.getByRole('button', { name: t('auth.sendNewResetLink') }));

  assert.deepEqual(recovery.resets, ['ruth@example.com']);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.title, t('auth.checkYourEmail'));
});

test('without a pending link the screen goes straight to the expired-link explanation', async () => {
  recovery.pending = null;
  const view = await renderReset();

  assert.ok(view.getByText(t('auth.resetPasswordInvalidSession')));
  assert.equal(view.queryByRole('button', { name: t('common.continue') }), null);
  await view.press(view.getByRole('button', { name: t('auth.sendNewResetLink') }));
  assert.ok(view.getByLabelText(`${t('auth.email')}, ${t('auth.emailRequiredForReset')}`));
  assert.deepEqual(recovery.resets, []);
});

test('an unconfigured backend says so and does not offer a new link', async () => {
  recovery.activation = { status: 'failed', problem: 'configuration' };
  const view = await renderReset();
  await continueToForm(view);

  assert.ok(view.getByText(t('auth.backendNotConfigured')));
  assert.equal(view.queryByRole('button', { name: t('auth.sendNewResetLink') }), null);
});

test('a new password shorter than six characters, or not repeated exactly, is not sent', async () => {
  const view = await renderReset();
  await continueToForm(view);

  await view.changeText(view.getByLabelText(t('auth.newPassword')), '12345');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), '12345');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
  assert.ok(view.getByLabelText(`${t('auth.newPassword')}, ${t('auth.passwordMinLength')}`));

  await view.changeText(
    view.getByLabelText(`${t('auth.newPassword')}, ${t('auth.passwordMinLength')}`),
    'new-secret'
  );
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secre');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
  assert.ok(view.getByText(t('auth.passwordsDoNotMatch')));

  assert.deepEqual(pulls, []);
  assert.equal(
    harness.rn.__recorded.alerts.some((alert) => alert.title === t('auth.resetPasswordSuccess')),
    false
  );
});

test('a password update refused while the service is down says so, translated', async () => {
  recovery.updateResult = { success: false, code: 'service_unavailable', error: 'raw 503' };
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);

  assert.ok(view.getByText(t('auth.serviceUnavailable')));
  assert.equal(view.queryByText('raw 503'), null);
});

test('a failed request for a new link keeps the reader on the screen with the reason', async () => {
  recovery.pending = null;
  recovery.resetResult = { success: false };
  const view = await renderReset();

  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.press(view.getByRole('button', { name: t('auth.sendNewResetLink') }));

  assert.deepEqual(recovery.resets, ['ruth@example.com']);
  assert.ok(view.getByLabelText(`${t('auth.email')}, ${t('auth.resetEmailError')}`));
  assert.equal(
    harness.rn.__recorded.alerts.some((alert) => alert.title === t('auth.checkYourEmail')),
    false
  );
});

test('cancelling a reset closes the flow without exchanging anything', async () => {
  const view = await renderReset();

  await view.press(view.getAllByRole('button', { name: t('common.cancel') })[0]);

  assert.equal(recovery.signOuts, 0);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

const lastAlert = () => harness.rn.__recorded.alerts.at(-1);

/** Press the OK button of the last alert, as the user would. */
async function acceptAlert(view: View) {
  const buttons = (lastAlert()?.buttons ?? []) as Array<{ text?: string; onPress?: () => void }>;
  const ok = buttons.find((button) => button.text === t('common.ok'));
  assert.ok(ok?.onPress, 'the alert has an OK button');
  await act(async () => ok.onPress?.());
  await view.flush();
}

test('a signed-in reader is told Continue signs the current account out, and the activation knows who', async () => {
  harness.authStore.setState({ user: { uid: 'signed-in-uid' } });
  const view = await renderReset();

  assert.ok(view.getByText(t('auth.resetLinkSignsOutCurrent')));
  assert.equal(view.queryByText(t('auth.resetPasswordSubtitle')), null);
  await continueToForm(view);
  assert.deepEqual(recovery.activations, ['signed-in-uid']);
});

test('a signed-out reader sees the reset subtitle on the confirm step', async () => {
  const view = await renderReset();
  assert.ok(view.getByText(t('auth.resetPasswordSubtitle')));
  assert.ok(view.getByRole('header', { name: t('auth.resetLinkConfirmTitle') }));
  await continueToForm(view);
  assert.deepEqual(recovery.activations, [null]);
});

test('while the link is being checked Continue and Cancel are disabled and a spinner shows', async () => {
  const gate = deferred();
  recovery.gate = gate.promise;
  const view = await renderReset();
  const pending = (
    view.getByRole('button', { name: t('common.continue') }).props.onPress as () => void
  )();
  await view.flush();

  assert.ok(view.getByRole('button', { name: t('common.continue'), disabled: true }));
  assert.ok(view.getByRole('button', { name: t('common.cancel'), disabled: true }));
  assert.equal(view.queryAllByType('ActivityIndicator').length, 1);
  assert.equal(view.queryByText(t('common.continue')), null);

  await act(async () => {
    gate.resolve();
    await pending;
  });
  assert.ok(view.getByLabelText(t('auth.newPassword')));
});

for (const [problem, key] of [
  ['expired', 'auth.resetPasswordInvalidSession'],
  ['network', 'auth.serviceUnavailable'],
] as const) {
  test(`a link that fails with ${problem} explains it and still offers a new link`, async () => {
    recovery.activation = { status: 'failed', problem };
    const view = await renderReset();
    await continueToForm(view);

    assert.ok(view.getByText(t(key)));
    assert.ok(view.getByRole('button', { name: t('auth.sendNewResetLink') }));
    assert.ok(view.getByRole('header', { name: t('auth.resetPasswordTitle') }));
  });
}

test('a link already used up (missing) is explained as expired', async () => {
  recovery.activation = { status: 'missing' } as unknown as Activation;
  const view = await renderReset();
  await continueToForm(view);

  assert.ok(view.getByText(t('auth.resetPasswordInvalidSession')));
});

test('a new password is required, and the two fields share one reveal toggle', async () => {
  const view = await renderReset();
  await continueToForm(view);
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
  assert.ok(view.getByLabelText(`${t('auth.newPassword')}, ${t('auth.passwordRequired')}`));

  const secure = () =>
    view.queryAllByType('TextInput').map((input) => input.props.secureTextEntry as boolean);
  assert.deepEqual(secure(), [true, true]);
  await view.press(view.getByRole('button', { name: t('auth.showPassword') }));
  assert.deepEqual(secure(), [false, false]);
  assert.ok(view.getByRole('button', { name: t('auth.hidePassword') }));
});

test('typing clears the field error and the form error', async () => {
  recovery.updateResult = { success: false, code: 'unknown', error: 'raw' };
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);
  assert.ok(view.getByText(t('auth.resetPasswordInvalidSession')));

  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret!');
  assert.equal(view.queryByText(t('auth.resetPasswordInvalidSession')), null);

  await submitNewPassword(view);
  assert.ok(view.getByText(t('auth.resetPasswordInvalidSession')));
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'x');
  assert.equal(view.queryByText(t('auth.resetPasswordInvalidSession')), null);
});

test('a password update refused for configuration says the backend is not configured', async () => {
  recovery.updateResult = { success: false, code: 'configuration', error: 'raw' };
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);

  assert.ok(view.getByText(t('auth.backendNotConfigured')));
});

test('a password update that throws shows the generic reset error', async () => {
  recovery.throwOnUpdate = true;
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);

  assert.ok(view.getByText(t('auth.resetPasswordError')));
  assert.ok(view.getByRole('button', { name: t('auth.resetPasswordSubmit'), disabled: false }));
});

test('while the password is being saved the form is locked', async () => {
  const view = await renderReset();
  await continueToForm(view);
  const gate = deferred();
  recovery.gate = gate.promise;
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  const pending = (
    view.getByRole('button', { name: t('auth.resetPasswordSubmit') }).props.onPress as () => void
  )();
  await view.flush();

  assert.ok(view.getByRole('button', { name: t('auth.resetPasswordSubmit'), disabled: true }));
  assert.ok(view.getByRole('button', { name: t('auth.showPassword'), disabled: true }));
  assert.deepEqual(
    view.queryAllByType('TextInput').map((input) => input.props.editable),
    [false, false]
  );
  await act(async () => {
    gate.resolve();
    await pending;
  });
});

test('after a new password is saved, OK closes and leaving keeps the session', async () => {
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);
  await acceptAlert(view);

  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
  await view.unmount();
  assert.equal(recovery.signOuts, 0);
});

test('a saved password with no live session still succeeds, without a cloud restore', async () => {
  recovery.session = null;
  const view = await renderReset();
  await continueToForm(view);
  await submitNewPassword(view);

  assert.equal(lastAlert()?.title, t('auth.resetPasswordSuccess'));
  assert.deepEqual(pulls, []);
  assert.equal(harness.authStore.getState().session, null);
});

test('the new-password key moves to the confirm field, whose key submits', async () => {
  const view = await renderReset();
  await continueToForm(view);
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.fire(view.getByLabelText(t('auth.newPassword')), 'onSubmitEditing');
  assert.deepEqual(
    harness.refCalls.map((call) => [call.method, call.props.accessibilityLabel]),
    [['focus', t('auth.confirmNewPassword')]]
  );

  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.fire(view.getByLabelText(t('auth.confirmNewPassword')), 'onSubmitEditing');
  assert.equal(lastAlert()?.title, t('auth.resetPasswordSuccess'));
});

test('a new link that was sent closes the flow on OK', async () => {
  recovery.pending = null;
  const view = await renderReset();
  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.fire(view.getByLabelText(t('auth.email')), 'onSubmitEditing');

  assert.deepEqual(recovery.resets, ['ruth@example.com']);
  assert.equal(lastAlert()?.message, t('auth.resetLinkSent'));
  await acceptAlert(view);
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('a request for a new link that throws shows the reason, and typing clears it', async () => {
  recovery.pending = null;
  recovery.throwOnReset = true;
  const view = await renderReset();
  await view.changeText(view.getByLabelText(t('auth.email')), 'ruth@example.com');
  await view.press(view.getByRole('button', { name: t('auth.sendNewResetLink') }));

  assert.ok(view.getByText(t('auth.resetEmailError')));
  await view.changeText(
    view.getByLabelText(`${t('auth.email')}, ${t('auth.resetEmailError')}`),
    'ruth@example.org'
  );
  assert.equal(view.queryByText(t('auth.resetEmailError')), null);
});

test('the close button cancels from any step', async () => {
  const view = await renderReset();
  await view.press(view.getByRole('button', { name: t('interface.close') }));
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
  await view.unmount();
  assert.equal(recovery.signOuts, 0);
});

test('the scroll content keeps the submit button above the bottom inset', async () => {
  const view = await renderReset();
  const [scroll] = view.queryAllByType('ScrollView');
  const style = [scroll.props.contentContainerStyle].flat() as Array<Record<string, unknown>>;
  assert.equal(style.at(-1)?.paddingBottom, harness.insets.bottom);
});

// The header close button stays live while the link is checked. Closing then ran the
// unmount cleanup before the exchange finished, so the recovery session it opened
// was left signed in with no screen to finish or end it.
test('closing while the link is being checked signs out the session it then opens', async () => {
  const gate = deferred();
  recovery.gate = gate.promise;
  const view = await renderReset();
  const pending = (
    view.getByRole('button', { name: t('common.continue') }).props.onPress as () => void
  )();
  await view.flush();

  await view.press(view.getByRole('button', { name: t('interface.close') }));
  await view.unmount();
  assert.equal(recovery.signOuts, 0);

  await act(async () => {
    gate.resolve();
    await pending;
  });
  assert.equal(recovery.signOuts, 1);
});
