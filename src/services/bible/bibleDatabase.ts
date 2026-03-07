import * as SQLite from 'expo-sqlite';
import type { Verse } from '../../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('bible.db');

  // Create tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT,
      testament TEXT CHECK(testament IN ('OT', 'NT')),
      chapters INTEGER NOT NULL,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      heading TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    CREATE INDEX IF NOT EXISTS idx_verses_book_chapter ON verses(book_id, chapter);
  `);
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    await initDatabase();
  }
  return db!;
}

export async function getChapter(bookId: string, chapter: number): Promise<Verse[]> {
  const database = await getDatabase();
  const results = await database.getAllAsync<{
    id: number;
    book_id: string;
    chapter: number;
    verse: number;
    text: string;
    heading: string | null;
  }>('SELECT * FROM verses WHERE book_id = ? AND chapter = ? ORDER BY verse', [bookId, chapter]);

  return results.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    heading: row.heading ?? undefined,
  }));
}

export async function searchVerses(query: string, limit = 50): Promise<Verse[]> {
  const database = await getDatabase();
  const results = await database.getAllAsync<{
    id: number;
    book_id: string;
    chapter: number;
    verse: number;
    text: string;
    heading: string | null;
  }>('SELECT * FROM verses WHERE text LIKE ? LIMIT ?', [`%${query}%`, limit]);

  return results.map((row) => ({
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    heading: row.heading ?? undefined,
  }));
}

export async function insertVerse(verse: Omit<Verse, 'id'>): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO verses (book_id, chapter, verse, text, heading) VALUES (?, ?, ?, ?, ?)',
    [verse.bookId, verse.chapter, verse.verse, verse.text, verse.heading ?? null]
  );
}

export async function insertVerses(verses: Omit<Verse, 'id'>[]): Promise<void> {
  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    for (const verse of verses) {
      await database.runAsync(
        'INSERT INTO verses (book_id, chapter, verse, text, heading) VALUES (?, ?, ?, ?, ?)',
        [verse.bookId, verse.chapter, verse.verse, verse.text, verse.heading ?? null]
      );
    }
  });
}

export async function getVerseCount(): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM verses'
  );
  return result?.count ?? 0;
}

export async function clearVerses(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM verses');
}
