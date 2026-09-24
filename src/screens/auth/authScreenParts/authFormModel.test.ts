import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authFailureMessageKey,
  authFailureTitleKey,
  authModeCopyKeys,
  emailErrorKey,
  hasFormErrors,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  otherAuthMode,
  passwordErrorKey,
  validateAuthForm,
} from './authFormModel';

test('an address is trimmed before it is checked or sent', () => {
  assert.equal(normalizeEmail('  ruth@example.com '), 'ruth@example.com');
  assert.equal(emailErrorKey(' ruth@example.com '), undefined);
});

test('an address is required and must look like one', () => {
  assert.equal(emailErrorKey(''), 'auth.emailRequired');
  assert.equal(emailErrorKey('   '), 'auth.emailRequired');
  assert.equal(emailErrorKey('ruth'), 'auth.emailInvalid');
  assert.equal(emailErrorKey('ruth@example'), 'auth.emailInvalid');
  assert.equal(emailErrorKey('ruth x@example.com'), undefined, 'the check is unanchored');
});

test('a password is required and at least six characters, spaces included', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  assert.equal(passwordErrorKey(''), 'auth.passwordRequired');
  assert.equal(passwordErrorKey('12345'), 'auth.passwordMinLength');
  assert.equal(passwordErrorKey('123456'), undefined);
  assert.equal(passwordErrorKey('      '), undefined, 'passwords are never trimmed');
});

test('the form reports each failing field and nothing for valid input', () => {
  assert.deepEqual(validateAuthForm('', ''), {
    email: 'auth.emailRequired',
    password: 'auth.passwordRequired',
  });
  assert.deepEqual(validateAuthForm('ruth@example.com', '123'), {
    password: 'auth.passwordMinLength',
  });
  assert.deepEqual(validateAuthForm('ruth@example.com', 'secret-pass'), {});
  assert.equal(hasFormErrors({}), false);
  assert.equal(hasFormErrors({ email: undefined }), false);
  assert.equal(hasFormErrors({ password: 'auth.passwordRequired' }), true);
});

test('failure codes map to translated messages, and anything else to the fallback', () => {
  assert.deepEqual(
    (
      [
        'in_progress',
        'provider_unavailable',
        'service_unavailable',
        'configuration',
        'invalid_credentials',
        'cancelled',
        undefined,
      ] as const
    ).map((code) => authFailureMessageKey(code, 'auth.checkCredentials')),
    [
      'auth.signInAlreadyInProgress',
      'auth.providerUnavailable',
      'auth.serviceUnavailable',
      'auth.backendNotConfigured',
      'auth.checkCredentials',
      'auth.checkCredentials',
      'auth.checkCredentials',
    ]
  );
});

test('each mode has its own copy and failure title, and the switch flips the mode', () => {
  assert.equal(authFailureTitleKey('signIn'), 'auth.signInFailed');
  assert.equal(authFailureTitleKey('signUp'), 'auth.signUpFailed');
  assert.equal(otherAuthMode('signIn'), 'signUp');
  assert.equal(otherAuthMode('signUp'), 'signIn');
  assert.deepEqual(authModeCopyKeys('signIn'), {
    title: 'auth.welcomeBack',
    subtitle: 'auth.signInSubtitle',
    primaryLabel: 'auth.signIn',
    switchLead: 'auth.newHere',
    switchAction: 'auth.createAnAccount',
    passwordPlaceholder: 'auth.passwordPlaceholder',
  });
  assert.deepEqual(authModeCopyKeys('signUp'), {
    title: 'auth.createAnAccount',
    subtitle: 'auth.signUpSubtitle',
    primaryLabel: 'auth.createAccount',
    switchLead: 'auth.alreadyHaveAccount',
    switchAction: 'auth.signIn',
    passwordPlaceholder: 'auth.passwordHint',
  });
});
