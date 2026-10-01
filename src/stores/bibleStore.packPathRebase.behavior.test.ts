/**
 * iOS can hand the app a new container UUID after an update or restore. Installed packs are
 * persisted as absolute paths, so recovery re-anchors them on the current document directory
 * before reconcile decides whether they are missing.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';
import * as deferredServices from './bible/bibleStoreDeferredServices';
import type { TextPackInstallJournal } from '../services/bible/textPackInstallJournalModel';

const JOURNAL_KEY = 'bible.textPackInstallJournal.v1';
const OLD_DOCS = 'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/';
const NEW_DOCS = 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/';

const mmkv = mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);
mockModule(mock, sourcePath('stores/bible/bibleStoreDeferredServices.ts'), {
  ...deferredServices,
  getCurrentDocumentDirectory: async () => NEW_DOCS,
});

const readJournal = (): TextPackInstallJournal => JSON.parse(mmkv.store.get(JOURNAL_KEY) ?? '{}');
const originalWarn = console.warn;

let useBibleStore: typeof import('./bibleStore').useBibleStore;
before(async () => {
  console.warn = () => {};
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});
beforeEach(() => {
  doubles.reset();
  // Only files under the current container exist on disk.
  doubles.fileSystem.defaultInfo = { exists: false, size: 0 };
  doubles.fileSystem.setFile(`${NEW_DOCS}translations/esv1.db`, { exists: true, size: 4096 });
  mmkv.store.set(
    JOURNAL_KEY,
    JSON.stringify({
      installs: {},
      deletions: {
        gone: {
          operationId: 'gone:1',
          translationId: 'gone',
          paths: [`${OLD_DOCS}translations/gone.db`],
          updatedAt: 1,
        },
      },
    })
  );
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      translations: [
        makeRuntimeTranslation({
          id: 'esv1',
          isDownloaded: true,
          installState: 'installed',
          textPackLocalPath: `${OLD_DOCS}translations/esv1.db`,
        }),
      ],
      currentTranslation: 'esv1',
    },
    true
  );
});
after(() => {
  console.warn = originalWarn;
  mock.reset();
});

// Leaves its entry journaled, so recovery is still live for the next test.
test('an install that stays pending is journaled again under the current container', async () => {
  const pendingInstall: TextPackInstallJournal = {
    installs: {
      ins1: {
        operationId: 'ins1:op',
        translationId: 'ins1',
        version: '4',
        finalPath: `${OLD_DOCS}translations/ins1.op.db`,
        stagingPath: `${OLD_DOCS}translations/ins1.op.staging.db`,
        rollbackPath: `${OLD_DOCS}translations/ins1.op.db.rollback`,
        phase: 'activating',
        updatedAt: 1,
      },
    },
    deletions: {},
  };
  mmkv.store.set(JOURNAL_KEY, JSON.stringify(pendingInstall));
  doubles.cloud.recover = async () => 'current';
  doubles.cloud.validateError = () => new Error('candidate read temporarily unavailable');

  await useBibleStore.getState().reconcileTranslationPacks();

  // deleteTranslation reads these paths to find the files to remove, so the entry left for a
  // later pass must point into the live container, not the one the files were moved out of.
  const pending = readJournal().installs.ins1;
  assert.deepEqual(
    [pending?.finalPath, pending?.stagingPath, pending?.rollbackPath],
    [
      `${NEW_DOCS}translations/ins1.op.db`,
      `${NEW_DOCS}translations/ins1.op.staging.db`,
      `${NEW_DOCS}translations/ins1.op.db.rollback`,
    ]
  );
});

// Recovery is once-per-process state: this pass empties the journal, which switches it off.
test('a pack saved under an old app container survives reconcile at the current one', async () => {
  await useBibleStore.getState().reconcileTranslationPacks();

  const esv = useBibleStore.getState().translations.find((item) => item.id === 'esv1');
  assert.equal(esv?.textPackLocalPath, `${NEW_DOCS}translations/esv1.db`);
  assert.equal(esv?.installState, 'installed');
  assert.equal(useBibleStore.getState().currentTranslation, 'esv1');
  assert.equal(doubles.fileSystem.infoRequests.includes(`${OLD_DOCS}translations/esv1.db`), false);
  // Journal paths are re-anchored too, so interrupted-delete cleanup targets the live container.
  assert.deepEqual(doubles.cloud.deletedArtifacts, [`${NEW_DOCS}translations/gone.db`]);
});
