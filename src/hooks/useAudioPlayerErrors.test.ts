import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createInstance } from 'i18next';
import ts from 'typescript';
import { zh } from '../i18n/locales/zh';
import type { useAudioStore as AudioStore } from '../stores/audioStore';

function loadModule<T>(path: string, dependencies: Record<string, unknown>, allowLocal = false): T {
  const url = new URL(path, import.meta.url);
  const localRequire = createRequire(url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      assert.ok(allowLocal, `Unexpected dependency: ${name}`);
      return localRequire(name);
    },
  });
  return exports as T;
}

async function mountPlayer(failure: 'unavailable' | 'lookup' | 'playback') {
  // Use the production store actions, replacing only native persistence.
  const { useAudioStore: store } = loadModule<{ useAudioStore: typeof AudioStore }>(
    '../stores/audioStore.ts',
    {
      './mmkvStorage': {
        zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      },
    },
    true
  );
  const useAudioStore = Object.assign(
    (selector: (state: ReturnType<typeof store.getState>) => unknown) => selector(store.getState()),
    { getState: store.getState }
  );
  const i18n = createInstance();
  await i18n.init({ lng: 'zh', resources: { zh: { translation: zh } }, initImmediate: false });
  let clearedNowPlaying = 0;
  let playbackAttempts = 0;
  const { useAudioPlayer: invokePlayerHook } = loadModule<{
    useAudioPlayer: () => { playChapter: (bookId: string, chapter: number) => Promise<void> };
  }>('./useAudioPlayer.ts', {
    react: {
      useCallback: (callback: unknown) => callback,
      useEffect: () => {},
      useMemo: (factory: () => unknown) => factory(),
      useRef: (current: unknown) => ({ current }),
      useState: (initial: () => unknown) => [initial(), () => {}],
    },
    'react-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n) }) },
    'zustand/react/shallow': { useShallow: (selector: unknown) => selector },
    '../stores/audioStore': { useAudioStore },
    '../stores/bibleStore': { useBibleStore: { getState: () => ({ translations: [] }) } },
    '../stores/libraryStore': {
      useLibraryStore: { getState: () => ({ recordHistory: () => {} }) },
    },
    '../services/audio': {
      audioPlayer: {
        stop: async () => {},
        loadAndPlay: async () => {
          playbackAttempts += 1;
          throw new Error('Native decoder failed');
        },
      },
      isAudioAvailable: () => true,
      getChapterAudioUrl: async () => {
        if (failure === 'lookup') throw new Error('Server unavailable');
        return failure === 'unavailable' ? null : { url: 'https://audio.example/chapter.mp3' };
      },
      clearBibleNowPlaying: () => {
        clearedNowPlaying += 1;
      },
    },
    '../services/audio/audioDownloadStorage': { expoAudioFileSystemAdapter: {} },
    '../services/audio/audioRemote': {},
    '../services/analytics': {},
    '../constants': {},
    '../stores/audioQueueModel': {},
    '../stores/audioPlaybackCompletionModel': {},
    '../stores/audioPlaybackSequenceModel': {},
  });
  await invokePlayerHook().playChapter('GEN', 1);
  return { state: store.getState(), clearedNowPlaying, playbackAttempts };
}

for (const failure of ['unavailable', 'lookup', 'playback'] as const) {
  test(`audio ${failure} failure retains its translated message in the real store`, async () => {
    const { state, clearedNowPlaying, playbackAttempts } = await mountPlayer(failure);
    assert.equal(state.status, 'error');
    assert.equal(
      state.error,
      failure === 'unavailable'
        ? zh.interface.audioUnavailableChapter
        : zh.interface.audioPlayFailed
    );
    assert.equal(clearedNowPlaying, 1);
    assert.equal(playbackAttempts, failure === 'playback' ? 1 : 0);
  });
}
