import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersistentAudioDownloadJobStore } from './audioDownloadJobStore';
import type { AudioDownloadJobRecord, AudioFileSystemAdapter } from './audioDownloadService';

const makeJob = (id: string): AudioDownloadJobRecord => ({
  id,
  translationId: 'bsb',
  scope: 'book',
  bookId: id,
  status: 'downloading',
  createdAt: 1,
  updatedAt: 1,
  attemptCount: 1,
});

function registryDouble() {
  let contents: string | null = null;
  let reads = 0;
  let writes = 0;
  let failNextWrite = false;
  const fileSystem: AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    downloadFile: async () => {},
    readTextFile: async () => {
      reads++;
      return contents;
    },
    writeTextFile: async (_uri, value) => {
      writes++;
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('disk full');
      }
      contents = value;
    },
  };
  return {
    fileSystem,
    stats: () => ({ reads, writes }),
    diskJobs: (): AudioDownloadJobRecord[] => JSON.parse(contents ?? '{"jobs":[]}').jobs,
    failWrite: () => {
      failNextWrite = true;
    },
  };
}

test('concurrent book registry updates survive together on disk', async () => {
  const fixture = registryDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: fixture.fileSystem,
    rootUri: 'file:///audio/',
  });
  await Promise.all([store.upsertJob(makeJob('JHN')), store.upsertJob(makeJob('MRK'))]);
  assert.deepEqual(
    fixture
      .diskJobs()
      .map((job) => job.id)
      .sort(),
    ['JHN', 'MRK']
  );
});

test('separate callers share removals and only read the registry once', async () => {
  const fixture = registryDouble();
  const first = createPersistentAudioDownloadJobStore({
    fileSystem: fixture.fileSystem,
    rootUri: 'file:///audio/',
  });
  const second = createPersistentAudioDownloadJobStore({
    fileSystem: fixture.fileSystem,
    rootUri: 'file:///audio/',
  });
  await first.upsertJob(makeJob('JHN'));
  await second.removeJob('JHN');
  await first.upsertJob(makeJob('MRK'));
  for (let index = 0; index < 50; index++) await second.getJob('MRK');
  assert.deepEqual(
    fixture.diskJobs().map((job) => job.id),
    ['MRK']
  );
  assert.deepEqual(await first.listJobs(), [makeJob('MRK')]);
  assert.equal(fixture.stats().reads, 1);
});

test('failed writes reject without entering memory and do not poison later updates', async () => {
  const fixture = registryDouble();
  const store = createPersistentAudioDownloadJobStore({
    fileSystem: fixture.fileSystem,
    rootUri: 'file:///audio/',
  });
  fixture.failWrite();
  await assert.rejects(store.upsertJob(makeJob('JHN')), /disk full/);
  assert.deepEqual(await store.listJobs(), []);
  await store.upsertJob(makeJob('MRK'));
  assert.deepEqual(
    fixture.diskJobs().map((job) => job.id),
    ['MRK']
  );
});
