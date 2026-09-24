import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../../types';
import {
  resolveTranslationSelection,
  type TranslationSelectionEnvironment,
} from './translationSelectionModel';

function bible(overrides: Partial<BibleTranslation>): BibleTranslation {
  return {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'English',
    description: '',
    copyright: '',
    isDownloaded: true,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4,
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'bundled',
    ...overrides,
  };
}

const env = (
  overrides: Partial<TranslationSelectionEnvironment> = {}
): TranslationSelectionEnvironment => ({
  currentBook: 'JHN',
  audioEnabled: true,
  isRemoteAudioAvailable: () => true,
  getFirstAvailableAudioBook: () => null,
  ...overrides,
});

const audioOnly = bible({
  id: 'eng-audio',
  isDownloaded: false,
  hasText: false,
  hasAudio: true,
  source: 'runtime',
});

test('a Bible on the device opens where the reader is', () => {
  assert.deepEqual(resolveTranslationSelection(bible({}), env()), {
    kind: 'activate',
    jumpToBook: null,
  });
});

test('a New-Testament-only text opens at Matthew from an Old Testament book, not from a Gospel', () => {
  const ntOnly = bible({ totalBooks: 27 });
  assert.deepEqual(resolveTranslationSelection(ntOnly, env({ currentBook: 'GEN' })), {
    kind: 'activate',
    jumpToBook: 'MAT',
  });
  assert.deepEqual(resolveTranslationSelection(ntOnly, env({ currentBook: 'ROM' })), {
    kind: 'activate',
    jumpToBook: null,
  });
});

test('an audio Bible that streams the current book opens in place', () => {
  assert.deepEqual(resolveTranslationSelection(audioOnly, env()), {
    kind: 'activate',
    jumpToBook: null,
  });
});

test('an audio Bible without the current book jumps to the first book it streams', () => {
  const streams = new Set(['eng-audio:MAT']);
  assert.deepEqual(
    resolveTranslationSelection(
      audioOnly,
      env({
        isRemoteAudioAvailable: (id, book) => streams.has(`${id}:${book}`),
        getFirstAvailableAudioBook: () => 'MAT',
      })
    ),
    { kind: 'activate', jumpToBook: 'MAT' }
  );
});

test('audio is unavailable when there is nowhere to jump, or audio is switched off', () => {
  const nothingStreams = env({ isRemoteAudioAvailable: () => false });
  assert.deepEqual(resolveTranslationSelection(audioOnly, nothingStreams), {
    kind: 'audio-unavailable',
  });
  assert.deepEqual(
    resolveTranslationSelection(audioOnly, {
      ...nothingStreams,
      getFirstAvailableAudioBook: () => 'JHN',
    }),
    { kind: 'audio-unavailable' },
    'the first covered book is the one the reader is already in'
  );
  assert.deepEqual(
    resolveTranslationSelection(
      audioOnly,
      env({ audioEnabled: false, getFirstAvailableAudioBook: () => 'MAT' })
    ),
    { kind: 'audio-unavailable' },
    'with audio switched off there is no book to jump to'
  );
});

test('a runtime Bible whose text pack can be fetched asks to download it', () => {
  const runtime = bible({
    id: 'engnet',
    isDownloaded: false,
    source: 'runtime',
    catalog: {
      version: '1',
      updatedAt: '2026-09-01',
      text: { format: 'sqlite', version: '1', downloadUrl: 'https://example.test/n', sha256: 'x' },
    },
  });
  assert.deepEqual(resolveTranslationSelection(runtime, env()), { kind: 'download-required' });
  assert.deepEqual(
    resolveTranslationSelection({ ...runtime, catalog: undefined }, env()),
    { kind: 'coming-soon' },
    'without a pack to fetch there is nothing to offer yet'
  );
});
