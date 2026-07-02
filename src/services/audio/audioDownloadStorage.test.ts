import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadAndValidateAudioFile } from './audioDownloadService';

test('downloadAndValidateAudioFile succeeds when status is ok and size clears the floor', async () => {
  let deleted = false;

  await downloadAndValidateAudioFile({
    sourceUrl: 'https://example.com/chapter.mp3',
    runDownload: async () => ({ status: 200 }),
    getFileSize: async () => 5000,
    deleteFile: async () => {
      deleted = true;
    },
  });

  assert.equal(deleted, false);
});

test('downloadAndValidateAudioFile deletes and throws on an HTTP error status', async () => {
  let deleted = false;

  await assert.rejects(
    () =>
      downloadAndValidateAudioFile({
        sourceUrl: 'https://example.com/chapter.mp3',
        runDownload: async () => ({ status: 404 }),
        getFileSize: async () => 5000,
        deleteFile: async () => {
          deleted = true;
        },
      }),
    /HTTP 404/
  );

  assert.equal(deleted, true);
});

test('downloadAndValidateAudioFile deletes and throws when a 500 error body is saved as audio', async () => {
  let deleted = false;

  await assert.rejects(
    () =>
      downloadAndValidateAudioFile({
        sourceUrl: 'https://example.com/chapter.mp3',
        runDownload: async () => ({ status: 500 }),
        getFileSize: async () => 5000,
        deleteFile: async () => {
          deleted = true;
        },
      }),
    /HTTP 500/
  );

  assert.equal(deleted, true);
});

test('downloadAndValidateAudioFile deletes and throws when the downloaded file is below the byte-size floor', async () => {
  let deleted = false;

  await assert.rejects(
    () =>
      downloadAndValidateAudioFile({
        sourceUrl: 'https://example.com/chapter.mp3',
        runDownload: async () => ({ status: 200 }),
        getFileSize: async () => 12,
        deleteFile: async () => {
          deleted = true;
        },
      }),
    /too small \(12 bytes\)/
  );

  assert.equal(deleted, true);
});

test('downloadAndValidateAudioFile deletes and throws when the download times out', async () => {
  let deleted = false;

  await assert.rejects(
    () =>
      downloadAndValidateAudioFile({
        sourceUrl: 'https://example.com/chapter.mp3',
        runDownload: () => new Promise(() => {}), // never resolves
        getFileSize: async () => 5000,
        deleteFile: async () => {
          deleted = true;
        },
        timeoutMs: 20,
      }),
    /timed out/
  );

  assert.equal(deleted, true);
});
