import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import {
  installBibleStoreDoubles,
  makeRuntimeTranslation,
  flushAsyncWork,
} from './__tests__/bibleStoreDoubles';

// Run the real startup preference reconciliation and real store install/selection actions.
// Only the preference transport and native pack/database boundaries are replaced.
const mmkv = mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);
const preferredId = 'saved-primary';
const savedStamp = '2026-09-27T00:00:00.000Z';
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: { uid: 'user-1' }, authGeneration: 0 }) },
});
mockModule(mock, sourcePath('services/translations/translationService.ts'), {
  getUserTranslationPreferences: async () => ({
    success: true,
    data: { primary_translation: preferredId, synced_at: savedStamp },
  }),
  setUserTranslationPreferences: async () => ({ success: true }),
});

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let reconcilePrimaryTranslationPreference: typeof import('../services/translations/runtimeTranslationBootstrap').reconcilePrimaryTranslationPreference;
class CancelledTransfer extends Error {}

before(async () => {
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  ({ reconcilePrimaryTranslationPreference } =
    await import('../services/translations/runtimeTranslationBootstrap'));
  await flushAsyncWork();
});
beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
  doubles.cloud.isCancelled = (error) => error instanceof CancelledTransfer;
  mmkv.store.delete('bible.textPackInstallJournal.v1');
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      translations: [
        ...useBibleStore.getInitialState().translations.filter((row) => row.id !== 'hincv'),
        makeRuntimeTranslation({ id: preferredId, language: 'Hindi' }),
        makeRuntimeTranslation({
          id: 'hincv',
          language: 'Hindi',
          isDownloaded: true,
          textPackLocalPath: 'file:///packs/hincv.db',
        }),
      ],
      currentTranslation: 'bsb',
      currentTranslationChosenAt: null,
    },
    true
  );
});
after(() => mock.reset());

function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => (resolve = done)), resolve: () => resolve() };
}
function persistedChoice(): {
  currentTranslation: string;
  currentTranslationChosenAt: string | null;
} {
  const raw = mmkv.store.get('bible-storage');
  assert.ok(raw);
  return JSON.parse(raw).state;
}

for (const outcome of ['success', 'failure'] as const) {
  test(`a reader choice A→B→A during saved-primary ${outcome} preserves the latest persisted A choice`, async () => {
    const started = deferred();
    const transfer = deferred();
    doubles.cloud.run = async () => {
      started.resolve();
      await transfer.promise;
      if (outcome === 'failure') throw new Error('native transfer failed');
      return 'file:///packs/saved-primary.db';
    };
    const reconciling = reconcilePrimaryTranslationPreference();
    await started.promise;
    useBibleStore.getState().setCurrentTranslation('asv');
    assert.equal(useBibleStore.getState().currentTranslation, 'asv');
    useBibleStore.getState().setCurrentTranslation('bsb');
    const latestStamp = useBibleStore.getState().currentTranslationChosenAt;
    assert.ok(latestStamp);
    transfer.resolve();
    await reconciling;

    assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
    assert.equal(useBibleStore.getState().currentTranslationChosenAt, latestStamp);
    assert.deepEqual(persistedChoice().currentTranslation, 'bsb');
    assert.equal(persistedChoice().currentTranslationChosenAt, latestStamp);
    const preferred = useBibleStore.getState().translations.find((row) => row.id === preferredId);
    assert.equal(preferred?.isDownloaded, outcome === 'success');
  });
}

test('an unchanged reader choice adopts the downloaded primary and its saved stamp', async () => {
  await reconcilePrimaryTranslationPreference();
  assert.equal(useBibleStore.getState().currentTranslation, preferredId);
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, savedStamp);
  assert.equal(persistedChoice().currentTranslation, preferredId);
  assert.equal(persistedChoice().currentTranslationChosenAt, savedStamp);
  assert.equal(
    doubles.translations.preferenceCalls.length,
    0,
    'adoption must not upload a new choice'
  );
});

test('a cancelled saved-primary download cannot adopt its Bible or saved stamp', async () => {
  const started = deferred();
  const transfer = deferred();
  doubles.cloud.run = async () => {
    started.resolve();
    await transfer.promise;
    throw new CancelledTransfer();
  };
  const reconciling = reconcilePrimaryTranslationPreference();
  await started.promise;
  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();
  assert.equal(doubles.cloud.textCancellationRequests, 1);
  transfer.resolve();
  await reconciling;
  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.equal(useBibleStore.getState().currentTranslationChosenAt, null);
  assert.equal(persistedChoice().currentTranslationChosenAt, null);
  assert.equal(
    useBibleStore.getState().translations.find((row) => row.id === preferredId)?.isDownloaded,
    false
  );
});
