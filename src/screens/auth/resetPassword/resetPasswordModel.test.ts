import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activationProblem,
  canRequestNewLink,
  initialResetPhase,
  resetFailureMessageKey,
  validateNewPassword,
} from './resetPasswordModel';

test('only a parked code starts at the confirm step', () => {
  assert.equal(initialResetPhase({ kind: 'code' }), 'confirm');
  assert.equal(initialResetPhase({ kind: 'implicit' }), 'problem');
  assert.equal(initialResetPhase(null), 'problem');
});

test('an activation names its problem, and a missing link reads as expired', () => {
  assert.equal(activationProblem({ status: 'activated' }), null);
  assert.equal(activationProblem({ status: 'missing' }), 'expired');
  for (const problem of ['wrong-device', 'expired', 'network', 'configuration'] as const) {
    assert.equal(activationProblem({ status: 'failed', problem }), problem);
  }
});

test('a new link can be requested unless the backend is not configured', () => {
  assert.equal(canRequestNewLink('configuration'), false);
  assert.equal(canRequestNewLink('expired'), true);
  assert.equal(canRequestNewLink('wrong-device'), true);
  assert.equal(canRequestNewLink('network'), true);
});

test('a new password follows the sign-up rule and must be repeated exactly', () => {
  assert.deepEqual(validateNewPassword('', ''), { password: 'auth.passwordRequired' });
  assert.deepEqual(validateNewPassword('12345', '12345'), { password: 'auth.passwordMinLength' });
  assert.deepEqual(validateNewPassword('new-secret', 'new-secre'), {
    confirmPassword: 'auth.passwordsDoNotMatch',
  });
  assert.deepEqual(validateNewPassword('123', '12'), {
    password: 'auth.passwordMinLength',
    confirmPassword: 'auth.passwordsDoNotMatch',
  });
  assert.deepEqual(validateNewPassword('new-secret', 'new-secret'), {});
});

test('a refused update maps its code, and anything else reads as an invalid session', () => {
  assert.equal(resetFailureMessageKey('service_unavailable'), 'auth.serviceUnavailable');
  assert.equal(resetFailureMessageKey('configuration'), 'auth.backendNotConfigured');
  assert.equal(resetFailureMessageKey('unknown'), 'auth.resetPasswordInvalidSession');
  assert.equal(resetFailureMessageKey(undefined), 'auth.resetPasswordInvalidSession');
});
