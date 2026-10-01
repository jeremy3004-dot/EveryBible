/**
 * Regenerates apps/site/data/bible/bsb/<BOOK>.json.gz, the text behind the
 * /bible reading pages, from the helloao.org Berean Standard Bible export
 * at data/bsb_complete.json (repo root). One shard per book, so a chapter
 * page reads a single small file:
 *
 *   npm run bible:pages          # write
 *   npm run bible:pages:check    # fail if the committed shards are stale
 *
 * The site build reads only the committed shards.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

import { SITE_BIBLE_BOOKS } from '../lib/bible-books';
import {
  bibleTextFile,
  compactChapter,
  type BibleBookShard,
  type SourceChapter,
} from '../lib/bible-text-model';

const source = new URL('../../../data/bsb_complete.json', import.meta.url);
const directory = new URL('../data/bible/bsb/', import.meta.url);
const check = process.argv.includes('--check');

interface SourceBible {
  translation: { id: string };
  books: { id: string; chapters: { chapter: SourceChapter }[] }[];
}

const bible = JSON.parse(readFileSync(source, 'utf8')) as SourceBible;
if (bible.translation.id !== 'BSB') throw new Error(`Expected BSB, got ${bible.translation.id}`);

const files = new Map<string, BibleBookShard>();
for (const book of SITE_BIBLE_BOOKS) {
  const sourceBook = bible.books.find((candidate) => candidate.id === book.id);
  if (!sourceBook) throw new Error(`${book.id} is missing from ${source.pathname}`);
  if (sourceBook.chapters.length !== book.chapters)
    throw new Error(
      `${book.id}: ${sourceBook.chapters.length} chapters, expected ${book.chapters}`
    );
  files.set(bibleTextFile(book.id), {
    book: book.id,
    chapters: sourceBook.chapters.map(({ chapter }, index) => {
      if (chapter.number !== index + 1) throw new Error(`${book.id}: chapter order`);
      return compactChapter(chapter, `${book.id} ${chapter.number}`);
    }),
  });
}

/** gzip's header carries no timestamp from Node, so identical input gives identical bytes. */
const encode = (value: unknown) => gzipSync(JSON.stringify(value), { level: 9 });

const existing = (() => {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
})();

if (check) {
  const stale = [
    ...existing.filter((name) => !files.has(name)),
    ...[...files]
      .filter(
        ([name, value]) =>
          !existing.includes(name) ||
          gunzipSync(readFileSync(new URL(name, directory))).toString() !== JSON.stringify(value)
      )
      .map(([name]) => name),
  ];
  if (stale.length) {
    console.error(`Bible pages are stale (${stale.join(', ')}); run npm run bible:pages`);
    process.exit(1);
  }
} else {
  mkdirSync(directory, { recursive: true });
  for (const name of existing) if (!files.has(name)) rmSync(new URL(name, directory));
  for (const [name, value] of files) writeFileSync(new URL(name, directory), encode(value));
}

const bytes = [...files.values()].reduce((total, value) => total + encode(value).byteLength, 0);
console.log(
  `Bible pages: ${files.size} books; ${bytes.toLocaleString('en')} bytes gzipped; ` +
    `${check ? 'verified' : 'written'}`
);
