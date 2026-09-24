import test, { mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { StateStorage } from 'zustand/middleware';
import { mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';
import {
  checkAdmits,
  readRepoMigrations,
  replayTableMigrations,
} from '../../testing/migrationSchema';
import { createSyncIdentityBoundary } from '../sync/syncIdentity';
import type { UserReadingPlanProgress } from './types';

// One mock configuration for the whole file (ESM caches modules). Every scenario
// is driven through the mutable state below: `backend.configured`, the fake's
// scripted responders, and `authState`.
const mmkv = mockMmkvStorage(mock);
const supabaseFake = createSupabaseFake();
const backend = { configured: true };
const authState: { user: { uid: string } | null; authGeneration: number } = {
  user: null,
  authGeneration: 0,
};
// Stands in for a runtime where the auth store's native persistence adapter is
// unavailable, so reading the snapshot throws.
const authControl = { readsThrow: false };

// readingPlanService reads the auth snapshot through `require('../../stores/authStore')`
// so the store stays out of the startup import graph. Mocking the file by path
// intercepts that require as well as any `await import()` of it.
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: {
    getState: () => {
      if (authControl.readsThrow) {
        throw new Error('auth store is unavailable in this runtime');
      }
      return authState;
    },
  },
});

const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => (backend.configured ? (authState.user?.uid ?? null) : null),
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

type PlanServiceModule = typeof import('./readingPlanService');
type PlansStoreModule = typeof import('../../stores/readingPlansStore');

let service: PlanServiceModule;
let storeModule: PlansStoreModule;

/** Drains the microtask queue so `void`-ed background pushes have settled. */
const flushBackgroundWork = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Synchronous persist storage for the injectable (non-singleton) store variant. */
function createMemoryStorage(): StateStorage {
  const entries = new Map<string, string>();

  return {
    setItem: (name, value) => {
      entries.set(name, value);
    },
    getItem: (name) => entries.get(name) ?? null,
    removeItem: (name) => {
      entries.delete(name);
    },
  };
}

const signIn = (uid: string, authGeneration = 1) => {
  authState.user = { uid };
  authState.authGeneration = authGeneration;
  supabaseFake.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: uid }) }));
};

const signOut = () => {
  authState.user = null;
  authState.authGeneration = 0;
  supabaseFake.auth.setSession(null);
};

const UNENROLLMENTS = 'user_reading_plan_unenrollments';
const UNCONFIRMED_LEAVE = 'Unable to confirm leaving this plan; it will retry on next sync';
const MERGE_RPC = 'merge_reading_plan_progress';
// PostgREST's answer for a function the server does not have yet.
const MISSING_MERGE_RPC = {
  data: null,
  error: {
    code: 'PGRST202',
    message: 'Could not find the function public.merge_reading_plan_progress(p_rows)',
  },
  status: 404,
};

const remoteRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'remote-1',
  user_id: 'user-a',
  plan_id: null,
  plan_slug: 'psalms-30-days',
  started_at: '2026-01-01T00:00:00.000Z',
  completed_entries: { '1': '2026-01-01T00:00:00.000Z' },
  current_day: 2,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const localProgress = (
  planId: string,
  overrides: Partial<UserReadingPlanProgress> = {}
): UserReadingPlanProgress => ({
  id: `local-${planId}`,
  plan_id: planId,
  started_at: '2026-02-02T00:00:00.000Z',
  completed_entries: {},
  completed_sessions: {},
  current_day: 1,
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: '2026-02-02T00:00:00.000Z',
  ...overrides,
});

test.before(async () => {
  storeModule = await import('../../stores/readingPlansStore');
  service = await import('./readingPlanService');
  // Let the persist middleware finish its (empty) rehydration before any test
  // mutates the singleton store.
  await flushBackgroundWork();
});

test.beforeEach(() => {
  storeModule.readingPlansStore.getState().resetAll();
  mmkv.store.clear();
  supabaseFake.reset();
  // Most scenarios describe a server without migration 20260924035821, so plan
  // pushes take the upsert path; the merge-RPC tests below install the function.
  supabaseFake.respondToRpc(MERGE_RPC, () => MISSING_MERGE_RPC);
  backend.configured = true;
  authControl.readsThrow = false;
  signOut();
});

// ---------------------------------------------------------------------------
// Catalog reads
// ---------------------------------------------------------------------------

test('listReadingPlans returns the bundled catalog ordered by sort_order', async () => {
  const result = await service.listReadingPlans();

  assert.equal(result.success, true);
  const sortOrders = result.data?.map((plan) => plan.sort_order) ?? [];
  assert.deepEqual(
    sortOrders,
    [...sortOrders].sort((left, right) => left - right)
  );
  assert.equal(result.data?.[0]?.slug, 'bible-in-1-year');
});

test('getPlanEntries returns an empty list for a plan that is not bundled', async () => {
  const result = await service.getPlanEntries('no-such-plan');

  assert.deepEqual(result, { success: true, data: [] });
});

test('getFeaturedPlans returns the featured plan from the bundled catalog', async () => {
  const result = await service.getFeaturedPlans();

  assert.deepEqual(
    result.data?.map((plan) => plan.slug),
    ['bible-in-1-year']
  );
});

test('getPlanEntries returns the bundled day entries for a plan in the catalog', async () => {
  const result = await service.getPlanEntries('psalms-30-days');

  assert.equal(result.success, true);
  assert.equal(result.data?.length, 30);
  assert.deepEqual(result.data?.[0], {
    id: 'psalms-30-days-day-1',
    plan_id: 'psalms-30-days',
    day_number: 1,
    book: 'PSA',
    chapter_start: 1,
    chapter_end: 5,
  });
});

test('getPlansByCategory returns only the plans in that category, in catalog order', async () => {
  const result = await service.getPlansByCategory('chronological');

  assert.equal(result.success, true);
  const sortOrders = result.data?.map((plan) => plan.sort_order) ?? [];
  assert.deepEqual(
    sortOrders,
    [...sortOrders].sort((left, right) => left - right)
  );
  assert.equal(
    result.data?.every((plan) => plan.category === 'chronological'),
    true
  );
  assert.equal(
    result.data?.some((plan) => plan.id === 'bible-in-1-year'),
    true
  );
});

test('getPlansByCategory returns nothing for a category no plan uses', async () => {
  const result = await service.getPlansByCategory('not-a-category');

  assert.deepEqual(result, { success: true, data: [] });
});

test('getTimedChallengePlans returns only the timed challenges', async () => {
  const result = await service.getTimedChallengePlans();

  assert.deepEqual(result.data?.map((plan) => plan.id).sort(), [
    'acts-28-days',
    'bible-in-30-days',
    'bible-in-90-days',
    'gospels-30-days',
    'nt-in-30-days',
    'proverbs-31-days',
    'psalms-30-days',
    'sermon-on-the-mount-7-days',
  ]);
});

// ---------------------------------------------------------------------------
// Saved plans
// ---------------------------------------------------------------------------

test('savePlanForLater refuses a plan id that is not in the catalog', async () => {
  const result = await service.savePlanForLater('not-a-plan');

  assert.deepEqual(result, { success: false, error: 'Plan not found' });
  assert.deepEqual(storeModule.readingPlansStore.getState().savedPlanIds, []);
});

test('savePlanForLater records the plan and returns a local saved-plan row', async () => {
  const result = await service.savePlanForLater('psalms-30-days');

  assert.equal(result.success, true);
  assert.equal(result.data?.id, 'saved-psalms-30-days');
  assert.equal(result.data?.user_id, 'local-user');
  assert.equal(result.data?.plan_id, 'psalms-30-days');
  assert.deepEqual(storeModule.readingPlansStore.getState().savedPlanIds, ['psalms-30-days']);
});

test('getSavedPlans returns the saved plans in catalog order', async () => {
  await service.savePlanForLater('acts-28-days');
  await service.savePlanForLater('psalms-30-days');

  const result = await service.getSavedPlans();

  assert.deepEqual(
    result.data?.map((plan) => plan.slug),
    ['psalms-30-days', 'acts-28-days']
  );
});

test('unsavePlan drops the plan from the saved list', async () => {
  await service.savePlanForLater('psalms-30-days');

  const result = await service.unsavePlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  assert.deepEqual(storeModule.readingPlansStore.getState().savedPlanIds, []);
});

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

test('enrollInPlan rejects a plan id that is not in the bundled catalog', async () => {
  const result = await service.enrollInPlan('not-a-plan');

  assert.deepEqual(result, { success: false, error: 'Plan not found' });
});

test('enrollInPlan enrols a signed-out reader locally without touching Supabase', async () => {
  const result = await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.equal(result.success, true);
  assert.equal(result.data?.current_day, 1);
  assert.equal(result.data?.plan_id, 'psalms-30-days');
  assert.deepEqual(storeModule.readingPlansStore.getState().enrolledPlanIds, ['psalms-30-days']);
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('enrollInPlan pushes the new enrolment to Supabase in the background', async () => {
  signIn('user-a', 4);
  const remoteWrite = new Promise<void>((resolve) => {
    supabaseFake.respondTo('user_reading_plan_progress', (call) => {
      // The push reads the account's server row first so it never overwrites it.
      if (call.operation === 'select') {
        return { data: [] };
      }
      resolve();
      return {
        data: remoteRow({ plan_slug: 'psalms-30-days', current_day: 1, completed_entries: {} }),
      };
    });
  });

  const result = await service.enrollInPlan('psalms-30-days');
  // A first dynamic import can outlive setImmediate on Node 22. Wait for the
  // actual background write before checking its payload and persisted result.
  await remoteWrite;
  await flushBackgroundWork();

  assert.equal(result.success, true);
  const [read, write] = supabaseFake.callsFor('user_reading_plan_progress');
  assert.equal(read?.operation, 'select');
  assert.equal(write?.operation, 'upsert');
  assert.deepEqual(write?.options, { onConflict: 'user_id,plan_slug' });
  assert.deepEqual((write?.payload as { user_id: string; plan_slug: string }).user_id, 'user-a');
  assert.equal((write?.payload as { plan_slug: string }).plan_slug, 'psalms-30-days');
  // The synced row replaces the local one in the store.
  assert.equal(
    storeModule.readingPlansStore.getState().getProgress('psalms-30-days')?.id,
    'remote-1'
  );
});

test('enrollInPlan keeps the local row when the remote upsert errors', async () => {
  signIn('user-a', 4);
  supabaseFake.respondTo('user_reading_plan_progress', () => ({
    data: null,
    error: { message: 'permission denied' },
  }));

  const result = await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.equal(result.success, true);
  assert.equal(
    storeModule.readingPlansStore.getState().getProgress('psalms-30-days')?.id,
    'reading-plan-progress-psalms-30-days'
  );
});

test('enrollInPlan swallows a throwing Supabase client so the local enrolment stands', async () => {
  signIn('user-a', 4);
  supabaseFake.respondTo('user_reading_plan_progress', () => {
    throw new Error('socket hang up');
  });

  const result = await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.equal(result.success, true);
  assert.equal(storeModule.readingPlansStore.getState().enrolledPlanIds.length, 1);
});

test('enrollInPlan skips the remote push entirely when the backend is unconfigured', async () => {
  signIn('user-a', 4);
  backend.configured = false;

  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('enrollInPlan abandons the push when the account changes during the auth check', async () => {
  signIn('user-a', 4);
  supabaseFake.auth.handlers.getUser = async () => {
    // The reader signed out while the remote identity check was in flight.
    authState.user = { uid: 'user-b' };
    return { data: { user: makeFakeUser({ id: 'user-a' }) }, error: null };
  };

  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
  supabaseFake.auth.handlers.getUser = async () => ({
    data: { user: supabaseFake.auth.user },
    error: null,
  });
});

// ---------------------------------------------------------------------------
// Day and session completion
// ---------------------------------------------------------------------------

test('markDayComplete rejects a plan id that is not in the catalog', async () => {
  const result = await service.markDayComplete('not-a-plan', 1);

  assert.deepEqual(result, { success: false, error: 'Plan not found' });
});

test('markDayComplete reports that the reader is not enrolled in the plan', async () => {
  const result = await service.markDayComplete('psalms-30-days', 1);

  assert.deepEqual(result, { success: false, error: 'Not enrolled in this plan' });
});

test('markDayComplete on a sequential plan advances current_day and keys the day by number', async () => {
  await service.enrollInPlan('sermon-on-the-mount-7-days');

  const result = await service.markDayComplete('sermon-on-the-mount-7-days', 1);

  assert.equal(result.success, true);
  assert.equal(result.data?.current_day, 2);
  assert.equal(result.data?.is_completed, false);
  assert.deepEqual(Object.keys(result.data?.completed_entries ?? {}), ['1']);
});

test('markDayComplete marks a sequential plan finished on its last day', async () => {
  await service.enrollInPlan('sermon-on-the-mount-7-days');
  for (let day = 1; day <= 6; day += 1) {
    await service.markDayComplete('sermon-on-the-mount-7-days', day);
  }

  const result = await service.markDayComplete('sermon-on-the-mount-7-days', 7);

  assert.equal(result.data?.is_completed, true);
  assert.notEqual(result.data?.completed_at, null);
  assert.deepEqual(storeModule.readingPlansStore.getState().completedPlanIds, [
    'sermon-on-the-mount-7-days',
  ]);
});

test('markDayComplete on a recurring plan keys the completion by local date, never by day number', async () => {
  await service.enrollInPlan('proverbs-31-days');

  const result = await service.markDayComplete('proverbs-31-days', 12);

  assert.equal(result.success, true);
  const [completionKey] = Object.keys(result.data?.completed_entries ?? {});
  assert.match(completionKey ?? '', /^\d{4}-\d{2}-\d{2}$/);
  // A recurring rhythm never "finishes" and parks on the day the reader tapped.
  assert.equal(result.data?.is_completed, false);
  assert.equal(result.data?.current_day, 12);
});

test('markPlanSessionComplete rejects a plan id that is not in the catalog', async () => {
  const result = await service.markPlanSessionComplete('not-a-plan', 1, 'morning');

  assert.deepEqual(result, { success: false, error: 'Plan not found' });
});

test('markPlanSessionComplete reports a session the plan day does not offer', async () => {
  await service.enrollInPlan('kathisma-weekly');

  const result = await service.markPlanSessionComplete('kathisma-weekly', 1, 'evening');

  assert.deepEqual(result, { success: false, error: 'Plan session not found' });
});

test('markPlanSessionComplete reports that the reader is not enrolled in the plan', async () => {
  const result = await service.markPlanSessionComplete('kathisma-weekly', 2, 'morning');

  assert.deepEqual(result, { success: false, error: 'Not enrolled in this plan' });
});

test('markPlanSessionComplete moves a multi-session day on to the next session', async () => {
  await service.enrollInPlan('kathisma-weekly');

  const result = await service.markPlanSessionComplete('kathisma-weekly', 2, 'morning');

  assert.equal(result.success, true);
  assert.equal(result.data?.current_session, 'evening');
  assert.equal(result.data?.current_day, 2);
  // The day itself is not complete until its final session is done.
  assert.deepEqual(result.data?.completed_entries, {});
  const [sessionKey] = Object.keys(result.data?.completed_sessions ?? {});
  assert.match(sessionKey ?? '', /^\d{4}-\d{2}-\d{2}:morning$/);
});

test('markPlanSessionComplete completes the day once its final session is done', async () => {
  await service.enrollInPlan('kathisma-weekly');
  await service.markPlanSessionComplete('kathisma-weekly', 2, 'morning');

  const result = await service.markPlanSessionComplete('kathisma-weekly', 2, 'evening');

  assert.equal(result.success, true);
  assert.equal(result.data?.current_session, null);
  assert.equal(Object.keys(result.data?.completed_entries ?? {}).length, 1);
  // A recurring rhythm does not advance the day past today.
  assert.equal(result.data?.current_day, 2);
  assert.equal(result.data?.is_completed, false);
});

for (const implementation of ['singleton', 'injected'] as const) {
  test(`${implementation}: Kathisma requires both sessions even when evening is read first`, async () => {
    const api =
      implementation === 'singleton'
        ? service
        : service.createReadingPlanService(
            storeModule.createReadingPlansStore(createMemoryStorage())
          );
    await api.enrollInPlan('kathisma-weekly');
    const evening = await api.markPlanSessionComplete('kathisma-weekly', 2, 'evening');
    assert.deepEqual(evening.data?.completed_entries, {});
    assert.equal(evening.data?.current_session, 'morning');
    const morning = await api.markPlanSessionComplete('kathisma-weekly', 2, 'morning');
    assert.equal(Object.keys(morning.data?.completed_entries ?? {}).length, 1);
    assert.equal(morning.data?.current_session, null);
    assert.equal(morning.data?.is_completed, false);
  });
}

// ---------------------------------------------------------------------------
// Completed plans
// ---------------------------------------------------------------------------

test('getCompletedPlans joins finished progress rows to their catalog plan', async () => {
  storeModule.readingPlansStore
    .getState()
    .upsertProgress(localProgress('psalms-30-days', { is_completed: true }));

  const result = await service.getCompletedPlans();

  assert.equal(result.data?.length, 1);
  assert.equal(result.data?.[0]?.plan.slug, 'psalms-30-days');
});

test('getCompletedPlans drops finished progress for a plan no longer in the catalog', async () => {
  storeModule.readingPlansStore
    .getState()
    .upsertProgress(localProgress('retired-plan', { is_completed: true }));

  const result = await service.getCompletedPlans();

  assert.deepEqual(result.data, []);
});

// ---------------------------------------------------------------------------
// getUserPlanProgress
// ---------------------------------------------------------------------------

test('getUserPlanProgress returns local rows when the backend is unconfigured', async () => {
  backend.configured = false;
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('psalms-30-days'));

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['psalms-30-days']
  );
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('getUserPlanProgress does not fetch for a signed-out reader', async () => {
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('psalms-30-days'));

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, true);
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('getUserPlanProgress sorts local rows newest enrolment first', async () => {
  backend.configured = false;
  storeModule.readingPlansStore
    .getState()
    .upsertProgress(localProgress('psalms-30-days', { started_at: '2026-01-01T00:00:00.000Z' }));
  storeModule.readingPlansStore
    .getState()
    .upsertProgress(localProgress('acts-28-days', { started_at: '2026-03-01T00:00:00.000Z' }));

  const result = await service.getUserPlanProgress();

  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['acts-28-days', 'psalms-30-days']
  );
});

test('getUserPlanProgress narrows the query to one plan when a plan id is supplied', async () => {
  signIn('user-a', 2);
  supabaseFake.respondTo('user_reading_plan_progress', () => ({ data: [] }));

  await service.getUserPlanProgress('psalms-30-days');

  const [read] = supabaseFake.callsFor('user_reading_plan_progress');
  assert.deepEqual(
    read?.steps.filter((step) => step.method === 'eq').map((step) => step.args),
    [
      ['user_id', 'user-a'],
      ['plan_slug', 'psalms-30-days'],
    ]
  );
});

test('getUserPlanProgress merges the remote rows into the local store', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().upsertProgress(
    localProgress('psalms-30-days', {
      completed_entries: { '2': '2026-02-02T00:00:00.000Z' },
      current_day: 3,
    })
  );
  supabaseFake.respondTo('user_reading_plan_progress', () => ({ data: [remoteRow()] }));

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, true);
  const merged = storeModule.readingPlansStore.getState().getProgress('psalms-30-days');
  assert.deepEqual(Object.keys(merged?.completed_entries ?? {}).sort(), ['1', '2']);
  assert.equal(merged?.current_day, 3);
  assert.equal(merged?.id, 'remote-1');
});

test('getUserPlanProgress returns local rows unchanged when the remote result is empty', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('psalms-30-days'));
  supabaseFake.respondTo('user_reading_plan_progress', () => ({ data: [] }));

  const result = await service.getUserPlanProgress();

  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['psalms-30-days']
  );
});

test('getUserPlanProgress falls back to local rows when the query errors', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('psalms-30-days'));
  supabaseFake.respondTo('user_reading_plan_progress', () => ({
    data: null,
    error: { message: 'network down' },
  }));

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['psalms-30-days']
  );
});

test('getUserPlanProgress falls back to local rows when the query throws', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('psalms-30-days'));
  supabaseFake.respondTo('user_reading_plan_progress', () => {
    throw new Error('socket hang up');
  });

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['psalms-30-days']
  );
});

test('getUserPlanProgress never re-enrols a plan the reader unenrolled locally', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().addPendingUnenroll('psalms-30-days');
  supabaseFake.respondTo('user_reading_plan_progress', () => ({ data: [remoteRow()] }));

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, true);
  assert.equal(storeModule.readingPlansStore.getState().getProgress('psalms-30-days'), null);
});

test('getUserPlanProgress pushes local-only rows that the server has never seen', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('acts-28-days'));
  const reads: string[] = [];
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    reads.push(call.operation ?? 'unknown');
    return call.operation === 'select' ? { data: [remoteRow()] } : { data: remoteRow() };
  });

  const result = await service.getUserPlanProgress();
  await flushBackgroundWork();

  assert.deepEqual(result.data?.map((progress) => progress.plan_id).sort(), [
    'acts-28-days',
    'psalms-30-days',
  ]);
  // The pull's read, then the push's own pre-write read of that plan, then the push.
  assert.deepEqual(reads, ['select', 'select', 'upsert']);
  const upsert = supabaseFake
    .callsFor('user_reading_plan_progress')
    .find((call) => call.operation === 'upsert');
  assert.equal((upsert?.payload as { plan_slug: string }).plan_slug, 'acts-28-days');
});

test('getUserPlanProgress reports a stale sync when the account changes mid-fetch', async () => {
  signIn('user-a', 2);
  supabaseFake.respondTo('user_reading_plan_progress', () => {
    // The reader signed into another account while the fetch was in flight.
    authState.user = { uid: 'user-b' };
    return { data: [remoteRow()] };
  });

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
  assert.equal(storeModule.readingPlansStore.getState().getProgress('psalms-30-days'), null);
});

test('getUserPlanProgress reports a stale sync when a query error races an account change', async () => {
  signIn('user-a', 2);
  supabaseFake.respondTo('user_reading_plan_progress', () => {
    authState.user = { uid: 'user-b' };
    return { data: null, error: { message: 'network down' } };
  });

  const result = await service.getUserPlanProgress();

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
});

test('getUserPlanProgress refuses a prevalidated identity captured for another account', async () => {
  signIn('user-a', 2);
  const otherIdentity = createSyncIdentityBoundary(
    'user-b',
    () => 'user-b',
    2,
    () => 2
  );

  const result = await service.getUserPlanProgress(undefined, 'user-a', 2, otherIdentity);

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('getUserPlanProgress reuses a prevalidated identity instead of re-checking auth remotely', async () => {
  signIn('user-a', 2);
  const identity = createSyncIdentityBoundary(
    'user-a',
    () => authState.user?.uid ?? null,
    2,
    () => authState.authGeneration
  );
  supabaseFake.respondTo('user_reading_plan_progress', () => ({ data: [remoteRow()] }));

  const result = await service.getUserPlanProgress(undefined, 'user-a', 2, identity);

  assert.equal(result.success, true);
  assert.equal(
    supabaseFake.authCalls.some((call) => call.method === 'getUser'),
    false
  );
});

test('getUserPlanProgress returns the local snapshot when the fetch outruns its timeout', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().upsertProgress(localProgress('psalms-30-days'));
  let releaseFetch = () => {};
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  supabaseFake.respondTo('user_reading_plan_progress', async () => {
    await fetchGate;
    return { data: [remoteRow({ current_day: 9 })] };
  });

  const pending = service.getUserPlanProgress();
  await flushBackgroundWork();
  t.mock.timers.tick(1500);
  const result = await pending;

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((progress) => progress.current_day),
    [1]
  );

  releaseFetch();
  await flushBackgroundWork();
  // The late fetch must not clobber the store the fallback already answered from.
  assert.equal(
    storeModule.readingPlansStore.getState().getProgress('psalms-30-days')?.id,
    'local-psalms-30-days'
  );
});

test('getUserPlanProgress reports a stale sync when the timeout fires after an account switch', async (t: TestContext) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  signIn('user-a', 2);
  let releaseFetch = () => {};
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  supabaseFake.respondTo('user_reading_plan_progress', async () => {
    await fetchGate;
    return { data: [] };
  });

  const pending = service.getUserPlanProgress();
  await flushBackgroundWork();
  authState.user = { uid: 'user-b' };
  t.mock.timers.tick(1500);
  const result = await pending;

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');

  releaseFetch();
  await flushBackgroundWork();
});

// ---------------------------------------------------------------------------
// Unenrol and tombstones
// ---------------------------------------------------------------------------

test('unenrollFromPlan consumes a guest tombstone immediately', async () => {
  await service.enrollInPlan('psalms-30-days');

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
  assert.deepEqual(storeModule.readingPlansStore.getState().enrolledPlanIds, []);
});

test('unenrollFromPlan records when the reader left as a server tombstone', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollAtByPlanId, {});
  // The server deletes the ended enrolment itself; the client never deletes rows.
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
  const [tombstone] = supabaseFake.callsFor(UNENROLLMENTS);
  assert.equal(tombstone?.operation, 'upsert');
  assert.deepEqual(tombstone?.options, { onConflict: 'user_id,plan_slug' });
  const payload = tombstone?.payload as {
    user_id: string;
    plan_slug: string;
    unenrolled_at: string;
  };
  assert.equal(payload.user_id, 'user-a');
  assert.equal(payload.plan_slug, 'psalms-30-days');
  assert.ok(Number.isFinite(Date.parse(payload.unenrolled_at)), 'the leave time is sent');
});

test('an unconfirmed server leave reports an error the plans screen can show', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondTo(UNENROLLMENTS, () => ({ data: null, error: { message: 'offline' } }));

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: false, error: UNCONFIRMED_LEAVE });
  // The tombstone stays so the next sync retries the leave.
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, [
    'psalms-30-days',
  ]);
});

test('a leave retried later still carries the time the reader actually left', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondTo(UNENROLLMENTS, () => ({ data: null, error: { message: 'offline' } }));
  await service.unenrollFromPlan('psalms-30-days');
  const leftAt =
    storeModule.readingPlansStore.getState().pendingUnenrollAtByPlanId['psalms-30-days'];
  assert.ok(leftAt);
  supabaseFake.reset();

  await service.syncPlanProgress([]);

  const retried = supabaseFake.callsFor(UNENROLLMENTS).find((call) => call.operation === 'upsert');
  assert.equal((retried?.payload as { unenrolled_at: string }).unenrolled_at, leftAt);
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
});

test('unenrollFromPlan deletes the row the old way when the server has no tombstone table', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondTo(UNENROLLMENTS, () => ({
    data: null,
    error: {
      code: 'PGRST205',
      message: "Could not find the table 'public.user_reading_plan_unenrollments'",
    },
  }));
  supabaseFake.respondTo('user_reading_plan_progress', () => ({ data: null }));

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
  const [deletion] = supabaseFake.callsFor('user_reading_plan_progress');
  assert.equal(deletion?.operation, 'delete');
  assert.deepEqual(
    deletion?.steps.filter((step) => step.method === 'eq').map((step) => step.args),
    [
      ['user_id', 'user-a'],
      ['plan_slug', 'psalms-30-days'],
    ]
  );
});

test('unenrollFromPlan keeps the tombstone when the remote delete fails', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondTo(UNENROLLMENTS, () => ({
    data: null,
    error: { message: 'row level security' },
  }));

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: false, error: UNCONFIRMED_LEAVE });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, [
    'psalms-30-days',
  ]);
});

test('unenrollFromPlan keeps the tombstone when the delete throws', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondTo(UNENROLLMENTS, () => {
    throw new Error('socket hang up');
  });

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: false, error: UNCONFIRMED_LEAVE });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, [
    'psalms-30-days',
  ]);
});

test('unenrollFromPlan clears the tombstone for a signed-in reader with no backend', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  backend.configured = false;

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
});

test('unenrollFromPlan keeps the tombstone when the account changed before the local delete', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  backend.configured = false;
  supabaseFake.auth.handlers.getUser = async () => {
    authState.user = { uid: 'user-b' };
    return { data: { user: makeFakeUser({ id: 'user-a' }) }, error: null };
  };

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  supabaseFake.auth.handlers.getUser = async () => ({
    data: { user: supabaseFake.auth.user },
    error: null,
  });
});

test('re-enrolling in a tombstoned plan clears its pending unenroll', async () => {
  signIn('user-a', 3);
  storeModule.readingPlansStore.getState().addPendingUnenroll('psalms-30-days');

  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
});

// ---------------------------------------------------------------------------
// Group plans
// ---------------------------------------------------------------------------

test('assignPlanToGroup keeps the local assignment when the backend is unconfigured', async () => {
  backend.configured = false;

  const result = await service.assignPlanToGroup('psalms-30-days', 'group-1');

  assert.equal(result.success, true);
  assert.equal(result.data?.assigned_by, 'local-user');
  assert.deepEqual(supabaseFake.callsFor('group_reading_plans'), []);
});

test('assignPlanToGroup keeps the local assignment for a signed-out leader', async () => {
  const result = await service.assignPlanToGroup('psalms-30-days', 'group-1');

  assert.equal(result.success, true);
  assert.deepEqual(supabaseFake.callsFor('group_reading_plans'), []);
});

test('assignPlanToGroup returns the inserted remote row for a signed-in leader', async () => {
  signIn('user-a', 1);
  supabaseFake.respondTo('group_reading_plans', () => ({
    data: { id: 'remote-group-plan', group_id: 'group-1', plan_id: 'psalms-30-days' },
  }));

  const result = await service.assignPlanToGroup('psalms-30-days', 'group-1');

  assert.equal(result.data?.id, 'remote-group-plan');
  const [insert] = supabaseFake.callsFor('group_reading_plans');
  assert.equal(insert?.operation, 'insert');
  assert.equal((insert?.payload as { assigned_by: string }).assigned_by, 'user-a');
});

test('assignPlanToGroup falls back to the local assignment when the insert errors', async () => {
  signIn('user-a', 1);
  supabaseFake.respondTo('group_reading_plans', () => ({
    data: null,
    error: { message: 'duplicate key' },
  }));

  const result = await service.assignPlanToGroup('psalms-30-days', 'group-1');

  assert.equal(result.success, true);
  assert.equal(result.data?.assigned_by, 'local-user');
});

test('assignPlanToGroup falls back to the local assignment when the insert throws', async () => {
  signIn('user-a', 1);
  supabaseFake.respondTo('group_reading_plans', () => {
    throw new Error('socket hang up');
  });

  const result = await service.assignPlanToGroup('psalms-30-days', 'group-1');

  assert.equal(result.success, true);
  assert.equal(result.data?.assigned_by, 'local-user');
});

test('getGroupPlans returns only local assignments when the backend is unconfigured', async () => {
  backend.configured = false;
  await service.assignPlanToGroup('psalms-30-days', 'group-1');

  const result = await service.getGroupPlans('group-1');

  assert.equal(result.data?.length, 1);
  assert.deepEqual(supabaseFake.callsFor('group_reading_plans'), []);
});

test('getGroupPlans concatenates the remote rows ahead of the local ones', async () => {
  backend.configured = false;
  await service.assignPlanToGroup('psalms-30-days', 'group-1');
  backend.configured = true;
  supabaseFake.respondTo('group_reading_plans', () => ({
    data: [{ id: 'remote-group-plan', group_id: 'group-1', plan_id: 'acts-28-days' }],
  }));

  const result = await service.getGroupPlans('group-1');

  assert.deepEqual(
    result.data?.map((groupPlan) => groupPlan.id),
    ['remote-group-plan', result.data?.[1]?.id ?? '']
  );
  const [read] = supabaseFake.callsFor('group_reading_plans');
  assert.deepEqual(read?.steps.find((step) => step.method === 'eq')?.args, ['group_id', 'group-1']);
});

test('getGroupPlans falls back to local assignments when the query errors', async () => {
  supabaseFake.respondTo('group_reading_plans', () => ({
    data: null,
    error: { message: 'network down' },
  }));

  const result = await service.getGroupPlans('group-1');

  assert.deepEqual(result, { success: true, data: [] });
});

test('getGroupPlans falls back to local assignments when the query throws', async () => {
  supabaseFake.respondTo('group_reading_plans', () => {
    throw new Error('socket hang up');
  });

  const result = await service.getGroupPlans('group-1');

  assert.deepEqual(result, { success: true, data: [] });
});

// ---------------------------------------------------------------------------
// syncPlanProgress
// ---------------------------------------------------------------------------

test('syncPlanProgress applies the local rows when the backend is unconfigured', async () => {
  backend.configured = false;
  const rows = [localProgress('psalms-30-days')];

  const result = await service.syncPlanProgress(rows);

  assert.deepEqual(result, { success: true, data: rows });
  assert.equal(
    storeModule.readingPlansStore.getState().getProgress('psalms-30-days')?.id,
    'local-psalms-30-days'
  );
});

test('syncPlanProgress applies the local rows for a signed-out reader', async () => {
  const rows = [localProgress('psalms-30-days')];

  const result = await service.syncPlanProgress(rows);

  assert.deepEqual(result, { success: true, data: rows });
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('syncPlanProgress reports a stale sync when the account changed before it started', async () => {
  backend.configured = false;
  authState.authGeneration = 7;

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')], 'user-a', 2);

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
  assert.equal(storeModule.readingPlansStore.getState().getProgress('psalms-30-days'), null);
});

test('syncPlanProgress applies local rows through a prevalidated identity when offline', async () => {
  backend.configured = false;
  signIn('user-a', 2);
  const identity = createSyncIdentityBoundary(
    'user-a',
    () => authState.user?.uid ?? null,
    2,
    () => authState.authGeneration
  );
  const rows = [localProgress('psalms-30-days')];

  const result = await service.syncPlanProgress(rows, 'user-a', 2, identity);

  assert.deepEqual(result, { success: true, data: rows });
  assert.equal(
    storeModule.readingPlansStore.getState().getProgress('psalms-30-days')?.id,
    'local-psalms-30-days'
  );
});

test('syncPlanProgress drops an offline write whose prevalidated identity is no longer current', async () => {
  backend.configured = false;
  signIn('user-a', 2);
  const identity = createSyncIdentityBoundary(
    'user-a',
    () => 'user-b',
    2,
    () => 2
  );

  const result = await service.syncPlanProgress(
    [localProgress('psalms-30-days')],
    'user-a',
    2,
    identity
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
  assert.equal(storeModule.readingPlansStore.getState().getProgress('psalms-30-days'), null);
});

test('syncPlanProgress upserts every syncable row and stores the server copies', async () => {
  signIn('user-a', 2);
  supabaseFake.respondTo('user_reading_plan_progress', () => ({
    data: [remoteRow({ id: 'server-1', current_day: 5 })],
  }));

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')]);

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((progress) => progress.id),
    ['server-1']
  );
  const [read, write] = supabaseFake.callsFor('user_reading_plan_progress');
  assert.equal(read?.operation, 'select');
  assert.equal(write?.operation, 'upsert');
  assert.equal((write?.payload as Array<{ plan_slug: string }>).length, 1);
  assert.equal(
    storeModule.readingPlansStore.getState().getProgress('psalms-30-days')?.current_day,
    5
  );
});

test('syncPlanProgress never pushes a plan whose unenroll delete is still unconfirmed', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().addPendingUnenroll('psalms-30-days');
  supabaseFake.respondTo(UNENROLLMENTS, () => ({ data: null, error: { message: 'offline' } }));

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')]);

  assert.equal(result.success, true);
  assert.equal(storeModule.readingPlansStore.getState().getProgress('psalms-30-days'), null);
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, [
    'psalms-30-days',
  ]);
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

// The sync's snapshot can predate the unenrol. Once the leave is confirmed that
// snapshot row is the ended enrolment, so pushing it would undo the leave (the
// server would skip it anyway).
test('syncPlanProgress does not push a snapshot row back once its unenroll is confirmed', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().addPendingUnenroll('psalms-30-days');
  supabaseFake.respondTo('user_reading_plan_progress', () => ({
    data: [remoteRow({ id: 'server-1' })],
  }));

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')]);

  assert.equal(result.success, true);
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
  assert.equal(storeModule.readingPlansStore.getState().getProgress('psalms-30-days'), null);
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('syncPlanProgress retries an unconfirmed unenroll delete before pushing progress', async () => {
  signIn('user-a', 2);
  storeModule.readingPlansStore.getState().addPendingUnenroll('acts-28-days');
  const order: string[] = [];
  supabaseFake.respondTo(UNENROLLMENTS, (call) => {
    order.push(`tombstone:${call.operation}`);
    return { data: call.operation === 'select' ? [] : null };
  });
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    order.push(`progress:${call.operation}`);
    return { data: [remoteRow({ id: 'server-1' })] };
  });

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')]);

  assert.equal(result.success, true);
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, []);
  assert.equal(order[0], 'tombstone:upsert', 'the leave is recorded before any push');
  assert.deepEqual(
    supabaseFake.callsFor('user_reading_plan_progress').map((call) => call.operation),
    ['select', 'upsert']
  );
});

// QUESTION: shouldSyncPlanProgressRemotely (readingPlanService.ts:186) reads
// `planId ? canSyncReadingPlanRemotely(planId) : true`, so an EMPTY-string plan id
// short-circuits to `true` and is pushed with `plan_slug: ''` — the guard only bites
// for a whitespace-only id, which is what these two tests exercise. Reaching it needs
// a progress row whose plan_id never came from the bundled catalog, so this looks
// defensive rather than a live defect; left as-is pending an owner's call.

test('syncPlanProgress keeps a row with an unsyncable plan id local instead of pushing it', async () => {
  signIn('user-a', 2);
  const localOnly = localProgress('   ', { id: 'local-unsyncable' });

  const result = await service.syncPlanProgress([localOnly]);

  // canSyncReadingPlanRemotely rejects a blank slug, so there is nothing to push.
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
  assert.deepEqual(result, { success: true, data: [localOnly] });
  assert.equal(storeModule.readingPlansStore.getState().getProgress('   ')?.id, 'local-unsyncable');
});

test('syncPlanProgress pushes only the syncable rows and returns the unsyncable ones alongside the server copies', async () => {
  signIn('user-a', 2);
  const localOnly = localProgress('   ', { id: 'local-unsyncable' });
  supabaseFake.respondTo('user_reading_plan_progress', () => ({
    data: [remoteRow({ id: 'server-1' })],
  }));

  const result = await service.syncPlanProgress([localOnly, localProgress('psalms-30-days')]);

  assert.equal(result.success, true);
  const write = supabaseFake
    .callsFor('user_reading_plan_progress')
    .find((call) => call.operation === 'upsert');
  assert.deepEqual(
    (write?.payload as Array<{ plan_slug: string }>).map((row) => row.plan_slug),
    ['psalms-30-days']
  );
  // The unsyncable row is not dropped from the result just because it never left the device.
  assert.deepEqual(
    result.data?.map((progress) => progress.id),
    ['local-unsyncable', 'server-1']
  );
});

test('syncPlanProgress keeps the local rows when the remote upsert errors', async () => {
  signIn('user-a', 2);
  const rows = [localProgress('psalms-30-days')];
  supabaseFake.respondTo('user_reading_plan_progress', () => ({
    data: null,
    error: { message: 'network down' },
  }));

  const result = await service.syncPlanProgress(rows);

  assert.deepEqual(result, { success: true, data: rows });
});

test('syncPlanProgress keeps the local rows when the remote upsert throws', async () => {
  signIn('user-a', 2);
  const rows = [localProgress('psalms-30-days')];
  supabaseFake.respondTo('user_reading_plan_progress', () => {
    throw new Error('socket hang up');
  });

  const result = await service.syncPlanProgress(rows);

  assert.deepEqual(result, { success: true, data: rows });
});

test('syncPlanProgress reports a stale sync when an upsert error races an account change', async () => {
  signIn('user-a', 2);
  supabaseFake.respondTo('user_reading_plan_progress', () => {
    authState.user = { uid: 'user-b' };
    return { data: null, error: { message: 'network down' } };
  });

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')]);

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
});

test('syncPlanProgress refuses a prevalidated identity captured for another generation', async () => {
  signIn('user-a', 2);
  const identity = createSyncIdentityBoundary(
    'user-a',
    () => 'user-a',
    9,
    () => 9
  );

  const result = await service.syncPlanProgress(
    [localProgress('psalms-30-days')],
    'user-a',
    2,
    identity
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('syncPlanProgress reports a stale sync when the remote identity check fails', async () => {
  signIn('user-a', 2);
  supabaseFake.auth.handlers.getUser = async () => ({
    data: { user: null },
    error: null,
  });

  const result = await service.syncPlanProgress([localProgress('psalms-30-days')]);

  assert.equal(result.success, false);
  assert.equal(result.error, 'Authenticated user changed during sync');
  supabaseFake.auth.handlers.getUser = async () => ({
    data: { user: supabaseFake.auth.user },
    error: null,
  });
});

test('a runtime without the auth store still enrols the reader locally', async () => {
  signIn('user-a', 2);
  authControl.readsThrow = true;

  const result = await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();

  assert.equal(result.success, true);
  assert.deepEqual(storeModule.readingPlansStore.getState().enrolledPlanIds, ['psalms-30-days']);
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('assignPlanToGroup keeps the assignment local when the auth lookup errors', async () => {
  signIn('user-a', 1);
  supabaseFake.auth.handlers.getUser = async () => ({
    data: { user: null },
    error: { message: 'JWT expired' } as never,
  });

  const result = await service.assignPlanToGroup('psalms-30-days', 'group-1');

  assert.equal(result.success, true);
  assert.equal(result.data?.assigned_by, 'local-user');
  assert.deepEqual(supabaseFake.callsFor('group_reading_plans'), []);
  supabaseFake.auth.handlers.getUser = async () => ({
    data: { user: supabaseFake.auth.user },
    error: null,
  });
});

test('unenrollFromPlan keeps the tombstone when the account changes as the delete lands', async () => {
  signIn('user-a', 3);
  await service.enrollInPlan('psalms-30-days');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondTo(UNENROLLMENTS, () => {
    // The reader switched accounts while the delete was in flight, so the
    // tombstone must survive for the next sync rather than be cleared here.
    authState.user = { uid: 'user-b' };
    return { data: null };
  });

  const result = await service.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: false, error: UNCONFIRMED_LEAVE });
  assert.deepEqual(storeModule.readingPlansStore.getState().pendingUnenrollPlanIds, [
    'psalms-30-days',
  ]);
});

// ---------------------------------------------------------------------------
// Sync identity seams
// ---------------------------------------------------------------------------

const boundaryFor = (userId: string, generation: number) =>
  createSyncIdentityBoundary(
    userId,
    () => userId,
    generation,
    () => generation
  );

test('resolvePlanSyncIdentity captures an identity only when none was prevalidated', async () => {
  const captured = boundaryFor('user-a', 2);
  let captures = 0;

  const identity = await service.resolvePlanSyncIdentity('user-a', 2, undefined, async () => {
    captures += 1;
    return captured;
  });

  assert.equal(identity, captured);
  assert.equal(captures, 1);
});

test('resolvePlanSyncIdentity prefers the prevalidated identity over another capture', async () => {
  const prevalidated = boundaryFor('user-a', 2);
  let captures = 0;

  const identity = await service.resolvePlanSyncIdentity('user-a', 2, prevalidated, async () => {
    captures += 1;
    return boundaryFor('user-a', 2);
  });

  assert.equal(identity, prevalidated);
  assert.equal(captures, 0);
});

test('resolvePlanSyncIdentity reports no identity when the capture finds no account', async () => {
  const identity = await service.resolvePlanSyncIdentity('user-a', 2, undefined, async () => null);

  assert.equal(identity, null);
});

test('resolvePlanSyncIdentity rejects an identity captured for another account', async () => {
  const identity = await service.resolvePlanSyncIdentity(
    'user-a',
    2,
    boundaryFor('user-b', 2),
    async () => null
  );

  assert.equal(identity, null);
});

test('resolvePlanSyncIdentity rejects an identity captured in an earlier auth generation', async () => {
  const identity = await service.resolvePlanSyncIdentity(
    'user-a',
    3,
    boundaryFor('user-a', 2),
    async () => null
  );

  assert.equal(identity, null);
});

test('retryPlanTombstonesWithIdentity reuses one identity for every pending tombstone', async () => {
  const identity = boundaryFor('user-a', 2);
  const seen: Array<[string, boolean]> = [];

  const results = await service.retryPlanTombstonesWithIdentity(
    ['psalms-30-days', 'acts-28-days'],
    identity,
    async (planId, passedIdentity) => {
      seen.push([planId, passedIdentity === identity]);
      return planId === 'psalms-30-days';
    }
  );

  assert.deepEqual(seen, [
    ['psalms-30-days', true],
    ['acts-28-days', true],
  ]);
  assert.deepEqual(results, [true, false]);
});

test('retryPlanTombstonesWithIdentity does nothing when there are no tombstones', async () => {
  const results = await service.retryPlanTombstonesWithIdentity(
    [],
    boundaryFor('user-a', 2),
    async () => {
      throw new Error('should not run');
    }
  );

  assert.deepEqual(results, []);
});

// ---------------------------------------------------------------------------
// createReadingPlanService — the injectable, local-only variant used by screens
// that own their own store instance.
// ---------------------------------------------------------------------------

const createLocalService = () =>
  service.createReadingPlanService(storeModule.createReadingPlansStore(createMemoryStorage()));

test('the injectable service refuses to enrol in a plan outside the catalog', async () => {
  const local = createLocalService();

  assert.deepEqual(await local.enrollInPlan('not-a-plan'), {
    success: false,
    error: 'Plan not found',
  });
});

// QUESTION: the module-level `markDayComplete` answers 'Plan not found' for an id
// outside the catalog, but the injectable variant collapses "unknown plan" and
// "not enrolled" into one message. Documenting the current behaviour rather than
// changing it — the injectable service has no production caller today.
test('the injectable service reports an unknown plan as an unenrolled one', async () => {
  const local = createLocalService();

  assert.deepEqual(await local.markDayComplete('not-a-plan', 1), {
    success: false,
    error: 'Not enrolled in this plan',
  });
});

test('the injectable service reports an unenrolled plan on day completion', async () => {
  const local = createLocalService();

  assert.deepEqual(await local.markDayComplete('psalms-30-days', 1), {
    success: false,
    error: 'Not enrolled in this plan',
  });
});

test('the injectable service keys a recurring day completion by local date', async () => {
  const local = createLocalService();
  await local.enrollInPlan('proverbs-31-days');

  const result = await local.markDayComplete('proverbs-31-days', 9);

  assert.equal(result.success, true);
  assert.match(Object.keys(result.data?.completed_entries ?? {})[0] ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

test('the injectable service refuses a session for a plan outside the catalog', async () => {
  const local = createLocalService();

  assert.deepEqual(await local.markPlanSessionComplete('not-a-plan', 1, 'morning'), {
    success: false,
    error: 'Plan not found',
  });
});

test('the injectable service refuses a session the plan day does not offer', async () => {
  const local = createLocalService();
  await local.enrollInPlan('kathisma-weekly');

  assert.deepEqual(await local.markPlanSessionComplete('kathisma-weekly', 1, 'evening'), {
    success: false,
    error: 'Plan session not found',
  });
});

test('the injectable service reports an unenrolled plan on session completion', async () => {
  const local = createLocalService();

  assert.deepEqual(await local.markPlanSessionComplete('kathisma-weekly', 2, 'morning'), {
    success: false,
    error: 'Not enrolled in this plan',
  });
});

test('the injectable service advances to the next session of a multi-session day', async () => {
  const local = createLocalService();
  await local.enrollInPlan('kathisma-weekly');

  const result = await local.markPlanSessionComplete('kathisma-weekly', 2, 'morning');

  assert.equal(result.data?.current_session, 'evening');
});

test('the injectable service lists progress for one plan only when asked', async () => {
  const local = createLocalService();
  await local.enrollInPlan('psalms-30-days');
  await local.enrollInPlan('acts-28-days');

  const result = await local.getUserPlanProgress('acts-28-days');

  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['acts-28-days']
  );
});

test('the injectable service unenrols without any remote round-trip', async () => {
  const local = createLocalService();
  await local.enrollInPlan('psalms-30-days');

  const result = await local.unenrollFromPlan('psalms-30-days');

  assert.deepEqual(result, { success: true });
  assert.deepEqual(await local.getUserPlanProgress().then((value) => value.data), []);
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

test('the injectable service assigns and lists group plans locally', async () => {
  const local = createLocalService();

  const assigned = await local.assignPlanToGroup('psalms-30-days', 'group-7');
  const listed = await local.getGroupPlans('group-7');

  assert.equal(assigned.data?.plan_id, 'psalms-30-days');
  assert.deepEqual(
    listed.data?.map((groupPlan) => groupPlan.id),
    [assigned.data?.id]
  );
  assert.deepEqual(supabaseFake.callsFor('group_reading_plans'), []);
});

test('the injectable service syncs progress into its own store without Supabase', async () => {
  const local = createLocalService();
  const rows = [localProgress('psalms-30-days')];

  const result = await local.syncPlanProgress(rows);

  assert.deepEqual(result, { success: true, data: rows });
  assert.deepEqual(
    await local.getUserPlanProgress().then((value) => value.data?.map((row) => row.id)),
    ['local-psalms-30-days']
  );
  assert.deepEqual(supabaseFake.callsFor('user_reading_plan_progress'), []);
});

// ---------------------------------------------------------------------------
// Local-first guarantees (ported from readingPlanServiceSource.test.ts)
// ---------------------------------------------------------------------------

test('the bundled catalog and its day entries are served without querying Supabase', async () => {
  signIn('user-a', 4);

  const plans = await service.listReadingPlans();
  const entries = await service.getPlanEntries('psalms-30-days');

  assert.equal(plans.success, true);
  assert.ok((plans.data?.length ?? 0) > 0);
  assert.equal(entries.success, true);
  assert.ok((entries.data?.length ?? 0) > 0);
  assert.deepEqual(supabaseFake.calls, []);
});

test('markPlanSessionComplete pushes the session tick to the account in the background', async () => {
  signIn('user-a', 4);
  await service.enrollInPlan('kathisma-weekly');
  await flushBackgroundWork();
  supabaseFake.reset();
  supabaseFake.respondToRpc(MERGE_RPC, () => MISSING_MERGE_RPC);
  let pushed!: (payload: Record<string, unknown>) => void;
  const push = new Promise<Record<string, unknown>>((resolve) => {
    pushed = resolve;
  });
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    if (call.operation !== 'upsert') {
      return { data: [] };
    }
    pushed(call.payload as Record<string, unknown>);
    return { data: remoteRow({ ...(call.payload as object), id: 'remote-k' }) };
  });

  const result = await service.markPlanSessionComplete('kathisma-weekly', 2, 'morning');
  const payload = await push;
  await flushBackgroundWork();

  assert.equal(result.success, true);
  assert.equal(result.data?.current_session, 'evening');
  assert.equal(payload.plan_slug, 'kathisma-weekly');
  assert.deepEqual(Object.keys(payload.completed_sessions as object).length, 1);
  assert.equal(payload.current_session, 'evening');
});

// ---------------------------------------------------------------------------
// Server echoes merge into the live row; they never replace it
// (docs/research/sync-offline-review-2026-09-24.md, findings 2, 4, 5)
// ---------------------------------------------------------------------------

const planStore = () => storeModule.readingPlansStore.getState();

test('a plan sync keeps the session ticks the server row cannot carry', async () => {
  signIn('user-a', 2);
  // Enrol through the store so no background push races the sync under test.
  planStore().enrollPlan('kathisma-weekly');
  await service.markPlanSessionComplete('kathisma-weekly', 2, 'morning');
  const beforeSync = planStore().getProgress('kathisma-weekly')!;
  assert.equal(Object.keys(beforeSync.completed_sessions ?? {}).length, 1);
  // user_reading_plan_progress has no completed_sessions/current_session columns.
  supabaseFake.respondTo('user_reading_plan_progress', (call) =>
    call.operation === 'upsert'
      ? {
          data: [
            remoteRow({
              id: 'server-k',
              plan_slug: 'kathisma-weekly',
              completed_entries: {},
              current_day: 2,
            }),
          ],
        }
      : { data: [] }
  );

  const result = await service.syncPlanProgress([beforeSync]);

  assert.equal(result.success, true);
  const afterSync = planStore().getProgress('kathisma-weekly');
  assert.deepEqual(afterSync?.completed_sessions, beforeSync.completed_sessions);
  assert.equal(afterSync?.current_session, 'evening');
});

test('a day completed while its enrolment push is in flight survives the server echo', async () => {
  signIn('user-a', 4);
  let echoSent!: () => void;
  const echo = new Promise<void>((resolve) => {
    echoSent = resolve;
  });
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    if (call.operation !== 'upsert') {
      return { data: [] };
    }
    // The reader finishes day 1 while the enrolment row is still on the wire.
    planStore().markDayComplete('psalms-30-days', 1, 30);
    echoSent();
    return {
      data: remoteRow({ plan_slug: 'psalms-30-days', current_day: 1, completed_entries: {} }),
    };
  });

  await service.enrollInPlan('psalms-30-days');
  await echo;
  await flushBackgroundWork();

  const live = planStore().getProgress('psalms-30-days');
  assert.ok(live?.completed_entries['1'], 'day 1 must not be rolled back by the echo');
  assert.equal(live?.current_day, 2);
});

test('an unenrol made while the enrolment push is in flight is not undone by the echo', async () => {
  signIn('user-a', 4);
  let echoSent!: () => void;
  const echo = new Promise<void>((resolve) => {
    echoSent = resolve;
  });
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    if (call.operation !== 'upsert') {
      return { data: [] };
    }
    planStore().unenrollPlan('psalms-30-days');
    echoSent();
    return { data: remoteRow({ plan_slug: 'psalms-30-days', current_day: 1 }) };
  });

  await service.enrollInPlan('psalms-30-days');
  await echo;
  await flushBackgroundWork();

  assert.equal(planStore().getProgress('psalms-30-days'), null);
  assert.equal(planStore().enrolledPlanIds.includes('psalms-30-days'), false);
});

// ---------------------------------------------------------------------------
// Pushes read the server row first, so one device never overwrites another
// (docs/research/sync-offline-review-2026-09-24.md, findings 3, 4)
// ---------------------------------------------------------------------------

type PlanPayload = {
  plan_slug: string;
  completed_entries: Record<string, string>;
  current_day: number;
};

const upsertPayloads = (): PlanPayload[] =>
  supabaseFake
    .callsFor('user_reading_plan_progress')
    .filter((call) => call.operation === 'upsert')
    .flatMap(
      (call) => (Array.isArray(call.payload) ? call.payload : [call.payload]) as PlanPayload[]
    );

/** Answers reads with `serverRows` and echoes every upsert back as the stored row. */
const serveRows = (serverRows: Array<Record<string, unknown>>) => {
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    if (call.operation === 'select') {
      return { data: serverRows };
    }
    const rows = (Array.isArray(call.payload) ? call.payload : [call.payload]) as PlanPayload[];
    const echoed = rows.map((row) => remoteRow({ ...row, id: `server-${row.plan_slug}` }));
    return { data: call.single ? echoed[0] : echoed };
  });
};

test('a plan sync keeps the days another device already completed', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(
    localProgress('psalms-30-days', {
      completed_entries: { '3': '2026-03-03T00:00:00.000Z' },
      current_day: 4,
    })
  );
  serveRows([
    remoteRow({
      completed_entries: {
        '1': '2026-03-01T00:00:00.000Z',
        '2': '2026-03-02T00:00:00.000Z',
        '5': '2026-03-05T00:00:00.000Z',
      },
      current_day: 6,
    }),
  ]);

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  const [pushed] = upsertPayloads();
  assert.deepEqual(Object.keys(pushed?.completed_entries ?? {}).sort(), ['1', '2', '3', '5']);
  assert.equal(pushed?.current_day, 6);
  assert.deepEqual(
    Object.keys(planStore().getProgress('psalms-30-days')?.completed_entries ?? {}).sort(),
    ['1', '2', '3', '5']
  );
});

test('a day completed while the plan sync waits on the network is kept and pushed', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('psalms-30-days'));
  const snapshot = Object.values(planStore().progressByPlanId);
  serveRows([]);
  // The auth round-trip is the first await inside syncPlanProgress.
  supabaseFake.auth.handlers.getUser = async () => {
    planStore().markDayComplete('psalms-30-days', 1, 30);
    return { data: { user: supabaseFake.auth.user }, error: null };
  };

  try {
    const result = await service.syncPlanProgress(snapshot);

    assert.equal(result.success, true);
    assert.ok(planStore().getProgress('psalms-30-days')?.completed_entries['1']);
    assert.ok(upsertPayloads()[0]?.completed_entries['1']);
  } finally {
    supabaseFake.auth.handlers.getUser = async () => ({
      data: { user: supabaseFake.auth.user },
      error: null,
    });
  }
});

test('a plan sync that cannot read the server rows does not push blind', async () => {
  signIn('user-a', 2);
  const rows = [localProgress('psalms-30-days')];
  supabaseFake.respondTo('user_reading_plan_progress', (call) =>
    call.operation === 'select'
      ? { data: null, error: { message: 'network down' } }
      : { data: [remoteRow()] }
  );

  const result = await service.syncPlanProgress(rows);

  assert.deepEqual(result, { success: true, data: rows });
  assert.deepEqual(upsertPayloads(), []);
});

test('enrolling on a second device keeps the progress the account already has for that plan', async () => {
  signIn('user-a', 4);
  let upserted!: () => void;
  const upsertSeen = new Promise<void>((resolve) => {
    upserted = resolve;
  });
  const serverRow = remoteRow({
    completed_entries: { '1': '2026-01-01T00:00:00.000Z', '2': '2026-01-02T00:00:00.000Z' },
    current_day: 3,
  });
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    if (call.operation === 'select') {
      return { data: [serverRow] };
    }
    upserted();
    return { data: remoteRow({ ...(call.payload as object), id: 'remote-1' }) };
  });

  await service.enrollInPlan('psalms-30-days');
  await upsertSeen;
  await flushBackgroundWork();

  const [pushed] = upsertPayloads();
  assert.deepEqual(Object.keys(pushed?.completed_entries ?? {}).sort(), ['1', '2']);
  assert.equal(pushed?.current_day, 3);
  assert.equal(planStore().getProgress('psalms-30-days')?.current_day, 3);
});

// ---------------------------------------------------------------------------
// A plan left on another device stays left
// (docs/research/sync-offline-review-2026-09-24.md, finding 9)
// ---------------------------------------------------------------------------

/** Serves the account's server tombstones for every tombstone-table read. */
const serveTombstones = (rows: Array<{ plan_slug: string; unenrolled_at: string }>) => {
  supabaseFake.respondTo(UNENROLLMENTS, (call) =>
    call.operation === 'select' ? { data: rows } : { data: null }
  );
};

test('a plan left on another phone is dropped here instead of being pushed back', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('psalms-30-days')); // started 2026-02-02
  serveTombstones([{ plan_slug: 'psalms-30-days', unenrolled_at: '2026-03-01T00:00:00.000Z' }]);
  serveRows([]);

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  assert.equal(planStore().getProgress('psalms-30-days'), null);
  assert.equal(planStore().enrolledPlanIds.includes('psalms-30-days'), false);
  assert.deepEqual(upsertPayloads(), []);
  // Nothing to retry: the leave is already on the server.
  assert.deepEqual(planStore().pendingUnenrollPlanIds, []);
});

test('re-joining a plan after it was left elsewhere is kept and pushed', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(
    localProgress('psalms-30-days', { started_at: '2026-03-02T00:00:00.000Z' })
  );
  serveTombstones([{ plan_slug: 'psalms-30-days', unenrolled_at: '2026-03-01T00:00:00.000Z' }]);
  serveRows([]);

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  assert.ok(planStore().getProgress('psalms-30-days'));
  assert.deepEqual(
    upsertPayloads().map((row) => row.plan_slug),
    ['psalms-30-days']
  );
});

test('a pull drops a plan left elsewhere instead of pushing it as local-only', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('acts-28-days'));
  serveTombstones([{ plan_slug: 'acts-28-days', unenrolled_at: '2026-03-01T00:00:00.000Z' }]);
  serveRows([remoteRow()]);

  const result = await service.getUserPlanProgress();
  await flushBackgroundWork();

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((progress) => progress.plan_id),
    ['psalms-30-days']
  );
  assert.equal(planStore().getProgress('acts-28-days'), null);
  assert.deepEqual(upsertPayloads(), []);
});

test('a pull adopts a re-join made on another phone after this phone was left behind', async () => {
  signIn('user-a', 2);
  // This phone still holds the enrolment that was left on 2026-03-01; another
  // phone joined the plan again afterwards.
  planStore().upsertProgress(
    localProgress('psalms-30-days', { completed_entries: { '9': '2026-02-10T00:00:00.000Z' } })
  );
  serveTombstones([{ plan_slug: 'psalms-30-days', unenrolled_at: '2026-03-01T00:00:00.000Z' }]);
  serveRows([
    remoteRow({ id: 'rejoined', started_at: '2026-03-05T00:00:00.000Z', completed_entries: {} }),
  ]);

  await service.getUserPlanProgress();

  const live = planStore().getProgress('psalms-30-days');
  assert.equal(live?.id, 'rejoined');
  assert.equal(live?.started_at, '2026-03-05T00:00:00.000Z');
  assert.deepEqual(live?.completed_entries, {}, 'the ended enrolment is not merged in');
});

test('a pull with no tombstones visible keeps every local plan as before', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('acts-28-days'));
  supabaseFake.respondTo(UNENROLLMENTS, () => ({
    data: null,
    error: { code: 'PGRST205', message: 'no such table' },
  }));
  serveRows([remoteRow()]);

  const result = await service.getUserPlanProgress();
  await flushBackgroundWork();

  assert.deepEqual(result.data?.map((progress) => progress.plan_id).sort(), [
    'acts-28-days',
    'psalms-30-days',
  ]);
});

// ---------------------------------------------------------------------------
// Session ticks follow the account (migration 20260924023342)
// ---------------------------------------------------------------------------

type SessionPayload = PlanPayload & {
  completed_sessions?: Record<string, string>;
  current_session?: string | null;
};

test('a plan sync uploads session ticks when the server rows have the columns', async () => {
  signIn('user-a', 2);
  planStore().enrollPlan('kathisma-weekly');
  planStore().markSessionComplete('kathisma-weekly', 2, 'morning', {
    completionKey: '2026-09-22:morning',
    dayCompletionKey: '2026-09-22',
    totalDays: 7,
    isFinalSession: false,
    advanceDayOnCompletion: false,
    nextSessionKey: 'evening',
  });
  serveRows([
    remoteRow({
      plan_slug: 'kathisma-weekly',
      completed_sessions: { '2026-09-21:evening': '2026-09-21T19:00:00.000Z' },
      current_session: null,
    }),
  ]);

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  const [pushed] = upsertPayloads() as SessionPayload[];
  assert.deepEqual(Object.keys(pushed?.completed_sessions ?? {}).sort(), [
    '2026-09-21:evening',
    '2026-09-22:morning',
  ]);
  assert.equal(pushed?.current_session, 'evening');
});

test('session ticks from another phone arrive with a pull', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(
    localProgress('kathisma-weekly', {
      completed_sessions: { '2026-09-22:morning': '2026-09-22T06:00:00.000Z' },
    })
  );
  serveRows([
    remoteRow({
      plan_slug: 'kathisma-weekly',
      started_at: '2026-02-02T00:00:00.000Z',
      completed_sessions: { '2026-09-22:evening': '2026-09-22T19:00:00.000Z' },
    }),
  ]);

  await service.getUserPlanProgress();

  assert.deepEqual(
    Object.keys(planStore().getProgress('kathisma-weekly')?.completed_sessions ?? {}).sort(),
    ['2026-09-22:evening', '2026-09-22:morning']
  );
});

test('a server without the session columns is never sent them', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(
    localProgress('kathisma-weekly', {
      completed_sessions: { '2026-09-22:morning': '2026-09-22T06:00:00.000Z' },
    })
  );
  // select('*') rows from a database without the columns simply lack the keys.
  serveRows([remoteRow({ plan_slug: 'kathisma-weekly' })]);

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  const [pushed] = upsertPayloads() as SessionPayload[];
  assert.ok(pushed);
  assert.equal('completed_sessions' in pushed, false);
  assert.equal('current_session' in pushed, false);
  // The ticks stay on this phone.
  assert.ok(planStore().getProgress('kathisma-weekly')?.completed_sessions?.['2026-09-22:morning']);
});

test('a push refused for a missing session column is retried without the columns', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('kathisma-weekly'));
  const upserts: SessionPayload[][] = [];
  supabaseFake.respondTo('user_reading_plan_progress', (call) => {
    if (call.operation === 'select') {
      return { data: [] }; // no row to detect the columns from
    }
    const rows = (Array.isArray(call.payload) ? call.payload : [call.payload]) as SessionPayload[];
    upserts.push(rows);
    return upserts.length === 1
      ? {
          data: null,
          error: {
            code: 'PGRST204',
            message:
              "Could not find the 'completed_sessions' column of 'user_reading_plan_progress'",
          },
        }
      : { data: rows.map((row) => remoteRow({ ...row, id: 'server-k' })) };
  });

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  assert.equal(upserts.length, 2);
  assert.ok('completed_sessions' in (upserts[0]?.[0] ?? {}));
  assert.equal('completed_sessions' in (upserts[1]?.[0] ?? {}), false);
  assert.equal(planStore().getProgress('kathisma-weekly')?.id, 'server-k');
});

test('every column a plan push writes exists in the migrated table', async () => {
  const schema = replayTableMigrations('user_reading_plan_progress', readRepoMigrations());
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('kathisma-weekly', { current_session: 'evening' }));
  serveRows([]);

  await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  const [pushed] = upsertPayloads() as SessionPayload[];
  assert.ok(pushed);
  assert.deepEqual(
    Object.keys(pushed).filter((column) => !schema.columns.has(column)),
    []
  );
  assert.equal(checkAdmits(schema, 'current_session', 'evening'), true);
});

// ---------------------------------------------------------------------------
// Plan pushes merge on the server in one statement, so two phones syncing at
// the same instant keep each other's days
// (docs/research/sync-offline-review-2026-09-24.md, finding 12)
// ---------------------------------------------------------------------------

type MergeRpcArgs = { p_rows: Array<SessionPayload & Record<string, unknown>> };

const mergeRpcCalls = () => supabaseFake.callsFor(`rpc:${MERGE_RPC}`);

test('a plan sync merges through the server RPC and keeps a day another phone wrote meanwhile', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(
    localProgress('psalms-30-days', {
      completed_entries: { '3': '2026-03-03T00:00:00.000Z' },
      completed_sessions: { '3:morning': '2026-03-03T06:00:00.000Z' },
      current_day: 4,
    })
  );
  // The pre-push read sees days 1-2 (and the session columns) ...
  serveRows([
    remoteRow({
      completed_entries: {
        '1': '2026-03-01T00:00:00.000Z',
        '2': '2026-03-02T00:00:00.000Z',
      },
      completed_sessions: {},
      current_session: null,
      current_day: 3,
    }),
  ]);
  // ... and another phone lands day 4 before this push: the server merges into it.
  supabaseFake.respondToRpc(MERGE_RPC, (call) => {
    const [row] = (call.payload as MergeRpcArgs).p_rows;
    return {
      data: [
        remoteRow({
          id: 'server-merged',
          completed_entries: { ...row?.completed_entries, '4': '2026-03-04T00:00:00.000Z' },
          completed_sessions: row?.completed_sessions,
          current_day: 5,
        }),
      ],
    };
  });

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  assert.deepEqual(upsertPayloads(), [], 'no read-modify-write upsert when the RPC exists');
  const [call] = mergeRpcCalls();
  assert.equal(call?.single, false);
  const [pushed] = (call?.payload as MergeRpcArgs).p_rows;
  assert.equal(pushed?.plan_slug, 'psalms-30-days');
  assert.deepEqual(Object.keys(pushed?.completed_entries ?? {}).sort(), ['1', '2', '3']);
  assert.deepEqual(pushed?.completed_sessions, { '3:morning': '2026-03-03T06:00:00.000Z' });
  const live = planStore().getProgress('psalms-30-days');
  assert.equal(live?.id, 'server-merged');
  assert.deepEqual(Object.keys(live?.completed_entries ?? {}).sort(), ['1', '2', '3', '4']);
  assert.deepEqual(live?.completed_sessions, { '3:morning': '2026-03-03T06:00:00.000Z' });
  assert.equal(live?.current_day, 5);
  assert.deepEqual(
    result.data?.map((row) => row.id),
    ['server-merged']
  );
});

test('a day completed on this phone is pushed through the merge RPC and adopts the merged row', async () => {
  signIn('user-a', 4);
  planStore().enrollPlan('psalms-30-days');
  serveRows([]);
  const merged = new Promise<void>((resolve) => {
    supabaseFake.respondToRpc(MERGE_RPC, (call) => {
      const [row] = (call.payload as MergeRpcArgs).p_rows;
      resolve();
      return {
        data: remoteRow({
          id: 'server-merged',
          completed_entries: { ...row?.completed_entries, '2': '2026-03-02T00:00:00.000Z' },
          current_day: 3,
        }),
      };
    });
  });

  await service.markDayComplete('psalms-30-days', 1);
  await merged;
  await flushBackgroundWork();

  const [call] = mergeRpcCalls();
  assert.equal(call?.single, true);
  assert.equal((call?.payload as MergeRpcArgs).p_rows.length, 1);
  assert.deepEqual(upsertPayloads(), []);
  const live = planStore().getProgress('psalms-30-days');
  assert.deepEqual(Object.keys(live?.completed_entries ?? {}).sort(), ['1', '2']);
  assert.equal(live?.current_day, 3);
});

for (const [label, missing] of [
  ['PGRST202', MISSING_MERGE_RPC],
  [
    'an undefined-function error',
    { data: null, error: { code: '42883', message: 'function does not exist' } },
  ],
  ['a bare 404', { data: null, error: { message: 'Not Found' }, status: 404 }],
] as const) {
  test(`a server without the merge RPC (${label}) still syncs through the upsert`, async () => {
    signIn('user-a', 2);
    planStore().upsertProgress(
      localProgress('psalms-30-days', {
        completed_entries: { '3': '2026-03-03T00:00:00.000Z' },
        current_day: 4,
      })
    );
    // The server has the session columns, so the merge function is worth trying.
    serveRows([remoteRow({ completed_sessions: {}, current_session: null })]);
    supabaseFake.respondToRpc(MERGE_RPC, () => missing);

    const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

    assert.equal(result.success, true);
    assert.equal(mergeRpcCalls().length, 1);
    const [pushed] = upsertPayloads();
    assert.deepEqual(Object.keys(pushed?.completed_entries ?? {}).sort(), ['1', '3']);
    assert.equal(planStore().getProgress('psalms-30-days')?.id, 'server-psalms-30-days');
  });
}

test('a merge the server refuses is not retried as a blind upsert', async () => {
  signIn('user-a', 2);
  const rows = [localProgress('psalms-30-days', { completed_entries: { '3': 'x' } })];
  planStore().upsertProgress(rows[0]!);
  serveRows([]);
  supabaseFake.respondToRpc(MERGE_RPC, () => ({
    data: null,
    error: { code: '22023', message: 'p_rows names a plan_slug more than once' },
    status: 400,
  }));

  const result = await service.syncPlanProgress(rows);

  assert.equal(result.success, true);
  assert.deepEqual(upsertPayloads(), []);
  assert.deepEqual(planStore().getProgress('psalms-30-days')?.completed_entries, { '3': 'x' });
});

test('every column the merge RPC is sent exists in the migrated table', async () => {
  const schema = replayTableMigrations('user_reading_plan_progress', readRepoMigrations());
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('kathisma-weekly', { current_session: 'evening' }));
  serveRows([]);
  supabaseFake.respondToRpc(MERGE_RPC, () => ({ data: [] }));

  await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  const [pushed] = (mergeRpcCalls()[0]?.payload as MergeRpcArgs).p_rows;
  assert.ok(pushed);
  assert.deepEqual(
    Object.keys(pushed).filter((column) => !schema.columns.has(column)),
    []
  );
});

test('a server without the session columns is not asked for the merge RPC', async () => {
  signIn('user-a', 2);
  planStore().upsertProgress(localProgress('psalms-30-days'));
  // Rows without completed_sessions: migration 20260924023342 (and so the merge
  // function, which needs its columns) is not applied.
  serveRows([remoteRow()]);

  const result = await service.syncPlanProgress(Object.values(planStore().progressByPlanId));

  assert.equal(result.success, true);
  assert.equal(mergeRpcCalls().length, 0);
  assert.equal(upsertPayloads().length, 1);
});
