import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chapterBlocks,
  chapterDescription,
  chapterPlainText,
  compactChapter,
  footnoteLabel,
  type ChapterBlock,
  type ChapterInline,
  type SourceChapter,
} from './bible-text-model';

/** Genesis 1:1–5, 27 and 31 as they appear in data/bsb_complete.json. */
const genesis: SourceChapter = {
  number: 1,
  content: [
    { type: 'heading', content: ['The Creation'] },
    {
      type: 'verse',
      number: 1,
      content: ['In the beginning God created the heavens and the earth.'],
    },
    { type: 'line_break' },
    { type: 'verse', number: 2, content: ['Now the earth was formless and void.'] },
    { type: 'heading', content: ['The First Day'] },
    { type: 'line_break' },
    {
      type: 'verse',
      number: 3,
      content: ['And God said, “Let there be light,”', { noteId: 0 }, 'and there was light.'],
    },
    { type: 'line_break' },
    {
      type: 'verse',
      number: 27,
      content: [
        { text: 'So God created man in His own image;', poem: 1 },
        { text: 'in the image of God He created him;', poem: 2 },
        { lineBreak: true },
        { text: 'male and female He created them.', poem: 2 },
        { noteId: 4 },
      ],
    },
    { type: 'line_break' },
    {
      type: 'verse',
      number: 31,
      content: [
        'And God looked upon all that He had made.',
        { lineBreak: true },
        'And there was evening, and there was morning—the sixth day.',
      ],
    },
  ],
  footnotes: [
    { noteId: 4, text: 'Cited in Matthew 19:4', reference: { chapter: 1, verse: 27 } },
    { noteId: 0, text: ' Cited in 2 Corinthians 4:6 ', reference: { chapter: 1, verse: 3 } },
    { noteId: 9, text: 'Never referenced', reference: { chapter: 1, verse: 5 } },
  ],
};

/** Renders inline parts the way the page does, with verse numbers as [n] and notes as {a}. */
function flatten(parts: readonly ChapterInline[]): string {
  return parts
    .map((part) =>
      part.kind === 'text'
        ? part.text
        : part.kind === 'verse'
          ? `[${part.number}]`
          : part.kind === 'note'
            ? `{${footnoteLabel(part.index)}}`
            : '\n'
    )
    .join('');
}

function describe(block: ChapterBlock): string {
  switch (block.kind) {
    case 'heading':
      return `# ${block.text}`;
    case 'superscription':
      return `~ ${flatten(block.parts)}`;
    case 'paragraph':
      return `¶ ${flatten(block.parts)}`;
    case 'poetry':
      return block.lines
        .map((line) => `${'  '.repeat(line.indent)}| ${flatten(line.parts)}`)
        .join('\n');
  }
}

test('footnotes are renumbered in reading order; unreferenced notes are dropped', () => {
  const chapter = compactChapter(genesis, 'GEN 1');
  assert.deepEqual(chapter.n, [
    { v: 3, t: 'Cited in 2 Corinthians 4:6' },
    { v: 27, t: 'Cited in Matthew 19:4' },
  ]);
});

test('headings, paragraphs, poetry, footnote markers and line breaks become blocks', () => {
  const blocks = chapterBlocks(compactChapter(genesis, 'GEN 1'));
  assert.deepEqual(blocks.map(describe), [
    '# The Creation',
    '¶ [1] In the beginning God created the heavens and the earth.',
    '¶ [2] Now the earth was formless and void.',
    '# The First Day',
    '¶ [3] And God said, “Let there be light,”{a} and there was light.',
    [
      '| [27] So God created man in His own image;',
      '  | in the image of God He created him;',
      '  | male and female He created them.{b}',
    ].join('\n'),
    '¶ [31] And God looked upon all that He had made.\nAnd there was evening, and there was morning—the sixth day.',
  ]);
});

test('verses in one paragraph are spaced, and a prose lead-in keeps its poetry', () => {
  const blocks = chapterBlocks({
    c: [
      { v: 4, c: ['Jesus answered,'] },
      {
        v: 5,
        c: ['“It is written:', { q: 1, t: 'Man shall not live' }, { f: 0 }, { q: 2, t: '”' }],
      },
      { v: 6, c: ['Then the devil left Him.'] },
    ],
    n: [{ v: 5, t: 'Deuteronomy 8:3' }],
  });
  assert.deepEqual(blocks.map(describe), [
    '¶ [4] Jesus answered, [5] “It is written:',
    // A closing quote left alone after a footnote joins the line it closes.
    '| Man shall not live{a}”',
    '¶ [6] Then the devil left Him.',
  ]);
});

test('a psalm superscription keeps its footnote, and a verse that starts a new line breaks first', () => {
  const blocks = chapterBlocks({
    c: [
      { s: ['For the choirmaster.', { f: 0 }, 'A Psalm of David.'] },
      { v: 1, c: ['First.'] },
      { v: 2, c: [0, 'Second.'] },
      { v: 3, c: [] },
    ],
    n: [{ v: 0, t: 'Probably a musical term' }],
  });
  assert.deepEqual(blocks.map(describe), [
    '~ For the choirmaster.{a} A Psalm of David.',
    // A verse with no text of its own still gets its number (and anchor).
    '¶ [1] First.\n[2] Second. [3]',
  ]);
});

test('an unknown item type fails the build instead of disappearing', () => {
  assert.throws(
    () =>
      compactChapter(
        { number: 1, content: [{ type: 'table' } as unknown as SourceChapter['content'][number]] },
        'GEN 1'
      ),
    /GEN 1: unknown item type/
  );
});

test('footnote labels run a to z, then aa', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(footnoteLabel), [
    'a',
    'b',
    'z',
    'aa',
    'ab',
    'az',
    'ba',
  ]);
});

test('the description is the opening verse text, cut at a word within 155 characters', () => {
  const chapter = compactChapter(genesis, 'GEN 1');
  assert.equal(
    chapterPlainText(chapter).slice(0, 80),
    'In the beginning God created the heavens and the earth. Now the earth was formle'
  );
  const description = chapterDescription(chapter);
  assert.ok(description.length <= 155, description);
  assert.ok(description.endsWith('…'));
  assert.equal(
    description,
    'In the beginning God created the heavens and the earth. Now the earth was formless and void. And God said, “Let there be light,” and there was light. So…'
  );
  // Short text is left whole; a dangling comma is not kept before the ellipsis.
  assert.equal(chapterDescription({ c: [{ v: 1, c: ['Jesus wept.'] }] }), 'Jesus wept.');
  assert.equal(chapterDescription({ c: [{ v: 1, c: ['one two, three four'] }] }, 12), 'one two…');
});
