import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookById } from '../../constants/books';
import {
  fetchRemoteChapterAudio,
  setElManifestChapterResolverForTests,
  setRemoteAudioMetadataResolver,
} from './audioRemote';
import {
  createAudioDownloadJobId,
  createAudioDownloadJobStore,
  downloadAudioBook,
  downloadAudioTranslation,
  failAudioDownloadJob,
  reattachAudioDownloadJob,
  requestAudioDownloadCancellation,
  startAudioDownloadJob,
  getChapterAudioFileUri,
  getDownloadedChapterAudioUri,
  type AudioFileSystemAdapter,
} from './audioDownloadService';

const createFileSystemDouble = () => {
  const files = new Set<string>();
  const directories = new Set<string>();
  const downloads: Array<{ from: string; to: string }> = [];

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async (directoryUri) => {
      directories.add(directoryUri);
    },
    fileExists: async (fileUri) => files.has(fileUri),
    downloadFile: async (from, to) => {
      downloads.push({ from, to });
      files.add(to);
    },
  };

  return { fileSystem, files, directories, downloads };
};

const createPersistentFileSystemDouble = () => {
  const files = new Map<string, string>();

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async (fileUri) => files.has(fileUri),
    downloadFile: async (from, to) => {
      files.set(to, from);
    },
    readTextFile: async (fileUri) => files.get(fileUri) ?? null,
    writeTextFile: async (fileUri, contents) => {
      files.set(fileUri, contents);
    },
    deleteFile: async (fileUri) => {
      files.delete(fileUri);
    },
  };

  return { fileSystem, files };
};

test.afterEach(() => {
  setRemoteAudioMetadataResolver(null);
  setElManifestChapterResolverForTests(null);
});

test('el-manifest chapter downloads through the existing machinery to the .mp3 path and is found offline', async () => {
  // Exercise the REAL production callback (fetchRemoteChapterAudio is what bibleStore /
  // BibleReaderScreen pass as resolveRemoteAudio — no site filters by strategy), so this
  // proves the el-manifest strategy flows end-to-end through the download machinery.
  setRemoteAudioMetadataResolver((translationId) =>
    translationId === 'lqdtest'
      ? {
          id: 'lqdtest',
          hasAudio: true,
          fileExtension: 'mp3',
          audio: {
            strategy: 'el-manifest',
            manifestUrl: '/manifests/audio/lqdtest/v2026-07-20-1.json',
            audioVersion: 'v2026-07-20-1',
            catalogBaseUrl: 'https://media.example.test',
          },
        }
      : null
  );
  setElManifestChapterResolverForTests(async (_ref, bookId, chapter) => ({
    url: `https://media.example.test/audio/lqdtest/v2026-07-20-1/chapters/${bookId}/${chapter}.mp3`,
    mimeType: 'audio/mpeg',
    fileExt: 'mp3',
    bytes: 2703104,
    durationMs: 225000,
  }));

  // File system double that records byte sizes so the >=1024-byte validity guard is exercised.
  const files = new Map<string, number>();
  const downloads: Array<{ from: string; to: string }> = [];
  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async (fileUri) => files.has(fileUri),
    downloadFile: async (from, to) => {
      downloads.push({ from, to });
      files.set(to, 2703104);
    },
    getFileSize: async (fileUri) => files.get(fileUri) ?? null,
    deleteFile: async (fileUri) => {
      files.delete(fileUri);
    },
  };

  const philemon = getBookById('PHM');
  assert.ok(philemon);

  const result = await downloadAudioBook({
    translationId: 'lqdtest',
    book: philemon,
    fileSystem,
    resolveRemoteAudio: fetchRemoteChapterAudio,
  });

  assert.equal(result.bookId, 'PHM');
  assert.equal(downloads.length, 1);
  const expectedFileUri = getChapterAudioFileUri('lqdtest', 'PHM', 1);
  assert.ok(expectedFileUri.endsWith('lqdtest/PHM/1.mp3'));
  assert.deepEqual(downloads[0], {
    from: 'https://media.example.test/audio/lqdtest/v2026-07-20-1/chapters/PHM/1.mp3',
    to: expectedFileUri,
  });

  // Offline lookup resolves the just-downloaded file, and the byte-size guard accepts it.
  const localUri = await getDownloadedChapterAudioUri('lqdtest', 'PHM', 1, fileSystem);
  assert.equal(localUri, expectedFileUri);
});

test('createAudioDownloadJobId keeps book and translation download jobs distinct', () => {
  assert.equal(
    createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: 'GEN' }),
    'audio-download:bsb:book:GEN'
  );
  assert.equal(
    createAudioDownloadJobId({ translationId: 'bsb', scope: 'translation' }),
    'audio-download:bsb:translation:all'
  );
});

test('audio download job store persists records across store instances', async () => {
  const { fileSystem } = createPersistentFileSystemDouble();
  const store = await createAudioDownloadJobStore({
    fileSystem,
    rootUri: 'file:///tmp/everybible-audio/',
  });

  await store.upsertJob({
    id: 'audio-download:bsb:book:GEN',
    translationId: 'bsb',
    scope: 'book',
    bookId: 'GEN',
    status: 'downloading',
    createdAt: 123,
    updatedAt: 456,
    attemptCount: 1,
  });

  const reloadedStore = await createAudioDownloadJobStore({
    fileSystem,
    rootUri: 'file:///tmp/everybible-audio/',
  });
  const jobs = await reloadedStore.listJobs();

  assert.deepEqual(jobs, [
    {
      id: 'audio-download:bsb:book:GEN',
      translationId: 'bsb',
      scope: 'book',
      bookId: 'GEN',
      status: 'downloading',
      createdAt: 123,
      updatedAt: 456,
      attemptCount: 1,
    },
  ]);
});

test('audio download job lifecycle exposes start, reattach, and failure hooks', async () => {
  const { fileSystem } = createPersistentFileSystemDouble();
  const rootUri = 'file:///tmp/everybible-audio-lifecycle/';
  const store = await createAudioDownloadJobStore({
    fileSystem,
    rootUri,
  });

  const events: string[] = [];

  const started = await startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'GEN',
    jobStore: store,
    hooks: {
      onStart: (job) => events.push(`start:${job.id}:${job.status}`),
    },
  });

  assert.equal(started.status, 'downloading');

  const reattached = await reattachAudioDownloadJob({
    jobId: started.id,
    jobStore: store,
    hooks: {
      onReattach: (job) => events.push(`reattach:${job.id}:${job.status}`),
    },
  });

  assert.ok(reattached);

  const failed = await failAudioDownloadJob({
    jobId: started.id,
    jobStore: store,
    error: new Error('network down'),
    hooks: {
      onFailure: (job, error) => events.push(`failure:${job.id}:${job.status}:${error.message}`),
    },
  });

  assert.equal(failed.status, 'failed');
  assert.deepEqual(events, [
    'start:audio-download:bsb:book:GEN:downloading',
    'reattach:audio-download:bsb:book:GEN:downloading',
    'failure:audio-download:bsb:book:GEN:failed:network down',
  ]);
});

test('audio download progress events carry the real job id so a caller can target the exact running job for cancellation', async () => {
  const { fileSystem } = createFileSystemDouble();
  const book = getBookById('GEN')!;
  const progressEvents: Array<{ jobId?: string }> = [];

  await downloadAudioBook({
    translationId: 'bsb',
    book,
    resolveRemoteAudio: async () => ({ url: 'https://example.com/audio.mp3', duration: 42 }),
    fileSystem,
    hooks: {
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
    },
  });

  assert.ok(progressEvents.length > 0, 'expected at least one progress event');
  assert.ok(
    progressEvents.every((event) => event.jobId === 'audio-download:bsb:book:GEN'),
    'every book progress event should carry the real job id, not be left undefined'
  );
});

test('audio download collection events carry the real translation job id', async () => {
  const { fileSystem } = createFileSystemDouble();
  const books = [getBookById('OBA')!];
  const collectionEvents: Array<{ jobId?: string }> = [];

  await downloadAudioTranslation({
    translationId: 'bsb',
    books,
    resolveRemoteAudio: async () => ({ url: 'https://example.com/audio.mp3', duration: 42 }),
    fileSystem,
    hooks: {
      onBookComplete: (progress) => {
        collectionEvents.push(progress);
      },
    },
  });

  assert.ok(collectionEvents.length > 0, 'expected at least one collection progress event');
  assert.ok(
    collectionEvents.every((event) => event.jobId === 'audio-download:bsb:translation:all'),
    'every collection progress event should carry the real translation job id'
  );
});

test('requestAudioDownloadCancellation stops runWithConcurrency from scheduling further chapter downloads', async () => {
  const { fileSystem } = createFileSystemDouble();
  const book = getBookById('GEN')!;
  let downloadCount = 0;

  const transport = {
    downloadFile: async (_from: string, _to: string) => {
      downloadCount += 1;
      if (downloadCount === 1) {
        requestAudioDownloadCancellation(
          createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: book.id })
        );
      }
    },
  };

  await assert.rejects(
    downloadAudioBook({
      translationId: 'bsb',
      book,
      resolveRemoteAudio: async () => ({ url: 'https://example.com/audio.mp3', duration: 42 }),
      fileSystem,
      transport,
    }),
    /download was cancelled/i
  );

  assert.ok(
    downloadCount < book.chapters,
    `expected cancellation to stop scheduling new chapter downloads (downloaded ${downloadCount} of ${book.chapters})`
  );
});

test('getDownloadedChapterAudioUri returns a local file when it has been downloaded', async () => {
  const { fileSystem, files } = createFileSystemDouble();
  const fileUri = getChapterAudioFileUri('bsb', 'JHN', 3);
  files.add(fileUri);

  const localUri = await getDownloadedChapterAudioUri('bsb', 'JHN', 3, fileSystem);

  assert.equal(localUri, fileUri);
});

test('offline lookup rejects truncated files without deleting an active partial download', async () => {
  const { fileSystem, files } = createFileSystemDouble();
  const uri = getChapterAudioFileUri('bsb', 'JHN', 3);
  files.add(uri);
  let existsChecks = 0;
  let sizeChecks = 0;
  let deletes = 0;
  fileSystem.fileExists = async () => {
    existsChecks++;
    return true;
  };
  fileSystem.getFileSize = async () => {
    sizeChecks++;
    return 12;
  };
  fileSystem.deleteFile = async () => {
    deletes++;
  };
  assert.equal(await getDownloadedChapterAudioUri('bsb', 'JHN', 3, fileSystem), null);
  assert.equal(existsChecks, 0, 'size metadata already establishes existence');
  assert.equal(sizeChecks, 2, 'both the configured file and legacy MP3 must be validated');
  assert.equal(deletes, 0);
});

test('offline lookup uses one metadata read for a valid configured audio file', async () => {
  const { fileSystem } = createFileSystemDouble();
  let existsChecks = 0;
  let sizeChecks = 0;
  fileSystem.fileExists = async () => {
    existsChecks++;
    return true;
  };
  fileSystem.getFileSize = async () => {
    sizeChecks++;
    return 5000;
  };
  assert.equal(
    await getDownloadedChapterAudioUri('bsb', 'JHN', 3, fileSystem),
    getChapterAudioFileUri('bsb', 'JHN', 3)
  );
  assert.equal(existsChecks, 0);
  assert.equal(sizeChecks, 1);
});

test('offline lookup falls back to a valid legacy file when configured audio is truncated', async () => {
  const { fileSystem } = createFileSystemDouble();
  const legacyUri = 'file:///everybible-audio/bsb/JHN/3.mp3';
  fileSystem.getFileSize = async (uri) => (uri === legacyUri ? 5000 : 12);
  assert.equal(await getDownloadedChapterAudioUri('bsb', 'JHN', 3, fileSystem), legacyUri);
});

test('getChapterAudioFileUri uses the configured remote audio file extension', () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'bsb') {
      return null;
    }

    return {
      id: 'bsb',
      hasAudio: true,
      fileExtension: 'm4a',
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://media.everybible.app/audio/bsb',
        chapterPathTemplate: '{bookId}/{chapter}.m4a',
      },
    };
  });

  assert.equal(getChapterAudioFileUri('bsb', 'JHN', 3), 'file:///everybible-audio/bsb/JHN/3.m4a');
});

test('getDownloadedChapterAudioUri falls back to legacy mp3 file names for existing downloads', async () => {
  setRemoteAudioMetadataResolver((translationId) => {
    if (translationId !== 'bsb') {
      return null;
    }

    return {
      id: 'bsb',
      hasAudio: true,
      fileExtension: 'm4a',
      audio: {
        strategy: 'stream-template',
        baseUrl: 'https://media.everybible.app/audio/bsb',
        chapterPathTemplate: '{bookId}/{chapter}.m4a',
      },
    };
  });

  const { fileSystem, files } = createFileSystemDouble();
  files.add('file:///everybible-audio/bsb/JHN/3.mp3');

  const localUri = await getDownloadedChapterAudioUri('bsb', 'JHN', 3, fileSystem);

  assert.equal(localUri, 'file:///everybible-audio/bsb/JHN/3.mp3');
});

test('downloadAudioBook downloads each chapter once and creates the book directory', async () => {
  const { fileSystem, directories, downloads } = createFileSystemDouble();
  const philemon = getBookById('PHM');

  assert.ok(philemon);

  const result = await downloadAudioBook({
    translationId: 'bsb',
    book: philemon,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
  });

  assert.equal(result.bookId, 'PHM');
  assert.equal(downloads.length, 1);
  assert.equal(directories.size, 1);
  assert.deepEqual(downloads[0], {
    from: 'https://audio.test/PHM/1.mp3',
    to: getChapterAudioFileUri('bsb', 'PHM', 1),
  });
});

test('downloadAudioBook deletes and re-downloads an existing file that is below the byte-size floor', async () => {
  const philemon = getBookById('PHM');
  assert.ok(philemon);

  const fileUri = getChapterAudioFileUri('bsb', 'PHM', 1);
  const fileSizes = new Map<string, number>([[fileUri, 12]]);
  const deletedFiles: string[] = [];
  const downloads: Array<{ from: string; to: string }> = [];

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => undefined,
    fileExists: async (uri) => fileSizes.has(uri),
    getFileSize: async (uri) => fileSizes.get(uri) ?? null,
    deleteFile: async (uri) => {
      deletedFiles.push(uri);
      fileSizes.delete(uri);
    },
    downloadFile: async (from, to) => {
      downloads.push({ from, to });
      fileSizes.set(to, 5000);
    },
  };

  const result = await downloadAudioBook({
    translationId: 'bsb',
    book: philemon,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
  });

  assert.equal(result.bookId, 'PHM');
  assert.deepEqual(deletedFiles, [fileUri]);
  assert.equal(downloads.length, 1);
  assert.deepEqual(downloads[0], {
    from: 'https://audio.test/PHM/1.mp3',
    to: fileUri,
  });
});

test('downloadAudioBook uses bounded concurrency instead of downloading chapters strictly serially', async () => {
  const activeDownloads = new Set<string>();
  let peakConcurrency = 0;
  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => undefined,
    fileExists: async () => false,
    downloadFile: async (_from, to) => {
      activeDownloads.add(to);
      peakConcurrency = Math.max(peakConcurrency, activeDownloads.size);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeDownloads.delete(to);
    },
  };

  await downloadAudioBook({
    translationId: 'bsb',
    book: {
      id: 'TST',
      name: 'Test Book',
      abbreviation: 'Test',
      testament: 'NT',
      chapters: 6,
      order: 999,
    },
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.m4a`,
      duration: 1000,
    }),
  });

  assert.ok(peakConcurrency > 1);
  assert.ok(peakConcurrency <= 4);
});

test('downloadAudioBook reports chapter progress while a book is downloading', async () => {
  const philemon = getBookById('PHM');

  assert.ok(philemon);

  const progressEvents: Array<{
    bookId: string;
    completedChapters: number;
    totalChapters: number;
  }> = [];

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => undefined,
    fileExists: async () => false,
    downloadFile: async (_from, to, options) => {
      options?.onProgress?.({ bytesDownloaded: 25, bytesTotal: 100 });
      options?.onProgress?.({ bytesDownloaded: 100, bytesTotal: 100 });
      assert.ok(to.includes('PHM'));
    },
  };

  await downloadAudioBook({
    translationId: 'bsb',
    book: philemon,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
    hooks: {
      onProgress: ({ bookId, completedChapters, totalChapters, progress }) => {
        progressEvents.push({ bookId, completedChapters, totalChapters });
        assert.ok(progress >= 0 && progress <= 100);
      },
    },
  });

  assert.ok(progressEvents.length >= 2);
  assert.deepEqual(progressEvents.at(-1), {
    bookId: 'PHM',
    completedChapters: 1,
    totalChapters: 1,
  });
});

test('downloadAudioTranslation returns every fully-downloaded book id in order', async () => {
  const { fileSystem, downloads } = createFileSystemDouble();
  const selectedBooks = ['2JN', '3JN']
    .map((bookId) => getBookById(bookId))
    .filter((book) => book !== undefined);

  const result = await downloadAudioTranslation({
    translationId: 'bsb',
    books: selectedBooks,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
  });

  assert.deepEqual(result.downloadedBookIds, ['2JN', '3JN']);
  assert.equal(downloads.length, 2);
});

test('downloadAudioBook coalesces duplicate progress emissions so onProgress only fires on real changes', async () => {
  const philemon = getBookById('PHM');

  assert.ok(philemon);

  const recordedProgress: number[] = [];

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => undefined,
    fileExists: async () => false,
    downloadFile: async (_from, _to, options) => {
      // Emit the same rounded progress (50%) 50 times, then a final 100%.
      for (let i = 0; i < 50; i++) {
        options?.onProgress?.({ bytesDownloaded: 500, bytesTotal: 1000 });
      }
      options?.onProgress?.({ bytesDownloaded: 1000, bytesTotal: 1000 });
    },
  };

  await downloadAudioBook({
    translationId: 'bsb',
    book: philemon,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
    hooks: {
      onProgress: ({ progress }) => {
        recordedProgress.push(progress);
      },
    },
  });

  // Total emissions must be small — nowhere near 51.
  assert.ok(
    recordedProgress.length <= 5,
    `Expected at most 5 progress emissions but got ${recordedProgress.length}: ${JSON.stringify(recordedProgress)}`
  );

  // No two consecutive emissions should be the same value.
  for (let i = 1; i < recordedProgress.length; i++) {
    assert.notEqual(
      recordedProgress[i],
      recordedProgress[i - 1],
      `Consecutive duplicate progress value ${recordedProgress[i]} at index ${i}`
    );
  }
});

test('downloadAudioTranslation reports incremental book completion progress', async () => {
  const { fileSystem } = createFileSystemDouble();
  const selectedBooks = ['2JN', '3JN']
    .map((bookId) => getBookById(bookId))
    .filter((book) => book !== undefined);
  const events: Array<{ completedBooks: number; totalBooks: number }> = [];

  await downloadAudioTranslation({
    translationId: 'bsb',
    books: selectedBooks,
    fileSystem,
    resolveRemoteAudio: async (_translationId, bookId, chapter) => ({
      url: `https://audio.test/${bookId}/${chapter}.mp3`,
      duration: 1000,
    }),
    hooks: {
      onBookComplete: ({ completedBooks, totalBooks }) => {
        events.push({ completedBooks, totalBooks });
      },
    },
  });

  assert.deepEqual(events, [
    { completedBooks: 1, totalBooks: 2 },
    { completedBooks: 2, totalBooks: 2 },
  ]);
});
