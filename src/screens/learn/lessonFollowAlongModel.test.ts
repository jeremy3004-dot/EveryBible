import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORY_VERSE_NUMBER_GAP,
  lessonFollowScrollTarget,
  storyVerseLineTops,
  storyVerseTextStarts,
} from './lessonFollowAlongModel';

const verses = [
  { verse: 1, text: 'In the beginning.' },
  { verse: 2, text: 'Void.', heading: 'Day One' },
  { verse: 10, text: 'Light.' },
];

/** The paragraph exactly as the story renders it. */
const paragraph =
  `1${STORY_VERSE_NUMBER_GAP}In the beginning.` +
  `\nDay One\n2${STORY_VERSE_NUMBER_GAP}Void.` +
  ` 10${STORY_VERSE_NUMBER_GAP}Light.`;

test('verse starts point at each verse number in the rendered paragraph', () => {
  const starts = storyVerseTextStarts(verses);
  assert.deepEqual(
    starts.map((start) => paragraph.slice(start, start + 2)),
    [`1${STORY_VERSE_NUMBER_GAP}`, `2${STORY_VERSE_NUMBER_GAP}`, '10']
  );
});

test('each verse takes the top of the line its number is laid out on', () => {
  // Split the paragraph into lines the way a text layout would, breaking inside verse 1.
  const lines = [
    { y: 0, text: paragraph.slice(0, 8) },
    { y: 27, text: paragraph.slice(8, 20) },
    { y: 54, text: paragraph.slice(20, 30) },
    { y: 81, text: paragraph.slice(30) },
  ];
  const starts = storyVerseTextStarts(verses);
  const expected = starts.map((start) => {
    let end = 0;
    return lines.find((line) => (end += line.text.length) > start)?.y;
  });

  assert.deepEqual(storyVerseLineTops(verses, lines), expected);
  assert.equal(storyVerseLineTops(verses, lines)[0], 0);
});

test('a verse past the reported lines has no top', () => {
  assert.deepEqual(storyVerseLineTops(verses, [{ y: 0, text: paragraph.slice(0, 5) }]), [
    0,
    null,
    null,
  ]);
  assert.deepEqual(storyVerseLineTops(verses, []), [null, null, null]);
});

const view = { scrollY: 1000, viewportHeight: 800, storyTop: 500, storyBottom: 4000 };

test('a verse inside the comfortable band stays put', () => {
  assert.equal(lessonFollowScrollTarget({ ...view, verseY: 1300 }), null);
});

test('a verse moving below the band scrolls it back to a third of the way down', () => {
  assert.equal(lessonFollowScrollTarget({ ...view, verseY: 1700 }), 1700 - 240);
  assert.equal(lessonFollowScrollTarget({ ...view, verseY: 900 }), 900 - 240, 'or above it');
  assert.equal(
    lessonFollowScrollTarget({ ...view, scrollY: 200, verseY: 50, storyTop: 0 }),
    0,
    'never above the top of the page'
  );
});

test('someone reading the questions outside the story is left where they are', () => {
  assert.equal(lessonFollowScrollTarget({ ...view, verseY: 1700, storyTop: 1500 }), null);
  assert.equal(lessonFollowScrollTarget({ ...view, verseY: 1700, storyBottom: 1300 }), null);
  assert.equal(lessonFollowScrollTarget({ ...view, verseY: 1700, viewportHeight: 0 }), null);
});
