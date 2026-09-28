import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';
import type { BibleTranslation } from '../types';
import type { TextPackInstallJournal } from '../services/bible/textPackInstallJournalModel';

const JOURNAL_KEY = 'bible.textPackInstallJournal.v1';
const OLD_PATH = 'file:///packs/esv1.old.db';
const phase = process.env.EVERYBIBLE_TEXT_DELETION_TEST_PHASE;

if (!phase) {
  test('cold recovery preserves a successful reinstall after native deletion failed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'everybible-deletion-recovery-'));
    try {
      for (const childPhase of ['reinstall', 'recover']) {
        const childEnvironment: NodeJS.ProcessEnv = {
          ...process.env,
          EVERYBIBLE_TEXT_DELETION_TEST_PHASE: childPhase,
          EVERYBIBLE_TEXT_DELETION_TEST_STATE: join(directory, 'state.json'),
        };
        // A fresh test process must not inherit the parent's test-worker protocol.
        delete childEnvironment.NODE_TEST_CONTEXT;
        const output = execFileSync(
          process.execPath,
          [
            '--test',
            '--experimental-test-module-mocks',
            '--import',
            'tsx',
            fileURLToPath(import.meta.url),
          ],
          {
            cwd: fileURLToPath(new URL('../..', import.meta.url)),
            env: childEnvironment,
            encoding: 'utf8',
            timeout: 30_000,
            stdio: 'pipe',
          }
        );
        assert.match(output, new RegExp(`native-boundary fixture: ${childPhase}`));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
} else {
  const mmkv = mockMmkvStorage(mock);
  const doubles = installBibleStoreDoubles(mock);
  const other = makeRuntimeTranslation({
    id: 'other',
    isDownloaded: true,
    installState: 'installed',
    textPackLocalPath: 'file:///packs/other.db',
  });
  interface SavedState {
    journal: TextPackInstallJournal;
    translations: BibleTranslation[];
    newPath: string;
  }

  test(`native-boundary fixture: ${phase}`, async (t) => {
    t.mock.method(console, 'warn', () => {});
    const statePath = process.env.EVERYBIBLE_TEXT_DELETION_TEST_STATE;
    assert.ok(statePath);
    const { useBibleStore } = await import('./bibleStore');
    await flushAsyncWork();
    doubles.fileSystem.setFile(other.textPackLocalPath!, { exists: true, size: 4096 });

    if (phase === 'recover') {
      const saved: SavedState = JSON.parse(readFileSync(statePath, 'utf8'));
      mmkv.store.set(JOURNAL_KEY, JSON.stringify(saved.journal));
      useBibleStore.setState(
        {
          ...useBibleStore.getInitialState(),
          translations: saved.translations,
          currentTranslation: 'esv1',
        },
        true
      );
      doubles.fileSystem.setFile(saved.newPath, { exists: true, size: 4096 });
      await useBibleStore.getState().reconcileTranslationPacks();

      const installed = useBibleStore.getState().translations.find((row) => row.id === 'esv1');
      assert.equal(installed?.textPackLocalPath, saved.newPath);
      assert.equal(installed?.isDownloaded, true);
      assert.equal(useBibleStore.getState().currentTranslation, 'esv1');
      assert.ok(doubles.fileSystem.files.has(saved.newPath));
      assert.deepEqual(doubles.cloud.deletedArtifacts, [OLD_PATH]);
      assert.equal(mmkv.store.has(JOURNAL_KEY), false);
      assert.deepEqual(
        useBibleStore.getState().translations.find((row) => row.id === 'other'),
        other
      );
      return;
    }

    useBibleStore.setState(
      {
        ...useBibleStore.getInitialState(),
        translations: [
          makeRuntimeTranslation({
            id: 'esv1',
            isDownloaded: true,
            installState: 'installed',
            textPackLocalPath: OLD_PATH,
          }),
          other,
        ],
        currentTranslation: 'esv1',
      },
      true
    );
    doubles.fileSystem.setFile(OLD_PATH, { exists: true, size: 4096 });
    // Normal startup already completed an empty recovery pass in this process.
    await useBibleStore.getState().reconcileTranslationPacks();
    doubles.fileSystem.deleteError = new Error('native file removal failed');
    await useBibleStore.getState().deleteTranslation('esv1');
    assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
    assert.ok(JSON.parse(mmkv.store.get(JOURNAL_KEY)!).deletions.esv1);

    doubles.fileSystem.deleteError = null;
    doubles.cloud.paths = (id, operationId) =>
      operationId
        ? {
            finalPath: `file:///packs/${id}.${operationId}.db`,
            stagingPath: `file:///packs/${id}.${operationId}.staging.db`,
            rollbackPath: `file:///packs/${id}.${operationId}.db.rollback`,
          }
        : undefined;
    doubles.cloud.run = async (call) => {
      const path = doubles.cloud.paths(call.translationId, call.operationId)!.finalPath;
      doubles.fileSystem.setFile(path, { exists: true, size: 4096 });
      return path;
    };
    assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'installed');
    const installed = useBibleStore.getState().translations.find((row) => row.id === 'esv1');
    assert.ok(installed?.textPackLocalPath);
    assert.notEqual(installed.textPackLocalPath, OLD_PATH);
    assert.equal(installed.isDownloaded, true);
    const journal: TextPackInstallJournal = JSON.parse(mmkv.store.get(JOURNAL_KEY)!);
    // Preserve pending cleanup of the old bytes, even though a new pack is registered.
    assert.deepEqual(journal.deletions.esv1?.paths, [OLD_PATH]);
    assert.deepEqual(journal.installs, {});
    const saved: SavedState = {
      journal,
      translations: useBibleStore.getState().translations,
      newPath: installed.textPackLocalPath,
    };
    writeFileSync(statePath, JSON.stringify(saved));
  });
}
