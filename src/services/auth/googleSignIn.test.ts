import test from 'node:test';
import assert from 'node:assert/strict';
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
