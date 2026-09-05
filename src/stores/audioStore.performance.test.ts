import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { useAudioStore as AudioStore } from './audioStore';

function loadAudioStore() {
  const url = new URL('./audioStore.ts', import.meta.url);
  const localRequire = createRequire(url);
  const values = new Map<string, string>();
  let writes = 0;
  let serializations = 0;
  let failWrite = false;
  const exports = {} as { useAudioStore: typeof AudioStore };
  const source = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Run the real Zustand middleware, replacing only the native storage boundary.
  const middleware = localRequire('zustand/middleware');
  runInNewContext(source, {
    exports,
    require: (name: string) => {
      if (name === './mmkvStorage')
        return {
          zustandStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
              writes += 1;
              if (failWrite) throw new Error('disk unavailable');
              values.set(key, value);
            },
            removeItem: (key: string) => values.delete(key),
          },
        };
      if (name === 'zustand/middleware')
        return {
          ...middleware,
          createJSONStorage: (...args: Parameters<typeof middleware.createJSONStorage>) => {
            const storage = middleware.createJSONStorage(...args);
            return {
              ...storage,
              setItem: (...setArgs: unknown[]) => {
                serializations += 1;
                return storage.setItem(...setArgs);
              },
            };
          },
        };
      return localRequire(name);
    },
  });
  return {
    store: exports.useAudioStore,
    values,
    counts: () => ({ writes, serializations }),
    setFailWrite: (value: boolean) => {
      failWrite = value;
    },
  };
}

test('playback ticks only serialize at the existing five-second resume checkpoints', () => {
  const { store, counts, values } = loadAudioStore();
  store.getState().setCurrentTrack('bsb', 'PSA', 119);
  const before = counts();
  for (let position = 250; position <= 60_000; position += 250) {
    store.getState().setPosition(position);
    store.getState().setDuration(90_000);
    store.getState().setStatus('playing');
  }
  assert.equal(store.getState().currentPosition, 60_000);
  assert.equal(store.getState().duration, 90_000);
  assert.equal(counts().serializations - before.serializations, 12);
  assert.equal(counts().writes - before.writes, 12);
  assert.equal(JSON.parse(values.get('audio-storage')!).state.lastPosition, 60_000);
});

test('settings, queue changes and backwards seeks still persist immediately', () => {
  const { store, values } = loadAudioStore();
  store.getState().setCurrentTrack('bsb', 'JHN', 3);
  store.getState().setPosition(30_000);
  store.getState().setPosition(500);
  store.getState().setPlaybackRate(1.5);
  store.getState().addToQueue('bsb', 'JHN', 4);
  const saved = JSON.parse(values.get('audio-storage')!).state;
  assert.equal(saved.lastPosition, 500);
  assert.equal(saved.playbackRate, 1.5);
  assert.equal(saved.queue[0].chapter, 4);
});

test('unchanged native playback snapshots do not notify every store subscriber again', () => {
  const { store } = loadAudioStore();
  store.getState().setDuration(90_000);
  store.getState().setStatus('playing');
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });
  for (let poll = 0; poll < 50; poll++) {
    store.getState().setDuration(90_000);
    store.getState().setStatus('playing');
    store.getState().setPosition(0);
  }
  unsubscribe();
  assert.equal(notifications, 0);
});

test('a failed persistence write is retried and clearing storage does not suppress the next save', () => {
  const { store, values, setFailWrite } = loadAudioStore();
  store.getState().setCurrentTrack('bsb', 'JHN', 3);
  setFailWrite(true);
  assert.throws(() => store.getState().setPlaybackRate(1.5), /disk unavailable/);
  setFailWrite(false);
  store.getState().setPlaybackRate(1.5);
  assert.equal(JSON.parse(values.get('audio-storage')!).state.playbackRate, 1.5);
  store.persist.clearStorage();
  assert.equal(values.has('audio-storage'), false);
  store.getState().setPlaybackRate(1.5);
  assert.equal(JSON.parse(values.get('audio-storage')!).state.playbackRate, 1.5);
});
