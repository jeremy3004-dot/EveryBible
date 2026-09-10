import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as googleSignIn from './googleSignIn';

const { createGoogleSignInInitializer, resolveGoogleSignInConfig } = googleSignIn;

test('resolveGoogleSignInConfig returns null when no client IDs are available', () => {
  assert.equal(resolveGoogleSignInConfig({}), null);
});

test('resolveGoogleSignInConfig returns the available IDs without inventing values', () => {
  assert.deepEqual(
    resolveGoogleSignInConfig({
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client',
    }),
    {
      iosClientId: 'ios-client',
      webClientId: 'web-client',
    }
  );
});

test('google sign-in initializer configures at most once and only when values exist', () => {
  const calls: Array<{ iosClientId?: string; webClientId?: string }> = [];
  const initialize = createGoogleSignInInitializer({
    env: {
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client',
    },
    configure: (config) => {
      calls.push(config);
    },
  });

  assert.deepEqual(initialize(), { available: true });
  assert.deepEqual(initialize(), { available: true });
  assert.deepEqual(calls, [
    {
      iosClientId: 'ios-client',
      webClientId: 'web-client',
    },
  ]);
});

test('google sign-in initializer safely skips configuration when IDs are missing', () => {
  const calls: Array<{ iosClientId?: string; webClientId?: string }> = [];
  const initialize = createGoogleSignInInitializer({
    env: {},
    configure: (config) => {
      calls.push(config);
    },
  });

  assert.deepEqual(initialize(), {
    available: false,
    reason: 'missing_client_ids',
  });
  assert.deepEqual(calls, []);
});

test('resolveGoogleSignInAvailability flags android-only client ID configuration', () => {
  assert.equal(typeof googleSignIn.resolveGoogleSignInAvailability, 'function');
  assert.deepEqual(
    googleSignIn.resolveGoogleSignInAvailability({
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: 'android-client',
    }),
    {
      available: false,
      reason: 'android_client_id_only',
    }
  );
});

test('the Android Google sign-in catch names DEVELOPER_ERROR instead of falling through to a generic failure', () => {
  // authService pulls in the React Native runtime, so assert on its source: the
  // native status 10 (no matching Android OAuth client) must reach
  // mapGoogleAuthError with its own code and leave a line in logcat.
  const source = readFileSync(
    fileURLToPath(new URL('./authService.ts', import.meta.url).href),
    'utf8'
  );

  // The native module rejects with Android's raw CommonStatusCodes value, and
  // `statusCodes` from the library does not expose DEVELOPER_ERROR at all.
  assert.match(
    source,
    /const GOOGLE_ANDROID_DEVELOPER_ERROR_CODE = '10';/,
    'the Android DEVELOPER_ERROR status number should be named, not inlined'
  );

  assert.match(
    source,
    /case GOOGLE_ANDROID_DEVELOPER_ERROR_CODE:/,
    'signInWithGoogle should branch on the Android DEVELOPER_ERROR status code'
  );

  assert.match(
    source,
    /console\.error\(\s*'\[Auth\] Google DEVELOPER_ERROR/,
    'the DEVELOPER_ERROR branch should log so the failure is diagnosable in logcat'
  );

  assert.match(
    source,
    /code: 'DEVELOPER_ERROR',/,
    'the DEVELOPER_ERROR branch should forward a canonical code to mapGoogleAuthError'
  );
});
