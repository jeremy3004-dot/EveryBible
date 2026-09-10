import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('audio download reattach startup hook is wired in App boot flow', async () => {
  const appPath = path.resolve(process.cwd(), 'App.tsx');
  const appSource = await readFile(appPath, 'utf8');

  assert.match(appSource, /import\('\.\/src\/stores\/bibleStore'\)/);
  assert.match(appSource, /AppState\.addEventListener\('change'/);
  assert.match(appSource, /useBibleStore\.getState\(\)\.reattachAudioDownloads\(\)/);
});

test('audio download recovery reattaches background tasks and kicks stuck downloads', async () => {
  const storePath = path.resolve(process.cwd(), 'src/stores/bibleStore.ts');
  const storeSource = await readFile(storePath, 'utf8');
  const storagePath = path.resolve(process.cwd(), 'src/services/audio/audioDownloadStorage.ts');
  const storageSource = await readFile(storagePath, 'utf8');

  assert.match(storeSource, /await audio\.ensureBackgroundAudioDownloadsRunning\(\);/);
  assert.match(storageSource, /ensureBackgroundAudioDownloadsRunning/);
  // ensureDownloadsAreRunning does not exist in @kesha-antonov/react-native-background-downloader
  // 4.5.4 — calling it was a permanent silent no-op. Resume must use the real export surface, and
  // the behaviour is covered by audioDownloadStorage.behavior.test.ts against a mock of that
  // surface. (N24)
  assert.equal(storageSource.includes('ensureDownloadsAreRunning'), false);
  assert.match(storageSource, /getExistingDownloadTasks\(\)/);
});
