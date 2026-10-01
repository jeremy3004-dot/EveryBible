import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
mockModule(mock, '@react-navigation/native', {
  useFocusEffect: (effect: () => void | (() => void)) => {
    // Unit tests exercise the initial focused mount; real focus/blur lifecycle
    // coverage lives in ReadingActivityScreen.render.test.tsx.
    const useEffect = runtime.react.useEffect as (
      callback: () => void | (() => void),
      deps: unknown[]
    ) => void;
    useEffect(effect, [effect]);
  },
});

const service = {
  calls: [] as string[],
  refreshFails: false,
  summary: { success: true, data: { total_chapters_read: 12 } } as {
    success: boolean;
    data?: { total_chapters_read: number };
  },
};
mockModule(mock, sourcePath('services/analytics/analyticsService.ts'), {
  refreshEngagement: async () => {
    service.calls.push('refreshEngagement');
    if (service.refreshFails) throw new Error('offline');
    return { success: true };
  },
  getEngagementSummary: async () => {
    service.calls.push('getEngagementSummary');
    return service.summary;
  },
});

type Hook = typeof import('./useEngagementSummary').useEngagementSummary;
let useEngagementSummary: Hook;

before(async () => {
  ({ useEngagementSummary } = await import('./useEngagementSummary'));
});

afterEach(() => {
  runtime.unmountAll();
  service.calls.length = 0;
  service.refreshFails = false;
  service.summary = { success: true, data: { total_chapters_read: 12 } };
});

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('signed out, the cloud is never asked', async () => {
  const view = runtime.mount(useEngagementSummary, false);
  await view.commit();
  await settle();

  assert.equal(view.rerender(), null);
  assert.deepEqual(service.calls, []);
});

test('signed in, the summary is refreshed and then read', async () => {
  const view = runtime.mount(useEngagementSummary, true);
  await view.commit();
  await settle();

  assert.deepEqual(view.rerender(), { total_chapters_read: 12 });
  assert.deepEqual(service.calls, ['refreshEngagement', 'getEngagementSummary']);
});

test('a failed refresh still reads the last summary', async () => {
  service.refreshFails = true;
  const view = runtime.mount(useEngagementSummary, true);
  await view.commit();
  await settle();

  assert.deepEqual(view.rerender(), { total_chapters_read: 12 });
});

test('an unsuccessful read leaves the local totals in charge', async () => {
  service.summary = { success: false };
  const view = runtime.mount(useEngagementSummary, true);
  await view.commit();
  await settle();

  assert.equal(view.rerender(), null);
});

test('leaving before the refresh settles skips the read', async () => {
  const view = runtime.mount(useEngagementSummary, true);
  view.flushEffects();
  view.unmount();
  await settle();

  assert.deepEqual(service.calls, ['refreshEngagement']);
});

test('signing out drops the previous reader’s cloud totals', async () => {
  const view = runtime.mount(useEngagementSummary, true, 'user-a' as string | null);
  await view.commit();
  await settle();
  assert.deepEqual(view.rerender(), { total_chapters_read: 12 });

  // The session ends (expiry, remote sign-out) while the screen stays mounted.
  assert.equal(view.rerender(false, null), null);
});

test('another account never sees the previous account’s totals while its own load', async () => {
  const view = runtime.mount(useEngagementSummary, true, 'user-a');
  await view.commit();
  await settle();
  assert.deepEqual(view.rerender(), { total_chapters_read: 12 });

  service.summary = { success: true, data: { total_chapters_read: 3 } };
  assert.equal(view.rerender(true, 'user-b'), null);
  await view.commit();
  await settle();
  assert.deepEqual(view.rerender(), { total_chapters_read: 3 });
});
