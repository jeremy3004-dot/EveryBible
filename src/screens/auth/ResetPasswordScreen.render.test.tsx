import test, { mock } from 'node:test';
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
};
const pulls: string[] = [];

mockBarrel(mock, 'services/auth/index.ts', {
  provide: {
    updatePassword: async () => recovery.updateResult,
    getCurrentSession: async () => ({ session: recovery.session }),
    resetPassword: async (email: string) => {
      recovery.resets.push(email);
      return recovery.resetResult;
    },
    signOut: async () => {
      recovery.signOuts += 1;
    },
  },
});
mockModule(mock, sourcePath('services/auth/authDeepLink.ts'), {
  getPendingPasswordRecovery: () => recovery.pending,
  activatePendingPasswordRecovery: async () => recovery.activation,
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
  pulls.length = 0;
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
