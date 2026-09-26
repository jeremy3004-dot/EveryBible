import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import type { BackgroundMusicOption } from '../services/audio/backgroundMusicCatalog';
import type { BackgroundMusicChoice } from '../types';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

// A catalog with one bundled and two remote sounds, since the shipped one has no remote
// sounds yet. The real cache runs against it, over an in-memory file system.
const fixture = (
  id: BackgroundMusicChoice,
  source: BackgroundMusicOption['source']
): BackgroundMusicOption => ({
  id,
  label: id,
  description: '',
  workTitle: '',
  license: 'CC0',
  credit: '',
  sourceUrl: '',
  defaultVolume: 0.2,
  source,
});
const OPTIONS: BackgroundMusicOption[] = [
  fixture('off', { kind: 'bundled' }),
  fixture('piano', { kind: 'bundled' }),
  fixture('rain', { kind: 'remote', path: 'background-sounds/v1/rain.m4a' }),
  fixture('shore', { kind: 'remote', path: 'background-sounds/v1/shore.m4a' }),
];
mockModule(mock, sourcePath('services/audio/backgroundMusicCatalog.ts'), {
  BACKGROUND_MUSIC_OPTIONS: OPTIONS,
  getBackgroundMusicOption: (choice: BackgroundMusicChoice) =>
    OPTIONS.find((option) => option.id === choice),
});

const files = new Set<string>();
let releaseDownload: (() => void) | null = null;
mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: 'file:///docs/',
  deleteAsync: async (uri: string) => {
    files.delete(uri);
  },
});
mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  expoAudioFileSystemAdapter: {
    ensureDirectory: async () => {},
    fileExists: async (uri: string) => files.has(uri),
    downloadFile: async (_from: string, to: string) => {
      await new Promise<void>((resolve) => {
        releaseDownload = resolve;
      });
      files.add(to);
    },
  },
});
const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

const RAIN_FILE = 'file:///docs/everybible-background-sounds/background-sounds/v1/rain.m4a';

beforeEach(() => {
  files.clear();
});
afterEach(() => runtime.unmountAll());

test('bundled sounds, off and shuffle are available; remote sounds need a download', async () => {
  const { useBackgroundSoundAvailability } = await import('./useBackgroundSoundAvailability');

  const view = runtime.mount(useBackgroundSoundAvailability);

  assert.equal(view.result.off, 'bundled');
  assert.equal(view.result.shuffle, 'bundled');
  assert.equal(view.result.piano, 'bundled');
  assert.equal(view.result.rain, 'remote');
  assert.equal(view.result.shore, 'remote');
});

test('a sound id the catalog does not list yet reads as unplayable', async () => {
  const { useBackgroundSoundAvailability } = await import('./useBackgroundSoundAvailability');

  const view = runtime.mount(useBackgroundSoundAvailability);

  assert.equal(view.result.hymns, 'failed');
  assert.equal(view.result.ambient, 'failed');
});

test('mounting finds a sound downloaded in an earlier session and reports it cached', async () => {
  const { useBackgroundSoundAvailability } = await import('./useBackgroundSoundAvailability');
  const { backgroundSoundCache } = await import('../services/audio/backgroundSoundCache');
  files.add(RAIN_FILE);
  const refreshed = new Promise<void>((resolve) => {
    const unsubscribe = backgroundSoundCache.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });

  const view = runtime.mount(useBackgroundSoundAvailability);
  await view.commit();
  await refreshed;
  view.rerender();

  assert.equal(view.result.rain, 'cached');
  assert.equal(view.result.shore, 'remote');
});

test('a download in progress, then finished, shows up on the next render', async () => {
  const { useBackgroundSoundAvailability } = await import('./useBackgroundSoundAvailability');
  const { backgroundSoundCache } = await import('../services/audio/backgroundSoundCache');
  const shore = OPTIONS[3];
  assert.ok(shore);
  const view = runtime.mount(useBackgroundSoundAvailability);
  await view.commit();
  const started = new Promise<void>((resolve) => {
    const unsubscribe = backgroundSoundCache.subscribe(() => {
      if (backgroundSoundCache.getSnapshot().shore !== 'downloading') return;
      unsubscribe();
      resolve();
    });
  });

  const download = backgroundSoundCache.ensureCached(shore);
  await started;
  view.rerender();
  assert.equal(view.result.shore, 'downloading');

  // The transfer is waiting on the fake; let it finish.
  while (!releaseDownload) await new Promise((resolve) => setImmediate(resolve));
  releaseDownload();
  await download;
  view.rerender();

  assert.equal(view.result.shore, 'cached');
});
