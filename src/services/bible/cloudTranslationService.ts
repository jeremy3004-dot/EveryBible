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
import { serializeVerseFormatting } from './verseFormatting';
import { base64UrlToBytes, sha256HexSync } from '../elMedia/elEs256';

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

// Validate staging before this function runs. Keep the old database and its sidecars
// together until activation succeeds so a failed move can restore the installed copy.
async function activateStagedTranslationDatabase(
  stagingDbPath: string,
  finalDbPath: string
): Promise<void> {
  const backupPath = `${finalDbPath}.rollback`;
  const artifacts = ['', '-journal', '-shm', '-wal'].map((suffix) => ({
    installed: `${finalDbPath}${suffix}`,
    backup: `${backupPath}${suffix}`,
  }));
  for (const artifact of artifacts) {
    if ((await FileSystem.getInfoAsync(artifact.backup)).exists) {
      throw new Error(`A previous translation rollback needs recovery: ${backupPath}`);
    }
  }

  const moved: typeof artifacts = [];
  let activationStarted = false;
  try {
    for (const artifact of artifacts) {
      if ((await FileSystem.getInfoAsync(artifact.installed)).exists) {
        await FileSystem.moveAsync({ from: artifact.installed, to: artifact.backup });
        moved.push(artifact);
      }
    }
    activationStarted = true;
    await FileSystem.moveAsync({ from: stagingDbPath, to: finalDbPath });
  } catch (error) {
    try {
      if (activationStarted) {
        // A failed native move may leave a partial destination. The originals are
        // already backed up, so remove only the failed replacement before restoring.
        for (const artifact of artifacts) {
          await FileSystem.deleteAsync(artifact.installed, { idempotent: true });
        }
      }
      for (const artifact of moved.reverse()) {
        await FileSystem.moveAsync({ from: artifact.backup, to: artifact.installed });
      }
    } catch {
      // Do not clean up the backup if restoration itself fails.
      throw new Error(
        `Translation activation and rollback failed; recover the backup at ${backupPath}`
      );
    }
    throw error;
  }
  await deleteDatabaseArtifactsIfExists(backupPath);
}

// Hermes has neither Web Crypto nor atob. Use the same pure-JS primitives as EL
// catalog verification, and fail closed whenever a declared checksum cannot be verified.
async function verifyTextPackSha256({
  fileUri,
  expectedSha256,
}: {
  fileUri: string;
  expectedSha256: string;
}): Promise<void> {
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    throw new Error('Downloaded translation has an invalid expected checksum.');
  }
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64UrlToBytes(base64.replace(/\+/g, '-').replace(/\//g, '_'));
  if (!bytes) {
    throw new Error('Downloaded translation could not be decoded for checksum verification.');
  }
  if (sha256HexSync(bytes) !== expectedSha256.toLowerCase()) {
    throw new Error('Downloaded translation failed integrity verification (checksum mismatch).');
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
 * - verses(id, translation_id, book_id, chapter, verse, text, heading, formatting)
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

    try {
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
          heading TEXT,
          formatting TEXT
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
              `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text, heading, formatting)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                row.translation_id,
                row.book_id,
                row.chapter,
                row.verse,
                row.text,
                row.heading ?? null,
                serializeVerseFormatting(row.formatting),
              ]
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
      await database.execAsync('PRAGMA user_version = 5');
    } finally {
      // Always release the writer, including schema, transaction, and progress failures.
      await database.closeAsync();
    }

    await verifyInstalledTranslationDatabase({
      directory,
      databaseName: stagingDatabaseName,
      expectedVerseCount: allVerses.length,
    });
    await activateStagedTranslationDatabase(stagingDbPath, finalDbPath);

    onProgress?.({
      phase: 'complete',
      versesDownloaded: allVerses.length,
      totalVerses: allVerses.length,
    });

    return finalDbPath;
  } catch (err) {
    // ── 8. Clean up partial file on error ─────────────────────────────────
    await deleteDatabaseArtifactsIfExists(stagingDbPath);

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
  expectedSha256?: string;
  onProgress?: CloudDownloadProgressCallback;
  translationId: string;
}): Promise<string> {
  const finalDbPath = getTranslationDbPath(params.translationId);
  const stagingDbPath = getStagingTranslationDbPath(params.translationId);
  // Prefer the catalog's real verse count when the caller provides one; only fall back to the
  // permissive "≥1 verse" threshold when no expected count is known (M6). Combined with the
  // SHA-256 check below, this stops a stale/partial pack from silently activating.
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

    const download = await FileSystem.downloadAsync(resolvedDownloadUrl, stagingDbPath);
    if (download.status < 200 || download.status >= 300) {
      throw new Error(`Translation download failed with HTTP ${download.status}.`);
    }

    if (params.expectedSha256 !== undefined) {
      await verifyTextPackSha256({
        fileUri: stagingDbPath,
        expectedSha256: params.expectedSha256,
      });
    }

    params.onProgress?.({
      phase: 'indexing',
      versesDownloaded: expectedVerseCount,
      totalVerses: expectedVerseCount,
    });

    const directory = getTranslationsDirectory();
    await verifyInstalledTranslationDatabase({
      directory,
      databaseName: `${params.translationId}.staging.db`,
      expectedVerseCount,
    });
    await activateStagedTranslationDatabase(stagingDbPath, finalDbPath);

    params.onProgress?.({
      phase: 'complete',
      versesDownloaded: expectedVerseCount,
      totalVerses: expectedVerseCount,
    });

    return finalDbPath;
  } catch (err) {
    await deleteDatabaseArtifactsIfExists(stagingDbPath);

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
