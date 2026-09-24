import assert from 'node:assert/strict';
import test, { before, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { AudioFileSystemAdapter } from './audioDownloadService';

// Mock configuration for this file: the persistent job registry cannot be created (a corrupt
// module graph or a factory that throws), so createAudioDownloadJobStore must fall back to an
// in-memory registry rather than failing every download.
let registryAttempts = 0;
mockModule(mock, sourcePath('services/audio/audioDownloadJobStore.ts'), {
  createPersistentAudioDownloadJobStore: () => {
    registryAttempts += 1;
    throw new Error('registry unavailable');
  },
});

type ServiceModule = typeof import('./audioDownloadService');
let service: ServiceModule;

before(async () => {
  service = await import('./audioDownloadService');
});

const fileSystem: AudioFileSystemAdapter = {
  ensureDirectory: async () => {},
  fileExists: async () => false,
  downloadFile: async () => {},
};

test('jobs are kept in memory per root when the persistent registry cannot be created', async () => {
  const first = await service.createAudioDownloadJobStore({
    fileSystem,
    rootUri: 'file:///fallback-a/',
  });
  const again = await service.createAudioDownloadJobStore({
    fileSystem,
    rootUri: 'file:///fallback-a/',
  });
  const otherRoot = await service.createAudioDownloadJobStore({
    fileSystem,
    rootUri: 'file:///fallback-b/',
  });

  const job = await service.startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'PHM',
    jobStore: first,
  });

  assert.equal(registryAttempts, 3);
  assert.deepEqual(await again.getJob(job.id), job);
  assert.deepEqual(await again.listJobs(), [job]);
  assert.deepEqual(await otherRoot.listJobs(), []);

  await again.removeJob(job.id);
  assert.equal(await first.getJob(job.id), null);
});

test('a book download without an explicit store records its outcome in the fallback registry', async () => {
  const { getBookById } = await import('../../constants/books');
  const phm = getBookById('PHM');
  assert.ok(phm);

  await service.downloadAudioBook({
    rootUri: 'file:///fallback-download/',
    translationId: 'bsb',
    book: phm,
    fileSystem,
    resolveRemoteAudio: async () => ({ url: 'https://audio.test/PHM/1.mp3', duration: 1 }),
  });

  const store = await service.createAudioDownloadJobStore({
    fileSystem,
    rootUri: 'file:///fallback-download/',
  });
  const jobs = await store.listJobs();
  assert.deepEqual(
    jobs.map((job) => [job.id, job.status]),
    [['audio-download:bsb:book:PHM', 'completed']]
  );
});
