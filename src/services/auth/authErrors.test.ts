import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSilentAuthError,
  mapAppleAuthError,
  mapGoogleAuthError,
  mapProviderIdTokenAuthError,
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

test('mapGoogleAuthError names the Android DEVELOPER_ERROR configuration failure', () => {
  const result = mapGoogleAuthError({ code: 'DEVELOPER_ERROR' });

  // Android status 10 means no Android OAuth client matches this build. Before it
  // had a case it fell through to a bare 'unknown' failure the user could not act on.
  assert.equal(result.code, 'provider_unavailable');
  assert.match(result.error, /DEVELOPER_ERROR/);
  assert.equal(isSilentAuthError(result.code), false);
});

test('mapGoogleAuthError keeps the native DEVELOPER_ERROR message when one is present', () => {
  const result = mapGoogleAuthError({
    code: 'DEVELOPER_ERROR',
    message: 'DEVELOPER_ERROR (status 10)',
  });

  assert.equal(result.code, 'provider_unavailable');
  assert.equal(result.error, 'DEVELOPER_ERROR (status 10)');
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

test('mapSupabaseAuthError maps network failures to service_unavailable', () => {
  const result = mapSupabaseAuthError({
    message: 'Network request failed',
  });

  assert.equal(result.code, 'service_unavailable');
});

test('mapProviderIdTokenAuthError maps disabled provider errors to provider_unavailable', () => {
  const result = mapProviderIdTokenAuthError('google', {
    status: 400,
    message: 'Unsupported provider: provider is not enabled',
  });

  assert.equal(result.code, 'provider_unavailable');
  assert.equal(result.error, 'Google sign in is not enabled on the EveryBible backend yet.');
});

test('mapProviderIdTokenAuthError maps audience mismatch to provider_unavailable', () => {
  const result = mapProviderIdTokenAuthError('apple', {
    status: 400,
    message: 'Unacceptable audience in id_token',
  });

  assert.equal(result.code, 'provider_unavailable');
  assert.equal(result.error, 'Apple sign in is using the wrong client ID for this build.');
});
