import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, sourcePath } from '../../testing/mockModules';

// AppRuntimeEffects renders nothing; its job is to mount three effect hooks and
// to own the deferred react-query listener install, so the hook modules, the
// queryClient barrel and react's useEffect are all replaced with recorders.
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

let installCount = 0;
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
mockModule(mock, sourcePath('services/queryClient.ts'), {
  queryClient: {},
  installQueryClientListeners: () => {
    installCount += 1;
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
  installCount = 0;
  reportingInstallCount = 0;
  reportingCleanupCount = 0;
  cleanups.length = 0;
  failingHook = null;
});

test('rendering mounts sync, the privacy lock and the auth deep-link listener', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();

  assert.deepEqual(calls, ['useSync', 'usePrivacyLock', 'useAuthDeepLink']);
});

test('the component renders nothing so it can sit anywhere in the tree', async () => {
  const AppRuntimeEffects = await loadComponent();

  assert.equal(AppRuntimeEffects(), null);
});

test('every render re-runs all three hooks, keeping hook order stable', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();
  AppRuntimeEffects();

  assert.deepEqual(calls, [
    'useSync',
    'usePrivacyLock',
    'useAuthDeepLink',
    'useSync',
    'usePrivacyLock',
    'useAuthDeepLink',
  ]);
});

test('a hook that throws stops the render rather than silently skipping the rest', async () => {
  const AppRuntimeEffects = await loadComponent();
  failingHook = 'usePrivacyLock';

  assert.throws(() => AppRuntimeEffects(), { message: 'usePrivacyLock exploded' });
  assert.deepEqual(calls, ['useSync', 'usePrivacyLock']);
});

test('the component takes no props, so callers cannot configure it by accident', async () => {
  const AppRuntimeEffects = await loadComponent();

  assert.equal(AppRuntimeEffects.length, 0);
});

test('the react-query listeners are installed from an effect, not during render', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();
  assert.equal(installCount, 0, 'rendering must not touch NetInfo or AppState');

  commit();
  assert.equal(installCount, 1);
});

test('the install effect has an empty dependency list so a re-render does not re-run it', async () => {
  const AppRuntimeEffects = await loadComponent();

  AppRuntimeEffects();

  assert.equal(effects.length, 1);
  assert.deepEqual(effects[0].deps, []);
});

test('a hook that throws leaves the install effect unqueued', async () => {
  const AppRuntimeEffects = await loadComponent();
  failingHook = 'useSync';

  assert.throws(() => AppRuntimeEffects());

  assert.deepEqual(effects, []);
  assert.equal(installCount, 0);
});

test('optional reporting listeners install only after commit and clean up on unmount', async () => {
  const AppRuntimeEffects = await loadComponent();
  AppRuntimeEffects();
  assert.equal(reportingInstallCount, 0);
  commit();
  assert.equal(reportingInstallCount, 1);
  assert.equal(reportingCleanupCount, 0);
  assert.equal(cleanups.length, 1);
  cleanups[0]();
  assert.equal(reportingCleanupCount, 1);
});
