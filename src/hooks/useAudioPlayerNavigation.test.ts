import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { useAudioStore as AudioStore } from '../stores/audioStore';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

// `react` is the shared hook runtime rather than a stub written here; effects
// stay queued (these cases never commit them), state slots behave properly.
const runtime = createReactHookRuntime();

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

type PlayerHook = typeof import('./useAudioPlayer').useAudioPlayer;
function mountPlayer() {
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
  let plays = 0;
  let loads = 0;
  let loaded = false;
  const { useAudioPlayer: playerHook } = loadModule<{ useAudioPlayer: PlayerHook }>(
    './useAudioPlayer.ts',
    {
      react: runtime.react,
      'react-i18next': { useTranslation: () => ({ t: (key: string) => key }) },
      'zustand/react/shallow': { useShallow: (selector: unknown) => selector },
      '../stores/audioStore': { useAudioStore },
      '../stores/bibleStore': {
        useBibleStore: Object.assign(
          (selector: (state: { translations: unknown[] }) => unknown) =>
            selector({ translations: [] }),
          { getState: () => ({ translations: [] }) }
        ),
      },
      // No Every Language manifest in these navigation cases, so chapter walks fall
      // back to plain canonical adjacency.
      './useTranslationContentSummary': { useTranslationContentSummary: () => undefined },
      '../services/bible/contentAvailability': {
        findAdjacentAvailableChapter: () => null,
        getAudioChaptersForBook: () => undefined,
      },
      '../stores/libraryStore': {
        useLibraryStore: { getState: () => ({ recordHistory: () => {} }) },
      },
      '../stores/progressStore': {
        useProgressStore: { getState: () => ({ markChapterListened: () => {} }) },
      },
      '../services/audio': {
        audioPlayer: {
          stop: async () => {
            loaded = false;
          },
          pause: async () => {},
          loadAndPlay: async () => {
            plays += 1;
            loaded = true;
          },
          isLoaded: () => loaded,
        },
        isAudioAvailable: () => true,
        getChapterAudioUrl: async () => {
          loads += 1;
          return { url: 'https://example.test/audio', duration: 90_000 };
        },
        clearBibleNowPlaying: () => {},
        syncBibleNowPlaying: () => {},
        prefetchChapterAudio: () => {},
      },
      '../services/audio/audioDownloadStorage': {},
      '../services/audio/audioRemote': {},
      '../services/analytics': {},
      '../services/analytics/listeningTime': { elapsedListeningMs: () => 0 },
      '../constants': {
        getAdjacentBibleChapter: (bookId: string, chapter: number, direction: number) => ({
          bookId,
          chapter: chapter + direction,
        }),
      },
      '../stores/audioQueueModel': {},
      '../stores/audioPlaybackCompletionModel': {},
      '../stores/audioPlaybackSequenceModel': {
        hasAudioPlaybackSequenceEntry: (
          entries: { bookId: string; chapter: number }[],
          book: string,
          chapter: number
        ) => entries.some((entry) => entry.bookId === book && entry.chapter === chapter),
        getAdjacentAudioPlaybackSequenceEntry: (
          entries: { bookId: string; chapter: number }[],
          book: string,
          chapter: number,
          direction: number
        ) =>
          entries[
            entries.findIndex((entry) => entry.bookId === book && entry.chapter === chapter) +
              direction
          ] ?? null,
      },
    }
  );
  // Every `render()` is a fresh mount: this hook's navigation surface reads the
  // store on each pass, and these cases never commit its effects.
  const render = () => runtime.mount(playerHook).result;
  return { render, store, counts: () => ({ plays, loads }) };
}

for (const direction of ['nextChapter', 'previousChapter'] as const) {
  for (const mode of ['linear', 'queue', 'sequence'] as const) {
    test(`play, pause, ${direction} stays paused for ${mode} navigation`, async () => {
      const h = mountPlayer();
      await h.render().playChapter('JHN', 3);
      await h.render().pause();
      const targetChapter = direction === 'nextChapter' ? 4 : 2;
      if (mode === 'queue') {
        h.store.getState().clearQueue();
        h.store.getState().addToQueue('bsb', 'JHN', 2);
        h.store.getState().addToQueue('bsb', 'JHN', 3);
        h.store.getState().addToQueue('bsb', 'JHN', 4);
        h.store.getState().syncQueueToTrack('bsb', 'JHN', 3);
      }
      if (mode === 'sequence')
        h.store
          .getState()
          .setPlaybackSequence([2, 3, 4].map((chapter) => ({ bookId: 'JHN', chapter })));
      const before = h.counts();
      const target = await h.render()[direction]();
      assert.equal(target?.chapter, targetChapter);
      assert.equal(h.store.getState().currentChapter, targetChapter);
      assert.equal(h.store.getState().status, 'paused');
      assert.equal(h.store.getState().currentPosition, 0);
      assert.equal(h.store.getState().lastPosition, 0);
      assert.equal(h.store.getState().duration, 0);
      assert.deepEqual(h.counts(), before, 'navigation must not load or play audio');
      await h.render().togglePlayPause();
      assert.equal(h.store.getState().status, 'playing');
      assert.equal(h.counts().plays, before.plays + 1);
    });
  }
  test(`${direction} continues active playback`, async () => {
    const h = mountPlayer();
    await h.render().playChapter('JHN', 3);
    await h.render()[direction]();
    assert.equal(h.store.getState().status, 'playing');
    assert.equal(h.counts().plays, 2);
  });
}

test('pause, next, next, play starts only the last selected chapter from zero', async () => {
  const h = mountPlayer();
  await h.render().playChapter('JHN', 3);
  h.store.getState().setPosition(30_000);
  await h.render().pause();
  await h.render().nextChapter();
  await h.render().nextChapter();
  assert.equal(h.store.getState().currentChapter, 5);
  assert.equal(h.store.getState().status, 'paused');
  assert.deepEqual(h.counts(), { plays: 1, loads: 1 });
  assert.equal(h.store.getState().lastPosition, 0);
  await h.render().togglePlayPause();
  assert.equal(h.store.getState().currentChapter, 5);
  assert.equal(h.store.getState().status, 'playing');
  assert.equal(h.store.getState().currentPosition, 0);
  assert.deepEqual(h.counts(), { plays: 2, loads: 2 });
});

test('manual navigation observes pause made after the controls last rendered', async () => {
  const h = mountPlayer();
  await h.render().playChapter('JHN', 3);
  const controls = h.render();
  await controls.pause();
  await controls.nextChapter();
  assert.equal(h.store.getState().status, 'paused');
  assert.equal(h.counts().plays, 1);
});

test('paused navigation does not escape a pinned playback sequence boundary', async () => {
  const h = mountPlayer();
  await h.render().playChapter('JHN', 3);
  await h.render().pause();
  h.store.getState().setPlaybackSequence([{ bookId: 'JHN', chapter: 3 }]);
  assert.equal(await h.render().nextChapter(), null);
  assert.equal(h.store.getState().currentChapter, 3);
  assert.equal(h.store.getState().status, 'paused');
  assert.equal(h.counts().plays, 1);
});
