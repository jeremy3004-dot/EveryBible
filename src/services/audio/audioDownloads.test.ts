import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleBooks } from '../../constants/books';
import {
  buildAudioChapterTargets,
  isAudioBookDownloaded,
  isTranslationAudioDownloaded,
} from './audioDownloads';

test('buildAudioChapterTargets expands selected books into chapter-level download targets', () => {
  const targets = buildAudioChapterTargets(
    bibleBooks.filter((book) => book.id === 'GEN' || book.id === 'OBA')
  );

  assert.equal(targets.length, 51);
  assert.deepEqual(targets[0], { bookId: 'GEN', chapter: 1 });
  assert.deepEqual(targets[49], { bookId: 'GEN', chapter: 50 });
  assert.deepEqual(targets[50], { bookId: 'OBA', chapter: 1 });
});

test('isAudioBookDownloaded only marks books present in the downloaded set', () => {
  assert.equal(isAudioBookDownloaded(['GEN', 'JHN'], 'GEN'), true);
  assert.equal(isAudioBookDownloaded(['GEN', 'JHN'], 'EXO'), false);
});

test('isTranslationAudioDownloaded requires every book in the scope', () => {
  const newTestamentBooks = bibleBooks.filter((book) => book.testament === 'NT');

  assert.equal(isTranslationAudioDownloaded(['MAT', 'MRK'], newTestamentBooks), false);
  assert.equal(
    isTranslationAudioDownloaded(newTestamentBooks.map((book) => book.id), newTestamentBooks),
    true
  );
});
