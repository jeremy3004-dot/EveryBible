import test from 'node:test';
import assert from 'node:assert/strict';

test('resolveInitializedAuthState clears stale persisted auth when no live session exists', async () => {
  const authSessionState = await import('./authSessionState').catch(() => null);

  assert.ok(authSessionState, 'authSessionState module should exist');
  assert.equal(typeof authSessionState.resolveInitializedAuthState, 'function');

  const staleUser = {
    uid: 'user-1',
    email: 'reader@example.com',
    displayName: 'Reader',
    photoURL: null,
    createdAt: 1,
    lastActive: 2,
  };

  assert.deepEqual(
    authSessionState.resolveInitializedAuthState({
      session: null,
      user: staleUser,
    }),
    {
      session: null,
      user: null,
      isAuthenticated: false,
    }
  );
});

test('resolveInitializedAuthState preserves a restored live session', async () => {
  const authSessionState = await import('./authSessionState').catch(() => null);

  assert.ok(authSessionState, 'authSessionState module should exist');
  assert.equal(typeof authSessionState.resolveInitializedAuthState, 'function');

  const restoredSession = { access_token: 'token', user: { id: 'user-1' } };
  const restoredUser = {
    uid: 'user-1',
    email: 'reader@example.com',
    displayName: 'Reader',
    photoURL: null,
    createdAt: 1,
    lastActive: 2,
  };

  assert.deepEqual(
    authSessionState.resolveInitializedAuthState({
      session: restoredSession,
      user: restoredUser,
    }),
    {
      session: restoredSession,
      user: restoredUser,
      isAuthenticated: true,
    }
  );
});
