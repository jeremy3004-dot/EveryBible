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

test('critical startup continues when auth initialization stalls', async () => {
  const calls: string[] = [];

  const coordinator = createStartupCoordinator({
    initializeAuth: async () => {
      calls.push('auth');
      await new Promise<void>(() => {});
    },
    initializePrivacy: async () => {
      calls.push('privacy');
    },
    preloadBibleData: async () => {
      calls.push('bible');
    },
    criticalTaskTimeoutMs: 10,
    onCriticalTimeout: (taskName: string) => {
      calls.push(`timeout:${taskName}`);
    },
  });

  const outcome = await Promise.race([
    coordinator.initializeCritical().then(() => 'resolved'),
    new Promise<'deadline'>((resolve) => {
      setTimeout(() => resolve('deadline'), 75);
    }),
  ]);

  assert.equal(outcome, 'resolved');
  assert.deepEqual(calls, ['auth', 'timeout:auth', 'privacy']);
});

test('critical startup continues when storage migration stalls', async () => {
  const calls: string[] = [];

  const coordinator = createStartupCoordinator({
    migrateStorage: async () => {
      calls.push('migration');
      await new Promise<void>(() => {});
    },
    initializeAuth: async () => {
      calls.push('auth');
    },
    initializePrivacy: async () => {
      calls.push('privacy');
    },
    preloadBibleData: async () => {
      calls.push('bible');
    },
    migrateStorageTimeoutMs: 10,
    onCriticalTimeout: (taskName: string) => {
      calls.push(`timeout:${taskName}`);
    },
  });

  const outcome = await Promise.race([
    coordinator.initializeCritical().then(() => 'resolved'),
    new Promise<'deadline'>((resolve) => {
      setTimeout(() => resolve('deadline'), 75);
    }),
  ]);

  assert.equal(outcome, 'resolved');
  assert.deepEqual(calls, ['migration', 'timeout:migrateStorage', 'auth', 'privacy']);
});
