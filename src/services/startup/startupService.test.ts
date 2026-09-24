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

const noop = async () => {};

test('the default scheduler runs deferred warmups on a later timer turn, not during startup', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const coordinator = createStartupCoordinator({
    initializeAuth: noop,
    initializePrivacy: noop,
    isPrivacyInitialized: () => true,
    preloadBibleData: async () => {
      calls.push('bible');
    },
  });

  coordinator.startDeferredWarmups();
  assert.deepEqual(calls, []);

  t.mock.timers.tick(0);
  assert.deepEqual(calls, ['bible']);
});

test('cancelling a warmup on the default scheduler before it runs means it never runs', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const coordinator = createStartupCoordinator({
    initializeAuth: noop,
    initializePrivacy: noop,
    isPrivacyInitialized: () => true,
    preloadBibleData: async () => {
      calls.push('bible');
    },
  });

  const cancel = coordinator.startDeferredWarmups();
  cancel();
  t.mock.timers.tick(1000);

  assert.deepEqual(calls, []);
});

function runWarmupsNow(overrides: {
  preloadRuntimeTranslations?: () => Promise<void>;
  preloadBibleData: () => Promise<void>;
  onWarmupError?: (error: unknown) => void;
}) {
  let scheduled: (() => Promise<void> | void) | undefined;
  createStartupCoordinator({
    initializeAuth: noop,
    initializePrivacy: noop,
    isPrivacyInitialized: () => true,
    ...overrides,
    scheduleTask: (task) => {
      scheduled = task;
      return () => {};
    },
  }).startDeferredWarmups();
  return scheduled?.();
}

test('deferred warmup preloads runtime translations before the bible data', async () => {
  const calls: string[] = [];

  await runWarmupsNow({
    preloadRuntimeTranslations: async () => {
      calls.push('translations');
    },
    preloadBibleData: async () => {
      calls.push('bible');
    },
  });

  assert.deepEqual(calls, ['translations', 'bible']);
});

test('a failed runtime-translation warmup is reported and skips the bible preload', async () => {
  const calls: string[] = [];
  const reported: unknown[] = [];
  const failure = new Error('catalog offline');

  await runWarmupsNow({
    preloadRuntimeTranslations: async () => {
      throw failure;
    },
    preloadBibleData: async () => {
      calls.push('bible');
    },
    onWarmupError: (error) => reported.push(error),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(reported, [failure]);
});

test('a warmup failure without an error reporter is still swallowed', async () => {
  await assert.doesNotReject(async () =>
    runWarmupsNow({
      preloadBibleData: async () => {
        throw new Error('warmup failed');
      },
    })
  );
});

test('a stalled privacy initialization times out and keeps auth closed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const coordinator = createStartupCoordinator({
    initializePrivacy: () => {
      calls.push('privacy');
      return new Promise<void>(() => {});
    },
    // Even a gate that reports ready must not open auth after privacy timed out.
    isPrivacyInitialized: () => true,
    initializeAuth: async () => {
      calls.push('auth');
    },
    preloadBibleData: noop,
    criticalTaskTimeoutMs: 4000,
    onCriticalTimeout: (taskName) => calls.push(`timeout:${taskName}`),
  });

  const critical = coordinator.initializeCritical();
  await Promise.resolve();
  t.mock.timers.tick(3999);
  assert.deepEqual(calls, ['privacy']);

  t.mock.timers.tick(1);
  await critical;

  assert.deepEqual(calls, ['privacy', 'timeout:privacy']);
});

test('a critical task times out quietly when no timeout listener is registered', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const coordinator = createStartupCoordinator({
    initializePrivacy: () => new Promise<void>(() => {}),
    isPrivacyInitialized: () => true,
    initializeAuth: async () => {
      calls.push('auth');
    },
    preloadBibleData: noop,
  });

  const critical = coordinator.initializeCritical();
  t.mock.timers.tick(4000);
  await critical;

  assert.deepEqual(calls, []);
});

test('a critical task that fails before its deadline fails critical startup', async () => {
  const calls: string[] = [];
  const coordinator = createStartupCoordinator({
    initializePrivacy: async () => {
      throw new Error('keychain unavailable');
    },
    isPrivacyInitialized: () => true,
    initializeAuth: async () => {
      calls.push('auth');
    },
    preloadBibleData: noop,
  });

  await assert.rejects(coordinator.initializeCritical(), /keychain unavailable/);
  assert.deepEqual(calls, []);
});

test('a critical task that fails after its deadline is ignored rather than surfacing as unhandled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));

  let failAuth: ((error: Error) => void) | undefined;
  const timeouts: string[] = [];
  const coordinator = createStartupCoordinator({
    initializePrivacy: noop,
    isPrivacyInitialized: () => true,
    initializeAuth: () =>
      new Promise<void>((_, reject) => {
        failAuth = reject;
      }),
    preloadBibleData: noop,
    criticalTaskTimeoutMs: 50,
    onCriticalTimeout: (taskName) => timeouts.push(taskName),
  });

  const critical = coordinator.initializeCritical();
  // Let privacy finish and auth start before the auth deadline passes.
  while (!failAuth) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  t.mock.timers.tick(50);
  await critical;

  failAuth(new Error('session refresh failed late'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(timeouts, ['auth']);
  assert.deepEqual(unhandled, []);
});
