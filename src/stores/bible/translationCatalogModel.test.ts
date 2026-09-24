import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRuntimeTranslation } from '../__tests__/bibleStoreDoubles';
import {
  carryInstallStateIntoRuntimeTranslation,
  hasReadableTranslationText,
  normalizePreferredTranslationLanguage,
} from './translationCatalogModel';

test('a catalog refresh keeps the installed pack and download state of an existing row', () => {
  const existing = makeRuntimeTranslation({
    id: 'esv1',
    isDownloaded: true,
    downloadedBooks: ['GEN'],
    downloadedAudioBooks: ['MAT'],
    installState: 'installed',
    activeTextPackVersion: '2',
    pendingTextPackVersion: '3',
    pendingTextPackLocalPath: 'file:///pending.db',
    textPackLocalPath: 'file:///esv1.db',
    rollbackTextPackVersion: '1',
    rollbackTextPackLocalPath: 'file:///rollback.db',
    lastInstallError: 'earlier failure',
  });
  const refreshed = makeRuntimeTranslation({ id: 'esv1', name: 'Renamed', description: 'New' });

  const next = carryInstallStateIntoRuntimeTranslation(refreshed, existing);

  assert.deepEqual(next, {
    ...refreshed,
    isDownloaded: true,
    downloadedBooks: ['GEN'],
    downloadedAudioBooks: ['MAT'],
    installState: 'installed',
    activeTextPackVersion: '2',
    pendingTextPackVersion: '3',
    pendingTextPackLocalPath: 'file:///pending.db',
    textPackLocalPath: 'file:///esv1.db',
    rollbackTextPackVersion: '1',
    rollbackTextPackLocalPath: 'file:///rollback.db',
    lastInstallError: 'earlier failure',
  });
});

test('a new catalog row keeps its own download lists and install fields', () => {
  const incoming = makeRuntimeTranslation({
    id: 'new1',
    downloadedBooks: ['PSA'],
    downloadedAudioBooks: ['JHN'],
    installState: 'remote-only',
  });

  assert.deepEqual(carryInstallStateIntoRuntimeTranslation(incoming, undefined), incoming);
});

test('non-empty download lists from the catalog win over the existing row', () => {
  const next = carryInstallStateIntoRuntimeTranslation(
    makeRuntimeTranslation({ id: 'x', downloadedBooks: ['EXO'], downloadedAudioBooks: ['ACT'] }),
    makeRuntimeTranslation({ id: 'x', downloadedBooks: ['GEN'], downloadedAudioBooks: ['MAT'] })
  );

  assert.deepEqual([next.downloadedBooks, next.downloadedAudioBooks], [['EXO'], ['ACT']]);
});

test('a language preference is trimmed, and blank or non-string values clear it', () => {
  assert.deepEqual(
    ['  Nepali ', 'English', '   ', '', null, 42].map(normalizePreferredTranslationLanguage),
    ['Nepali', 'English', null, null, null, null]
  );
});

test('bundled text is readable without a pack, runtime text only once its pack is installed', () => {
  assert.deepEqual(
    [
      makeRuntimeTranslation({ source: 'bundled', hasText: true }),
      makeRuntimeTranslation({ source: 'runtime', hasText: true, textPackLocalPath: null }),
      makeRuntimeTranslation({
        source: 'runtime',
        hasText: true,
        textPackLocalPath: 'file:///a.db',
      }),
      makeRuntimeTranslation({ source: 'bundled', hasText: false }),
    ].map(hasReadableTranslationText),
    [true, false, true, false]
  );
});
