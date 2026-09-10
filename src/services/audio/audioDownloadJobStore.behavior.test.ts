import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentAudioDownloadJobStore } from './audioDownloadJobStore';
import type { AudioDownloadJobRecord, AudioFileSystemAdapter } from './audioDownloadService';

const REGISTRY_URI = 'file:///audio/download-jobs.json';

const makeJob = (
  id: string,
  overrides: Partial<AudioDownloadJobRecord> = {}
): AudioDownloadJobRecord => ({
  id,
  translationId: 'bsb',
  scope: 'book',
  bookId: id,
  status: 'queued',
  createdAt: 1,
  updatedAt: 1,
  attemptCount: 0,
  ...overrides,
});

/**
 * A file-system double whose registry contents and capability surface can both be
 * varied — the store treats `readTextFile` / `writeTextFile` as optional, so an
 * adapter that lacks either has to stay usable.
 */
function fileSystemDouble(
  options: {
    contents?: string | null;
    canRead?: boolean;
    canWrite?: boolean;
  } = {}
) {
  const files = new Map<string, string>();
  if (options.contents != null) {
    files.set(REGISTRY_URI, options.contents);
  }
  const ensuredDirectories: string[] = [];
  const written: Array<{ uri: string; contents: string }> = [];

  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async (uri) => {
      ensuredDirectories.push(uri);
    },
    fileExists: async () => false,
    downloadFile: async () => {},
  };

  if (options.canRead !== false) {
    fileSystem.readTextFile = async (uri) => files.get(uri) ?? null;
  }
  if (options.canWrite !== false) {
    fileSystem.writeTextFile = async (uri, contents) => {
      written.push({ uri, contents });
      files.set(uri, contents);
    };
  }

  return { fileSystem, files, ensuredDirectories, written };
}

/** What survives a JSON round-trip: `undefined` fields are not written to disk. */
const persisted = (job: AudioDownloadJobRecord): AudioDownloadJobRecord =>
  JSON.parse(JSON.stringify(job)) as AudioDownloadJobRecord;

test('a registry the device has never written starts empty', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), []);
});

test('an adapter that cannot read files still reports an empty job list', async () => {
  const disk = fileSystemDouble({ canRead: false });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), []);
});

test('a corrupt registry file is treated as empty rather than crashing the queue', async () => {
  const disk = fileSystemDouble({ contents: '{ this is not json' });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), []);
});

test('a registry whose jobs field is not a list is treated as empty', async () => {
  const disk = fileSystemDouble({ contents: JSON.stringify({ version: 1, jobs: 'nope' }) });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), []);
});

test('a registry with no jobs field at all is treated as empty', async () => {
  const disk = fileSystemDouble({ contents: JSON.stringify({ version: 1 }) });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), []);
});

test('malformed entries are dropped and well-formed ones survive alongside them', async () => {
  const valid = makeJob('JHN', { status: 'downloading' });
  const disk = fileSystemDouble({
    contents: JSON.stringify({
      version: 1,
      jobs: [
        null,
        'JHN',
        ['JHN'],
        { ...valid, id: 42 },
        { ...valid, status: 'paused' },
        { ...valid, scope: 'chapter' },
        { ...valid, createdAt: '1' },
        { ...valid, attemptCount: null },
        valid,
      ],
    }),
  });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), [valid]);
});

test('every job status the downloader can record round-trips through the registry', async () => {
  const jobs = (['queued', 'downloading', 'completed', 'failed'] as const).map((status) =>
    makeJob(status, { status })
  );
  const disk = fileSystemDouble({ contents: JSON.stringify({ version: 1, jobs }) });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(
    (await store.listJobs()).map((job) => job.status),
    ['queued', 'downloading', 'completed', 'failed']
  );
});

test('a translation-scoped job is accepted as well as a book-scoped one', async () => {
  const translationJob = makeJob('bsb-all', { scope: 'translation', bookId: undefined });
  const disk = fileSystemDouble({
    contents: JSON.stringify({ version: 1, jobs: [translationJob] }),
  });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  assert.deepEqual(await store.listJobs(), [persisted(translationJob)]);
});

test('the registry directory is created before the first write', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  await store.upsertJob(makeJob('JHN'));

  assert.deepEqual(disk.ensuredDirectories, ['file:///audio/']);
  assert.equal(disk.written[0]?.uri, REGISTRY_URI);
  assert.deepEqual(JSON.parse(disk.written[0]?.contents ?? '{}'), {
    version: 1,
    jobs: [makeJob('JHN')],
  });
});

test('upserting an existing job replaces it instead of duplicating it', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  await store.upsertJob(makeJob('JHN'));
  await store.upsertJob(makeJob('JHN', { status: 'completed', attemptCount: 2 }));

  const jobs = await store.listJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.status, 'completed');
  assert.equal(jobs[0]?.attemptCount, 2);
});

test('listJobs hands back a copy so callers cannot mutate the registry in place', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });
  await store.upsertJob(makeJob('JHN'));

  const jobs = await store.listJobs();
  jobs.length = 0;

  assert.equal((await store.listJobs()).length, 1);
});

test('getJob answers null for an id the registry does not hold', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });
  await store.upsertJob(makeJob('JHN'));

  assert.equal(await store.getJob('MRK'), null);
  assert.deepEqual(await store.getJob('JHN'), makeJob('JHN'));
});

test('removing a job that is not in the registry leaves the remaining jobs alone', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });
  await store.upsertJob(makeJob('JHN'));

  await store.removeJob('MRK');

  assert.deepEqual(
    (await store.listJobs()).map((job) => job.id),
    ['JHN']
  );
});

test('an adapter that cannot write files keeps the queue usable in memory', async () => {
  const disk = fileSystemDouble({ canWrite: false });
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  await store.upsertJob(makeJob('JHN'));

  // Nothing was persisted, and no directory was created for a write that never happened.
  assert.deepEqual(disk.written, []);
  assert.deepEqual(disk.ensuredDirectories, []);
  // The in-memory registry still tracks the job for the rest of this session.
  assert.deepEqual(
    (await store.listJobs()).map((job) => job.id),
    ['JHN']
  );
});

test('two roots on one adapter keep separate registries', async () => {
  const disk = fileSystemDouble();
  const audio = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });
  const scratch = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///scratch/',
  });

  assert.notEqual(audio, scratch);
  await audio.upsertJob(makeJob('JHN'));

  assert.deepEqual(
    disk.written.map((entry) => entry.uri),
    [REGISTRY_URI]
  );
  assert.deepEqual(await scratch.listJobs(), []);
});

test('two adapters for the same root keep separate registries', async () => {
  const first = fileSystemDouble();
  const second = fileSystemDouble();
  const firstStore = createPersistentAudioDownloadJobStore({
    fileSystem: first.fileSystem,
    rootUri: 'file:///audio/',
  });
  const secondStore = createPersistentAudioDownloadJobStore({
    fileSystem: second.fileSystem,
    rootUri: 'file:///audio/',
  });

  await firstStore.upsertJob(makeJob('JHN'));

  assert.notEqual(firstStore, secondStore);
  assert.deepEqual(await secondStore.listJobs(), []);
  assert.deepEqual(second.written, []);
});

test('queued operations are applied in the order they were requested', async () => {
  const disk = fileSystemDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  const results = await Promise.all([
    store.upsertJob(makeJob('JHN')).then(() => 'upsert-JHN'),
    store.upsertJob(makeJob('MRK')).then(() => 'upsert-MRK'),
    store.removeJob('JHN').then(() => 'remove-JHN'),
    store.listJobs().then((jobs) => jobs.map((job) => job.id).join(',')),
  ]);

  assert.deepEqual(results, ['upsert-JHN', 'upsert-MRK', 'remove-JHN', 'MRK']);
});

test('a failed write is reported to its caller without blocking the next operation', async () => {
  const disk = fileSystemDouble();
  let failNextWrite = true;
  disk.fileSystem.writeTextFile = async (uri, contents) => {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('disk full');
    }
    disk.written.push({ uri, contents });
    disk.files.set(uri, contents);
  };
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: disk.fileSystem,
    rootUri: 'file:///audio/',
  });

  await assert.rejects(store.upsertJob(makeJob('JHN')), /disk full/);
  await store.upsertJob(makeJob('MRK'));

  // The failed write left the in-memory registry untouched; the next one still lands.
  assert.deepEqual(
    (await store.listJobs()).map((job) => job.id),
    ['MRK']
  );
  assert.deepEqual(
    disk.written.map((entry) => entry.uri),
    [REGISTRY_URI]
  );
});
