import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule } from '../../testing/mockModules';

/**
 * Second mock configuration for audioDownloadStorage: the background-downloader
 * package is deliberately NOT mocked here, so `await import(...)` of it fails
 * exactly as it does in an Expo Go / unlinked-native-module build. That is the
 * only way to reach the file-system-only fallback transport, and mock
 * configurations cannot be swapped mid-file.
 */

const DOCUMENT_DIRECTORY = 'file:///documents/';
const VALID_AUDIO_BYTES = 4_096;

const downloadCalls: Array<{ from: string; to: string }> = [];
const files = new Map<string, number>();

mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: DOCUMENT_DIRECTORY,
  cacheDirectory: 'file:///caches/',
  makeDirectoryAsync: async (): Promise<void> => {},
  getInfoAsync: async (uri: string): Promise<{ exists: boolean; size?: number }> => {
    const size = files.get(uri);
    return size == null ? { exists: false } : { exists: true, size };
  },
  deleteAsync: async (uri: string): Promise<void> => {
    files.delete(uri);
  },
  readAsStringAsync: async (): Promise<string> => '',
  writeAsStringAsync: async (): Promise<void> => {},
  createDownloadResumable: (from: string, to: string) => ({
    downloadAsync: async (): Promise<{ status: number }> => {
      downloadCalls.push({ from, to });
      files.set(to, VALID_AUDIO_BYTES);
      return { status: 200 };
    },
    cancelAsync: async (): Promise<void> => {},
  }),
});

type StorageModule = typeof import('./audioDownloadStorage');

let mod: StorageModule;

before(async () => {
  mod = await import('./audioDownloadStorage');
});

beforeEach(() => {
  downloadCalls.length = 0;
  files.clear();
});

test('without the background downloader the transport is file-system only', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();

  assert.equal(typeof transport.downloadFile, 'function');
  assert.equal(transport.reattachJob, undefined);
  assert.equal(transport.cancelJob, undefined);
});

test('the fallback transport still downloads chapters even when a task id is supplied', async () => {
  const transport = await mod.createBackgroundAudioDownloadTransport();

  await transport.downloadFile(
    'https://media.test/GEN/1.m4a',
    'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    { taskId: 'job-1:GEN:1' }
  );

  assert.deepEqual(downloadCalls, [
    {
      from: 'https://media.test/GEN/1.m4a',
      to: 'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    },
  ]);
});

test('ensuring background downloads are running is a no-op without the native downloader', async () => {
  await assert.doesNotReject(() => mod.ensureBackgroundAudioDownloadsRunning());
});
