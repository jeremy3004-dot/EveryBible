import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAudioChapterMapFromElManifest,
  getBookContentAvailability,
  getChapterContentAvailability,
  type TranslationContentSummary,
} from './contentAvailability';

const genesis = { id: 'GEN', testament: 'OT' as const, chapters: 50 };
const matthew = { id: 'MAT', testament: 'NT' as const, chapters: 28 };

const textOnly: TranslationContentSummary = { hasText: true, hasAudio: false };

const audioEverywhere: TranslationContentSummary = { hasText: false, hasAudio: true };

const audioNewTestamentOnly: TranslationContentSummary = {
  hasText: false,
  hasAudio: true,
  catalog: { audio: { coverage: 'new-testament' } },
};

const audioPartialCatalog: TranslationContentSummary = {
  hasText: false,
  hasAudio: true,
  catalog: {
    audio: {
      coverage: 'partial',
      books: {
        MAT: { totalChapters: 10 },
      },
    },
  },
};

const nothing: TranslationContentSummary = { hasText: false, hasAudio: false };

test('an unknown translation is treated as fully available', () => {
  const availability = getBookContentAvailability(genesis, undefined);

  assert.equal(availability.isAvailable, true);
  assert.equal(getChapterContentAvailability(genesis, 1, undefined).isAvailable, true);
});

test('a text translation makes every book and chapter available', () => {
  assert.equal(getBookContentAvailability(genesis, textOnly).isAvailable, true);
  assert.equal(getBookContentAvailability(matthew, textOnly).hasText, true);
  assert.equal(getChapterContentAvailability(genesis, 50, textOnly).isAvailable, true);
});

test('an audio translation with no coverage data covers every book', () => {
  const availability = getBookContentAvailability(genesis, audioEverywhere);

  assert.equal(availability.hasText, false);
  assert.equal(availability.hasAudio, true);
  assert.equal(availability.isAvailable, true);
});

test('new-testament audio coverage greys out Old Testament books', () => {
  assert.equal(getBookContentAvailability(genesis, audioNewTestamentOnly).isAvailable, false);
  assert.equal(getBookContentAvailability(matthew, audioNewTestamentOnly).isAvailable, true);
  assert.equal(getChapterContentAvailability(genesis, 1, audioNewTestamentOnly).isAvailable, false);
});

test('a per-book audio catalog limits both books and chapters', () => {
  assert.equal(getBookContentAvailability(genesis, audioPartialCatalog).isAvailable, false);
  assert.equal(getBookContentAvailability(matthew, audioPartialCatalog).isAvailable, true);
  assert.equal(getChapterContentAvailability(matthew, 10, audioPartialCatalog).isAvailable, true);
  assert.equal(getChapterContentAvailability(matthew, 11, audioPartialCatalog).isAvailable, false);
});

test('text coverage keeps chapters beyond the audio catalog available', () => {
  const textAndPartialAudio: TranslationContentSummary = {
    ...audioPartialCatalog,
    hasText: true,
  };

  assert.equal(getBookContentAvailability(genesis, textAndPartialAudio).isAvailable, true);
  assert.equal(getChapterContentAvailability(matthew, 28, textAndPartialAudio).isAvailable, true);
});

test('a translation with neither text nor audio is entirely unavailable', () => {
  assert.equal(getBookContentAvailability(matthew, nothing).isAvailable, false);
  assert.equal(getChapterContentAvailability(matthew, 1, nothing).isAvailable, false);
});

test('book ids are matched case-insensitively against the audio catalog', () => {
  const lowercaseCatalog: TranslationContentSummary = {
    hasText: false,
    hasAudio: true,
    catalog: { audio: { books: { mat: { totalChapters: 28 } } } },
  };

  assert.equal(getBookContentAvailability(matthew, lowercaseCatalog).isAvailable, true);
});

test('an empty audio catalog is treated as unknown rather than empty coverage', () => {
  const emptyCatalog: TranslationContentSummary = {
    hasText: false,
    hasAudio: true,
    catalog: { audio: { books: {} } },
  };

  assert.equal(getBookContentAvailability(genesis, emptyCatalog).isAvailable, true);
});

const psalms = { id: 'PSA', testament: 'OT' as const, chapters: 150 };

// Shaped like Bhujel's real manifest: Old Testament books only, Psalms is chapter 117 alone.
const manifestResolvedAudio: TranslationContentSummary = {
  hasText: false,
  hasAudio: true,
  catalog: { audio: { coverage: 'new-testament' } },
  audioChapters: { GEN: [1, 2, 3], PSA: [117] },
};

test('a resolved chapter map overrides the catalog coverage', () => {
  assert.equal(getBookContentAvailability(genesis, manifestResolvedAudio).isAvailable, true);
  assert.equal(getBookContentAvailability(matthew, manifestResolvedAudio).isAvailable, false);
});

test('a resolved chapter map is exact, so sparse books do not gain chapters', () => {
  assert.equal(getChapterContentAvailability(psalms, 117, manifestResolvedAudio).isAvailable, true);
  assert.equal(getChapterContentAvailability(psalms, 1, manifestResolvedAudio).isAvailable, false);
  assert.equal(getChapterContentAvailability(genesis, 4, manifestResolvedAudio).isAvailable, false);
});

test('a resolved chapter map with no books is authoritative, unlike an empty catalog map', () => {
  const nothingResolved: TranslationContentSummary = {
    hasText: false,
    hasAudio: true,
    audioChapters: {},
  };

  assert.equal(getBookContentAvailability(genesis, nothingResolved).isAvailable, false);
});

test('text still keeps a book available when the chapter map excludes it', () => {
  const textAndManifest: TranslationContentSummary = { ...manifestResolvedAudio, hasText: true };

  assert.equal(getBookContentAvailability(matthew, textAndManifest).isAvailable, true);
  assert.equal(getChapterContentAvailability(psalms, 1, textAndManifest).isAvailable, true);
});

test('buildAudioChapterMapFromElManifest keeps only sorted, unique chapter numbers', () => {
  const chapter = (number: number) => ({
    chapter: number,
    path: `/${number}.mp3`,
    bytes: 1,
    sha256: '',
  });
  const map = buildAudioChapterMapFromElManifest({
    books: { PSA: [chapter(117)], GEN: [chapter(3), chapter(1), chapter(3), chapter(2)] },
  });

  assert.deepEqual(map, { PSA: [117], GEN: [1, 2, 3] });
});
