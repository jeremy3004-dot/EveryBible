import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mockModule } from '../../testing/mockModules';

// Mock configuration for this file: expo-file-system reports neither a document nor a cache
// directory (as on web and some headless runtimes). The audio root is computed at import time,
// so this scenario needs its own file.
mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: null,
  cacheDirectory: null,
});

test('without a document or cache directory audio downloads root at the file scheme', async () => {
  const storage = await import('./audioDownloadStorage');

  assert.equal(storage.AUDIO_DOWNLOAD_ROOT_URI, 'file:///everybible-audio/');
  assert.equal(
    storage.getAudioDownloadJobRegistryUri(),
    'file:///everybible-audio/download-jobs.json'
  );
});
