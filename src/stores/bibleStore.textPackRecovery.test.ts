/**
 * Launch-time recovery of interrupted text-pack installs and deletions (the MMKV install
 * journal) and of packs an older release left at the legacy `<id>.db` location.
 *
 * Recovery is module state: once a pass leaves the journal empty the store never runs it
 * again in that process. Every test here therefore starts from a journal holding one
 * deletion ("stuck") whose files can never be removed, which keeps recovery live for the
 * next test. The final test removes it and proves recovery then switches itself off, so it
 * must stay last in this file.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
  type BibleStoreDoubles,
  type TextPackPaths,
} from './__tests__/bibleStoreDoubles';
import type { BibleTranslation } from '../types';
import type {
  TextPackDeletionJournalEntry,
  TextPackInstallJournal,
  TextPackInstallJournalEntry,
} from '../services/bible/textPackInstallJournalModel';

const JOURNAL_KEY = 'bible.textPackInstallJournal.v1';
const STUCK_PATH = 'file:///translations/stuck.db';
const STUCK_DELETION: TextPackDeletionJournalEntry = {
  operationId: 'stuck:1',
  translationId: 'stuck',
  paths: [STUCK_PATH],
  updatedAt: 1,
};

const mmkv = mockMmkvStorage(mock);
const doubles: BibleStoreDoubles = installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let defaultTranslations: () => BibleTranslation[];
const warnings: unknown[][] = [];
const originalWarn = console.warn;

const readJournal = (): TextPackInstallJournal =>
  JSON.parse(mmkv.store.get(JOURNAL_KEY) ?? '{"installs":{},"deletions":{}}');

const writeJournal = (journal: TextPackInstallJournal) => {
  mmkv.store.set(JOURNAL_KEY, JSON.stringify(journal));
};

/** Seed the journal alongside the permanent "stuck" deletion. */
const seedJournal = ({
  installs = [],
  deletions = [],
}: {
  installs?: TextPackInstallJournalEntry[];
  deletions?: TextPackDeletionJournalEntry[];
}) => {
  writeJournal({
    installs: Object.fromEntries(installs.map((entry) => [entry.translationId, entry])),
    deletions: Object.fromEntries(
      [STUCK_DELETION, ...deletions].map((entry) => [entry.translationId, entry])
    ),
  });
};

const packPaths = (name: string): TextPackPaths => ({
  finalPath: `file:///translations/${name}.db`,
  stagingPath: `file:///translations/${name}.staging.db`,
  rollbackPath: `file:///translations/${name}.db.rollback`,
});

const installEntry = (
  translationId: string,
  overrides: Partial<TextPackInstallJournalEntry> = {}
): TextPackInstallJournalEntry => ({
  operationId: `${translationId}:op`,
  translationId,
  version: '4',
  expectedSha256: 'b'.repeat(64),
  expectedVerseCount: 31102,
  previousPath: null,
  previousVersion: '3',
  ...packPaths(`${translationId}.op`),
  phase: 'activating',
  updatedAt: 1,
  ...overrides,
});

/** Legacy `<id>.db` paths for the given translations only (the bundled catalog has others). */
const legacyPathsFor =
  (ids: string[]) =>
  (translationId: string): TextPackPaths | undefined =>
    ids.includes(translationId) ? packPaths(translationId) : undefined;

/** The stuck deletion's files can never be removed; everything else deletes cleanly. */
const deleteAllButStuck = async (path: string) => {
  if (path === STUCK_PATH) {
    throw new Error('file is locked');
  }
};

const withTranslations = (extra: BibleTranslation[]) => {
  useBibleStore.setState((state) => ({ translations: [...state.translations, ...extra] }));
};

const findTranslation = (id: string): BibleTranslation | undefined =>
  useBibleStore.getState().translations.find((translation) => translation.id === id);

const installFields = (id: string) => {
  const translation = findTranslation(id);
  return {
    isDownloaded: translation?.isDownloaded,
    installState: translation?.installState,
    textPackLocalPath: translation?.textPackLocalPath,
    activeTextPackVersion: translation?.activeTextPackVersion,
  };
};

const reconcile = () => useBibleStore.getState().reconcileTranslationPacks();

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  assert.ok(predicate(), 'condition was never met');
}

before(async () => {
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  const sanitizers = await import('./persistedStateSanitizers');
  defaultTranslations = sanitizers.getDefaultBibleTranslations;
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});

beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
  doubles.cloud.deleteArtifacts = deleteAllButStuck;
  seedJournal({});
  warnings.length = 0;
  useBibleStore.setState(
    { ...useBibleStore.getInitialState(), translations: defaultTranslations() },
    true
  );
});

after(() => {
  console.warn = originalWarn;
  mock.reset();
});

// ---------------------------------------------------------------------------
// interrupted deletions
// ---------------------------------------------------------------------------

test('a deletion interrupted before its files were removed is finished on the next launch', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'del1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///translations/del1.db',
      activeTextPackVersion: '3',
    }),
  ]);
  seedJournal({
    deletions: [
      {
        operationId: 'del1:op',
        translationId: 'del1',
        paths: ['file:///translations/del1.db', 'file:///translations/del1.db.rollback'],
        updatedAt: 1,
      },
    ],
  });

  await reconcile();

  assert.deepEqual(installFields('del1'), {
    isDownloaded: false,
    installState: 'remote-only',
    textPackLocalPath: null,
    activeTextPackVersion: null,
  });
  assert.deepEqual(
    doubles.cloud.deletedArtifacts.filter((path) => path !== STUCK_PATH),
    ['file:///translations/del1.db', 'file:///translations/del1.db.rollback']
  );
  assert.deepEqual(Object.keys(readJournal().deletions), ['stuck']);
});

test('finishing an interrupted deletion also retires the install it interrupted', async () => {
  seedJournal({
    installs: [installEntry('del1')],
    deletions: [
      { operationId: 'del1:del', translationId: 'del1', paths: ['file:///a.db'], updatedAt: 1 },
    ],
  });

  await reconcile();

  // The half-finished install is never resurrected over a deletion the user asked for.
  assert.deepEqual(doubles.cloud.recoverCalls, []);
  assert.deepEqual(readJournal().installs, {});
  assert.deepEqual(Object.keys(readJournal().deletions), ['stuck']);
});

test('an install started while an interrupted deletion was being finished is kept', async () => {
  seedJournal({
    deletions: [
      { operationId: 'del1:del', translationId: 'del1', paths: ['file:///a.db'], updatedAt: 1 },
    ],
  });
  doubles.cloud.deleteArtifacts = async (path) => {
    await deleteAllButStuck(path);
    if (path === 'file:///a.db') {
      const journal = readJournal();
      writeJournal({
        ...journal,
        installs: { ...journal.installs, del1: installEntry('del1', { operationId: 'del1:new' }) },
      });
    }
  };

  await reconcile();

  assert.deepEqual(Object.keys(readJournal().deletions), ['stuck']);
  assert.equal(readJournal().installs.del1?.operationId, 'del1:new');
});

test('a deletion whose files still cannot be removed stays journaled and is retried', async () => {
  await reconcile();
  await reconcile();

  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH, STUCK_PATH]);
  assert.deepEqual(readJournal().deletions, { stuck: STUCK_DELETION });
  assert.deepEqual(
    warnings.map((args) => args.slice(0, 2)),
    [
      ['[Bible] Text pack deletion recovery is pending:', 'stuck'],
      ['[Bible] Text pack deletion recovery is pending:', 'stuck'],
    ]
  );
});

// ---------------------------------------------------------------------------
// interrupted installs
// ---------------------------------------------------------------------------

test('an install that finished activating is adopted, read back, and its rollback removed', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  const entry = installEntry('ins1');
  seedJournal({ installs: [entry] });
  doubles.cloud.recover = async () => 'current';

  await reconcile();

  assert.deepEqual(installFields('ins1'), {
    isDownloaded: true,
    installState: 'installed',
    textPackLocalPath: entry.finalPath,
    activeTextPackVersion: '4',
  });
  assert.deepEqual(doubles.cloud.recoverCalls, [
    {
      finalPath: entry.finalPath,
      stagingPath: entry.stagingPath,
      rollbackPath: entry.rollbackPath,
    },
  ]);
  assert.deepEqual(doubles.cloud.validateCalls, [
    {
      path: entry.finalPath,
      expectedVerseCount: 31102,
      expectedSha256: 'b'.repeat(64),
      translationId: 'ins1',
    },
  ]);
  assert.deepEqual(doubles.database.invalidatedPaths, [entry.finalPath]);
  assert.ok(doubles.cloud.deletedArtifacts.includes(entry.rollbackPath));
  assert.deepEqual(readJournal().installs, {});
});

test('an install rolled back to the previous pack keeps the previous version and rollback-free', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  const entry = installEntry('ins1', { expectedVerseCount: undefined });
  seedJournal({ installs: [entry] });
  doubles.cloud.recover = async () => 'previous';

  await reconcile();

  assert.equal(findTranslation('ins1')?.activeTextPackVersion, '3');
  // The previous pack was never checksummed against the new release's digest.
  assert.deepEqual(doubles.cloud.validateCalls, [
    {
      path: entry.finalPath,
      expectedVerseCount: 1,
      expectedSha256: undefined,
      translationId: 'ins1',
    },
  ]);
  assert.equal(doubles.cloud.deletedArtifacts.includes(entry.rollbackPath), false);
  assert.deepEqual(readJournal().installs, {});
});

test('a final pack without a rollback is trusted as the new release only once it was activating', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'act' }), makeRuntimeTranslation({ id: 'dl' })]);
  seedJournal({
    installs: [
      installEntry('act', { phase: 'activating' }),
      installEntry('dl', { phase: 'downloading' }),
    ],
  });
  doubles.cloud.recover = async () => 'current-without-rollback';

  await reconcile();

  assert.equal(findTranslation('act')?.activeTextPackVersion, '4');
  assert.equal(findTranslation('dl')?.activeTextPackVersion, '3');
  assert.deepEqual(
    doubles.cloud.validateCalls.map((call) => [call.translationId, call.expectedSha256]),
    [
      ['act', 'b'.repeat(64)],
      ['dl', undefined],
    ]
  );
  assert.deepEqual(readJournal().installs, {});
});

test('a recovered install without a recorded version falls back to the installed one, then 1', async () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'known', activeTextPackVersion: '7' }),
    makeRuntimeTranslation({ id: 'blank' }),
    makeRuntimeTranslation({ id: 'prev' }),
  ]);
  seedJournal({
    installs: [
      installEntry('known', { version: '' }),
      installEntry('blank', { version: '' }),
      installEntry('prev', { previousVersion: null }),
    ],
  });
  doubles.cloud.recover = async (paths) =>
    paths.finalPath.includes('prev') ? 'previous' : 'current';

  await reconcile();

  assert.deepEqual(
    ['known', 'blank', 'prev'].map((id) => findTranslation(id)?.activeTextPackVersion),
    ['7', '1', '1']
  );
});

test('an interrupted install of a translation no longer in the catalog is retired without a read', async () => {
  seedJournal({ installs: [installEntry('gone')] });
  doubles.cloud.recover = async () => 'current';

  await reconcile();

  assert.equal(findTranslation('gone'), undefined);
  assert.deepEqual(doubles.database.invalidatedPaths, []);
  assert.deepEqual(readJournal().installs, {});
});

test('an install that fails validation stays journaled and leaves the translation untouched', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  seedJournal({ installs: [installEntry('ins1')] });
  doubles.cloud.recover = async () => 'current';
  doubles.cloud.validateError = () => new Error('checksum mismatch');

  await reconcile();

  assert.equal(findTranslation('ins1')?.installState, 'remote-only');
  assert.equal(readJournal().installs.ins1?.operationId, 'ins1:op');
  assert.deepEqual(
    warnings.filter((args) => args[1] === 'ins1').map((args) => args[0]),
    ['[Bible] Text pack install recovery is pending:']
  );
});

test('an install whose pack cannot be read back is walked back to its prior state', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  seedJournal({ installs: [installEntry('ins1')] });
  doubles.cloud.recover = async () => 'current';
  doubles.database.readbackBookId = 'EXO';

  await reconcile();

  assert.deepEqual(installFields('ins1'), {
    isDownloaded: false,
    installState: 'remote-only',
    textPackLocalPath: null,
    activeTextPackVersion: null,
  });
  assert.equal(readJournal().installs.ins1?.operationId, 'ins1:op');
});

test('an install interrupted before anything was activated is retired, not retried forever', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  const entry = installEntry('ins1', { phase: 'downloading' });
  seedJournal({ installs: [entry] });
  // Nothing reached the final or rollback path (a cancelled or killed transfer), so there
  // is no database there to validate: the real validator throws on the missing file.
  doubles.cloud.recover = async () => 'none';
  doubles.cloud.validateError = (path) =>
    path === entry.finalPath ? new Error('no such database') : null;

  await reconcile();

  assert.deepEqual(readJournal().installs, {});
  assert.equal(findTranslation('ins1')?.installState, 'remote-only');
  assert.deepEqual(
    warnings.filter((args) => args[1] === 'ins1'),
    []
  );
});

test('an install replaced by a newer download while it was being recovered is not retired', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  seedJournal({ installs: [installEntry('ins1')] });
  doubles.cloud.recover = async () => 'current';
  doubles.cloud.validateError = () => {
    const journal = readJournal();
    writeJournal({
      ...journal,
      installs: { ...journal.installs, ins1: installEntry('ins1', { operationId: 'ins1:newer' }) },
    });
    return null;
  };

  await reconcile();

  assert.equal(readJournal().installs.ins1?.operationId, 'ins1:newer');
});

test('recovery leaves the journal entry of a download that is still running alone', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'live' })]);
  // Journaled paths only: no pack exists at the legacy location for this translation.
  doubles.cloud.paths = (translationId, operationId) =>
    operationId ? packPaths(`${translationId}.${operationId}`) : undefined;
  let finishDownload!: (path: string) => void;
  doubles.cloud.run = () =>
    new Promise<string>((resolve) => {
      finishDownload = resolve;
    });

  const download = useBibleStore.getState().downloadTranslation('live');
  await waitFor(() => doubles.cloud.calls.length === 1);
  const operationId = doubles.cloud.calls[0]?.operationId;
  doubles.cloud.recover = async () => 'current';

  await reconcile();

  // Neither the journaled install nor the legacy location is touched mid-transfer.
  assert.deepEqual(doubles.cloud.recoverCalls, []);
  assert.equal(readJournal().installs.live?.operationId, operationId);

  finishDownload(packPaths(`live.${operationId}`).finalPath);
  assert.equal(await download, 'installed');
  assert.equal(readJournal().installs.live, undefined);
});

// ---------------------------------------------------------------------------
// packs left at the legacy location by older releases
// ---------------------------------------------------------------------------

test('a pack an older release left at the legacy location is adopted after validation', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'leg1',
      catalog: {
        version: '3',
        updatedAt: '2026-01-01T00:00:00.000Z',
        text: {
          format: 'sqlite',
          version: '3',
          downloadUrl: 'https://media.example/leg1.db',
          sha256: 'a'.repeat(64),
          verseCount: 31102,
        },
      },
    }),
  ]);
  const paths = packPaths('leg1');
  doubles.cloud.paths = (translationId) => (translationId === 'leg1' ? paths : undefined);
  doubles.cloud.recover = async () => 'current';

  await reconcile();

  assert.deepEqual(installFields('leg1'), {
    isDownloaded: true,
    installState: 'installed',
    textPackLocalPath: paths.finalPath,
    activeTextPackVersion: '3',
  });
  assert.deepEqual(doubles.cloud.validateCalls, [
    {
      path: paths.finalPath,
      expectedVerseCount: 31102,
      expectedSha256: 'a'.repeat(64),
      translationId: 'leg1',
    },
  ]);
  assert.deepEqual(doubles.database.invalidatedPaths, [paths.finalPath]);
  assert.ok(doubles.cloud.deletedArtifacts.includes(paths.rollbackPath));
});

test('legacy discovery leaves a usable install, an absent pack and an unrecoverable pack alone', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'usable',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///translations/usable.db',
    }),
    makeRuntimeTranslation({ id: 'absent' }),
    makeRuntimeTranslation({ id: 'nothing' }),
  ]);
  doubles.cloud.paths = legacyPathsFor(['usable', 'absent', 'nothing']);
  doubles.fileSystem.setFile(packPaths('absent').finalPath, { exists: false, size: 0 });
  doubles.fileSystem.setFile(packPaths('absent').rollbackPath, { exists: false, size: 0 });
  doubles.cloud.recover = async () => 'none';
  const before = ['usable', 'absent', 'nothing'].map(installFields);

  await reconcile();

  assert.deepEqual(doubles.cloud.recoverCalls, [packPaths('nothing')]);
  assert.deepEqual(doubles.cloud.validateCalls, []);
  assert.deepEqual(['usable', 'absent', 'nothing'].map(installFields), before);
});

test('a legacy pack is versioned from the previous install, or the catalog, once recovered', async () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'prev' }),
    makeRuntimeTranslation({ id: 'bare', catalog: { version: '9', updatedAt: '2026-01-01' } }),
    makeRuntimeTranslation({ id: 'signed' }),
  ]);
  doubles.cloud.paths = legacyPathsFor(['prev', 'bare', 'signed']);
  doubles.cloud.recover = async (paths) =>
    paths.finalPath.includes('prev') ? 'previous' : 'current-without-rollback';

  await reconcile();

  assert.deepEqual(
    ['prev', 'bare', 'signed'].map((id) => findTranslation(id)?.activeTextPackVersion),
    ['1', '1', '3']
  );
  assert.deepEqual(
    doubles.cloud.validateCalls.map((call) => [
      call.translationId,
      call.expectedVerseCount,
      call.expectedSha256,
    ]),
    [
      ['prev', 1, undefined],
      ['bare', 1, undefined],
      ['signed', 1, 'a'.repeat(64)],
    ]
  );
  // Only a recovery that kept both generations has a rollback left to clean up.
  assert.deepEqual(
    doubles.cloud.deletedArtifacts.filter((path) => path !== STUCK_PATH),
    []
  );
});

test('a legacy pack that fails validation is not adopted and is retried next launch', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'leg1' })]);
  doubles.cloud.paths = legacyPathsFor(['leg1']);
  doubles.cloud.recover = async () => 'current';
  doubles.database.readbackBookId = 'EXO';

  await reconcile();

  assert.deepEqual(installFields('leg1'), {
    isDownloaded: false,
    installState: 'remote-only',
    textPackLocalPath: null,
    activeTextPackVersion: null,
  });
  assert.deepEqual(
    warnings.filter((args) => args[1] === 'leg1').map((args) => args[0]),
    ['[Bible] Legacy text pack recovery is pending:']
  );
});

// ---------------------------------------------------------------------------
// coordination
// ---------------------------------------------------------------------------

test('concurrent callers share a single recovery pass', async () => {
  await Promise.all([reconcile(), reconcile(), doubles.database.readinessResolver?.('bsb')]);

  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH]);
});

test('opening any translation waits for pending recovery first', async () => {
  assert.ok(doubles.database.readinessResolver, 'the store registers a readiness hook');

  await doubles.database.readinessResolver('bsb');

  assert.deepEqual(doubles.cloud.deletedArtifacts, [STUCK_PATH]);
});

test('reading a recovered pack back does not wait on the recovery that is reading it', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'ins1' })]);
  seedJournal({ installs: [installEntry('ins1')] });
  doubles.cloud.recover = async () => 'current';
  // The representative read goes through getDatabase, which asks the readiness hook
  // first. Without the bypass that read would await the very pass performing it.
  doubles.database.beforeGetChapter = async (translationId) => {
    await doubles.database.readinessResolver?.(translationId);
  };

  await reconcile();

  assert.equal(findTranslation('ins1')?.installState, 'installed');
});

// Must stay last: it empties the journal, which switches recovery off for this process.
test('once the journal is empty recovery stops running for the rest of the session', async () => {
  writeJournal({ installs: {}, deletions: {} });
  await reconcile();
  assert.equal(mmkv.store.has(JOURNAL_KEY), false);

  seedJournal({ installs: [installEntry('late')] });
  doubles.cloud.deletedArtifacts.length = 0;
  await reconcile();

  assert.deepEqual(doubles.cloud.recoverCalls, []);
  assert.deepEqual(doubles.cloud.deletedArtifacts, []);
  assert.equal(readJournal().installs.late?.operationId, 'late:op');
});
