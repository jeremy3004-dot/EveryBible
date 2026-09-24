import test from 'node:test';
import assert from 'node:assert/strict';

import type { BibleTranslation } from '../../types';
import {
  REGIONAL_FALLBACK_TRANSLATION_IDS,
  resolveRegionalFallbackTranslation,
} from './regionalTranslationFallback';

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

test('a language spoken in both Nepal and India falls back to Nepali first', () => {
  const bundled = [
    makeTranslation({
      id: 'hincv',
      name: 'Hindi Contemporary Version',
      language: 'Hindi',
      hasText: true,
      isDownloaded: true,
      source: 'bundled',
    }),
    makeTranslation({
      id: 'npiulb',
      name: 'Nepali Bible',
      language: 'Nepali',
      hasText: true,
      isDownloaded: true,
      source: 'bundled',
    }),
  ];
  const maithili = makeTranslation({
    id: 'mai',
    name: 'Maithili Bible',
    language: 'Maithili',
    hasText: true,
    source: 'runtime',
  });

  assert.equal(resolveRegionalFallbackTranslation(bundled, maithili, 'IN')?.id, 'npiulb');
  assert.deepEqual(REGIONAL_FALLBACK_TRANSLATION_IDS, { IN: 'hincv', NP: 'npiulb' });
});

function bundledBibles(): BibleTranslation[] {
  return [
    makeTranslation({
      id: 'bsb',
      name: 'Berean Standard Bible',
      language: 'English',
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
    makeTranslation({
      id: 'npiulb',
      name: 'Nepali Bible',
      language: 'Nepali',
      hasText: true,
      isDownloaded: true,
      source: 'bundled',
    }),
  ];
}

const failedEnglish = makeTranslation({
  id: 'kjv',
  name: 'King James Version',
  language: 'English',
  hasText: true,
  source: 'runtime',
});
const failedHindi = makeTranslation({
  id: 'hin2017',
  name: 'Hindi 2017',
  language: 'Hindi',
  hasText: true,
  source: 'runtime',
});
const failedNepali = makeTranslation({
  id: 'npinrv',
  name: 'Nepali NRV',
  language: 'Nepali',
  hasText: true,
  source: 'runtime',
});

for (const country of ['IN', 'NP', 'PK', null]) {
  test(`a failed English Bible falls back to a bundled English Bible, never a regional one (device ${country})`, () => {
    assert.equal(
      resolveRegionalFallbackTranslation(bundledBibles(), failedEnglish, country)?.id,
      'bsb'
    );
  });

  test(`a failed English Bible with no English Bible to fall back to gets no fallback (device ${country})`, () => {
    const withoutEnglish = bundledBibles().filter((translation) => translation.id !== 'bsb');
    assert.equal(resolveRegionalFallbackTranslation(withoutEnglish, failedEnglish, country), null);
  });

  test(`a failed Hindi Bible falls back to the bundled Hindi Bible (device ${country})`, () => {
    assert.equal(
      resolveRegionalFallbackTranslation(bundledBibles(), failedHindi, country)?.id,
      'hincv'
    );
  });

  test(`a failed Nepali Bible falls back to the bundled Nepali Bible (device ${country})`, () => {
    assert.equal(
      resolveRegionalFallbackTranslation(bundledBibles(), failedNepali, country)?.id,
      'npiulb'
    );
  });
}

test('a Bible in a language from outside the region never falls back to the device region default', () => {
  const failedSpanish = makeTranslation({
    id: 'rv1909',
    name: 'Reina-Valera 1909',
    language: 'Spanish',
    hasText: true,
    source: 'runtime',
  });

  assert.equal(resolveRegionalFallbackTranslation(bundledBibles(), failedSpanish, 'IN'), null);
  assert.equal(resolveRegionalFallbackTranslation(bundledBibles(), failedSpanish, 'NP'), null);
});

test('a same-language Bible must be readable to be the fallback', () => {
  const bibles = bundledBibles().map((translation) =>
    translation.id === 'bsb'
      ? { ...translation, isDownloaded: false, source: 'runtime' as const }
      : translation
  );

  assert.equal(resolveRegionalFallbackTranslation(bibles, failedEnglish, 'IN'), null);
});

test('a language the catalog cannot place falls back to the device region default, and only there', () => {
  const failedSantali = makeTranslation({
    id: 'sat',
    name: 'Santali Bible',
    language: 'Santali',
    hasText: true,
    source: 'runtime',
  });

  assert.equal(
    resolveRegionalFallbackTranslation(bundledBibles(), failedSantali, 'IN')?.id,
    'hincv'
  );
  assert.equal(
    resolveRegionalFallbackTranslation(bundledBibles(), failedSantali, 'NP')?.id,
    'npiulb'
  );
  assert.equal(resolveRegionalFallbackTranslation(bundledBibles(), failedSantali, 'PK'), null);
  assert.equal(resolveRegionalFallbackTranslation(bundledBibles(), failedSantali), null);
});
