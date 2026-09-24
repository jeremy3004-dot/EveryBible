/**
 * The text-pack download lifecycle around the transfer itself: the install journal a
 * download keeps, user cancellation, byte-level progress, the post-install read-back, and
 * deleting a translation while its pack is still downloading. Happy-path installs live in
 * bibleStore.downloads.test.ts; launch-time recovery in bibleStore.textPackRecovery.test.ts.
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
import type { BibleTranslation, TranslationDownloadProgress } from '../types';
import type { TextPackInstallJournal } from '../services/bible/textPackInstallJournalModel';

const JOURNAL_KEY = 'bible.textPackInstallJournal.v1';

const mmkv = mockMmkvStorage(mock);
const doubles: BibleStoreDoubles = installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let defaultTranslations: () => BibleTranslation[];

class CancelledTransfer extends Error {}

before(async () => {
  const sanitizers = await import('./persistedStateSanitizers');
  defaultTranslations = sanitizers.getDefaultBibleTranslations;
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});

beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
  doubles.cloud.isCancelled = (error) => error instanceof CancelledTransfer;
  mmkv.store.delete(JOURNAL_KEY);
  useBibleStore.setState(
    { ...useBibleStore.getInitialState(), translations: defaultTranslations() },
    true
  );
});

after(() => {
  mock.reset();
});

const withTranslations = (extra: BibleTranslation[]) => {
  useBibleStore.setState((state) => ({ translations: [...state.translations, ...extra] }));
};

const findTranslation = (id: string): BibleTranslation | undefined =>
  useBibleStore.getState().translations.find((translation) => translation.id === id);

const progress = () => useBibleStore.getState().downloadProgress;

const readJournal = (): TextPackInstallJournal | null => {
  const raw = mmkv.store.get(JOURNAL_KEY);
  return raw ? JSON.parse(raw) : null;
};

const journaledPaths = (translationId: string, operationId?: string): TextPackPaths | undefined =>
  operationId
    ? {
        finalPath: `file:///translations/${translationId}.${operationId}.db`,
        stagingPath: `file:///translations/${translationId}.${operationId}.staging.db`,
        rollbackPath: `file:///translations/${translationId}.${operationId}.db.rollback`,
      }
    : undefined;

/** A runtime translation with an older pack on disk that is being re-downloaded. */
const staleInstall = (overrides: Partial<BibleTranslation> = {}) =>
  makeRuntimeTranslation({
    id: 'esv1',
    isDownloaded: false,
    installState: 'installed',
    textPackLocalPath: 'file:///packs/esv1.old.db',
    activeTextPackVersion: '2',
    ...overrides,
  });

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  assert.ok(predicate(), 'condition was never met');
}

const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

// ---------------------------------------------------------------------------
// the install journal
// ---------------------------------------------------------------------------

test('a download journals its install before transferring and retires it once installed', async () => {
  withTranslations([
    staleInstall({
      catalog: {
        version: '3',
        updatedAt: '2026-01-01T00:00:00.000Z',
        text: {
          format: 'sqlite',
          version: '3',
          downloadUrl: 'https://media.example/esv1.db',
          sha256: 'a'.repeat(64),
          verseCount: 31102,
        },
      },
    }),
  ]);
  doubles.cloud.paths = journaledPaths;
  const phases: string[] = [];
  let journalDuringTransfer: Record<string, unknown> | undefined;
  doubles.cloud.run = async (call) => {
    const entry: Record<string, unknown> = { ...readJournal()?.installs.esv1 };
    delete entry.updatedAt; // a wall-clock stamp
    journalDuringTransfer = entry;
    call.onPhase?.('verifying');
    phases.push(readJournal()?.installs.esv1?.phase ?? 'missing');
    call.onPhase?.('activating');
    phases.push(readJournal()?.installs.esv1?.phase ?? 'missing');
    return journaledPaths('esv1', call.operationId)?.finalPath ?? '';
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'installed');

  const operationId = doubles.cloud.calls[0]?.operationId;
  assert.deepEqual(journalDuringTransfer, {
    operationId,
    translationId: 'esv1',
    version: '3',
    expectedSha256: 'a'.repeat(64),
    expectedVerseCount: 31102,
    previousPath: 'file:///packs/esv1.old.db',
    previousVersion: '2',
    ...journaledPaths('esv1', operationId),
    phase: 'downloading',
  });
  // Only activation changes what recovery may trust; verification does not.
  assert.deepEqual(phases, ['downloading', 'activating']);
  assert.equal(readJournal(), null);
  assert.equal(
    findTranslation('esv1')?.textPackLocalPath,
    journaledPaths('esv1', operationId)?.finalPath
  );
});

test('a phase report for a journal entry that was already retired is ignored', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.paths = journaledPaths;
  doubles.cloud.run = async (call) => {
    mmkv.store.delete(JOURNAL_KEY);
    call.onPhase?.('activating');
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.equal(readJournal(), null);
});

test('a failed journaled download retires its journal entry', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.paths = journaledPaths;
  doubles.cloud.run = async () => {
    assert.ok(readJournal()?.installs.esv1);
    throw new Error('network unreachable');
  };

  await assert.rejects(() => useBibleStore.getState().downloadTranslation('esv1'));

  assert.equal(readJournal(), null);
});

// ---------------------------------------------------------------------------
// cancellation
// ---------------------------------------------------------------------------

test('a cancelled download resolves as cancelled and returns the translation to remote-only', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.run = async () => {
    throw new CancelledTransfer();
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'cancelled');
  await flushAsyncWork();

  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.equal(findTranslation('esv1')?.lastInstallError, undefined);
  assert.equal(useBibleStore.getState().error, null);
  assert.equal(progress(), null);
  assert.deepEqual(doubles.analytics.events, []);
});

test('cancelling a re-download keeps the pack that was already installed', async () => {
  withTranslations([staleInstall()]);
  doubles.cloud.run = async () => {
    throw new CancelledTransfer();
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'cancelled');

  assert.equal(findTranslation('esv1')?.installState, 'installed');
  assert.equal(findTranslation('esv1')?.textPackLocalPath, 'file:///packs/esv1.old.db');
});

test('a text download that ends after another download took over the banner leaves it alone', async () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'esv1' }),
    makeRuntimeTranslation({ id: 'kjv1' }),
  ]);
  const otherBanner: TranslationDownloadProgress = {
    translationId: 'kjv1',
    progress: 40,
    status: 'downloading',
    jobId: 'job-kjv',
  };
  doubles.cloud.run = async () => {
    useBibleStore.setState({ downloadProgress: otherBanner });
    throw new CancelledTransfer();
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'cancelled');
  assert.deepEqual(progress(), otherBanner);

  doubles.cloud.run = async () => {
    useBibleStore.setState({ downloadProgress: otherBanner });
    throw new Error('network unreachable');
  };

  await assert.rejects(() => useBibleStore.getState().downloadTranslation('esv1'));
  // The failure is still thrown to the caller, but the other download's banner survives.
  assert.deepEqual(progress(), otherBanner);
  assert.equal(useBibleStore.getState().error, null);
});

test('cancelling a running text download hides its progress and walks the row back', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  let bannerAfterLateProgress: TranslationDownloadProgress | null | undefined;
  doubles.cloud.run = async (call) => {
    useBibleStore.getState().cancelDownload();
    // The transfer may still report progress before it notices the cancellation.
    call.onProgress?.({ phase: 'fetching', totalVerses: 200, versesDownloaded: 150 });
    bannerAfterLateProgress = progress();
    await waitFor(() => progress() === null);
    throw new CancelledTransfer();
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'cancelled');

  assert.deepEqual(bannerAfterLateProgress, {
    translationId: 'esv1',
    progress: 0,
    status: 'downloading',
  });
  assert.equal(doubles.cloud.textCancellationRequests, 1);
  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
});

test('a text cancellation the transfer refuses leaves the progress banner in place', async () => {
  const banner: TranslationDownloadProgress = {
    translationId: 'esv1',
    progress: 90,
    status: 'installing',
  };
  useBibleStore.setState({ downloadProgress: banner });
  doubles.cloud.cancelAccepted = false;

  useBibleStore.getState().cancelDownload();
  await waitFor(() => doubles.cloud.textCancellationRequests === 1);
  await settle();

  assert.deepEqual(progress(), banner);
});

test('a text cancellation that errors does not freeze the progress of the running download', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.cancelError = new Error('transport gone');
  let bannerAfterFailedCancel: TranslationDownloadProgress | null | undefined;
  doubles.cloud.run = async (call) => {
    useBibleStore.getState().cancelDownload();
    await waitFor(() => doubles.cloud.textCancellationRequests === 1);
    await settle();
    call.onProgress?.({ phase: 'fetching', totalVerses: 200, versesDownloaded: 100 });
    bannerAfterFailedCancel = progress();
    return 'file:///packs/esv1.db';
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'installed');

  assert.equal(bannerAfterFailedCancel?.progress, 50);
});

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------

test('progress is measured in bytes when the transfer size is known', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  let banner: TranslationDownloadProgress | null = null;
  doubles.cloud.run = async (call) => {
    call.onProgress?.({
      phase: 'fetching',
      totalVerses: 0,
      versesDownloaded: 0,
      bytesDownloaded: 512,
      bytesTotal: 2048,
    });
    banner = progress();
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(banner, {
    translationId: 'esv1',
    progress: 25,
    status: 'downloading',
    error: undefined,
    bytesDownloaded: 512,
    bytesTotal: 2048,
  });
});

test('a transfer of unknown size is shown as indeterminate', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  let banner: TranslationDownloadProgress | null = null;
  doubles.cloud.run = async (call) => {
    call.onProgress?.({
      phase: 'fetching',
      totalVerses: 0,
      versesDownloaded: 0,
      bytesDownloaded: 64,
    });
    banner = progress();
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(banner, {
    translationId: 'esv1',
    progress: 0,
    status: 'downloading',
    error: undefined,
    bytesDownloaded: 64,
    isIndeterminate: true,
  });
});

test('text progress never overwrites a banner that now belongs to another download', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  const banners: Array<TranslationDownloadProgress | null> = [];
  doubles.cloud.run = async (call) => {
    for (const other of [
      { translationId: 'kjv1', progress: 10, status: 'downloading' as const },
      { translationId: 'esv1', progress: 10, status: 'downloading' as const, jobId: 'audio-job' },
    ]) {
      useBibleStore.setState({ downloadProgress: other });
      call.onProgress?.({ phase: 'fetching', totalVerses: 200, versesDownloaded: 200 });
      banners.push(progress());
    }
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(
    banners.map((banner) => [banner?.translationId, banner?.progress, banner?.jobId]),
    [
      ['kjv1', 10, undefined],
      ['esv1', 10, 'audio-job'],
    ]
  );
});

// ---------------------------------------------------------------------------
// read-back and cleanup after install
// ---------------------------------------------------------------------------

test('a new pack that cannot be read back is removed and the previous install restored', async () => {
  withTranslations([staleInstall()]);
  doubles.database.readbackBookId = 'EXO';

  await assert.rejects(
    () => useBibleStore.getState().downloadTranslation('esv1'),
    /no readable representative chapter/
  );

  assert.deepEqual(doubles.cloud.deletedArtifacts, ['file:///packs/esv1.db']);
  const restored = findTranslation('esv1');
  assert.deepEqual(
    {
      isDownloaded: restored?.isDownloaded,
      installState: restored?.installState,
      textPackLocalPath: restored?.textPackLocalPath,
      activeTextPackVersion: restored?.activeTextPackVersion,
    },
    {
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.old.db',
      activeTextPackVersion: '2',
    }
  );
});

test('a first install that cannot be read back leaves the translation remote-only', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.database.readbackBookId = 'EXO';
  // Removing the unreadable pack is best-effort; its failure must not mask the real error.
  doubles.cloud.deleteArtifacts = async () => {
    throw new Error('file is locked');
  };

  await assert.rejects(
    () => useBibleStore.getState().downloadTranslation('esv1'),
    /no readable representative chapter/
  );

  const translation = findTranslation('esv1');
  assert.equal(translation?.isDownloaded, false);
  assert.equal(translation?.installState, 'remote-only');
  assert.equal(translation?.textPackLocalPath, null);
});

test('a replaced pack that cannot be cleaned up yet does not undo the new install', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  withTranslations([staleInstall()]);
  doubles.cloud.deleteArtifacts = async (path) => {
    if (path === 'file:///packs/esv1.old.db') {
      throw new Error('file is locked');
    }
  };

  assert.equal(await useBibleStore.getState().downloadTranslation('esv1'), 'installed');

  assert.equal(findTranslation('esv1')?.textPackLocalPath, 'file:///packs/esv1.db');
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments.slice(0, 2)),
    [['[Bible] Previous text pack cleanup is pending:', 'esv1']]
  );
});

test('tapping download again mid-transfer joins the running download', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  let finish!: (path: string) => void;
  doubles.cloud.run = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });

  const first = useBibleStore.getState().downloadTranslation('esv1');
  await waitFor(() => doubles.cloud.calls.length === 1);
  const second = useBibleStore.getState().downloadTranslation('esv1');
  finish('file:///packs/esv1.db');

  assert.deepEqual(await Promise.all([first, second]), ['installed', 'installed']);
  assert.equal(doubles.cloud.calls.length, 1);
});

// ---------------------------------------------------------------------------
// deleting while downloading
// ---------------------------------------------------------------------------

test('deleting a translation mid-download cancels the transfer and waits for it to settle', async () => {
  withTranslations([staleInstall()]);
  let failTransfer!: (error: Error) => void;
  doubles.cloud.run = () =>
    new Promise<string>((_resolve, reject) => {
      failTransfer = reject;
    });
  const events: string[] = [];

  const download = useBibleStore
    .getState()
    .downloadTranslation('esv1')
    .then((result) => {
      events.push(`download ${result}`);
    });
  await waitFor(() => doubles.cloud.calls.length === 1);
  const deletion = useBibleStore
    .getState()
    .deleteTranslation('esv1')
    .then(() => {
      events.push('deleted');
    });
  await waitFor(() => doubles.cloud.textCancellationRequests === 1);
  failTransfer(new CancelledTransfer());
  await Promise.all([download, deletion]);

  assert.deepEqual(events, ['download cancelled', 'deleted']);
  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.ok(doubles.fileSystem.deleted.some((entry) => entry.path === 'file:///packs/esv1.old.db'));
});

test('a deletion that cannot wait on the transfer still removes whatever it installed', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.waitError = new Error('transfer registry unavailable');
  let finish!: (path: string) => void;
  doubles.cloud.run = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });

  const download = useBibleStore.getState().downloadTranslation('esv1');
  await waitFor(() => doubles.cloud.calls.length === 1);
  const deletion = useBibleStore.getState().deleteTranslation('esv1');
  await waitFor(() => warn.mock.callCount() === 1);
  // The transfer finishes anyway; the deletion queued behind it must win.
  finish('file:///packs/esv1.db');
  assert.equal(await download, 'installed');
  await deletion;

  assert.deepEqual(warn.mock.calls[0]?.arguments.slice(0, 2), [
    '[Bible] Failed to settle text pack before deletion:',
    'esv1',
  ]);
  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.equal(findTranslation('esv1')?.textPackLocalPath, null);
  assert.ok(doubles.fileSystem.deleted.some((entry) => entry.path === 'file:///packs/esv1.db'));
});

// ---------------------------------------------------------------------------
// translation preference sync
// ---------------------------------------------------------------------------

test('switching translation still happens when the preference service cannot even load', () => {
  doubles.translations.preferenceThrowsSynchronously = true;

  useBibleStore.getState().setCurrentTranslation('web');

  assert.equal(useBibleStore.getState().currentTranslation, 'web');
  assert.deepEqual(
    doubles.translations.preferenceCalls.map(({ primary }) => primary),
    ['web']
  );
});
