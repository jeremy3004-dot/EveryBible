import test from 'node:test';
import assert from 'node:assert/strict';

import type { BibleTranslation } from '../types';
import {
  mergeRuntimeCatalogTranslations,
  reconcileMissingRuntimeTranslationPacks,
} from './bibleStoreModel';

function makeTranslation(overrides: Partial<BibleTranslation> & Pick<BibleTranslation, 'id' | 'name'>): BibleTranslation {
  return {
    id: overrides.id,
    name: overrides.name,
    abbreviation: overrides.abbreviation ?? overrides.id.toUpperCase(),
    language: overrides.language ?? 'English',
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

test('mergeRuntimeCatalogTranslations keeps ids unique when runtime catalog overlaps seeded translations', () => {
  const merged = mergeRuntimeCatalogTranslations(
    [
      makeTranslation({
        id: 'web',
        name: 'World English Bible',
        hasText: true,
        hasAudio: true,
        audioGranularity: 'chapter',
        audioProvider: 'ebible-webbe',
        source: 'bundled',
      }),
      makeTranslation({
        id: 'kjv',
        name: 'King James Version',
        hasText: false,
        source: 'bundled',
      }),
    ],
    [
      makeTranslation({
        id: 'web',
        name: 'World English Bible',
        hasText: true,
        hasAudio: true,
        audioGranularity: 'chapter',
        source: 'runtime',
        catalog: {
          version: '2026.03.26',
          updatedAt: '2026-03-26T00:00:00.000Z',
          text: {
            format: 'sqlite',
            version: '2026.03.26',
            downloadUrl: 'https://cdn.example.com/web.sqlite',
            sha256: 'sha-web',
          },
        },
      }),
      makeTranslation({
        id: 'kjv',
        name: 'King James Version',
        hasText: true,
        source: 'runtime',
        installState: 'remote-only',
        catalog: {
          version: '2026.03.26',
          updatedAt: '2026-03-26T00:00:00.000Z',
          text: {
            format: 'sqlite',
            version: '2026.03.26',
            downloadUrl: 'https://cdn.example.com/kjv.sqlite',
            sha256: 'sha-kjv',
          },
        },
      }),
      makeTranslation({
        id: 'hincv',
        name: 'Hindi Contemporary Version',
        language: 'Hindi',
        hasText: true,
        source: 'runtime',
        installState: 'remote-only',
        catalog: {
          version: '2026.03.26',
          updatedAt: '2026-03-26T00:00:00.000Z',
          text: {
            format: 'sqlite',
            version: '2026.03.26',
            downloadUrl: 'https://cdn.example.com/hincv.sqlite',
            sha256: 'sha-hincv',
          },
        },
      }),
    ]
  );

  assert.deepEqual(
    merged.map((translation) => translation.id),
    ['web', 'kjv', 'hincv']
  );

  const web = merged.find((translation) => translation.id === 'web');
  assert.ok(web);
  assert.equal(web.source, 'bundled');
  assert.equal(web.hasText, true);
  assert.equal(web.audioProvider, 'ebible-webbe');

  const kjv = merged.find((translation) => translation.id === 'kjv');
  assert.ok(kjv);
  assert.equal(kjv.source, 'runtime');
  assert.equal(kjv.hasText, true);
  assert.equal(kjv.installState, 'remote-only');
});
test('reconcileMissingRuntimeTranslationPacks resets a stale selected runtime translation to bsb', () => {
  const result = reconcileMissingRuntimeTranslationPacks(
    [
      makeTranslation({
        id: 'bsb',
        name: 'Berean Standard Bible',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
        installState: 'seeded',
      }),
      makeTranslation({
        id: 'niv',
        name: 'New International Version',
        hasText: true,
        source: 'runtime',
        installState: 'installed',
        isDownloaded: true,
        downloadedBooks: ['JHN'],
        activeTextPackVersion: '2026.03.27',
        textPackLocalPath: '/missing/niv.sqlite',
      }),
    ],
    'niv',
    new Set(['niv'])
  );

  assert.equal(result.currentTranslation, 'bsb');
  const niv = result.translations.find((translation) => translation.id === 'niv');

  assert.ok(niv);
  assert.equal(niv.installState, 'remote-only');
  assert.equal(niv.isDownloaded, false);
  assert.deepEqual(niv.downloadedBooks, []);
  assert.equal(niv.activeTextPackVersion, null);
  assert.equal(niv.textPackLocalPath, null);
  assert.match(niv.lastInstallError ?? '', /Re-download required/);
});

test('reconcileMissingRuntimeTranslationPacks keeps other translations selected and ignores bundled ones', () => {
  const result = reconcileMissingRuntimeTranslationPacks(
    [
      makeTranslation({
        id: 'bsb',
        name: 'Berean Standard Bible',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
        installState: 'seeded',
      }),
      makeTranslation({
        id: 'niv',
        name: 'New International Version',
        hasText: true,
        source: 'runtime',
        installState: 'installed',
        isDownloaded: true,
        textPackLocalPath: '/missing/niv.sqlite',
      }),
    ],
    'bsb',
    new Set(['niv', 'bsb'])
  );

  assert.equal(result.currentTranslation, 'bsb');
  const bsb = result.translations.find((translation) => translation.id === 'bsb');
  const niv = result.translations.find((translation) => translation.id === 'niv');

  assert.ok(bsb);
  assert.equal(bsb.textPackLocalPath, undefined);

  assert.ok(niv);
  assert.equal(niv.installState, 'remote-only');
  assert.equal(niv.isDownloaded, false);
});
