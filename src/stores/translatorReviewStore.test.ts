import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

// One mock configuration per file: this persisted store only needs MMKV. Its
// model (translatorFeedbackReviewModel) is pure and runs for real.
//
// `developmentTranslatorReviewPasscode` is an import-time constant derived from
// `__DEV__`, which is undefined under Node, so this file covers the release-build
// shape (translator mode off until a passcode is entered). The dev-build shape
// lives in translatorReviewStore.devPasscode.test.ts, which must be a separate
// file because the constant is computed once at module evaluation.
const mmkv = mockMmkvStorage(mock);

let useTranslatorReviewStore: typeof import('./translatorReviewStore').useTranslatorReviewStore;

before(async () => {
  ({ useTranslatorReviewStore } = await import('./translatorReviewStore'));
});

const state = () => useTranslatorReviewStore.getState();
const readPersisted = () => JSON.parse(mmkv.store.get('translator-review-storage') ?? '{}');

const seedStorage = (persistedState: unknown, version: number) => {
  mmkv.store.set('translator-review-storage', JSON.stringify({ state: persistedState, version }));
};

beforeEach(() => {
  useTranslatorReviewStore.setState(useTranslatorReviewStore.getInitialState(), true);
  mmkv.store.clear();
});

test('a release build starts with translator review off and no passcode', () => {
  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
  assert.deepEqual(state().feedbackMarkers, {});
});

// ---------------------------------------------------------------------------
// enableWithPasscode
// ---------------------------------------------------------------------------

test('entering a passcode enables translator review and stores the code', () => {
  assert.equal(state().enableWithPasscode('let-me-in'), true);

  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'let-me-in');
});

test('a passcode is trimmed before it is stored', () => {
  state().enableWithPasscode('  spaced  ');

  assert.equal(state().accessPasscode, 'spaced');
});

test('an empty passcode is rejected and leaves translator review off', () => {
  assert.equal(state().enableWithPasscode(''), false);

  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
});

test('a whitespace-only passcode is rejected', () => {
  assert.equal(state().enableWithPasscode('   \t '), false);

  assert.equal(state().enabled, false);
});

test('a rejected passcode does not revoke an already-enabled session', () => {
  state().enableWithPasscode('let-me-in');

  assert.equal(state().enableWithPasscode('  '), false);
  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'let-me-in');
});

test('entering a new passcode replaces the previous one', () => {
  state().enableWithPasscode('first');
  state().enableWithPasscode('second');

  assert.equal(state().accessPasscode, 'second');
});

test('enabling persists the passcode and enabled flag', () => {
  state().enableWithPasscode('let-me-in');

  assert.deepEqual(readPersisted().state, {
    enabled: true,
    accessPasscode: 'let-me-in',
    feedbackMarkers: {},
  });
  assert.equal(readPersisted().version, 3);
});

// ---------------------------------------------------------------------------
// disable
// ---------------------------------------------------------------------------

test('disabling clears the enabled flag and the passcode', () => {
  state().enableWithPasscode('let-me-in');

  state().disable();

  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
});

test('disabling keeps per-device listened markers, which are not access state', () => {
  state().enableWithPasscode('let-me-in');
  state().markListened('feedback-1');

  state().disable();

  assert.deepEqual(Object.keys(state().feedbackMarkers), ['feedback-1']);
});

// ---------------------------------------------------------------------------
// markListened
// ---------------------------------------------------------------------------

test('marking an item listened records an ISO timestamp for it', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T12:00:00.000Z') });

  state().markListened('feedback-1');

  assert.deepEqual(state().feedbackMarkers, {
    'feedback-1': { listenedAt: '2026-09-08T12:00:00.000Z' },
  });
});

test('marking a second item leaves the first marker in place', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T12:00:00.000Z') });
  state().markListened('feedback-1');

  t.mock.timers.setTime(new Date('2026-09-08T13:00:00.000Z').getTime());
  state().markListened('feedback-2');

  assert.deepEqual(state().feedbackMarkers, {
    'feedback-1': { listenedAt: '2026-09-08T12:00:00.000Z' },
    'feedback-2': { listenedAt: '2026-09-08T13:00:00.000Z' },
  });
});

test('re-listening to an item refreshes its timestamp', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T12:00:00.000Z') });
  state().markListened('feedback-1');

  t.mock.timers.setTime(new Date('2026-09-09T12:00:00.000Z').getTime());
  state().markListened('feedback-1');

  assert.deepEqual(state().feedbackMarkers, {
    'feedback-1': { listenedAt: '2026-09-09T12:00:00.000Z' },
  });
});

test('listened markers are persisted to MMKV', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T12:00:00.000Z') });

  state().markListened('feedback-1');

  assert.deepEqual(readPersisted().state.feedbackMarkers, {
    'feedback-1': { listenedAt: '2026-09-08T12:00:00.000Z' },
  });
});

// ---------------------------------------------------------------------------
// resetForSignOut
// ---------------------------------------------------------------------------

test('resetForSignOut clears access state and every per-device marker', () => {
  state().enableWithPasscode('let-me-in');
  state().markListened('feedback-1');

  state().resetForSignOut();

  assert.deepEqual(
    {
      enabled: state().enabled,
      accessPasscode: state().accessPasscode,
      feedbackMarkers: state().feedbackMarkers,
    },
    { enabled: false, accessPasscode: null, feedbackMarkers: {} }
  );
});

test('resetForSignOut wipes the persisted snapshot so translator mode cannot bleed across accounts', () => {
  state().enableWithPasscode('let-me-in');
  state().markListened('feedback-1');

  state().resetForSignOut();

  assert.deepEqual(readPersisted().state, {
    enabled: false,
    accessPasscode: null,
    feedbackMarkers: {},
  });
});

// ---------------------------------------------------------------------------
// hydration and migration
// ---------------------------------------------------------------------------

test('a current-version snapshot hydrates access state and markers unchanged', async () => {
  seedStorage(
    {
      enabled: true,
      accessPasscode: 'stored-code',
      feedbackMarkers: { 'feedback-1': { listenedAt: '2026-01-01T00:00:00.000Z' } },
    },
    3
  );

  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'stored-code');
  assert.deepEqual(state().feedbackMarkers, {
    'feedback-1': { listenedAt: '2026-01-01T00:00:00.000Z' },
  });
});

test('migrating from v2 keeps a stored passcode and normalises it', async () => {
  seedStorage({ enabled: true, accessPasscode: '  stored-code  ', feedbackMarkers: {} }, 2);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'stored-code');
});

test('migrating from v1 without a passcode revokes translator access', async () => {
  seedStorage({ enabled: true, accessPasscode: '', feedbackMarkers: {} }, 1);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
});

test('migrating from v1 with a passcode keeps translator access', async () => {
  seedStorage({ enabled: true, accessPasscode: 'legacy-code', feedbackMarkers: {} }, 1);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, 'legacy-code');
});

test('migration strips server-owned resolution fields from legacy markers', async () => {
  seedStorage(
    {
      enabled: true,
      accessPasscode: 'code',
      feedbackMarkers: {
        'feedback-1': {
          listenedAt: '2026-01-01T00:00:00.000Z',
          readAt: '2026-01-01T00:00:00.000Z',
          resolvedAs: 'fixed',
          resolvedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    },
    2
  );

  await useTranslatorReviewStore.persist.rehydrate();

  assert.deepEqual(state().feedbackMarkers, {
    'feedback-1': { listenedAt: '2026-01-01T00:00:00.000Z' },
  });
});

test('a legacy marker with no listenedAt migrates to an explicit null', async () => {
  seedStorage(
    {
      enabled: true,
      accessPasscode: 'code',
      feedbackMarkers: { 'feedback-1': { resolvedAs: 'no_change_needed' } },
    },
    2
  );

  await useTranslatorReviewStore.persist.rehydrate();

  assert.deepEqual(state().feedbackMarkers, { 'feedback-1': { listenedAt: null } });
});

test('legacy marker entries that are not objects are dropped during migration', async () => {
  seedStorage(
    {
      enabled: true,
      accessPasscode: 'code',
      feedbackMarkers: {
        'feedback-1': null,
        'feedback-2': 'listened',
        'feedback-3': { listenedAt: '2026-01-01T00:00:00.000Z' },
      },
    },
    2
  );

  await useTranslatorReviewStore.persist.rehydrate();

  assert.deepEqual(state().feedbackMarkers, {
    'feedback-3': { listenedAt: '2026-01-01T00:00:00.000Z' },
  });
});

test('a legacy marker whose listenedAt is not a string migrates to an explicit null', async () => {
  // Pre-v2 builds briefly wrote an epoch number here; anything but an ISO string
  // has to become null so getTranslatorFeedbackReviewStatus never trusts it.
  seedStorage(
    {
      enabled: true,
      accessPasscode: 'code',
      feedbackMarkers: { 'feedback-1': { listenedAt: 1735689600000 } },
    },
    2
  );

  await useTranslatorReviewStore.persist.rehydrate();

  assert.deepEqual(state().feedbackMarkers, { 'feedback-1': { listenedAt: null } });
});

test('a legacy snapshot with no accessPasscode key at all migrates without throwing', async () => {
  seedStorage({ enabled: true, feedbackMarkers: {} }, 2);

  await useTranslatorReviewStore.persist.rehydrate();

  // `enabled: true` proves the migration ran to completion: if it threw on the
  // missing key, persist would abandon the snapshot and leave the initial state.
  assert.equal(state().enabled, true);
  assert.equal(state().accessPasscode, null);
});

// QUESTION: at v2 and above a blank passcode is normalised to null but `enabled`
// is left true, unlike the v1 path which revokes access outright. Every consumer
// gates on `enabled && accessPasscode`, so nothing is exposed today — should the
// migration still clear `enabled` for consistency?
test('a legacy snapshot with a whitespace-only passcode migrates the passcode to null', async () => {
  seedStorage({ enabled: true, accessPasscode: '   ', feedbackMarkers: {} }, 2);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(state().accessPasscode, null);
});

test('a legacy snapshot whose markers are not an object migrates to no markers', async () => {
  seedStorage({ enabled: true, accessPasscode: 'code', feedbackMarkers: 'nope' }, 2);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.deepEqual(state().feedbackMarkers, {});
});

test('a legacy snapshot with no markers key at all migrates to no markers', async () => {
  seedStorage({ enabled: true, accessPasscode: 'code' }, 2);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.deepEqual(state().feedbackMarkers, {});
});

test('migration rewrites the stored snapshot at the current version', async () => {
  seedStorage({ enabled: true, accessPasscode: '  code  ', feedbackMarkers: {} }, 2);

  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(readPersisted().version, 3);
  assert.equal(readPersisted().state.accessPasscode, 'code');
});

test('an empty storage slot leaves translator review off', async () => {
  await useTranslatorReviewStore.persist.rehydrate();

  assert.equal(state().enabled, false);
  assert.equal(state().accessPasscode, null);
  assert.deepEqual(state().feedbackMarkers, {});
});

test('hydration keeps the actions callable', async () => {
  seedStorage({ enabled: true, accessPasscode: 'stored-code', feedbackMarkers: {} }, 3);

  await useTranslatorReviewStore.persist.rehydrate();
  state().disable();

  assert.equal(state().enabled, false);
});
