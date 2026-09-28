import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';
import * as deferredServices from './bible/bibleStoreDeferredServices';

mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);
const oldPath = 'file:///packs/esv1.old.db';
const newPath = 'file:///packs/esv1.new.db';
let oldPathInvalidation: { entered: () => void; release: Promise<void> } | null = null;
let oldPathCheck: { entered: () => void; release: Promise<void>; fail: boolean } | null = null;
mockModule(mock, sourcePath('stores/bible/bibleStoreDeferredServices.ts'), {
  ...deferredServices,
  invalidateInstalledBibleDatabaseAtPath: async (path: string) => {
    if (path === oldPath && oldPathInvalidation) {
      const pending = oldPathInvalidation;
      oldPathInvalidation = null;
      pending.entered();
      await pending.release;
    }
    return deferredServices.invalidateInstalledBibleDatabaseAtPath(path);
  },
  fileSystemPathIsUsableDatabase: async (path: string) => {
    if (path === oldPath && oldPathCheck) {
      const pending = oldPathCheck;
      oldPathCheck = null;
      pending.entered();
      await pending.release;
      if (pending.fail) throw new Error('old file was removed');
      return false;
    }
    return deferredServices.fileSystemPathIsUsableDatabase(path);
  },
});

let useBibleStore: typeof import('./bibleStore').useBibleStore;
before(async () => {
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});
beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
  oldPathCheck = null;
  oldPathInvalidation = null;
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      translations: [
        makeRuntimeTranslation({
          id: 'esv1',
          isDownloaded: true,
          installState: 'installed',
          textPackLocalPath: oldPath,
        }),
        makeRuntimeTranslation({
          id: 'other',
          isDownloaded: true,
          installState: 'installed',
          textPackLocalPath: 'file:///packs/other.db',
        }),
      ],
      currentTranslation: 'esv1',
    },
    true
  );
});
after(() => mock.reset());

for (const fail of [false, true]) {
  test(`a delayed ${fail ? 'failed' : 'missing'} old-path check preserves the reinstalled Bible`, async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    oldPathCheck = { entered, release: pending, fail };
    const unrelated = useBibleStore.getState().translations.find((item) => item.id === 'other');
    const reconciliation = useBibleStore.getState().reconcileTranslationPacks();
    await started;
    await useBibleStore.getState().deleteTranslation('esv1');
    doubles.cloud.run = async () => newPath;
    doubles.fileSystem.setFile(newPath, { exists: true, size: 4096 });
    await useBibleStore.getState().downloadTranslation('esv1');
    useBibleStore.setState({ currentTranslation: 'esv1' });
    const installed = useBibleStore.getState().translations.find((item) => item.id === 'esv1');
    release();
    await reconciliation;

    assert.equal(installed?.textPackLocalPath, newPath);
    assert.deepEqual(
      useBibleStore.getState().translations.find((item) => item.id === 'esv1'),
      installed
    );
    assert.equal(useBibleStore.getState().currentTranslation, 'esv1');
    assert.deepEqual(
      useBibleStore.getState().translations.find((item) => item.id === 'other'),
      unrelated
    );
    assert.ok(doubles.fileSystem.files.has(newPath));
  });
}

test('missing-pack recovery finishing on an old path preserves a newly reinstalled Bible', async () => {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  oldPathInvalidation = { entered, release: pending };
  const unrelated = useBibleStore.getState().translations.find((item) => item.id === 'other');
  const recovering = useBibleStore.getState().recoverMissingInstalledPack('esv1');
  await started;
  await useBibleStore.getState().deleteTranslation('esv1');
  doubles.cloud.run = async () => newPath;
  doubles.fileSystem.setFile(newPath, { exists: true, size: 4096 });
  await useBibleStore.getState().downloadTranslation('esv1');
  useBibleStore.setState({ currentTranslation: 'esv1' });
  const installed = useBibleStore.getState().translations.find((item) => item.id === 'esv1');
  release();
  await recovering;

  assert.equal(installed?.textPackLocalPath, newPath);
  assert.deepEqual(
    useBibleStore.getState().translations.find((item) => item.id === 'esv1'),
    installed
  );
  assert.equal(useBibleStore.getState().currentTranslation, 'esv1');
  assert.deepEqual(
    useBibleStore.getState().translations.find((item) => item.id === 'other'),
    unrelated
  );
  assert.deepEqual(doubles.cloud.deletedArtifacts, [oldPath]);
  assert.ok(doubles.fileSystem.files.has(newPath));
});
