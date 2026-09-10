import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, sourcePath } from '../../testing/mockModules';
import type { Verse } from '../../types';

// Only the SQLite-backed chapter reader is replaced; the book catalogue and the
// reference-label formatter are the real ones.
interface ChapterRequest {
  translationId: string;
  bookId: string;
  chapter: number;
}

const chapterRequests: ChapterRequest[] = [];
/** Scripted chapters keyed `<translation>/<bookId>/<chapter>`. */
const chapters = new Map<string, Verse[]>();
let chapterFailure: Error | null = null;

const makeVerse = (bookId: string, chapter: number, verse: number): Verse => ({
  id: chapter * 1000 + verse,
  bookId,
  chapter,
  verse,
  text: `${bookId} ${chapter}:${verse}`,
});

const seedChapter = (
  translationId: string,
  bookId: string,
  chapter: number,
  verseCount: number
): Verse[] => {
  const verses = Array.from({ length: verseCount }, (_, index) =>
    makeVerse(bookId, chapter, index + 1)
  );
  chapters.set(`${translationId}/${bookId}/${chapter}`, verses);
  return verses;
};

mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  getChapter: async (translationId: string, bookId: string, chapter: number) => {
    chapterRequests.push({ translationId, bookId, chapter });
    if (chapterFailure) {
      throw chapterFailure;
    }
    return chapters.get(`${translationId}/${bookId}/${chapter}`) ?? [];
  },
});

const loadService = () => import('./gatherBibleService');

beforeEach(() => {
  chapterRequests.length = 0;
  chapters.clear();
  chapterFailure = null;
});

test('a whole-chapter reference returns every verse and a bare book-and-chapter label', async () => {
  const { getPassageText } = await loadService();
  const verses = seedChapter('bsb', 'GEN', 1, 31);

  const blocks = await getPassageText([{ bookId: 'GEN', chapter: 1 }]);

  assert.deepEqual(blocks, [{ label: 'Genesis 1', verses }]);
});

test('a start-and-end verse range keeps only the verses inside it', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);

  const [block] = await getPassageText([{ bookId: 'GEN', chapter: 1, startVerse: 3, endVerse: 5 }]);

  assert.equal(block.label, 'Genesis 1:3-5');
  assert.deepEqual(
    block.verses.map((verse) => verse.verse),
    [3, 4, 5]
  );
});

test('a range is inclusive at both ends', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);

  const [block] = await getPassageText([
    { bookId: 'GEN', chapter: 1, startVerse: 1, endVerse: 31 },
  ]);

  assert.equal(block.verses.length, 31);
});

test('a start verse with no end runs to the end of the chapter and gets a "+" label', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);

  const [block] = await getPassageText([{ bookId: 'GEN', chapter: 1, startVerse: 29 }]);

  assert.equal(block.label, 'Genesis 1:29+');
  assert.deepEqual(
    block.verses.map((verse) => verse.verse),
    [29, 30, 31]
  );
});

test('an end verse with no start is treated as a whole chapter', async () => {
  const { getPassageText } = await loadService();
  const verses = seedChapter('bsb', 'GEN', 1, 31);

  const [block] = await getPassageText([{ bookId: 'GEN', chapter: 1, endVerse: 5 }]);

  assert.equal(block.label, 'Genesis 1');
  assert.deepEqual(block.verses, verses);
});

test('verse 0 is honoured as a real start verse rather than treated as absent', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 3);

  const [block] = await getPassageText([{ bookId: 'GEN', chapter: 1, startVerse: 0 }]);

  // The filter uses `!= null`, not truthiness, so a 0 start still filters.
  assert.equal(block.label, 'Genesis 1:0+');
  assert.equal(block.verses.length, 3);
});

test('a range that matches no verse yields an empty block rather than dropping it', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);

  const [block] = await getPassageText([
    { bookId: 'GEN', chapter: 1, startVerse: 40, endVerse: 45 },
  ]);

  assert.deepEqual(block, { label: 'Genesis 1:40-45', verses: [] });
});

test('a multi-reference lesson returns one block per reference, in order', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);
  seedChapter('bsb', 'JHN', 3, 36);

  const blocks = await getPassageText([
    { bookId: 'GEN', chapter: 1, startVerse: 1, endVerse: 2 },
    { bookId: 'JHN', chapter: 3, startVerse: 16 },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.label),
    ['Genesis 1:1-2', 'John 3:16+']
  );
});

test('a reference spanning several chapters reads each chapter separately', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);
  seedChapter('bsb', 'GEN', 2, 25);
  seedChapter('bsb', 'GEN', 3, 24);

  const blocks = await getPassageText([
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'GEN', chapter: 2 },
    { bookId: 'GEN', chapter: 3, startVerse: 1, endVerse: 7 },
  ]);

  assert.deepEqual(chapterRequests, [
    { translationId: 'bsb', bookId: 'GEN', chapter: 1 },
    { translationId: 'bsb', bookId: 'GEN', chapter: 2 },
    { translationId: 'bsb', bookId: 'GEN', chapter: 3 },
  ]);
  assert.deepEqual(
    blocks.map((block) => block.verses.length),
    [31, 25, 7]
  );
});

test('an empty reference list produces no blocks and reads nothing', async () => {
  const { getPassageText } = await loadService();

  const blocks = await getPassageText([]);

  assert.deepEqual(blocks, []);
  assert.deepEqual(chapterRequests, []);
});

test('BSB is the default translation when none is given', async () => {
  const { getPassageText } = await loadService();

  await getPassageText([{ bookId: 'GEN', chapter: 1 }]);

  assert.equal(chapterRequests[0].translationId, 'bsb');
});

test('an explicit translation is passed through to the chapter reader', async () => {
  const { getPassageText } = await loadService();
  seedChapter('web', 'GEN', 1, 31);

  const blocks = await getPassageText([{ bookId: 'GEN', chapter: 1 }], 'web');

  assert.equal(chapterRequests[0].translationId, 'web');
  assert.equal(blocks[0].verses.length, 31);
});

test('a chapter the translation does not carry yields an empty block, not a throw', async () => {
  const { getPassageText } = await loadService();

  const blocks = await getPassageText([{ bookId: 'GEN', chapter: 99 }]);

  assert.deepEqual(blocks, [{ label: 'Genesis 99', verses: [] }]);
});

test('an unknown book id falls back to the raw id in the label', async () => {
  const { getPassageText } = await loadService();

  const [block] = await getPassageText([
    { bookId: 'NOPE', chapter: 2, startVerse: 1, endVerse: 3 },
  ]);

  assert.equal(block.label, 'NOPE 2:1-3');
});

test('a caller-supplied resolver localises the book name in the label', async () => {
  const { getPassageText } = await loadService();
  seedChapter('bsb', 'GEN', 1, 31);

  const [block] = await getPassageText([{ bookId: 'GEN', chapter: 1 }], 'bsb', {
    bookNameResolver: (bookId) => (bookId === 'GEN' ? 'Génesis' : bookId),
  });

  assert.equal(block.label, 'Génesis 1');
});

test('a failing chapter read propagates so the caller can show an error', async () => {
  const { getPassageText } = await loadService();
  chapterFailure = new Error('bible database is not ready');

  await assert.rejects(() => getPassageText([{ bookId: 'GEN', chapter: 1 }]), {
    message: 'bible database is not ready',
  });
});

test('getPrimaryAudioReference points audio at the first reference', async () => {
  const { getPrimaryAudioReference } = await loadService();

  const primary = getPrimaryAudioReference([
    { bookId: 'JHN', chapter: 3, startVerse: 16 },
    { bookId: 'ROM', chapter: 8 },
  ]);

  assert.deepEqual(primary, { bookId: 'JHN', chapter: 3 });
});

test('getPrimaryAudioReference drops the verse range, which chapter audio cannot use', async () => {
  const { getPrimaryAudioReference } = await loadService();

  const primary = getPrimaryAudioReference([
    { bookId: 'JHN', chapter: 3, startVerse: 16, endVerse: 18 },
  ]);

  assert.deepEqual(primary, { bookId: 'JHN', chapter: 3 });
});

test('getPrimaryAudioReference returns null when a lesson has no references', async () => {
  const { getPrimaryAudioReference } = await loadService();

  assert.equal(getPrimaryAudioReference([]), null);
});
