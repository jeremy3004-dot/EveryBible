import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRecoveryExchangeError,
  parseRecoveryLink,
  recoveryProblemMessageKey,
} from './authRecoveryLink';

const CODE = '6f1c7a0e-2b7d-4a55-9d7e-3f0b8f2c1a90';

test('a PKCE reset link yields its authorization code', () => {
  assert.deepEqual(parseRecoveryLink(`com.everybible.app://reset-password?code=${CODE}`), {
    kind: 'code',
    code: CODE,
  });
});

test('the reset link is accepted with a trailing slash and a mixed-case scheme and host', () => {
  assert.deepEqual(parseRecoveryLink(`COM.EVERYBIBLE.APP://Reset-Password/?code=${CODE}`), {
    kind: 'code',
    code: CODE,
  });
});

test('a code that is not a plain token is refused rather than sent to Supabase', () => {
  for (const code of ['', 'abc', 'a b c d e f g h', `${CODE}%00`, 'x'.repeat(200)]) {
    assert.deepEqual(
      parseRecoveryLink(`com.everybible.app://reset-password?code=${code}`),
      { kind: 'unusable', reason: 'missing-code' },
      `code ${JSON.stringify(code)}`
    );
  }
});

// Emails sent before the PKCE switch carry a live session in the fragment.
// Accepting them is exactly the scheme-hijack exposure, so they are refused.
test('an old implicit-flow link carrying session tokens is refused', () => {
  assert.deepEqual(
    parseRecoveryLink(
      'com.everybible.app://reset-password#access_token=abc123&refresh_token=def456&type=recovery'
    ),
    { kind: 'unusable', reason: 'legacy-token' }
  );
  assert.deepEqual(
    parseRecoveryLink(
      'com.everybible.app://reset-password?access_token=abc123&refresh_token=def456&type=recovery'
    ),
    { kind: 'unusable', reason: 'legacy-token' }
  );
});

test('a link that carries both a code and session tokens is refused', () => {
  assert.deepEqual(
    parseRecoveryLink(`com.everybible.app://reset-password?code=${CODE}#access_token=abc123`),
    { kind: 'unusable', reason: 'legacy-token' }
  );
});

test('the error redirect Supabase sends for an expired or used email link is recognised', () => {
  assert.deepEqual(
    parseRecoveryLink(
      'com.everybible.app://reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    ),
    { kind: 'unusable', reason: 'link-error' }
  );
  assert.deepEqual(
    parseRecoveryLink(
      'com.everybible.app://reset-password#error=access_denied&error_code=otp_expired'
    ),
    { kind: 'unusable', reason: 'link-error' }
  );
});

test('a bare reset link with nothing to exchange is unusable', () => {
  assert.deepEqual(parseRecoveryLink('com.everybible.app://reset-password'), {
    kind: 'unusable',
    reason: 'missing-code',
  });
});

test('links that are not the app reset link are not recovery links at all', () => {
  for (const url of [
    'com.everybible.app://bible/JHN/3',
    'com.everybible.app://auth/callback?code=' + CODE,
    `com.everybible.app://reset-password.attacker.example?code=${CODE}`,
    `com.everybible.app://reset-passwordx?code=${CODE}`,
    `com.everybible.app://reset-password/extra?code=${CODE}`,
    `https://everybible.app/reset-password?code=${CODE}`,
    `exp://127.0.0.1:8081/--/reset-password?code=${CODE}`,
    `evil://reset-password?code=${CODE}`,
  ]) {
    assert.equal(parseRecoveryLink(url), null, url);
  }
});

test('a malformed percent-escape does not throw', () => {
  assert.deepEqual(parseRecoveryLink('com.everybible.app://reset-password?code=%E0%A4%A'), {
    kind: 'unusable',
    reason: 'missing-code',
  });
});

test('a missing code verifier means the link was opened away from the requesting install', () => {
  assert.equal(
    classifyRecoveryExchangeError({
      name: 'AuthPKCECodeVerifierMissingError',
      code: 'pkce_code_verifier_not_found',
      status: 400,
    }),
    'wrong-device'
  );
});

test('an expired, used, or superseded code is reported as an expired link', () => {
  for (const code of ['flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'x']) {
    assert.equal(
      classifyRecoveryExchangeError({ name: 'AuthApiError', code, status: 400 }),
      'expired',
      code
    );
  }
  assert.equal(classifyRecoveryExchangeError(null), 'expired');
});

test('a transport failure is reported as a network problem', () => {
  assert.equal(
    classifyRecoveryExchangeError({ name: 'AuthRetryableFetchError', status: 0 }),
    'network'
  );
  assert.equal(classifyRecoveryExchangeError(new TypeError('Network request failed')), 'network');
});

test('every recovery problem maps to a translated message key', () => {
  assert.equal(recoveryProblemMessageKey('wrong-device'), 'auth.resetLinkWrongDevice');
  assert.equal(recoveryProblemMessageKey('expired'), 'auth.resetPasswordInvalidSession');
  assert.equal(recoveryProblemMessageKey('network'), 'auth.serviceUnavailable');
  assert.equal(recoveryProblemMessageKey('configuration'), 'auth.backendNotConfigured');
});
