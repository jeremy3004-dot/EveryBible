import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, isSupabaseConfigured } from '../supabase';
import type { BibleVerseRow } from '../supabase/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudDownloadProgress {
  phase: 'fetching' | 'writing' | 'indexing' | 'complete' | 'error';
  versesDownloaded: number;
  totalVerses: number;
  error?: string;
}

export type CloudDownloadProgressCallback = (progress: CloudDownloadProgress) => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Directory where per-translation SQLite files are stored.
 * Guaranteed to end without a trailing slash.
 */
function getTranslationsDirectory(): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base.replace(/\/$/, '')}/translations`;
}

function getTranslationDbPath(translationId: string): string {
  return `${getTranslationsDirectory()}/${translationId}.db`;
}

async function ensureTranslationsDirectoryExists(): Promise<void> {
  const dir = getTranslationsDirectory();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function deleteFileIfExists(path: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch {
    // Cleanup failure is non-fatal — best effort
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the total verse count for a translation from Supabase.
 * Used to show progress and to validate the download.
 */
export async function getCloudTranslationVerseCount(translationId: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { count, error } = await supabase
    .from('bible_verses')
    .select('*', { count: 'exact', head: true })
    .eq('translation_id', translationId);

  if (error) {
    throw new Error(`Failed to get verse count: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Download all verses for a translation from Supabase and write them
 * into a per-translation SQLite file in the app's document directory.
 *
 * Returns the absolute path to the created SQLite file.
 *
 * The SQLite file uses the same schema as the bundled bible-bsb-v2.db:
 * - verses(id, translation_id, book_id, chapter, verse, text, heading)
 * - idx_verses_unique ON verses(translation_id, book_id, chapter, verse)
 * - idx_verses_lookup ON verses(translation_id, book_id, chapter)
 * - verses_fts USING fts5(text, content='verses', content_rowid='id')
 *
 * @param translationId - The translation_id from the catalog (e.g., 'engwebp')
 * @param onProgress - Optional progress callback
 * @returns Absolute path to the created .db file
 */
export async function downloadCloudTranslation(
  translationId: string,
  onProgress?: CloudDownloadProgressCallback
): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const dbPath = getTranslationDbPath(translationId);

  try {
    // ── 1. Get total verse count ───────────────────────────────────────────
    const totalVerses = await getCloudTranslationVerseCount(translationId);

    onProgress?.({
      phase: 'fetching',
      versesDownloaded: 0,
      totalVerses,
    });

    // ── 2. Fetch verses in pages of 5000 ──────────────────────────────────
    // Free-tier Supabase has response size limits so we page through the data.
    const PAGE_SIZE = 5000;
    const allVerses: BibleVerseRow[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from('bible_verses')
        .select('*')
        .eq('translation_id', translationId)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Failed to fetch verses at offset ${offset}: ${error.message}`);
      }

      const page = (data as BibleVerseRow[]) ?? [];
      if (page.length === 0) {
        break;
      }

      allVerses.push(...page);
      offset += page.length;

      onProgress?.({
        phase: 'fetching',
        versesDownloaded: allVerses.length,
        totalVerses,
      });

      if (page.length < PAGE_SIZE) {
        // Last page — no more data
        break;
      }
    }

    // ── 3. Create per-translation SQLite file ─────────────────────────────
    await ensureTranslationsDirectoryExists();

    const directory = getTranslationsDirectory();
    const databaseName = `${translationId}.db`;

    onProgress?.({
      phase: 'writing',
      versesDownloaded: 0,
      totalVerses: allVerses.length,
    });

    // ── 4. Open the SQLite database ───────────────────────────────────────
    const database = await SQLite.openDatabaseAsync(databaseName, undefined, directory);

    // ── 5. Create the schema matching the bundled db ─────────────────────
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS verses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        translation_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        text TEXT NOT NULL,
        heading TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_verses_unique ON verses(translation_id, book_id, chapter, verse);
      CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation_id, book_id, chapter);
    `);

    // ── 6. Insert verses in a transaction ─────────────────────────────────
    let written = 0;
    const BATCH_SIZE = 500;

    // Split into batches for progress reporting inside the transaction
    for (let batchStart = 0; batchStart < allVerses.length; batchStart += BATCH_SIZE) {
      const batch = allVerses.slice(batchStart, batchStart + BATCH_SIZE);

      await database.withTransactionAsync(async () => {
        for (const row of batch) {
          await database.runAsync(
            `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text, heading)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [row.translation_id, row.book_id, row.chapter, row.verse, row.text, row.heading ?? null]
          );
        }
      });

      written += batch.length;
      onProgress?.({
        phase: 'writing',
        versesDownloaded: written,
        totalVerses: allVerses.length,
      });
    }

    // ── 7. Build FTS index ─────────────────────────────────────────────────
    onProgress?.({
      phase: 'indexing',
      versesDownloaded: allVerses.length,
      totalVerses: allVerses.length,
    });

    await database.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(text, content='verses', content_rowid='id');
      INSERT INTO verses_fts(verses_fts) VALUES('rebuild');
    `);

    // ── 8. Set PRAGMA user_version to 3 (matches BUNDLED_BIBLE_SCHEMA_VERSION) ─
    await database.execAsync('PRAGMA user_version = 3');

    // ── 9. Close the database ─────────────────────────────────────────────
    await database.closeAsync();

    onProgress?.({
      phase: 'complete',
      versesDownloaded: allVerses.length,
      totalVerses: allVerses.length,
    });

    return dbPath;
  } catch (err) {
    // ── 10. Clean up partial file on error ────────────────────────────────
    await deleteFileIfExists(dbPath);

    const message = err instanceof Error ? err.message : 'Unknown download error';

    onProgress?.({
      phase: 'error',
      versesDownloaded: 0,
      totalVerses: 0,
      error: message,
    });

    throw err;
  }
}
