import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, sourcePath } from '../../testing/mockModules';
import { assertDefined } from '../../utils/assertDefined';

// AppRuntimeEffects renders nothing; its job is to mount two effect hooks and
// to own the deferred usage-queue reporting install, so the hook modules, the
// usage queue and react's useEffect are all replaced with recorders.
// (The older appRuntimeEffects.test.ts source guard stays and is a different file.)
const calls: string[] = [];
let failingHook: string | null = null;

const recorder = (name: string) => () => {
  calls.push(name);
  if (failingHook === name) {
    throw new Error(`${name} exploded`);
  }
};

/** Effects queued by the render, in registration order, with their dep arrays. */
type Effect = () => void | (() => void);
const effects: Array<{ run: Effect; deps: unknown }> = [];
const cleanups: Array<() => void> = [];
mockModule(mock, 'react', {
  useEffect: (run: Effect, deps: unknown) => {
    effects.push({ run, deps });
  },
});

let reportingInstallCount = 0;
let reportingCleanupCount = 0;
mockModule(mock, sourcePath('services/analytics/usageQueue.ts'), {
  installUsageQueueReporting: () => {
    reportingInstallCount += 1;
    return () => {
      reportingCleanupCount += 1;
    };
  },
});

let crashReportingInstallCount = 0;
let crashReportingCleanupCount = 0;
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  installCrashReporting: () => {
    crashReportingInstallCount += 1;
    return () => {
      crashReportingCleanupCount += 1;
    };
  },
});

/** Run every effect the last render queued, the way React does on commit. */
const commit = () => {
  const queued = effects.splice(0, effects.length);
  for (const effect of queued) {
    const cleanup = effect.run();
    if (cleanup) cleanups.push(cleanup);
  }
};

let reminderInstallCount = 0;
let reminderUninstallCount = 0;
mockModule(mock, sourcePath('services/notifications/dailyReminderReconciler.ts'), {
  installDailyReminderReconciler: () => {
    reminderInstallCount += 1;
    return {
      idle: async () => {},
      uninstall: () => {
        reminderUninstallCount += 1;
      },
    };
  },
});

mockModule(mock, sourcePath('hooks/useSync.ts'), { useSync: recorder('useSync') });
mockModule(mock, sourcePath('hooks/usePrivacyLock.ts'), {
  usePrivacyLock: recorder('usePrivacyLock'),
});
mockModule(mock, sourcePath('hooks/useAuthDeepLink.ts'), {
  useAuthDeepLink: recorder('useAuthDeepLink'),
});

const loadComponent = async () => (await import('./AppRuntimeEffects')).AppRuntimeEffects;

beforeEach(() => {
  calls.length = 0;
  effects.length = 0;
  reportingInstallCount = 0;
  reportingCleanupCount = 0;
  reminderInstallCount = 0;
  reminderUninstallCount = 0;
  crashReportingInstallCount = 0;
  crashReportingCleanupCount = 0;
  cleanups.length = 0;
  failingHook = null;
});

test('rendering mounts sync and the auth deep-link listener', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();

  assert.deepEqual(calls, ['useSync', 'useAuthDeepLink']);
});

test('the privacy lock is not mounted here, so an error in these effects cannot switch it off', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();

  assert.equal(calls.includes('usePrivacyLock'), false);
});

test('the component renders nothing so it can sit anywhere in the tree', async () => {
  const AppRuntimeEffects = await loadComponent();

  assert.equal(AppRuntimeEffects(), null);
});

test('every render re-runs both hooks, keeping hook order stable', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();
  AppRuntimeEffects();

  assert.deepEqual(calls, ['useSync', 'useAuthDeepLink', 'useSync', 'useAuthDeepLink']);
});

test('a hook that throws stops the render rather than silently skipping the rest', async () => {
  const AppRuntimeEffects = await loadComponent();
  failingHook = 'useSync';

  assert.throws(() => AppRuntimeEffects(), { message: 'useSync exploded' });
  assert.deepEqual(calls, ['useSync']);
});

test('the component takes no props, so callers cannot configure it by accident', async () => {
  const AppRuntimeEffects = await loadComponent();

  assert.equal(AppRuntimeEffects.length, 0);
});

test('the reporting install effect has an empty dependency list so a re-render does not re-run it', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();

  assert.equal(effects.length, 1);
  assert.deepEqual(effects[0]?.deps, []);
});

test('a hook that throws leaves the reporting install effect unqueued', async () => {
  const AppRuntimeEffects = await loadComponent();
  failingHook = 'useSync';

  assert.throws(() => AppRuntimeEffects());

  assert.deepEqual(effects, []);
  assert.equal(reportingInstallCount, 0);
});

test('optional reporting listeners install only after commit and clean up on unmount', async () => {
  const AppRuntimeEffects = await loadComponent();
  AppRuntimeEffects();
  assert.equal(reportingInstallCount, 0);
  commit();
  assert.equal(reportingInstallCount, 1);
  assert.equal(reportingCleanupCount, 0);
  assert.equal(cleanups.length, 1);
  assertDefined(cleanups[0], 'reporting cleanup')();
  assert.equal(reportingCleanupCount, 1);
});

test('the daily reminder is kept in line with the preference from commit until unmount', async () => {
  // Without this nothing re-schedules the reminder after a language change, a
  // timezone change or a preference pulled from another device (or reset by sign-out).
  const AppRuntimeEffects = await loadComponent();
  AppRuntimeEffects();
  assert.equal(reminderInstallCount, 0);

  commit();
  const installedAfterCommit = reminderInstallCount;
  cleanups.forEach((cleanup) => cleanup());

  assert.deepEqual([installedAfterCommit, reminderUninstallCount], [1, 1]);
});

test('crash-report uploads install with usage reporting and clean up with it', async () => {
  const AppRuntimeEffects = await loadComponent();
  AppRuntimeEffects();
  assert.equal(crashReportingInstallCount, 0);
  commit();
  assert.equal(crashReportingInstallCount, 1);
  assertDefined(cleanups[0], 'crash reporting cleanup')();
  assert.equal(crashReportingCleanupCount, 1);
});
