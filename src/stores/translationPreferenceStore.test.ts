import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { useTranslationPreferenceStore } from './translationPreferenceStore';

test('pin, hide, restore, and unpin persist across store reloads without accessing downloads', () => {
  const url = new URL('./translationPreferenceStore.ts', import.meta.url);
  const localRequire = createRequire(url);
  const values = new Map<string, string>();
  const source = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const load = () => {
    const exports = {} as { useTranslationPreferenceStore: typeof useTranslationPreferenceStore };
    runInNewContext(source, {
      exports,
      require: (name: string) => {
        if (name === './mmkvStorage')
          return {
            zustandStorage: {
              getItem: (key: string) => values.get(key) ?? null,
              setItem: (key: string, value: string) => values.set(key, value),
              removeItem: (key: string) => values.delete(key),
            },
          };
        assert.ok(
          name === 'zustand' || name === 'zustand/middleware',
          'preferences must not access Bible/download services'
        );
        return localRequire(name);
      },
    });
    return exports.useTranslationPreferenceStore;
  };
  let store = load();
  store.getState().pin('audio-only');
  store.getState().pin('audio-only');
  assert.deepEqual(Array.from(store.getState().pinnedIds), ['audio-only']);
  store.getState().hide('audio-only');
  store = load();
  assert.deepEqual(Array.from(store.getState().pinnedIds), []);
  assert.deepEqual(Array.from(store.getState().hiddenIds), ['audio-only']);
  store.getState().pin('audio-only');
  store = load();
  assert.deepEqual(Array.from(store.getState().hiddenIds), []);
  assert.deepEqual(Array.from(store.getState().pinnedIds), ['audio-only']);
  store.getState().unpin('audio-only');
  assert.deepEqual(Array.from(load().getState().pinnedIds), []);
});
