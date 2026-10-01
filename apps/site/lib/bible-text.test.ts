import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { SITE_BIBLE_BOOKS } from './bible-books';
import { getBibleBookText, getBibleChapterText } from './bible-text';
import {
  chapterBlocks,
  chapterDescription,
  CHAPTER_DESCRIPTION_MAX_LENGTH,
  type ChapterInline,
} from './bible-text-model';

const root = fileURLToPath(new URL('..', import.meta.url));

test('a chapter is read from its book shard', async () => {
  const john = await getBibleChapterText('JHN', 3, root);
  const blocks = chapterBlocks(john!);
  const verse16 = blocks.flatMap((block) =>
    block.kind === 'paragraph'
      ? [block.parts.findIndex((part) => part.kind === 'verse' && part.number === 16)]
      : []
  );
  assert.ok(verse16.some((index) => index >= 0));
  assert.match(
    chapterDescription(john!),
    /^Now there was a man of the Pharisees named Nicodemus, a leader of the Jews\./
  );
  const [heading, superscription, first] = chapterBlocks(
    (await getBibleChapterText('PSA', 23, root))!
  );
  assert.deepEqual(heading, { kind: 'heading', text: 'The LORD Is My Shepherd' });
  assert.deepEqual(superscription, {
    kind: 'superscription',
    parts: [{ kind: 'text', text: 'A Psalm of David.' }],
  });
  assert.equal(first.kind, 'poetry');
});

test('unknown books and chapters are not found, and nothing outside the shards is read', async () => {
  for (const id of ['XYZ', '../bsb_complete', 'constructor', '__proto__', ''])
    assert.equal(getBibleBookText(id, root), null, id);
  assert.equal(await getBibleChapterText('JHN', 22, root), null);
  assert.equal(await getBibleChapterText('JHN', 0, root), null);
  assert.equal(await getBibleChapterText('OBA', 1.5, root), null);
});

/** Every verse number and footnote marker a chapter renders, in order. */
function markers(parts: readonly ChapterInline[], verses: number[], notes: number[]) {
  for (const part of parts) {
    if (part.kind === 'verse') verses.push(part.number);
    if (part.kind === 'note') notes.push(part.index);
    // Single spaces only, and a space at an edge only next to a verse number or marker.
    if (part.kind === 'text') assert.match(part.text, /^(?: ?\S+(?: \S+)* ?| )$/, part.text);
  }
}

test('every chapter of the Bible renders each verse and footnote exactly once', async () => {
  let chapters = 0;
  let verseCount = 0;
  for (const book of SITE_BIBLE_BOOKS) {
    const shard = await getBibleBookText(book.id, root);
    assert.equal(shard?.chapters.length, book.chapters, book.id);
    for (const [index, chapter] of shard!.chapters.entries()) {
      const where = `${book.id} ${index + 1}`;
      const verses: number[] = [];
      const notes: number[] = [];
      for (const block of chapterBlocks(chapter)) {
        if (block.kind === 'heading') assert.ok(block.text, where);
        else if (block.kind === 'poetry') {
          assert.ok(block.lines.length, where);
          for (const line of block.lines) {
            assert.ok(line.parts.length, where);
            markers(line.parts, verses, notes);
          }
        } else {
          assert.ok(block.parts.length, where);
          assert.notEqual(block.parts.at(-1)?.kind, 'break', where);
          markers(block.parts, verses, notes);
        }
      }
      const expected = chapter.c.flatMap((item) => (item !== 0 && 'v' in item ? [item.v] : []));
      assert.deepEqual(verses, expected, where);
      assert.deepEqual(notes, [...(chapter.n ?? []).keys()], where);
      const description = chapterDescription(chapter);
      assert.ok(
        description.length > 40 && description.length <= CHAPTER_DESCRIPTION_MAX_LENGTH,
        where
      );
      chapters += 1;
      verseCount += verses.length;
    }
  }
  assert.equal(chapters, 1189);
  assert.equal(verseCount, 31086);
});
