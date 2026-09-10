import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookById } from '../../constants/books';
import { sha256HexSync } from '../elMedia/elEs256';
import * as service from './audioDownloadService';

async function flush() {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
}

const CHAPTER_BYTES = new Uint8Array(4096).fill(7);
const CHAPTER_SHA256 = sha256HexSync(CHAPTER_BYTES);

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function integrityRuntime(remote: Partial<service.RemoteAudioAsset>) {
  const jobs = new Map<string, service.AudioDownloadJobRecord>();
  const jobStore: service.AudioDownloadJobStore = {
    listJobs: async () => [...jobs.values()],
    getJob: async (id) => jobs.get(id) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
    },
    removeJob: async (id) => {
      jobs.delete(id);
    },
  };
  const deleted: string[] = [];
  let written: Uint8Array = CHAPTER_BYTES;
  let attempts = 0;
  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    getFileSize: async () => (attempts === 0 ? null : written.byteLength),
    readBase64File: async () => (attempts === 0 ? null : toBase64(written)),
    deleteFile: async (fileUri) => {
      deleted.push(fileUri);
    },
    downloadFile: async () => {
      attempts += 1;
    },
  };
  const start = () =>
    service.downloadAudioBook({
      translationId: 'bsb',
      book: getBookById('PHM')!,
      fileSystem,
      jobStore,
      resolveRemoteAudio: async () => ({
        url: 'https://audio.test/PHM/1.mp3',
        duration: 10,
        ...remote,
      }),
    });
  return {
    start,
    deleted,
    attemptCount: () => attempts,
    setWritten: (bytes: Uint8Array) => {
      written = bytes;
    },
  };
}

test('a manifest byte count is enforced exactly instead of the 1KB floor', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = integrityRuntime({ bytes: CHAPTER_BYTES.byteLength });
  // 2048 bytes clears the legacy 1KB floor but is a truncated transfer.
  runtime.setWritten(new Uint8Array(2048).fill(7));
  const rejected = assert.rejects(runtime.start(), /size mismatch/i);
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  t.mock.timers.tick(2000);
  await rejected;
  assert.equal(runtime.attemptCount(), 3, 'a size mismatch is retryable');
  assert.ok(runtime.deleted.length >= 1, 'the bad partial must be deleted, not kept forever');
});

test('a manifest sha256 is verified at completion and a mismatch deletes the file', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = integrityRuntime({
    bytes: CHAPTER_BYTES.byteLength,
    sha256: 'a'.repeat(64),
  });
  const rejected = assert.rejects(runtime.start(), /checksum|integrity/i);
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  t.mock.timers.tick(2000);
  await rejected;
  assert.ok(runtime.deleted.length >= 1);
});

test('a chapter matching both bytes and sha256 completes', async () => {
  const runtime = integrityRuntime({
    bytes: CHAPTER_BYTES.byteLength,
    sha256: CHAPTER_SHA256.toUpperCase(),
  });
  const result = await runtime.start();
  assert.equal(result.chapterCount, 1);
  assert.deepEqual(runtime.deleted, []);
});

test('with neither bytes nor sha256 known the 1KB floor still guards the download', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = integrityRuntime({});
  runtime.setWritten(new Uint8Array(12));
  const rejected = assert.rejects(runtime.start(), /missing or incomplete/);
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  t.mock.timers.tick(2000);
  await rejected;
});
