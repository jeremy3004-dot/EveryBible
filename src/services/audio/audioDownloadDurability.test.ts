import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookById } from '../../constants/books';
import {
  createAudioDownloadJobStore,
  downloadAudioBook,
  getBookAudioDirectoryUri,
  getChapterAudioFileUri,
  type AudioFileSystemAdapter,
} from './audioDownloadService';

const rootUri = 'file:///durability/';
const translationId = 'durability';
const book = getBookById('PHM')!;
const chapterUri = getChapterAudioFileUri(translationId, book.id, 1, rootUri);
const receiptUri = `${getBookAudioDirectoryUri(translationId, book.id, rootUri)}verified-sizes.json`;
const registryUri = `${rootUri}download-jobs.json`;
const bytes = 4096;

function diskFixture() {
  const files = new Map<string, number>();
  const texts = new Map<string, string>();
  let transfers = 0;
  // A fresh adapter gives the persistent job store fresh process-local state.
  const adapter = (): AudioFileSystemAdapter => ({
    ensureDirectory: async () => {},
    fileExists: async (uri) => files.has(uri),
    getFileSize: async (uri) => files.get(uri) ?? null,
    readTextFile: async (uri) => texts.get(uri) ?? null,
    writeTextFile: async (uri, contents) => {
      texts.set(uri, contents);
    },
    downloadFile: async (_url, uri) => {
      transfers += 1;
      files.set(uri, bytes);
    },
    deleteFile: async (uri) => {
      files.delete(uri);
      texts.delete(uri);
    },
  });
  return { files, texts, adapter, transfers: () => transfers };
}

for (const interruptedReceipt of [null, '{"version":2,"sizes":{'] as const) {
  test(`restart after finished bytes and ${interruptedReceipt === null ? 'absent' : 'truncated'} receipt verifies the source before completion`, async () => {
    const disk = diskFixture();
    disk.files.set(chapterUri, bytes);
    if (interruptedReceipt !== null) disk.texts.set(receiptUri, interruptedReceipt);
    let lookups = 0;
    let completed = 0;
    await downloadAudioBook({
      rootUri,
      translationId,
      book,
      fileSystem: disk.adapter(),
      resolveRemoteAudio: async () => {
        lookups += 1;
        return { url: 'https://audio.test/phm.mp3', duration: 1, bytes };
      },
      hooks: {
        onComplete: () => {
          completed += 1;
        },
      },
    });
    assert.equal(lookups, 1);
    assert.equal(disk.transfers(), 0);
    assert.equal(completed, 1);
    assert.deepEqual(JSON.parse(disk.texts.get(receiptUri)!), { version: 2, sizes: { 1: bytes } });
  });
}

for (const truncate of [false, true]) {
  test(`completion metadata write failure (${truncate ? 'Android-style truncation' : 'preserved prior file'}) never announces success and restart reuses verified bytes`, async () => {
    const disk = diskFixture();
    const firstAdapter = disk.adapter();
    const write = firstAdapter.writeTextFile!;
    let failing = false;
    firstAdapter.writeTextFile = async (uri, contents) => {
      if (uri === registryUri && (failing || contents.includes('"status": "completed"'))) {
        failing = true;
        if (truncate) disk.texts.set(uri, '{"version":1,"jobs":[');
        throw new Error('native write failed: ENOSPC');
      }
      await write(uri, contents);
    };
    let completed = 0;
    await assert.rejects(
      downloadAudioBook({
        rootUri,
        translationId,
        book,
        fileSystem: firstAdapter,
        resolveRemoteAudio: async () => ({ url: 'https://audio.test/phm.mp3', duration: 1, bytes }),
        hooks: {
          onComplete: () => {
            completed += 1;
          },
        },
      }),
      /native write failed/
    );
    assert.equal(completed, 0);
    assert.equal(disk.files.get(chapterUri), bytes);
    assert.equal(disk.transfers(), 1);
    const restartedAdapter = disk.adapter();
    await downloadAudioBook({
      rootUri,
      translationId,
      book,
      fileSystem: restartedAdapter,
      resolveRemoteAudio: async () => {
        throw new Error('offline');
      },
      hooks: {
        onComplete: () => {
          completed += 1;
        },
      },
    });
    assert.equal(completed, 1);
    assert.equal(disk.transfers(), 1);
    const store = await createAudioDownloadJobStore({ fileSystem: restartedAdapter, rootUri });
    assert.equal((await store.listJobs())[0]?.status, 'completed');
  });
}
