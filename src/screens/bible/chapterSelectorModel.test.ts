import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookById } from '../../constants/books';
import {
  CHAPTER_GRID_COLUMNS,
  CHAPTER_GRID_HORIZONTAL_PADDING,
  CHAPTER_GRID_ROW_GAP,
  buildChapterGridRows,
  buildChapterLaunchParams,
  buildBookHubPresentation,
  getChapterGridItemSize,
} from './chapterSelectorModel';

test('getChapterGridItemSize preserves the current five-column chapter grid math', () => {
  assert.equal(CHAPTER_GRID_COLUMNS, 5);
  assert.equal(CHAPTER_GRID_HORIZONTAL_PADDING, 72);
  assert.equal(CHAPTER_GRID_ROW_GAP, 8);
  assert.equal(getChapterGridItemSize(392), 64);
});

test('buildChapterGridRows keeps chapters grouped into fixed five-item rows', () => {
  assert.deepEqual(buildChapterGridRows(11), [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11],
  ]);
});

test('buildBookHubPresentation uses seeded synopsis when local book content exists', () => {
  const book = getBookById('MAT');
  assert.ok(book);

  const presentation = buildBookHubPresentation({
    book,
    chaptersRead: {},
    currentBookId: 'MRK',
    currentChapter: 1,
  });

  assert.match(presentation.summary, /Matthew/i);
  assert.equal(presentation.introState, 'coming-soon');
  assert.match(presentation.introLabel ?? '', /Matthew/i);
  assert.equal(presentation.continueChapter, 1);
});

test('buildBookHubPresentation uses the shared accent banner palette for every book hub', () => {
  const genesis = getBookById('GEN');
  const micah = getBookById('MIC');
  assert.ok(genesis);
  assert.ok(micah);

  const genesisPresentation = buildBookHubPresentation({
    book: genesis,
    chaptersRead: {},
    currentBookId: 'MAT',
    currentChapter: 1,
  });
  const micahPresentation = buildBookHubPresentation({
    book: micah,
    chaptersRead: {},
    currentBookId: 'MAT',
    currentChapter: 1,
  });

  assert.deepEqual(genesisPresentation.palette.gradient, ['#e35d5b', '#e35d5b']);
  assert.deepEqual(micahPresentation.palette.gradient, ['#e35d5b', '#e35d5b']);
  assert.deepEqual(genesisPresentation.palette.gradient, micahPresentation.palette.gradient);
});

test('buildBookHubPresentation falls back to generated copy and resumes the in-flight book session', () => {
  const book = getBookById('OBA');
  assert.ok(book);

  const presentation = buildBookHubPresentation({
    book,
    chaptersRead: {},
    currentBookId: 'OBA',
    currentChapter: 1,
  });

  assert.match(presentation.summary, /Old Testament/i);
  assert.match(presentation.summary, /1 chapter/i);
  assert.equal(presentation.continueChapter, 1);
  assert.deepEqual(presentation.completedChapters, []);
});

test('buildBookHubPresentation prefers the most recently completed chapter when no session is open', () => {
  const book = getBookById('GAL');
  assert.ok(book);

  const presentation = buildBookHubPresentation({
    book,
    chaptersRead: {
      GAL_2: 1700000000000,
      GAL_3: 1700000000250,
      GAL_4: 1700000000500,
    },
    currentBookId: 'MAT',
    currentChapter: 5,
  });

  assert.equal(presentation.continueChapter, 4);
  assert.deepEqual(presentation.completedChapters, [2, 3, 4]);
});

test('buildBookHubPresentation keeps chapter completion data but does not expose hero progress metrics', () => {
  const book = getBookById('JAS');
  assert.ok(book);

  const presentation = buildBookHubPresentation({
    book,
    chaptersRead: {
      JAS_1: 1700000000000,
      JAS_3: 1700000000200,
    },
    currentBookId: 'MAT',
    currentChapter: 2,
  });

  assert.deepEqual(presentation.completedChapters, [1, 3]);
  assert.equal(Object.hasOwn(presentation, 'chaptersReadCount'), false);
  assert.equal(Object.hasOwn(presentation, 'progressRatio'), false);
});

test('buildChapterLaunchParams preserves the listen or read preference in navigation params', () => {
  assert.deepEqual(buildChapterLaunchParams('MAT', 3, 'listen'), {
    bookId: 'MAT',
    chapter: 3,
    autoplayAudio: true,
    preferredMode: 'listen',
  });

  assert.deepEqual(buildChapterLaunchParams('MAT', 3, 'read'), {
    bookId: 'MAT',
    chapter: 3,
    preferredMode: 'read',
  });
});
