import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('bibleStore persists only user-mutable deltas for bundled translations, keeping full objects for runtime translations', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /function toPersistedTranslation\(\s*translation: BibleTranslation\s*\): BibleTranslation \| PersistedBundledTranslationDelta \{\s*if \(translation\.source === 'runtime'\) \{\s*return translation;\s*\}/,
    'toPersistedTranslation should keep persisting full runtime translations, since their catalog data has no separate offline cache to rebuild from'
  );

  assert.match(
    source,
    /return \{\s*id: translation\.id,\s*isDownloaded: translation\.isDownloaded,\s*downloadedBooks: translation\.downloadedBooks,\s*downloadedAudioBooks: translation\.downloadedAudioBooks,\s*installState: translation\.installState,\s*activeTextPackVersion: translation\.activeTextPackVersion,\s*pendingTextPackVersion: translation\.pendingTextPackVersion,\s*pendingTextPackLocalPath: translation\.pendingTextPackLocalPath,\s*textPackLocalPath: translation\.textPackLocalPath,\s*rollbackTextPackVersion: translation\.rollbackTextPackVersion,\s*rollbackTextPackLocalPath: translation\.rollbackTextPackLocalPath,\s*lastInstallError: translation\.lastInstallError,\s*activeDownloadJob: translation\.activeDownloadJob,\s*\};/,
    'toPersistedTranslation should slim bundled translations down to only the fields that are actually read back on hydration, dropping static catalog fields like name/description/catalog'
  );

  assert.match(
    source,
    /translations: state\.translations\.map\(toPersistedTranslation\),/,
    'the bible-storage partialize config should route every translation through toPersistedTranslation before persisting, instead of writing the full translations array on every set()'
  );
});
