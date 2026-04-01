import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('audio download reattach startup hook is wired in App boot flow', async () => {
  const appPath = path.resolve(process.cwd(), 'App.tsx');
  const appSource = await readFile(appPath, 'utf8');

  assert.match(appSource, /useBibleStore\(\(state\) => state\.reattachAudioDownloads\)/);
  assert.match(appSource, /AppState\.addEventListener\('change'/);
  assert.match(appSource, /void reattachAudioDownloads\(\)\.catch\(/);
});

test('audio download recovery reattaches background tasks and kicks stuck downloads', async () => {
  const storePath = path.resolve(process.cwd(), 'src/stores/bibleStore.ts');
  const storeSource = await readFile(storePath, 'utf8');
  const storagePath = path.resolve(process.cwd(), 'src/services/audio/audioDownloadStorage.ts');
  const storageSource = await readFile(storagePath, 'utf8');

  assert.match(storeSource, /await ensureBackgroundAudioDownloadsRunning\(\);/);
  assert.match(storageSource, /ensureBackgroundAudioDownloadsRunning/);
  assert.match(storageSource, /ensureDownloadsAreRunning/);
});
