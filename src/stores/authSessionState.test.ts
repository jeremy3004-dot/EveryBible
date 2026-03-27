import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';

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

  const restoredSession = {
    access_token: 'token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-1' },
  } as unknown as Session;
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

test('resolveUserStateUpdate keeps auth false when a profile exists without a live session', async () => {
  const authSessionState = await import('./authSessionState').catch(() => null);

  assert.ok(authSessionState, 'authSessionState module should exist');
  assert.equal(typeof authSessionState.resolveUserStateUpdate, 'function');

  const updatedUser = {
    uid: 'user-1',
    email: 'reader@example.com',
    displayName: 'Reader',
    photoURL: null,
    createdAt: 1,
    lastActive: 3,
  };

  assert.deepEqual(
    authSessionState.resolveUserStateUpdate({
      session: null,
      user: updatedUser,
    }),
    {
      user: updatedUser,
      isAuthenticated: false,
    }
  );
});

test('resolveUserStateUpdate preserves auth when a live session user profile changes', async () => {
  const authSessionState = await import('./authSessionState').catch(() => null);

  assert.ok(authSessionState, 'authSessionState module should exist');
  assert.equal(typeof authSessionState.resolveUserStateUpdate, 'function');

  const restoredSession = {
    access_token: 'token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-1' },
  } as unknown as Session;
  const updatedUser = {
    uid: 'user-1',
    email: 'reader@example.com',
    displayName: 'Updated Reader',
    photoURL: 'https://example.com/avatar.png',
    createdAt: 1,
    lastActive: 4,
  };

  assert.deepEqual(
    authSessionState.resolveUserStateUpdate({
      session: restoredSession,
      user: updatedUser,
    }),
    {
      user: updatedUser,
      isAuthenticated: true,
    }
  );
});
