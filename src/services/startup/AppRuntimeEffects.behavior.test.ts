import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, sourcePath } from '../../testing/mockModules';

// AppRuntimeEffects renders nothing; its whole job is to mount three effect
// hooks, so the three hook modules are replaced with recorders.
const calls: string[] = [];
let failingHook: string | null = null;

const recorder = (name: string) => () => {
  calls.push(name);
  if (failingHook === name) {
    throw new Error(`${name} exploded`);
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
