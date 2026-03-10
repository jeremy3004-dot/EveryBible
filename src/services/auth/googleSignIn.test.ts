import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleSignInInitializer,
  resolveGoogleSignInConfig,
} from './googleSignIn';

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

  assert.equal(initialize(), true);
  assert.equal(initialize(), true);
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

  assert.equal(initialize(), false);
  assert.deepEqual(calls, []);
});
