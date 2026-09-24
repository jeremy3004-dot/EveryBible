import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

const recovery = {
  pending: { subject: 'recovery-uid', email: 'ruth@example.com' } as {
    subject: string;
    email: string;
  } | null,
  activation: 'activated',
  updateResult: { success: true } as { success: boolean; code?: string; error?: string },
  session: { user: { id: 'recovery-uid' } } as { user: { id: string } } | null,
  signOuts: 0,
};
const pulls: string[] = [];

mockBarrel(mock, 'services/auth/index.ts', {
  provide: {
    updatePassword: async () => recovery.updateResult,
    getCurrentSession: async () => ({ session: recovery.session }),
    signOut: async () => {
      recovery.signOuts += 1;
    },
  },
});
mockModule(mock, sourcePath('services/auth/authDeepLink.ts'), {
  getPendingPasswordRecovery: () => recovery.pending,
  activatePendingPasswordRecovery: async () => ({ status: recovery.activation }),
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
  recovery.pending = { subject: 'recovery-uid', email: 'ruth@example.com' };
  recovery.activation = 'activated';
  recovery.updateResult = { success: true };
  recovery.session = { user: { id: 'recovery-uid' } };
  recovery.signOuts = 0;
  pulls.length = 0;
});

async function renderReset() {
  const { ResetPasswordScreen } = await import('./ResetPasswordScreen');
  return harness.render(<ResetPasswordScreen />);
}

test('a signed-out device confirms the account named in the link before showing the form', async () => {
  const view = await renderReset();

  assert.ok(view.getByText(t('auth.resetLinkConfirmBody', { email: 'ruth@example.com' })));
  await view.press(view.getByRole('button', { name: t('common.continue') }));

  assert.ok(view.getByLabelText(t('auth.newPassword')));
  assert.ok(view.getByLabelText(t('auth.confirmNewPassword')));
});

test('a new password stores the recovery session and restores that user from the cloud', async () => {
  recovery.session = { user: { id: 'recovery-uid' } };
  const view = await renderReset();
  await view.press(view.getByRole('button', { name: t('common.continue') }));

  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));

  assert.deepEqual(harness.authStore.getState().session, { user: { id: 'recovery-uid' } });
  assert.deepEqual(pulls, ['recovery-uid']);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.title, t('auth.resetPasswordSuccess'));
});

test('an expired recovery session shows the translated message instead of the raw error', async () => {
  recovery.updateResult = { success: false, code: 'unknown', error: 'raw service error' };
  const view = await renderReset();
  await view.press(view.getByRole('button', { name: t('common.continue') }));

  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));

  assert.ok(view.getByText(t('auth.resetPasswordInvalidSession')));
  assert.equal(view.queryByText('raw service error'), null);
  assert.deepEqual(pulls, []);
});

test('leaving after activating on a signed-out device signs the recovery session out', async () => {
  const view = await renderReset();
  await view.press(view.getByRole('button', { name: t('common.continue') }));
  await view.unmount();

  assert.equal(recovery.signOuts, 1);
});
