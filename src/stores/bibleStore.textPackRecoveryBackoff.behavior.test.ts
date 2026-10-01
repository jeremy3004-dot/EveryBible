/**
 * A journal entry recovery cannot retire (here a deletion whose file stays locked) must not
 * make every later chapter read repeat the whole recovery pass. Recovery is module state, so
 * this lives in its own file with its own process.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import { flushAsyncWork, installBibleStoreDoubles } from './__tests__/bibleStoreDoubles';

const JOURNAL_KEY = 'bible.textPackInstallJournal.v1';
const STUCK_PATH = 'file:///translations/stuck.db';
const stuckJournal = {
  installs: {},
  deletions: {
    stuck: { operationId: 'stuck:1', translationId: 'stuck', paths: [STUCK_PATH], updatedAt: 1 },
  },
};

const mmkv = mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);
const originalWarn = console.warn;

before(async () => {
  console.warn = () => {};
  await import('./bibleStore');
  await flushAsyncWork();
});
beforeEach(() => {
  doubles.reset();
  doubles.cloud.deleteArtifacts = async () => {
    throw new Error('file is locked');
  };
  mmkv.store.set(JOURNAL_KEY, JSON.stringify(stuckJournal));
});
after(() => {
  console.warn = originalWarn;
  mock.reset();
});

test('an entry that cannot be retired is not retried before every chapter read', async () => {
  for (let read = 0; read < 5; read += 1) {
    await doubles.database.readinessResolver?.('esv1');
  }

  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH]);
  assert.ok(mmkv.store.get(JOURNAL_KEY)?.includes('stuck:1'), 'the entry stays journaled');
});

test('an explicit reconcile still retries a stuck entry', async () => {
  const { useBibleStore } = await import('./bibleStore');
  await useBibleStore.getState().reconcileTranslationPacks();

  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH]);
});

test('a chapter read retries a stuck entry once a full minute has passed', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { useBibleStore } = await import('./bibleStore');
  await useBibleStore.getState().reconcileTranslationPacks();

  context.mock.timers.tick(59_999);
  await doubles.database.readinessResolver?.('esv1');
  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH]);

  context.mock.timers.tick(1);
  await doubles.database.readinessResolver?.('esv1');
  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH, STUCK_PATH]);
});
