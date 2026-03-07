import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupCoordinator } from './startupService';

test('critical startup only initializes auth and privacy', async () => {
  const calls: string[] = [];

  const coordinator = createStartupCoordinator({
    initializeAuth: async () => {
      calls.push('auth');
    },
    initializePrivacy: async () => {
      calls.push('privacy');
    },
    preloadBibleData: async () => {
      calls.push('bible');
    },
  });

  await coordinator.initializeCritical();

  assert.deepEqual(calls, ['auth', 'privacy']);
});

test('deferred warmup schedules bible preload after launch and swallows warmup failures', async () => {
  const calls: string[] = [];
  const reportedErrors: string[] = [];
  const scheduledTasks: Array<() => Promise<void> | void> = [];

  const coordinator = createStartupCoordinator({
    initializeAuth: async () => {
      calls.push('auth');
    },
    initializePrivacy: async () => {
      calls.push('privacy');
    },
    preloadBibleData: async () => {
      calls.push('bible');
      throw new Error('warmup failed');
    },
    scheduleTask: (task) => {
      scheduledTasks.push(task);
      return () => {
        calls.push('cancelled');
      };
    },
    onWarmupError: (error) => {
      reportedErrors.push(error instanceof Error ? error.message : 'unknown');
    },
  });

  const cancel = coordinator.startDeferredWarmups();

  assert.equal(scheduledTasks.length, 1);
  assert.deepEqual(calls, []);

  await scheduledTasks[0]?.();

  assert.deepEqual(calls, ['bible']);
  assert.deepEqual(reportedErrors, ['warmup failed']);

  cancel();
  assert.deepEqual(calls, ['bible', 'cancelled']);
});
