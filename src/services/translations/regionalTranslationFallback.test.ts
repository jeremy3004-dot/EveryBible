import test from 'node:test';
import assert from 'node:assert/strict';

import type { BibleTranslation } from '../../types';
import { resolveRegionalFallbackTranslation } from './regionalTranslationFallback';

function makeTranslation(
  overrides: Partial<BibleTranslation> & Pick<BibleTranslation, 'id' | 'name' | 'language'>
): BibleTranslation {
  return {
    id: overrides.id,
    name: overrides.name,
    abbreviation: overrides.abbreviation ?? overrides.id.toUpperCase(),
    language: overrides.language,
    description: overrides.description ?? 'description',
    copyright: overrides.copyright ?? 'Public Domain',
    isDownloaded: overrides.isDownloaded ?? false,
    downloadedBooks: overrides.downloadedBooks ?? [],
    downloadedAudioBooks: overrides.downloadedAudioBooks ?? [],
    totalBooks: overrides.totalBooks ?? 66,
    sizeInMB: overrides.sizeInMB ?? 4.5,
    hasText: overrides.hasText ?? false,
    hasAudio: overrides.hasAudio ?? false,
    audioGranularity: overrides.audioGranularity ?? 'none',
    audioProvider: overrides.audioProvider,
    source: overrides.source,
    installState: overrides.installState,
    activeTextPackVersion: overrides.activeTextPackVersion,
    pendingTextPackVersion: overrides.pendingTextPackVersion,
    pendingTextPackLocalPath: overrides.pendingTextPackLocalPath,
    textPackLocalPath: overrides.textPackLocalPath,
    rollbackTextPackVersion: overrides.rollbackTextPackVersion,
    rollbackTextPackLocalPath: overrides.rollbackTextPackLocalPath,
    lastInstallError: overrides.lastInstallError,
    catalog: overrides.catalog,
    activeDownloadJob: overrides.activeDownloadJob,
  };
}

test('resolveRegionalFallbackTranslation maps Nepal language misses to bundled Nepali text', () => {
  const fallback = resolveRegionalFallbackTranslation(
    [
      makeTranslation({
        id: 'npiulb',
        name: 'Nepali Bible',
        language: 'Nepali',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
      }),
      makeTranslation({
        id: 'hincv',
        name: 'Hindi Contemporary Version',
        language: 'Hindi',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
      }),
    ],
    makeTranslation({
      id: 'byh',
      name: 'Bhujel Bible',
      language: 'Bhujel',
      hasText: true,
      source: 'runtime',
    })
  );

  assert.equal(fallback?.id, 'npiulb');
});

test('resolveRegionalFallbackTranslation maps India language misses to bundled Hindi text', () => {
  const fallback = resolveRegionalFallbackTranslation(
    [
      makeTranslation({
        id: 'npiulb',
        name: 'Nepali Bible',
        language: 'Nepali',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
      }),
      makeTranslation({
        id: 'hincv',
        name: 'Hindi Contemporary Version',
        language: 'Hindi',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
      }),
    ],
    makeTranslation({
      id: 'awa',
      name: 'Awadhi Bible',
      language: 'Awadhi',
      hasText: true,
      source: 'runtime',
    })
  );

  assert.equal(fallback?.id, 'hincv');
});
