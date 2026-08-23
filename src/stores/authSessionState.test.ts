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

test('auth boundaries preserve guest progress but reset account-owned state', async () => {
  const authSessionState = await import('./authSessionState');

  assert.equal(
    authSessionState.shouldResetPerUserStateAtAuthBoundary({
      previousUserId: null,
      nextUserId: 'user-b',
      lastSyncedUserId: null,
    }),
    false,
    'guest progress and preferences should transfer into the first account'
  );
  assert.equal(
    authSessionState.shouldResetPerUserStateAtAuthBoundary({
      previousUserId: 'user-a',
      nextUserId: 'user-b',
      lastSyncedUserId: null,
    }),
    true,
    'account A state must be cleared before account B syncs'
  );
  assert.equal(
    authSessionState.shouldResetPerUserStateAtAuthBoundary({
      previousUserId: 'user-a',
      nextUserId: 'user-b',
      lastSyncedUserId: 'user-b',
    }),
    true,
    'a stale owner marker must not suppress an A-to-B reset'
  );
  assert.equal(
    authSessionState.shouldResetPerUserStateAtAuthBoundary({
      previousUserId: 'user-b',
      nextUserId: 'user-b',
      lastSyncedUserId: 'user-b',
    }),
    false,
    'same-user token refreshes must preserve preferences and plan state'
  );
  assert.equal(
    authSessionState.shouldResetPerUserStateAtAuthBoundary({
      previousUserId: null,
      nextUserId: null,
      lastSyncedUserId: null,
    }),
    false,
    'first-launch guest state must not be wiped by an empty auth callback'
  );
  assert.equal(
    authSessionState.shouldResetPerUserStateAtAuthBoundary({
      previousUserId: 'user-a',
      nextUserId: null,
      lastSyncedUserId: 'user-a',
    }),
    true,
    'a session-expiry callback must clear account A stores before guest state resumes'
  );
});

test('first guest-to-account boundary consumes guest tombstones without deleting guest progress', async () => {
  const authSessionState = await import('./authSessionState');
  const { createReadingPlansStore } = await import('./readingPlansStore');
  const store = createReadingPlansStore({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  const guestProgress = store.getState().enrollPlan('sermon-on-the-mount-7-days');
  store.getState().addPendingUnenroll('legacy-guest-plan');

  const shouldResetAll = authSessionState.shouldResetPerUserStateAtAuthBoundary({
    previousUserId: null,
    nextUserId: 'user-b',
    lastSyncedUserId: null,
  });
  assert.equal(shouldResetAll, false);

  // This is the actual injectable boundary action used by authStore: only
  // legacy guest tombstones are consumed; normal guest progress remains
  // transferable.
  authSessionState.applyAuthBoundaryEffects(
    {
      previousUserId: null,
      nextUserId: 'user-b',
      lastSyncedUserId: null,
    },
    {
      resetPerUserState: () => assert.fail('guest boundary must not reset progress'),
      resetPreferences: () => assert.fail('guest boundary must not reset preferences'),
      clearGuestTombstones: () => store.getState().clearPendingUnenrolls(),
    }
  );
  assert.deepEqual(store.getState().pendingUnenrollPlanIds, []);
  assert.deepEqual(store.getState().getProgress(guestProgress.plan_id), guestProgress);
});

test('auth boundary effects reset account state for A-to-B and session expiry', async () => {
  const authSessionState = await import('./authSessionState');
  let resetCount = 0;
  let preferenceResetCount = 0;
  let guestClearCount = 0;
  const effects = {
    resetPerUserState: () => {
      resetCount += 1;
    },
    resetPreferences: () => {
      preferenceResetCount += 1;
    },
    clearGuestTombstones: () => {
      guestClearCount += 1;
    },
  };

  assert.equal(
    authSessionState.applyAuthBoundaryEffects(
      { previousUserId: 'user-a', nextUserId: 'user-b', lastSyncedUserId: 'user-a' },
      effects
    ),
    'reset'
  );
  assert.equal(
    authSessionState.applyAuthBoundaryEffects(
      { previousUserId: 'user-a', nextUserId: null, lastSyncedUserId: 'user-a' },
      effects
    ),
    'reset'
  );
  assert.equal(resetCount, 2);
  assert.equal(preferenceResetCount, 2);
  assert.equal(guestClearCount, 0);
});
