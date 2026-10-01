/**
 * Server-side reads of the committed Berean Standard Bible shards. A chapter
 * page reads its book's one shard (95 KB at most, for Psalms); parsed books
 * stay cached for the life of the server instance.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import { bibleBookById } from './bible-books';
import {
  BIBLE_TEXT_DIRECTORY,
  bibleTextFile,
  type BibleBookShard,
  type ShardChapter,
} from './bible-text-model';

const cache = new Map<string, Promise<BibleBookShard>>();

/** Null for anything that is not one of the 66 book ids, so no other file is ever read. */
export function getBibleBookText(
  bookId: string,
  root = process.cwd()
): Promise<BibleBookShard> | null {
  const book = bibleBookById(bookId);
  if (!book) return null;
  const file = path.join(root, BIBLE_TEXT_DIRECTORY, bibleTextFile(book.id));
  let value = cache.get(file);
  if (!value) {
    value = readFile(file).then((bytes) => JSON.parse(gunzipSync(bytes).toString()));
    // A failed read is retried on the next request rather than cached.
    value.catch(() => cache.delete(file));
    cache.set(file, value);
  }
  return value;
}

export async function getBibleChapterText(
  bookId: string,
  chapter: number,
  root = process.cwd()
): Promise<ShardChapter | null> {
  const book = await getBibleBookText(bookId, root);
  if (!book || !Number.isInteger(chapter) || chapter < 1) return null;
  return book.chapters[chapter - 1] ?? null;
}
