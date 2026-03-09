import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSilentAuthError,
  mapAppleAuthError,
  mapGoogleAuthError,
  mapSupabaseAuthError,
} from './authErrors';

test('mapGoogleAuthError maps cancelled to a silent auth error', () => {
  const result = mapGoogleAuthError({
    code: 'SIGN_IN_CANCELLED',
    message: 'The flow was cancelled',
  });

  assert.equal(result.code, 'cancelled');
  assert.equal(isSilentAuthError(result.code), true);
});

test('mapGoogleAuthError maps in-progress to a stable code', () => {
  const result = mapGoogleAuthError({
    code: 'IN_PROGRESS',
    message: 'Already in progress',
  });

  assert.equal(result.code, 'in_progress');
  assert.equal(result.error, 'Already in progress');
});

test('mapAppleAuthError maps request cancellation to cancelled', () => {
  const result = mapAppleAuthError({
    code: 'ERR_REQUEST_CANCELED',
    message: 'Request cancelled',
  });

  assert.equal(result.code, 'cancelled');
});

test('mapSupabaseAuthError maps bad credentials without relying on message text', () => {
  const result = mapSupabaseAuthError({
    status: 400,
    message: 'Invalid login credentials',
  });

  assert.equal(result.code, 'invalid_credentials');
});
