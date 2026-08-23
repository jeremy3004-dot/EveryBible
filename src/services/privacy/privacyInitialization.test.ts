import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initializePrivacyWithTimeout, type PrivacySettingsLoader } from './privacyInitialization';

const settings = {
  mode: 'standard' as const,
  pin: null,
};

test('privacy initialization times out instead of waiting forever', async () => {
  const startedAt = Date.now();
  const result = await initializePrivacyWithTimeout(
    (() => new Promise<never>(() => {})) as PrivacySettingsLoader,
    5
  );

  assert.deepEqual(result, { status: 'timeout' });
  assert.ok(Date.now() - startedAt < 1_000);
});

test('a timed-out privacy initialization can be retried successfully', async () => {
  const firstAttempt = await initializePrivacyWithTimeout(
    (() => new Promise<never>(() => {})) as PrivacySettingsLoader,
    5
  );
  const retryAttempt = await initializePrivacyWithTimeout(async () => settings, 5);

  assert.deepEqual(firstAttempt, { status: 'timeout' });
  assert.deepEqual(retryAttempt, { status: 'ready', settings });
});
