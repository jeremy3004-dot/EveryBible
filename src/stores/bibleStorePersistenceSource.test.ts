import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('bibleStore persists only user-mutable deltas, for runtime translations as well as bundled ones', () => {
  const source = readRelativeSource('./bibleTranslationPersistence.ts');

  assert.match(
    source,
    /export function toPersistedTranslation\(translation: BibleTranslation\): PersistedTranslationDelta \{\s*return \{\s*id: translation\.id,\s*source: translation\.source,\s*isDownloaded: translation\.isDownloaded,\s*downloadedBooks: translation\.downloadedBooks,\s*downloadedAudioBooks: translation\.downloadedAudioBooks,\s*installState: translation\.installState,/,
    'toPersistedTranslation should slim every translation — runtime included — down to the fields the store itself mutates, and keep `source` so runtime deltas stay distinguishable on restore'
  );

  const toPersistedTranslationBody = /export function toPersistedTranslation[\s\S]*?\n\}/.exec(
    source
  )?.[0];
  assert.ok(toPersistedTranslationBody, 'toPersistedTranslation should still be a named export');
  for (const staticField of ['catalog', 'description', 'copyright', 'name', 'language']) {
    assert.doesNotMatch(
      toPersistedTranslationBody,
      new RegExp(`translation\\.${staticField}\\b`),
      `toPersistedTranslation must never re-serialize ${staticField} on the set() hot path`
    );
  }

  assert.match(
    source,
    /export const RUNTIME_CATALOG_SNAPSHOT_KEY = 'bible-runtime-catalog-v1';/,
    'runtime catalog metadata belongs in its own MMKV key, written only when the catalog changes'
  );

  assert.match(
    source,
    /export const BIBLE_PERSISTED_STATE_VERSION = 1;/,
    'the delta-only translation format is persisted-state version 1'
  );
});

test('bibleStore wires the versioned persist config to the split translation format', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /name: 'bible-storage',\s*version: BIBLE_PERSISTED_STATE_VERSION,/,
    'bible-storage must declare a persisted-state version so version-0 blobs run through migrate'
  );

  assert.match(
    source,
    /migrate: \(persistedState, version\) =>\s*migrateBiblePersistedState\(persistedState, version\) as BibleState,/,
    'upgrading installs must split their inlined runtime catalog metadata out instead of losing it'
  );

  assert.match(
    source,
    /translations: state\.translations\.map\(toPersistedTranslation\),/,
    'the bible-storage partialize config should route every translation through toPersistedTranslation before persisting, instead of writing the full translations array on every set()'
  );

  assert.match(
    source,
    /sanitizePersistedBibleState\(persistedState, readRuntimeCatalogSnapshot\(\)\)/,
    'merge should read the cached runtime catalog exactly once and re-join it with the persisted deltas'
  );

  assert.match(
    source,
    /writeRuntimeCatalogSnapshot\(nextTranslationsSnapshot\);/,
    'the catalog snapshot should be refreshed from applyRuntimeCatalog — the one place catalog metadata enters the store — and never from a download or navigation set()'
  );
});
