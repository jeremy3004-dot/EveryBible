/**
 * Text-pack download, cancellation and deletion behaviour of the Bible store.
 * Core state lives in bibleStore.test.ts; audio downloads in bibleStore.audio.test.ts.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  AUDIO_ROOT_URI,
  flushAsyncWork,
  installBibleStoreDoubles,
  makeAudioJob,
  makeRuntimeTranslation,
  type BibleStoreDoubles,
} from './__tests__/bibleStoreDoubles';
import type { BibleTranslation, TranslationDownloadProgress } from '../types';

mockMmkvStorage(mock);
const doubles: BibleStoreDoubles = installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let defaultTranslations: () => BibleTranslation[];

before(async () => {
  const sanitizers = await import('./persistedStateSanitizers');
  defaultTranslations = sanitizers.getDefaultBibleTranslations;
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});

beforeEach(async () => {
  // Let any fire-and-forget work started by the previous test settle before the
  // recordings are cleared, so a late analytics event cannot land in the next test.
  await flushAsyncWork();
  doubles.reset();
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

test('downloading a bundled translation marks it available without any network call', async () => {
  await useBibleStore.getState().downloadTranslation('web');

  const web = findTranslation('web');
  assert.equal(web?.isDownloaded, true);
  assert.equal(web?.installState, 'seeded');
  assert.deepEqual(doubles.cloud.calls, []);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('downloading a translation that is already installed does nothing', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(doubles.cloud.calls, []);
  assert.deepEqual(doubles.database.invalidatedPaths, []);
});

test('downloading a cloud translation installs its pack and records the install state', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.run = async () => 'file:///packs/esv1.db';

  await useBibleStore.getState().downloadTranslation('esv1');

  const installed = findTranslation('esv1');
  assert.deepEqual(
    {
      isDownloaded: installed?.isDownloaded,
      hasText: installed?.hasText,
      installState: installed?.installState,
      textPackLocalPath: installed?.textPackLocalPath,
      activeTextPackVersion: installed?.activeTextPackVersion,
      downloadProgress: useBibleStore.getState().downloadProgress,
      error: useBibleStore.getState().error,
    },
    {
      isDownloaded: true,
      hasText: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
      activeTextPackVersion: '3',
      downloadProgress: null,
      error: null,
    }
  );
});

test('downloading a cloud translation asks the download service for the catalog pack', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.equal(doubles.cloud.calls.length, 1);
  assert.equal(doubles.cloud.calls[0]?.translationId, 'esv1');
  assert.equal(doubles.cloud.calls[0]?.downloadUrl, 'https://media.example/esv1.db');
  assert.equal(doubles.cloud.calls[0]?.expectedSha256, 'a'.repeat(64));
});

test('downloading a cloud translation invalidates the cached database for the new pack', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(doubles.database.invalidatedPaths, ['file:///packs/esv1.db']);
});

test('re-downloading over a stale pack invalidates the old file before fetching', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: false,
      textPackLocalPath: 'file:///packs/esv1.old.db',
    }),
  ]);
  doubles.cloud.run = async () => 'file:///packs/esv1.db';

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(doubles.database.invalidatedPaths, [
    'file:///packs/esv1.old.db',
    'file:///packs/esv1.db',
  ]);
});

test('a cloud download reports its phases as reader-facing progress', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  const snapshots: Array<TranslationDownloadProgress | null> = [];
  doubles.cloud.run = async (call) => {
    snapshots.push(useBibleStore.getState().downloadProgress);
    call.onProgress?.({ phase: 'fetching', totalVerses: 200, versesDownloaded: 50 });
    snapshots.push(useBibleStore.getState().downloadProgress);
    call.onProgress?.({ phase: 'indexing', totalVerses: 200, versesDownloaded: 200 });
    snapshots.push(useBibleStore.getState().downloadProgress);
    call.onProgress?.({ phase: 'complete', totalVerses: 200, versesDownloaded: 200 });
    snapshots.push(useBibleStore.getState().downloadProgress);
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(snapshots, [
    { translationId: 'esv1', progress: 0, status: 'downloading' },
    { translationId: 'esv1', progress: 25, status: 'downloading', error: undefined },
    { translationId: 'esv1', progress: 100, status: 'installing', error: undefined },
    { translationId: 'esv1', progress: 100, status: 'completed', error: undefined },
  ]);
});

test('a cloud download reports an error phase with its message', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  let errorProgress: TranslationDownloadProgress | null = null;
  doubles.cloud.run = async (call) => {
    call.onProgress?.({
      phase: 'error',
      totalVerses: 0,
      versesDownloaded: 0,
      error: 'checksum mismatch',
    });
    errorProgress = useBibleStore.getState().downloadProgress;
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.deepEqual(errorProgress, {
    translationId: 'esv1',
    progress: 0,
    status: 'error',
    error: 'checksum mismatch',
  });
});

test('a cloud download marks the translation as downloading while it runs', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  let installStateDuringDownload: string | undefined;
  doubles.cloud.run = async () => {
    installStateDuringDownload = findTranslation('esv1')?.installState;
    return 'file:///packs/esv1.db';
  };

  await useBibleStore.getState().downloadTranslation('esv1');

  assert.equal(installStateDuringDownload, 'downloading');
});

test('a completed text download is reported to anonymous usage analytics', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1', hasAudio: true })]);

  await useBibleStore.getState().downloadTranslation('esv1');
  await flushAsyncWork();

  assert.deepEqual(doubles.analytics.events, [
    {
      name: 'text_translation_download_completed',
      properties: {
        content_kind: 'text',
        download_scope: 'translation',
        download_units: 1,
        has_audio: true,
        translation_id: 'esv1',
        translation_source: 'runtime',
      },
    },
  ]);
});

test('downloading a translation with no published text pack fails with a readable message', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      catalog: { version: '3', updatedAt: '2026-01-01T00:00:00.000Z' },
    }),
  ]);

  await assert.rejects(
    () => useBibleStore.getState().downloadTranslation('esv1'),
    /not published to the EveryBible library yet/
  );

  const failed = findTranslation('esv1');
  assert.equal(failed?.installState, 'failed');
  assert.equal(
    failed?.lastInstallError,
    'This Bible is not published to the EveryBible library yet.'
  );
  assert.equal(
    useBibleStore.getState().error,
    'This Bible is not published to the EveryBible library yet.'
  );
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('downloading a translation the store does not know fails without touching any row', async () => {
  await assert.rejects(() => useBibleStore.getState().downloadTranslation('ghost'));

  assert.deepEqual(doubles.cloud.calls, []);
  assert.equal(
    useBibleStore.getState().error,
    'This Bible is not published to the EveryBible library yet.'
  );
});

test('a failed cloud download records the failure on the translation and rethrows', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.run = async () => {
    throw new Error('network unreachable');
  };

  await assert.rejects(
    () => useBibleStore.getState().downloadTranslation('esv1'),
    /network unreachable/
  );

  const failed = findTranslation('esv1');
  assert.equal(failed?.installState, 'failed');
  assert.equal(failed?.lastInstallError, 'network unreachable');
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('a cloud download that rejects with a non-Error still surfaces a download error', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.run = async () => {
    throw 'boom';
  };

  await assert.rejects(() => useBibleStore.getState().downloadTranslation('esv1'), {
    message: 'Download failed',
  });

  assert.equal(findTranslation('esv1')?.lastInstallError, 'Download failed');
});

test('a failed cloud download records no analytics event', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);
  doubles.cloud.run = async () => {
    throw new Error('network unreachable');
  };

  await assert.rejects(() => useBibleStore.getState().downloadTranslation('esv1'));
  await flushAsyncWork();

  assert.deepEqual(doubles.analytics.events, []);
});

test('downloadAllBooks installs the whole translation pack', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);

  await useBibleStore.getState().downloadAllBooks('esv1');

  assert.equal(doubles.cloud.calls.length, 1);
  assert.equal(findTranslation('esv1')?.installState, 'installed');
});

test('cancelDownload clears the progress banner and the in-flight job', () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      activeDownloadJob: {
        id: 'job-1',
        kind: 'audio-book',
        state: 'running',
        progress: 30,
        startedAt: 1,
        updatedAt: 2,
      },
    }),
  ]);
  useBibleStore.setState({
    downloadProgress: {
      translationId: 'esv1',
      jobId: 'job-1',
      progress: 30,
      status: 'downloading',
    },
  });

  useBibleStore.getState().cancelDownload();

  assert.equal(useBibleStore.getState().downloadProgress, null);
  assert.equal(findTranslation('esv1')?.activeDownloadJob, null);
});

test('cancelDownload stops the native job and removes it from the persisted registry', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', jobId: 'job-1', progress: 30, status: 'downloading' },
  });

  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.cancellationRequests, ['job-1']);
  assert.deepEqual(doubles.audio.cancelledJobIds, ['job-1']);
  assert.deepEqual(doubles.audio.removedJobIds, ['job-1']);
});

test('cancelDownload still clears the registry when the native transport cannot cancel', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', jobId: 'job-1', progress: 30, status: 'downloading' },
  });
  doubles.audio.cancelJobError = new Error('no native transport');

  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.removedJobIds, ['job-1']);
});

test('cancelDownload tolerates a registry that refuses to drop the job', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', jobId: 'job-1', progress: 30, status: 'downloading' },
  });
  doubles.audio.removeJobError = new Error('registry locked');

  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();

  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('cancelDownload still clears the registry on a transport with no cancel support at all', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', jobId: 'job-1', progress: 30, status: 'downloading' },
  });
  // Older Expo/dev contexts hand back a transport object without a cancelJob member.
  doubles.audio.supportsCancel = false;

  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.cancelledJobIds, []);
  assert.deepEqual(
    doubles.audio.cancellationRequests,
    ['job-1'],
    'the in-JS scheduling loop is stopped even when nothing native can be cancelled'
  );
  assert.deepEqual(doubles.audio.removedJobIds, ['job-1']);
});

test('cancelDownload leaves the audio subsystem alone when no job id is in flight', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'esv1', progress: 10, status: 'downloading' },
  });

  useBibleStore.getState().cancelDownload();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.cancellationRequests, []);
  assert.equal(doubles.audio.transportCreations, 0);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('cancelDownload with nothing downloading leaves the translation list untouched', () => {
  const before = useBibleStore.getState().translations;

  useBibleStore.getState().cancelDownload();

  assert.equal(useBibleStore.getState().translations, before);
});

test('deleting a translation with nothing downloaded does nothing', async () => {
  withTranslations([makeRuntimeTranslation({ id: 'esv1' })]);

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.deepEqual(doubles.fileSystem.deleted, []);
  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
});

test('deleting an unknown translation does nothing', async () => {
  await useBibleStore.getState().deleteTranslation('ghost');

  assert.deepEqual(doubles.fileSystem.deleted, []);
});

test('deleting a translation removes every text pack file it holds exactly once', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.db',
      pendingTextPackLocalPath: 'file:///packs/esv1.next.db',
      rollbackTextPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.deepEqual(
    doubles.fileSystem.deleted.map((entry) => entry.path),
    ['file:///packs/esv1.db', 'file:///packs/esv1.next.db', `${AUDIO_ROOT_URI}esv1/`]
  );
  assert.deepEqual(doubles.database.invalidatedPaths, [
    'file:///packs/esv1.db',
    'file:///packs/esv1.next.db',
  ]);
});

test('deleting a translation resets its row to remote-only', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      installState: 'installed',
      activeTextPackVersion: '3',
      textPackLocalPath: 'file:///packs/esv1.db',
      downloadedBooks: ['GEN'],
      downloadedAudioBooks: ['MRK'],
      lastInstallError: 'older failure',
    }),
  ]);

  await useBibleStore.getState().deleteTranslation('esv1');

  const reset = findTranslation('esv1');
  assert.deepEqual(
    {
      isDownloaded: reset?.isDownloaded,
      installState: reset?.installState,
      textPackLocalPath: reset?.textPackLocalPath,
      activeTextPackVersion: reset?.activeTextPackVersion,
      downloadedBooks: reset?.downloadedBooks,
      downloadedAudioBooks: reset?.downloadedAudioBooks,
      lastInstallError: reset?.lastInstallError,
      activeDownloadJob: reset?.activeDownloadJob,
    },
    {
      isDownloaded: false,
      installState: 'remote-only',
      textPackLocalPath: null,
      activeTextPackVersion: null,
      downloadedBooks: [],
      downloadedAudioBooks: [],
      lastInstallError: null,
      activeDownloadJob: null,
    }
  );
});

test('deleting the selected translation falls the reader back to the Berean text', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  useBibleStore.setState({ currentTranslation: 'esv1' });

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
});

test('deleting the audio of the Berean text keeps it selected', async () => {
  useBibleStore.setState((state) => ({
    translations: state.translations.map((translation) =>
      translation.id === 'bsb' ? { ...translation, downloadedAudioBooks: ['GEN'] } : translation
    ),
  }));

  await useBibleStore.getState().deleteTranslation('bsb');

  assert.equal(useBibleStore.getState().currentTranslation, 'bsb');
  assert.equal(findTranslation('bsb')?.isDownloaded, true);
  assert.equal(findTranslation('bsb')?.installState, 'seeded');
});

test('deleting a translation clears only its own download progress', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  const otherProgress: TranslationDownloadProgress = {
    translationId: 'web',
    progress: 20,
    status: 'downloading',
  };
  useBibleStore.setState({ downloadProgress: otherProgress });

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.deepEqual(useBibleStore.getState().downloadProgress, otherProgress);
});

test('deleting a translation clears its in-flight download progress', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  useBibleStore.setState({
    downloadProgress: { translationId: 'esv1', progress: 20, status: 'downloading' },
  });

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('deleting a translation cancels and removes only its own download jobs', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-esv1', translationId: 'esv1' }),
    makeAudioJob({ id: 'job-bsb', translationId: 'bsb' })
  );

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.deepEqual(doubles.audio.cancelledJobIds, ['job-esv1']);
  assert.deepEqual(doubles.audio.removedJobIds, ['job-esv1']);
});

test('deleting a translation still removes a job the native transport cannot cancel', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.audio.jobs.push(makeAudioJob({ id: 'job-esv1', translationId: 'esv1' }));
  doubles.audio.cancelJobError = new Error('no native transport');

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.deepEqual(doubles.audio.removedJobIds, ['job-esv1']);
  assert.ok(warn.mock.callCount() >= 1);
});

test('deleting a translation completes even when its files cannot be removed', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.fileSystem.deleteError = new Error('read-only volume');

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.ok(warn.mock.callCount() >= 1);
});

test('deleting a translation completes even when the job registry is unreadable', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);
  doubles.audio.transportError = new Error('native transport unavailable');

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.equal(findTranslation('esv1')?.installState, 'remote-only');
  assert.ok(warn.mock.callCount() >= 1);
});

test('deleting a translation republishes the remaining list to the audio and timing resolvers', async () => {
  withTranslations([
    makeRuntimeTranslation({
      id: 'esv1',
      isDownloaded: true,
      textPackLocalPath: 'file:///packs/esv1.db',
    }),
  ]);

  await useBibleStore.getState().deleteTranslation('esv1');
  await flushAsyncWork();

  const expected = useBibleStore.getState().translations.map((translation) => translation.id);
  assert.deepEqual(doubles.remote.syncedTranslationIds.at(-1), expected);
  assert.deepEqual(doubles.timestamps.syncedTranslationIds.at(-1), expected);
});
