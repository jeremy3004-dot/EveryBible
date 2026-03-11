import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSyncedGroupServiceReady,
  getSyncedGroupServiceAvailability,
} from './groupServiceGuards';

test('marks synced group services unavailable when the backend is not configured', () => {
  assert.equal(
    getSyncedGroupServiceAvailability({
      backendConfigured: false,
      signedIn: true,
    }),
    'backend-unavailable'
  );
});

test('marks synced group services sign-in-required when auth is missing', () => {
  assert.equal(
    getSyncedGroupServiceAvailability({
      backendConfigured: true,
      signedIn: false,
    }),
    'signin-required'
  );
});

test('marks synced group services ready when backend and auth are available', () => {
  assert.equal(
    getSyncedGroupServiceAvailability({
      backendConfigured: true,
      signedIn: true,
    }),
    'ready'
  );
});

test('throws a stable error when synced group services are unavailable in the build', () => {
  assert.throws(
    () =>
      assertSyncedGroupServiceReady({
        backendConfigured: false,
        signedIn: true,
      }),
    /backend is not configured/i
  );
});

test('throws a stable error when a synced action requires sign-in', () => {
  assert.throws(
    () =>
      assertSyncedGroupServiceReady({
        backendConfigured: true,
        signedIn: false,
      }),
    /must be signed in/i
  );
});
