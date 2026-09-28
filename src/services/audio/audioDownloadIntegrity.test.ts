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
  const discardWaiters = new Map<number, () => void>();
  let written: Uint8Array = CHAPTER_BYTES;
  let attempts = 0;
  const base64Reads: number[] = [];
  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => false,
    getFileSize: async () => (attempts === 0 ? null : written.byteLength),
    readBase64Chunk: async (_fileUri, position, length) => {
      base64Reads.push(length);
      return attempts === 0 ? null : toBase64(written.subarray(position, position + length));
    },
    deleteFile: async (fileUri) => {
      deleted.push(fileUri);
      discardWaiters.get(deleted.length)?.();
      discardWaiters.delete(deleted.length);
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
    waitForDiscards: (count: number): Promise<void> => {
      if (deleted.length >= count) return Promise.resolve();
      return new Promise((resolve) => {
        discardWaiters.set(count, resolve);
      });
    },
    attemptCount: () => attempts,
    base64Reads,
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
  await runtime.waitForDiscards(1);
  await flush();
  t.mock.timers.tick(1000);
  await runtime.waitForDiscards(2);
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
  await runtime.waitForDiscards(1);
  await flush();
  t.mock.timers.tick(1000);
  await runtime.waitForDiscards(2);
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
  assert.deepEqual(runtime.base64Reads, [CHAPTER_BYTES.byteLength]);
});

test('resuming replaces a cached chapter with the right size but the wrong checksum', async () => {
  const fileUri = service.getChapterAudioFileUri('bsb', 'PHM', 1);
  const receiptUri = `${service.getBookAudioDirectoryUri('bsb', 'PHM')}verified-sizes.json`;
  const files = new Map<string, Uint8Array>([
    [fileUri, new Uint8Array(CHAPTER_BYTES.byteLength).fill(8)],
  ]);
  // A stale receipt cannot certify this file because its recorded size differs.
  const receipts = new Map<string, string>([
    [receiptUri, JSON.stringify({ version: 2, sizes: { 1: 2048 } })],
  ]);
  const deleted: string[] = [];
  let transfers = 0;
  let checksumReads = 0;
  let receiptBeforeTransfer: unknown;
  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async (uri) => files.has(uri),
    getFileSize: async (uri) => files.get(uri)?.byteLength ?? null,
    readTextFile: async (uri) => receipts.get(uri) ?? null,
    writeTextFile: async (uri, contents) => {
      receipts.set(uri, contents);
    },
    readBase64Chunk: async (uri, position, length) => {
      checksumReads += 1;
      const bytes = files.get(uri);
      return bytes ? toBase64(bytes.subarray(position, position + length)) : null;
    },
    deleteFile: async (uri) => {
      deleted.push(uri);
      files.delete(uri);
    },
    downloadFile: async (_from, to) => {
      transfers += 1;
      receiptBeforeTransfer = JSON.parse(receipts.get(receiptUri) ?? '{}');
      files.set(to, CHAPTER_BYTES);
    },
  };

  const download = () =>
    service.downloadAudioBook({
      translationId: 'bsb',
      book: getBookById('PHM')!,
      fileSystem,
      resolveRemoteAudio: async () => ({
        url: 'https://audio.test/PHM/1.mp3',
        duration: 10,
        bytes: CHAPTER_BYTES.byteLength,
        sha256: CHAPTER_SHA256,
      }),
    });
  const result = await download();

  assert.equal(result.chapterCount, 1);
  assert.equal(transfers, 1, 'equal byte counts must not certify a corrupt cached chapter');
  assert.ok(deleted.includes(fileUri));
  assert.deepEqual(
    receiptBeforeTransfer,
    { version: 2, sizes: {} },
    'discarding invalid bytes clears their stale receipt'
  );
  assert.deepEqual(files.get(fileUri), CHAPTER_BYTES);
  assert.deepEqual(JSON.parse(receipts.get(receiptUri) ?? '{}'), {
    version: 2,
    sizes: { 1: 4096 },
  });
  assert.equal(checksumReads, 2, 'the corrupt cache and its replacement are both checked');

  await download();
  assert.equal(transfers, 1);
  assert.equal(checksumReads, 2, 'the verified receipt keeps later resumes on the fast path');
});

test('cancelling during a cached checksum check cannot complete the chapter', async () => {
  const controller = new AbortController();
  const events: string[] = [];
  const fileSystem: service.AudioFileSystemAdapter = {
    ensureDirectory: async () => {},
    fileExists: async () => true,
    getFileSize: async () => CHAPTER_BYTES.byteLength,
    readBase64Chunk: async (_uri, position, length) => {
      controller.abort();
      return toBase64(CHAPTER_BYTES.subarray(position, position + length));
    },
    downloadFile: async () => {
      events.push('transfer');
    },
  };

  await assert.rejects(
    service.downloadAudioBook({
      translationId: 'bsb',
      book: getBookById('PHM')!,
      fileSystem,
      signal: controller.signal,
      resolveRemoteAudio: async () => ({
        url: 'https://audio.test/PHM/1.mp3',
        duration: 10,
        bytes: CHAPTER_BYTES.byteLength,
        sha256: CHAPTER_SHA256,
      }),
      hooks: {
        onComplete: () => events.push('complete'),
        onFailure: () => events.push('failure'),
        onProgress: () => events.push('progress'),
      },
    }),
    service.AudioDownloadCancelledError
  );
  assert.deepEqual(events, []);
});

test('cancelling after corrupt cache discard clears its stale receipt without a replacement', async () => {
  for (const cachedBytes of [CHAPTER_BYTES.byteLength, 3072]) {
    const controller = new AbortController();
    const events: string[] = [];
    let receipt = JSON.stringify({ version: 2, sizes: { 1: 2048 } });
    const fileSystem: service.AudioFileSystemAdapter = {
      ensureDirectory: async () => {},
      fileExists: async () => true,
      getFileSize: async () => cachedBytes,
      readTextFile: async (uri) => (uri.endsWith('verified-sizes.json') ? receipt : null),
      writeTextFile: async (uri, contents) => {
        if (uri.endsWith('verified-sizes.json')) receipt = contents;
      },
      readBase64Chunk: async (_uri, position, length) =>
        toBase64(
          new Uint8Array(CHAPTER_BYTES.byteLength).fill(8).subarray(position, position + length)
        ),
      deleteFile: async () => {
        controller.abort();
      },
      downloadFile: async () => {
        events.push('transfer');
      },
    };

    await assert.rejects(
      service.downloadAudioBook({
        translationId: 'bsb',
        book: getBookById('PHM')!,
        fileSystem,
        signal: controller.signal,
        resolveRemoteAudio: async () => ({
          url: 'https://audio.test/PHM/1.mp3',
          duration: 10,
          bytes: CHAPTER_BYTES.byteLength,
          sha256: CHAPTER_SHA256,
        }),
        hooks: {
          onComplete: () => events.push('complete'),
          onFailure: () => events.push('failure'),
          onProgress: () => events.push('progress'),
        },
      }),
      service.AudioDownloadCancelledError
    );

    assert.deepEqual(JSON.parse(receipt), { version: 2, sizes: {} });
    assert.deepEqual(events, []);
  }
});

test('sha256 verification reads a large chapter in bounded chunks', async () => {
  const large = new Uint8Array(1_000_000).fill(3);
  const runtime = integrityRuntime({ bytes: large.byteLength, sha256: sha256HexSync(large) });
  runtime.setWritten(large);
  const result = await runtime.start();
  assert.equal(result.chapterCount, 1);
  assert.ok(runtime.base64Reads.length > 1, 'a 1MB chapter is not read as one string');
  assert.ok(runtime.base64Reads.every((length) => length <= 256 * 1024));
  assert.equal(
    runtime.base64Reads.reduce((total, length) => total + length, 0),
    large.byteLength
  );
});

test('with neither bytes nor sha256 known the 1KB floor still guards the download', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = integrityRuntime({});
  runtime.setWritten(new Uint8Array(12));
  const rejected = assert.rejects(runtime.start(), /missing or incomplete/);
  await runtime.waitForDiscards(1);
  await flush();
  t.mock.timers.tick(1000);
  await runtime.waitForDiscards(2);
  await flush();
  t.mock.timers.tick(2000);
  await rejected;
});

test('an unreceipted cached chapter is reused after published checksum verification without a size', async () => {
  let transfers = 0;
  let checksumReads = 0;
  const result = await service.downloadAudioBook({
    translationId: 'bsb',
    book: getBookById('PHM')!,
    fileSystem: {
      ensureDirectory: async () => {},
      fileExists: async () => true,
      getFileSize: async () => CHAPTER_BYTES.byteLength,
      readBase64Chunk: async (_uri, position, length) => {
        checksumReads += 1;
        return toBase64(CHAPTER_BYTES.subarray(position, position + length));
      },
      downloadFile: async () => {
        transfers += 1;
      },
    },
    resolveRemoteAudio: async () => ({
      url: 'https://audio.test/PHM/1.mp3',
      duration: 10,
      sha256: CHAPTER_SHA256,
    }),
  });
  assert.equal(result.chapterCount, 1);
  assert.equal(checksumReads, 1);
  assert.equal(transfers, 0);
});
