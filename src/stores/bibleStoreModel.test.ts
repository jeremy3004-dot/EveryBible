import test from 'node:test';
import assert from 'node:assert/strict';

import type { BibleTranslation } from '../types';
import {
  mergeRuntimeCatalogTranslations,
  reconcileMissingRuntimeTranslationPacks,
  mergeDownloadedAudioBook,
  hasTranslationDownloadData,
  resetTranslationDownloadState,
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

test('mergeRuntimeCatalogTranslations keeps downloaded bundled translations but replaces bundled placeholders with runtime entries', () => {
  const merged = mergeRuntimeCatalogTranslations(
    [
      makeTranslation({
        id: 'bsb',
        name: 'Berean Standard Bible',
        hasText: true,
        hasAudio: true,
        audioGranularity: 'chapter',
        audioProvider: 'ebible-webbe',
        source: 'bundled',
        isDownloaded: true,
      }),
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
        id: 'bsb',
        name: 'Berean Standard Bible',
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
            downloadUrl: 'https://cdn.example.com/bsb.sqlite',
            sha256: 'sha-bsb',
          },
        },
      }),
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
    ['bsb', 'web', 'kjv', 'hincv']
  );

  const bsb = merged.find((translation) => translation.id === 'bsb');
  assert.ok(bsb);
  assert.equal(bsb.source, 'bundled');
  assert.equal(bsb.isDownloaded, true);
  assert.equal(bsb.audioProvider, 'ebible-webbe');
  assert.equal(bsb.catalog?.text?.downloadUrl, 'https://cdn.example.com/bsb.sqlite');

  const web = merged.find((translation) => translation.id === 'web');
  assert.ok(web);
  assert.equal(web.source, 'runtime');
  assert.equal(web.hasText, true);
  assert.equal(web.audioProvider, undefined);
  assert.equal(web.catalog?.text?.downloadUrl, 'https://cdn.example.com/web.sqlite');

  const kjv = merged.find((translation) => translation.id === 'kjv');
  assert.ok(kjv);
  assert.equal(kjv.source, 'runtime');
  assert.equal(kjv.hasText, true);
  assert.equal(kjv.installState, 'remote-only');
  assert.equal(kjv.catalog?.text?.downloadUrl, 'https://cdn.example.com/kjv.sqlite');
  assert.equal(kjv.catalog?.text?.sha256, 'sha-kjv');
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

test('mergeRuntimeCatalogTranslations preserves downloaded runtime translations even when catalog omits them', () => {
  const merged = mergeRuntimeCatalogTranslations(
    [
      // 1. BSB — bundled, always preserved
      makeTranslation({
        id: 'bsb',
        name: 'Berean Standard Bible',
        hasText: true,
        isDownloaded: true,
        source: 'bundled',
      }),
      // 2. hincv — downloaded runtime (isDownloaded: true), should survive
      makeTranslation({
        id: 'hincv',
        name: 'Hindi Contemporary Version',
        language: 'Hindi',
        hasText: true,
        source: 'runtime',
        isDownloaded: true,
        textPackLocalPath: '/data/hincv.sqlite',
        installState: 'installed',
      }),
      // 3. sparv1909 — has textPackLocalPath but not marked isDownloaded, should survive
      makeTranslation({
        id: 'sparv1909',
        name: 'Spanish Reina Valera 1909',
        language: 'Spanish',
        hasText: true,
        source: 'runtime',
        isDownloaded: false,
        textPackLocalPath: '/data/sparv1909.sqlite',
        installState: 'installed',
      }),
      // 4. npiulb — not installed, no textPackLocalPath, should be dropped
      makeTranslation({
        id: 'npiulb',
        name: 'Nepali Unlocked Literal Bible',
        language: 'Nepali',
        hasText: true,
        source: 'runtime',
        isDownloaded: false,
        installState: 'remote-only',
      }),
    ],
    [
      // Incoming catalog only contains KJV — none of the above runtime entries are present
      makeTranslation({
        id: 'kjv',
        name: 'King James Version',
        hasText: true,
        source: 'runtime',
        installState: 'remote-only',
      }),
    ]
  );

  const ids = merged.map((t) => t.id);

  // bsb, hincv, sparv1909, and kjv should be present
  assert.ok(ids.includes('bsb'), `expected bsb in output, got: ${ids.join(', ')}`);
  assert.ok(ids.includes('hincv'), `expected hincv in output, got: ${ids.join(', ')}`);
  assert.ok(ids.includes('sparv1909'), `expected sparv1909 in output, got: ${ids.join(', ')}`);
  assert.ok(ids.includes('kjv'), `expected kjv in output, got: ${ids.join(', ')}`);
  assert.equal(merged.length, 4, `expected 4 entries, got: ${merged.length} (${ids.join(', ')})`);

  // npiulb should NOT be present (not installed)
  assert.ok(!ids.includes('npiulb'), `npiulb should be dropped but was found in: ${ids.join(', ')}`);

  // hincv retains its isDownloaded and textPackLocalPath
  const hincv = merged.find((t) => t.id === 'hincv');
  assert.ok(hincv);
  assert.equal(hincv.isDownloaded, true);
  assert.equal(hincv.textPackLocalPath, '/data/hincv.sqlite');

  // sparv1909 retains its textPackLocalPath
  const sparv1909 = merged.find((t) => t.id === 'sparv1909');
  assert.ok(sparv1909);
  assert.equal(sparv1909.textPackLocalPath, '/data/sparv1909.sqlite');
});

test('mergeDownloadedAudioBook appends each finished audio book exactly once', () => {
  const translation = makeTranslation({
    id: 'bsb',
    name: 'Berean Standard Bible',
    hasAudio: true,
    downloadedAudioBooks: ['GEN'],
  });

  const withJohn = mergeDownloadedAudioBook(translation, 'JHN');
  const withJohnAgain = mergeDownloadedAudioBook(withJohn, 'JHN');

  assert.deepEqual(withJohn.downloadedAudioBooks, ['GEN', 'JHN']);
  assert.equal(withJohnAgain, withJohn);
});

test('hasTranslationDownloadData only reports removable local assets', () => {
  const seededBundledTranslation = makeTranslation({
    id: 'bsb',
    name: 'Berean Standard Bible',
    hasText: true,
    isDownloaded: true,
    source: 'bundled',
    installState: 'seeded',
  });
  const downloadedBundledAudio = makeTranslation({
    id: 'bsb',
    name: 'Berean Standard Bible',
    hasText: true,
    isDownloaded: true,
    source: 'bundled',
    installState: 'seeded',
    downloadedAudioBooks: ['EPH'],
  });
  const installedRuntimeTextPack = makeTranslation({
    id: 'niv',
    name: 'New International Version',
    hasText: true,
    isDownloaded: true,
    source: 'runtime',
    installState: 'installed',
    textPackLocalPath: '/data/niv.sqlite',
  });

  assert.equal(hasTranslationDownloadData(seededBundledTranslation), false);
  assert.equal(hasTranslationDownloadData(downloadedBundledAudio), true);
  assert.equal(hasTranslationDownloadData(installedRuntimeTextPack), true);
});

test('resetTranslationDownloadState clears local assets while preserving bundled readable text', () => {
  const resetBsb = resetTranslationDownloadState(
    makeTranslation({
      id: 'bsb',
      name: 'Berean Standard Bible',
      hasText: true,
      hasAudio: true,
      isDownloaded: true,
      source: 'bundled',
      installState: 'seeded',
      downloadedAudioBooks: ['EPH'],
      textPackLocalPath: '/data/bsb.sqlite',
    })
  );
  const resetNiv = resetTranslationDownloadState(
    makeTranslation({
      id: 'niv',
      name: 'New International Version',
      hasText: true,
      isDownloaded: true,
      source: 'runtime',
      installState: 'installed',
      textPackLocalPath: '/data/niv.sqlite',
      downloadedAudioBooks: ['JHN'],
    })
  );

  assert.equal(resetBsb.isDownloaded, true);
  assert.equal(resetBsb.installState, 'seeded');
  assert.deepEqual(resetBsb.downloadedAudioBooks, []);
  assert.equal(resetBsb.textPackLocalPath, null);

  assert.equal(resetNiv.isDownloaded, false);
  assert.equal(resetNiv.installState, 'remote-only');
  assert.deepEqual(resetNiv.downloadedAudioBooks, []);
  assert.equal(resetNiv.textPackLocalPath, null);
});
