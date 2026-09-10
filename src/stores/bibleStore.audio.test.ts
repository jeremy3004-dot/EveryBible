/**
 * Audio download orchestration in the Bible store: per-book downloads, collection
 * downloads, cancellation, and reattaching jobs that survived a process restart.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  AUDIO_ROOT_URI,
  FakeAudioCancellation,
  flushAsyncWork,
  installBibleStoreDoubles,
  makeAudioJob,
  makeRuntimeTranslation,
  type BibleStoreDoubles,
} from './__tests__/bibleStoreDoubles';
import type { BibleTranslation, TranslationDownloadJob } from '../types';

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

const activeJobOf = (id: string): TranslationDownloadJob | null | undefined =>
  findTranslation(id)?.activeDownloadJob;

test('downloading audio for a book refuses a translation with no audio', async () => {
  await assert.rejects(() => useBibleStore.getState().downloadAudioForBook('asv', 'GEN'), {
    message: 'Audio downloads are not available for this book.',
  });

  assert.deepEqual(doubles.audio.bookDownloads, []);
});

test('downloading audio for a book refuses a book the app does not know', async () => {
  await assert.rejects(() => useBibleStore.getState().downloadAudioForBook('bsb', 'NOPE'), {
    message: 'Audio downloads are not available for this book.',
  });
});

test('downloading audio for a book hands the download service the job store and transport', async () => {
  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  const call = doubles.audio.bookDownloads[0];
  assert.equal(doubles.audio.bookDownloads.length, 1);
  assert.equal(call?.translationId, 'bsb');
  assert.equal(call?.book.id, 'GEN');
  assert.equal(call?.rootUri, AUDIO_ROOT_URI);
  assert.deepEqual(doubles.audio.jobStoreOptions, [
    { fileSystem: call?.fileSystem, rootUri: AUDIO_ROOT_URI },
  ]);
  assert.equal(doubles.audio.transportCreations, 1);
});

test('a starting audio job appears on its translation and in the progress banner', async () => {
  let started: { job: TranslationDownloadJob | null | undefined; progress: unknown } | null = null;
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onStart?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
    );
    started = {
      job: activeJobOf('bsb'),
      progress: useBibleStore.getState().downloadProgress,
    };
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.deepEqual(started, {
    job: {
      id: 'job-1',
      kind: 'audio-book',
      state: 'running',
      progress: 0,
      startedAt: 1_000,
      updatedAt: 2_000,
      error: undefined,
    },
    progress: {
      translationId: 'bsb',
      jobId: 'job-1',
      bookId: 'GEN',
      progress: 0,
      status: 'downloading',
      error: undefined,
    },
  });
});

test('a job update never attaches another translation download job to the wrong translation', async () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'elx', hasAudio: true, audioGranularity: 'chapter' }),
  ]);
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onStart?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
    );
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.equal(activeJobOf('elx'), null);
});

test('chapter progress updates the job percentage and the progress banner', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 9_000 });
  let midway: { job: TranslationDownloadJob | null | undefined; progress: unknown } | null = null;
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onStart?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
    );
    call.hooks.onProgress?.({
      translationId: 'bsb',
      bookId: 'GEN',
      jobId: 'job-1',
      progress: 42.4,
      completedChapters: 21,
      totalChapters: 50,
    });
    midway = { job: activeJobOf('bsb'), progress: useBibleStore.getState().downloadProgress };
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.deepEqual(midway, {
    job: {
      id: 'job-1',
      kind: 'audio-book',
      state: 'running',
      progress: 42,
      startedAt: 1_000,
      updatedAt: 9_000,
      error: undefined,
    },
    progress: {
      translationId: 'bsb',
      bookId: 'GEN',
      jobId: 'job-1',
      progress: 42,
      status: 'downloading',
    },
  });
});

test('a non-finite chapter progress reading is clamped to zero rather than shown as NaN', async () => {
  let progress: unknown = null;
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onProgress?.({
      translationId: 'bsb',
      bookId: 'GEN',
      jobId: 'job-1',
      progress: Number.NaN,
      completedChapters: 0,
      totalChapters: 0,
    });
    progress = useBibleStore.getState().downloadProgress;
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.deepEqual(progress, {
    translationId: 'bsb',
    bookId: 'GEN',
    jobId: 'job-1',
    progress: 0,
    status: 'downloading',
  });
});

test('chapter progress for a translation with no running job leaves its job slot empty', async () => {
  let job: TranslationDownloadJob | null | undefined;
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onProgress?.({
      translationId: 'bsb',
      bookId: 'GEN',
      jobId: 'job-1',
      progress: 50,
      completedChapters: 25,
      totalChapters: 50,
    });
    job = activeJobOf('bsb');
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.equal(job, null);
});

test('a failed audio job is surfaced with its error before the failure propagates', async () => {
  let failure: { job: TranslationDownloadJob | null | undefined; progress: unknown } | null = null;
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onFailure?.(
      makeAudioJob({
        id: 'job-1',
        translationId: 'bsb',
        bookId: 'GEN',
        status: 'failed',
        error: 'chapter 3 unreachable',
      })
    );
    failure = { job: activeJobOf('bsb'), progress: useBibleStore.getState().downloadProgress };
    throw new Error('chapter 3 unreachable');
  };

  await assert.rejects(() => useBibleStore.getState().downloadAudioForBook('bsb', 'GEN'), {
    message: 'chapter 3 unreachable',
  });

  assert.deepEqual(failure, {
    job: {
      id: 'job-1',
      kind: 'audio-book',
      state: 'failed',
      progress: 0,
      startedAt: 1_000,
      updatedAt: 2_000,
      error: 'chapter 3 unreachable',
    },
    progress: {
      translationId: 'bsb',
      jobId: 'job-1',
      bookId: 'GEN',
      progress: 0,
      status: 'error',
      error: 'chapter 3 unreachable',
    },
  });
});

test('a completed audio job clears the running job rather than leaving it at 100%', async () => {
  let onComplete: TranslationDownloadJob | null | undefined;
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onComplete?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'completed' })
    );
    onComplete = activeJobOf('bsb');
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.equal(onComplete, null);
});

test('downloading audio for a book marks the book downloaded and clears the banner', async () => {
  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.deepEqual(findTranslation('bsb')?.downloadedAudioBooks, ['GEN']);
  assert.equal(activeJobOf('bsb'), null);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('downloading audio for a book already downloaded does not duplicate the entry', async () => {
  useBibleStore.setState((state) => ({
    translations: state.translations.map((translation) =>
      translation.id === 'bsb' ? { ...translation, downloadedAudioBooks: ['GEN'] } : translation
    ),
  }));

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.deepEqual(findTranslation('bsb')?.downloadedAudioBooks, ['GEN']);
});

test('a completed book download is reported to anonymous usage analytics', async () => {
  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');
  await flushAsyncWork();

  assert.deepEqual(doubles.analytics.events, [
    {
      name: 'audio_download_completed',
      properties: {
        book_count: 1,
        book_id: 'GEN',
        chapter_count: 50,
        content_kind: 'audio',
        download_scope: 'book',
        download_units: 1,
        translation_id: 'bsb',
      },
    },
  ]);
});

test('cancelling a book download clears the job without raising an error', async () => {
  doubles.audio.runBookDownload = async (call) => {
    call.hooks.onStart?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
    );
    throw new FakeAudioCancellation();
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.equal(activeJobOf('bsb'), null);
  assert.equal(useBibleStore.getState().downloadProgress, null);
  assert.deepEqual(findTranslation('bsb')?.downloadedAudioBooks, []);
});

test('cancelling a book download leaves another translation progress banner alone', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'web', progress: 10, status: 'downloading' },
  });
  doubles.audio.runBookDownload = async () => {
    throw new FakeAudioCancellation();
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');

  assert.deepEqual(useBibleStore.getState().downloadProgress, {
    translationId: 'web',
    progress: 10,
    status: 'downloading',
  });
});

test('cancelling a book download records no analytics event', async () => {
  doubles.audio.runBookDownload = async () => {
    throw new FakeAudioCancellation();
  };

  await useBibleStore.getState().downloadAudioForBook('bsb', 'GEN');
  await flushAsyncWork();

  assert.deepEqual(doubles.analytics.events, []);
});

test('downloading audio for several books refuses a translation with no audio', async () => {
  await assert.rejects(() => useBibleStore.getState().downloadAudioForBooks('asv', ['GEN']), {
    message: 'Audio downloads are not available for this translation.',
  });
});

test('downloading audio for several books refuses a selection with no known books', async () => {
  await assert.rejects(() => useBibleStore.getState().downloadAudioForBooks('bsb', ['NOPE']), {
    message: 'Audio downloads are not available for the selected books.',
  });

  assert.deepEqual(doubles.audio.translationDownloads, []);
});

test('downloading audio for several books passes only the recognised books to the service', async () => {
  await useBibleStore.getState().downloadAudioForBooks('bsb', ['MRK', 'NOPE', 'GEN']);

  assert.deepEqual(
    doubles.audio.translationDownloads[0]?.books.map((book) => book.id),
    ['GEN', 'MRK']
  );
});

test('each completed book in a collection download is marked downloaded as it finishes', async () => {
  const snapshots: Array<{ books: string[] | undefined; progress: unknown }> = [];
  doubles.audio.runTranslationDownload = async (call) => {
    call.hooks.onBookComplete?.({
      translationId: 'bsb',
      bookId: 'GEN',
      completedBooks: 1,
      totalBooks: 2,
      jobId: 'job-1',
    });
    snapshots.push({
      books: findTranslation('bsb')?.downloadedAudioBooks,
      progress: useBibleStore.getState().downloadProgress,
    });
    call.hooks.onBookComplete?.({
      translationId: 'bsb',
      bookId: 'MRK',
      completedBooks: 2,
      totalBooks: 2,
      jobId: 'job-1',
    });
    snapshots.push({
      books: findTranslation('bsb')?.downloadedAudioBooks,
      progress: useBibleStore.getState().downloadProgress,
    });
    return { downloadedBookIds: ['GEN', 'MRK'] };
  };

  await useBibleStore.getState().downloadAudioForBooks('bsb', ['GEN', 'MRK']);

  assert.deepEqual(snapshots, [
    {
      books: ['GEN'],
      progress: { translationId: 'bsb', progress: 50, status: 'downloading', jobId: 'job-1' },
    },
    {
      books: ['GEN', 'MRK'],
      progress: { translationId: 'bsb', progress: 100, status: 'downloading', jobId: 'job-1' },
    },
  ]);
});

test('a collection download records every downloaded book once and clears the banner', async () => {
  useBibleStore.setState((state) => ({
    translations: state.translations.map((translation) =>
      translation.id === 'bsb' ? { ...translation, downloadedAudioBooks: ['GEN'] } : translation
    ),
  }));
  doubles.audio.runTranslationDownload = async () => ({ downloadedBookIds: ['GEN', 'MRK'] });

  await useBibleStore.getState().downloadAudioForBooks('bsb', ['GEN', 'MRK']);

  assert.deepEqual(findTranslation('bsb')?.downloadedAudioBooks, ['GEN', 'MRK']);
  assert.equal(activeJobOf('bsb'), null);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('a collection download reports its scope and chapter count to analytics', async () => {
  doubles.audio.runTranslationDownload = async () => ({ downloadedBookIds: ['GEN', 'MRK'] });

  await useBibleStore.getState().downloadAudioForBooks('bsb', ['GEN', 'MRK']);
  await flushAsyncWork();

  assert.deepEqual(doubles.analytics.events, [
    {
      name: 'audio_download_completed',
      properties: {
        book_count: 2,
        chapter_count: 66,
        content_kind: 'audio',
        download_scope: 'collection',
        download_units: 2,
        translation_id: 'bsb',
      },
    },
  ]);
});

test('cancelling a collection download clears the job without raising an error', async () => {
  doubles.audio.runTranslationDownload = async (call) => {
    call.hooks.onStart?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', scope: 'translation', status: 'queued' })
    );
    throw new FakeAudioCancellation();
  };

  await useBibleStore.getState().downloadAudioForBooks('bsb', ['GEN', 'MRK']);

  assert.equal(activeJobOf('bsb'), null);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('a genuine collection download failure propagates to the caller', async () => {
  doubles.audio.runTranslationDownload = async () => {
    throw new Error('storage full');
  };

  await assert.rejects(() => useBibleStore.getState().downloadAudioForBooks('bsb', ['GEN']), {
    message: 'storage full',
  });
});

test('downloading audio for a translation covers every book of the Bible', async () => {
  doubles.audio.runTranslationDownload = async (call) => ({
    downloadedBookIds: call.books.map((book) => book.id),
  });

  await useBibleStore.getState().downloadAudioForTranslation('bsb');
  await flushAsyncWork();

  assert.equal(doubles.audio.translationDownloads[0]?.books.length, 66);
  assert.equal(doubles.analytics.events[0]?.properties.download_scope, 'translation');
  assert.equal(doubles.analytics.events[0]?.properties.book_count, 66);
});

test('a translation-scope audio job is mapped onto the translation as a translation download', async () => {
  let job: TranslationDownloadJob | null | undefined;
  doubles.audio.runTranslationDownload = async (call) => {
    call.hooks.onStart?.(
      makeAudioJob({ id: 'job-1', translationId: 'bsb', scope: 'translation', status: 'queued' })
    );
    job = activeJobOf('bsb');
    return { downloadedBookIds: [] };
  };

  await useBibleStore.getState().downloadAudioForTranslation('bsb');

  assert.deepEqual(job, {
    id: 'job-1',
    kind: 'translation-audio',
    state: 'queued',
    progress: 0,
    startedAt: 1_000,
    updatedAt: 2_000,
    error: undefined,
  });
});

test('reattaching audio downloads with an empty registry clears any stale progress', async () => {
  useBibleStore.setState({
    downloadProgress: { translationId: 'bsb', progress: 0, status: 'downloading' },
  });

  await useBibleStore.getState().reattachAudioDownloads();

  assert.equal(useBibleStore.getState().downloadProgress, null);
  assert.deepEqual(doubles.audio.reattachedJobIds, []);
  assert.equal(doubles.audio.ensureRunningCalls, 1);
});

test('reattaching audio downloads revives an in-flight job and resumes its book download', async () => {
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
  );

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.reattachedJobIds, ['job-1']);
  assert.deepEqual(
    doubles.audio.bookDownloads.map((call) => `${call.translationId}:${call.book.id}`),
    ['bsb:GEN']
  );
  assert.deepEqual(useBibleStore.getState().downloadProgress, null);
});

test('reattaching audio downloads shows the revived job in the progress banner', async () => {
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'queued' })
  );
  const progressSeen: unknown[] = [];
  doubles.audio.runBookDownload = async () => {
    progressSeen.push(useBibleStore.getState().downloadProgress);
  };

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.deepEqual(progressSeen, [
    {
      translationId: 'bsb',
      jobId: 'job-1',
      bookId: 'GEN',
      progress: 0,
      status: 'downloading',
      error: undefined,
    },
  ]);
});

test('reattaching audio downloads resumes a translation-wide job', async () => {
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', scope: 'translation', status: 'downloading' })
  );

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.equal(doubles.audio.translationDownloads.length, 1);
  assert.equal(doubles.audio.translationDownloads[0]?.books.length, 66);
});

test('reattaching audio downloads ignores completed and failed jobs so no phantom progress appears', async () => {
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'done', translationId: 'bsb', bookId: 'GEN', status: 'completed' }),
    makeAudioJob({ id: 'broken', translationId: 'web', bookId: 'GEN', status: 'failed' })
  );

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.reattachedJobIds, []);
  assert.deepEqual(doubles.audio.bookDownloads, []);
  assert.equal(useBibleStore.getState().downloadProgress, null);
});

test('reattaching audio downloads keeps only the newest job per translation', async () => {
  doubles.audio.jobs.push(
    makeAudioJob({
      id: 'older',
      translationId: 'bsb',
      bookId: 'GEN',
      status: 'downloading',
      updatedAt: 1_500,
    }),
    makeAudioJob({
      id: 'newer',
      translationId: 'bsb',
      bookId: 'MRK',
      status: 'downloading',
      updatedAt: 9_000,
    })
  );

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.reattachedJobIds, ['newer']);
  assert.deepEqual(
    doubles.audio.bookDownloads.map((call) => call.book.id),
    ['MRK']
  );
});

test('reattaching audio downloads keeps going when the transport cannot revive a job', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
  );
  doubles.audio.reattachError = new Error('native task gone');

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.equal(warn.mock.callCount(), 1);
  assert.equal(doubles.audio.ensureRunningCalls, 1);
  assert.equal(doubles.audio.bookDownloads.length, 1);
});

test('reattaching audio downloads works with a transport that cannot reattach at all', async () => {
  doubles.audio.supportsReattach = false;
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
  );

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.reattachedJobIds, []);
  assert.equal(doubles.audio.bookDownloads.length, 1);
});

test('reattaching audio downloads skips a job whose book the app no longer ships', async () => {
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'XYZ', status: 'downloading' })
  );

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.deepEqual(doubles.audio.bookDownloads, []);
  assert.deepEqual(doubles.audio.translationDownloads, []);
});

test('reattaching audio downloads reports a resumed download that fails again', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'bsb', bookId: 'GEN', status: 'downloading' })
  );
  doubles.audio.runBookDownload = async () => {
    throw new Error('still offline');
  };

  await useBibleStore.getState().reattachAudioDownloads();
  await flushAsyncWork();

  assert.equal(warn.mock.callCount(), 1);
  assert.match(String(warn.mock.calls[0]?.arguments[0]), /Failed to resume audio book download/);
});

test('reattaching audio downloads attaches the revived job to its own translation only', async () => {
  withTranslations([
    makeRuntimeTranslation({ id: 'elx', hasAudio: true, audioGranularity: 'chapter' }),
  ]);
  doubles.audio.jobs.push(
    makeAudioJob({ id: 'job-1', translationId: 'elx', bookId: 'GEN', status: 'downloading' })
  );

  // Asserted before the resumed download settles: reattach only queues the resume.
  await useBibleStore.getState().reattachAudioDownloads();

  assert.equal(activeJobOf('bsb'), null);
  assert.equal(activeJobOf('elx')?.id, 'job-1');
  await flushAsyncWork();
});
