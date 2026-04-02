import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, isSupabaseConfigured } from '../supabase';
import type { BibleVerseRow } from '../supabase/types';
import {
  assertCompleteCloudTranslationFetch,
  buildUnavailableCloudTranslationMessage,
  resolveCloudTextTranslationId,
  shouldContinueCloudTranslationFetch,
} from './cloudTranslationModel';
import { resolveBibleAssetUrl } from './bibleAssetBaseUrl';

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

function getStagingTranslationDbPath(translationId: string): string {
  return `${getTranslationsDirectory()}/${translationId}.staging.db`;
}

async function ensureTranslationsDirectoryExists(): Promise<void> {
  const dir = getTranslationsDirectory();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function deleteDatabaseArtifactsIfExists(path: string): Promise<void> {
  const cleanupPaths = [path, `${path}-journal`, `${path}-shm`, `${path}-wal`];

  try {
    for (const cleanupPath of cleanupPaths) {
      const info = await FileSystem.getInfoAsync(cleanupPath);
      if (info.exists) {
        await FileSystem.deleteAsync(cleanupPath, { idempotent: true });
      }
    }
  } catch {
    // Cleanup failure is non-fatal — best effort
  }
}

async function verifyInstalledTranslationDatabase({
  directory,
  databaseName,
  expectedVerseCount,
}: {
  directory: string;
  databaseName: string;
  expectedVerseCount: number;
}): Promise<void> {
  const database = await SQLite.openDatabaseAsync(
    databaseName,
    {
      finalizeUnusedStatementsBeforeClosing: false,
    },
    directory
  );

  try {
    const tableResult = await database.getFirstAsync<{ present: number }>(
      "SELECT COUNT(*) as present FROM sqlite_master WHERE type = 'table' AND name = 'verses'"
    );

    if ((tableResult?.present ?? 0) === 0) {
      throw new Error('Downloaded translation database is missing the verses table.');
    }

    const countResult = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM verses'
    );

    if ((countResult?.count ?? 0) < expectedVerseCount) {
      throw new Error(
        `Downloaded translation database is incomplete (${countResult?.count ?? 0}/${expectedVerseCount} verses).`
      );
    }
  } finally {
    await database.closeAsync();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the exact Supabase translation_id for a given store ID.
 * The store uses lowercase IDs (e.g. 'sparv1909') but Supabase may store
 * the original case from eBible (e.g. 'spaRV1909'). This looks up the
 * canonical ID from translation_catalog using a case-insensitive match.
 */
async function resolveSupabaseTranslationId(storeId: string): Promise<string> {
  const { data } = await supabase
    .from('translation_catalog')
    .select('translation_id')
    .ilike('translation_id', storeId)
    .limit(1)
    .maybeSingle();
  const catalogTranslationId =
    (data as { translation_id: string } | null)?.translation_id ?? storeId;

  return resolveCloudTextTranslationId(storeId, catalogTranslationId);
}

/**
 * Get the total verse count for a translation from Supabase.
 * Used to show progress and to validate the download.
 */
export async function getCloudTranslationVerseCount(translationId: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const resolvedId = await resolveSupabaseTranslationId(translationId);

  const { count, error } = await supabase
    .from('bible_verses')
    .select('*', { count: 'exact', head: true })
    .eq('translation_id', resolvedId);

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
 * The SQLite file uses the same base verses schema as the bundled bible-bsb-v2.db:
 * - verses(id, translation_id, book_id, chapter, verse, text, heading)
 * - idx_verses_unique ON verses(translation_id, book_id, chapter, verse)
 * - idx_verses_lookup ON verses(translation_id, book_id, chapter)
 *
 * Downloaded translations intentionally omit verses_fts. iOS release builds were
 * crashing inside expo-sqlite native closeDatabase after FTS rebuild on these
 * freshly written databases, so the app surfaces a dedicated "search unavailable"
 * state for installed translations instead of rebuilding FTS on-device.
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

  const finalDbPath = getTranslationDbPath(translationId);
  const stagingDbPath = getStagingTranslationDbPath(translationId);

  try {
    // ── 0. Resolve canonical Supabase ID (handles case mismatches) ─────────
    const supabaseId = await resolveSupabaseTranslationId(translationId);

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
        .eq('translation_id', supabaseId)
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

      if (
        !shouldContinueCloudTranslationFetch({
          totalVerses,
          fetchedVerses: allVerses.length,
          lastPageLength: page.length,
        })
      ) {
        break;
      }
    }

    if (allVerses.length === 0) {
      throw new Error(buildUnavailableCloudTranslationMessage(translationId.toUpperCase()));
    }

    assertCompleteCloudTranslationFetch(translationId.toUpperCase(), totalVerses, allVerses.length);

    // ── 3. Create per-translation SQLite file ─────────────────────────────
    await ensureTranslationsDirectoryExists();
    await deleteDatabaseArtifactsIfExists(stagingDbPath);

    const directory = getTranslationsDirectory();
    const stagingDatabaseName = `${translationId}.staging.db`;

    onProgress?.({
      phase: 'writing',
      versesDownloaded: 0,
      totalVerses: allVerses.length,
    });

    // ── 4. Open the SQLite database ───────────────────────────────────────
    // Expo tracks an iOS AsyncQueue close crash here unless statement auto-finalization is disabled.
    const database = await SQLite.openDatabaseAsync(
      stagingDatabaseName,
      {
        finalizeUnusedStatementsBeforeClosing: false,
      },
      directory
    );

    // Keep staging installs self-contained so activation only needs the main sqlite file.
    await database.execAsync('PRAGMA journal_mode = DELETE');

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

    // Use Expo SQLite's exclusive transaction handle for batched writes on native.
    await database.withExclusiveTransactionAsync(async (txn) => {
      for (let batchStart = 0; batchStart < allVerses.length; batchStart += BATCH_SIZE) {
        const batch = allVerses.slice(batchStart, batchStart + BATCH_SIZE);

        for (const row of batch) {
          await txn.runAsync(
            `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text, heading)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [row.translation_id, row.book_id, row.chapter, row.verse, row.text, row.heading ?? null]
          );
        }

        written += batch.length;
        onProgress?.({
          phase: 'writing',
          versesDownloaded: written,
          totalVerses: allVerses.length,
        });
      }
    });

    // ── 7. Finalize and activate the database ──────────────────────────────
    onProgress?.({
      phase: 'indexing',
      versesDownloaded: allVerses.length,
      totalVerses: allVerses.length,
    });

    // Keep schema version aligned with the bundled bible database contract.
    await database.execAsync('PRAGMA user_version = 3');

    // Closing before activation avoids exposing a partially-written file.
    await database.closeAsync();
    await deleteDatabaseArtifactsIfExists(finalDbPath);
    await FileSystem.moveAsync({ from: stagingDbPath, to: finalDbPath });
    await verifyInstalledTranslationDatabase({
      directory,
      databaseName: `${translationId}.db`,
      expectedVerseCount: allVerses.length,
    });

    onProgress?.({
      phase: 'complete',
      versesDownloaded: allVerses.length,
      totalVerses: allVerses.length,
    });

    return finalDbPath;
  } catch (err) {
    // ── 8. Clean up partial file on error ─────────────────────────────────
    await deleteDatabaseArtifactsIfExists(stagingDbPath);
    await deleteDatabaseArtifactsIfExists(finalDbPath);

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

export async function downloadCatalogTextPack(params: {
  downloadUrl: string;
  expectedVerseCount?: number;
  onProgress?: CloudDownloadProgressCallback;
  translationId: string;
}): Promise<string> {
  const finalDbPath = getTranslationDbPath(params.translationId);
  const stagingDbPath = getStagingTranslationDbPath(params.translationId);
  const expectedVerseCount = Math.max(1, params.expectedVerseCount ?? 1);

  try {
    await ensureTranslationsDirectoryExists();
    await deleteDatabaseArtifactsIfExists(stagingDbPath);

    const resolvedDownloadUrl = resolveBibleAssetUrl(params.downloadUrl);

    if (!resolvedDownloadUrl) {
      throw new Error(
        `No reachable Bible asset URL is configured for ${params.translationId.toUpperCase()}.`
      );
    }

    params.onProgress?.({
      phase: 'fetching',
      versesDownloaded: 0,
      totalVerses: expectedVerseCount,
    });

    await FileSystem.downloadAsync(resolvedDownloadUrl, stagingDbPath);

    params.onProgress?.({
      phase: 'indexing',
      versesDownloaded: expectedVerseCount,
      totalVerses: expectedVerseCount,
    });

    const directory = getTranslationsDirectory();
    await deleteDatabaseArtifactsIfExists(finalDbPath);
    await FileSystem.moveAsync({ from: stagingDbPath, to: finalDbPath });
    await verifyInstalledTranslationDatabase({
      directory,
      databaseName: `${params.translationId}.db`,
      expectedVerseCount,
    });

    params.onProgress?.({
      phase: 'complete',
      versesDownloaded: expectedVerseCount,
      totalVerses: expectedVerseCount,
    });

    return finalDbPath;
  } catch (err) {
    await deleteDatabaseArtifactsIfExists(stagingDbPath);
    await deleteDatabaseArtifactsIfExists(finalDbPath);

    const message = err instanceof Error ? err.message : 'Unknown download error';

    params.onProgress?.({
      phase: 'error',
      versesDownloaded: 0,
      totalVerses: expectedVerseCount,
      error: message,
    });

    throw err;
  }
}
