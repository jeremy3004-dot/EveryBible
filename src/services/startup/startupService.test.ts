import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthInitializer,
  createPrivacyRetryInitializer,
  createStartupCoordinator,
} from './startupService';

test('critical startup rejects a coordinator without the privacy readiness gate', () => {
  assert.throws(
    () =>
      // @ts-expect-error The production gate is intentionally required.
      createStartupCoordinator({
        initializeAuth: async () => {},
        initializePrivacy: async () => {},
        preloadBibleData: async () => {},
      }),
    /isPrivacyInitialized is required/
  );
});

test('critical startup only initializes auth and privacy', async () => {
  const calls: string[] = [];

  const coordinator = createStartupCoordinator({
    initializeAuth: async () => {
      calls.push('auth');
    },
    initializePrivacy: async () => {
      calls.push('privacy');
    },
    isPrivacyInitialized: () => true,
    preloadBibleData: async () => {
      calls.push('bible');
    },
  });

  await coordinator.initializeCritical();

  assert.deepEqual(calls, ['privacy', 'auth']);
});

test('critical startup initializes privacy before auth', async () => {
  const calls: string[] = [];
  let privacyReady = false;

  const coordinator = createStartupCoordinator({
    initializeAuth: async () => {
      assert.equal(privacyReady, true);
      calls.push('auth');
    },
    initializePrivacy: async () => {
      calls.push('privacy');
      privacyReady = true;
    },
    isPrivacyInitialized: () => privacyReady,
    preloadBibleData: async () => {
      calls.push('bible');
    },
  });

  await coordinator.initializeCritical();

  assert.deepEqual(calls, ['privacy', 'auth']);
});

test('auth initialization rehydrates persisted state before running auth initialization', async () => {
  const calls: string[] = [];

  const initializeAuth = createAuthInitializer({
    rehydrateAuth: async () => {
      calls.push('rehydrate');
    },
    initializeAuth: async () => {
      calls.push('initialize');
    },
  });

  await initializeAuth();

  assert.deepEqual(calls, ['rehydrate', 'initialize']);
});

test('critical startup never initializes auth when privacy is not ready', async () => {
  const calls: string[] = [];

  const coordinator = createStartupCoordinator({
    initializeAuth: async () => {
      calls.push('auth');
    },
    initializePrivacy: async () => {
      calls.push('privacy');
    },
    isPrivacyInitialized: () => false,
    preloadBibleData: async () => {},
  });

  await coordinator.initializeCritical();

  assert.deepEqual(calls, ['privacy']);
});

test('critical startup initializes auth after privacy becomes ready', async () => {
  const calls: string[] = [];
  let privacyReady = false;

  const coordinator = createStartupCoordinator({
    initializePrivacy: async () => {
      calls.push('privacy');
      privacyReady = true;
    },
    isPrivacyInitialized: () => privacyReady,
    initializeAuth: async () => {
      calls.push('auth');
    },
    preloadBibleData: async () => {},
  });

  await coordinator.initializeCritical();

  assert.deepEqual(calls, ['privacy', 'auth']);
});

test('privacy retry initializes auth only after privacy becomes ready', async () => {
  const calls: string[] = [];
  let privacyReady = false;

  const retry = createPrivacyRetryInitializer({
    retryPrivacy: async () => {
      calls.push('privacy:retry');
      privacyReady = true;
    },
    isPrivacyInitialized: () => privacyReady,
    initializeAuth: async () => {
      calls.push('auth');
    },
  });

  await retry();

  assert.deepEqual(calls, ['privacy:retry', 'auth']);
});

test('privacy retry keeps auth gated when privacy is still unavailable', async () => {
  const calls: string[] = [];

  const retry = createPrivacyRetryInitializer({
    retryPrivacy: async () => {
      calls.push('privacy:retry');
    },
    isPrivacyInitialized: () => false,
    initializeAuth: async () => {
      calls.push('auth');
    },
  });

  await retry();

  assert.deepEqual(calls, ['privacy:retry']);
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
    isPrivacyInitialized: () => true,
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
    isPrivacyInitialized: () => true,
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
  assert.deepEqual(calls, ['privacy', 'auth', 'timeout:auth']);
});
