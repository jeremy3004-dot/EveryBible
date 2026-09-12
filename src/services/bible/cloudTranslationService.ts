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
import { assertSafeAssetId } from './assetIdentifiers';
import { resolveBibleAssetUrl } from './bibleAssetBaseUrl';
import { serializeVerseFormatting } from './verseFormatting';
import { base64UrlToBytes } from '../elMedia/elEs256';
import { sha256 } from '@noble/hashes/sha2.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudDownloadProgress {
  phase: 'fetching' | 'writing' | 'indexing' | 'complete' | 'error';
  versesDownloaded: number;
  totalVerses: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  error?: string;
}

export type CloudDownloadProgressCallback = (progress: CloudDownloadProgress) => void;

export class TextPackDownloadCancelledError extends Error {
  constructor() {
    super('Text pack download was cancelled.');
    this.name = 'TextPackDownloadCancelledError';
  }
}

type CatalogTextDownloadOperation = {
  translationId: string;
  cancelled: boolean;
  phase: 'transferring' | 'verifying' | 'activating';
  cancelNative: (() => Promise<void>) | null;
};

const activeCatalogTextDownloads = new Map<string, CatalogTextDownloadOperation>();
const activeCatalogTextDownloadSettlements = new Map<string, Promise<unknown>>();

/** Cancel the active catalog text transfer, if one exists. The transport may settle later. */
export function cancelActiveCatalogTextPackDownload(translationId?: string): boolean {
  const activeOperations = translationId
    ? [activeCatalogTextDownloads.get(translationId)]
    : Array.from(activeCatalogTextDownloads.values());
  let accepted = false;
  for (const active of activeOperations) {
    if (!active || active.phase === 'activating') continue;
    active.cancelled = true;
    accepted = true;
    void active.cancelNative?.().catch(() => {});
  }
  return accepted;
}

export function waitForActiveCatalogTextPackDownload(translationId: string): Promise<void> {
  return activeCatalogTextDownloadSettlements.get(translationId)?.then(
    () => undefined,
    () => undefined
  ) ?? Promise.resolve();
}

export function isTextPackDownloadCancelled(error: unknown): boolean {
  return error instanceof TextPackDownloadCancelledError;
}

async function yieldToRuntime(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Directory where per-translation SQLite files are stored.
 * Guaranteed to end without a trailing slash.
 */
function getTranslationsDirectory(): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base.replace(/\/$/, '')}/translations`;
}

// Translation ids come from a remote catalog, so they are validated before they are
// interpolated into a path — `../…` would otherwise escape the translations directory and
// point the move/delete calls below at arbitrary files. The catalog parsers already drop
// unsafe ids; this is the second gate so no other caller can slip one past them.
function getTranslationDbPath(translationId: string): string {
  return `${getTranslationsDirectory()}/${assertSafeAssetId(translationId, 'translation id')}.db`;
}

function getStagingTranslationDbPath(translationId: string): string {
  return `${getTranslationsDirectory()}/${assertSafeAssetId(
    translationId,
    'translation id'
  )}.staging.db`;
}

export function getCatalogTextPackPaths(translationId: string, operationId?: string): {
  finalPath: string;
  stagingPath: string;
  rollbackPath: string;
} {
  const safeOperationId = operationId?.replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalPath = safeOperationId
    ? `${getTranslationsDirectory()}/${assertSafeAssetId(
        `${translationId}.${safeOperationId}`,
        'translation operation id'
      )}.db`
    : getTranslationDbPath(translationId);
  return {
    finalPath,
    stagingPath: safeOperationId
      ? `${getTranslationsDirectory()}/${assertSafeAssetId(
          `${translationId}.${safeOperationId}`,
          'translation operation id'
        )}.staging.db`
      : getStagingTranslationDbPath(translationId),
    rollbackPath: `${finalPath}.rollback`,
  };
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

  for (const cleanupPath of cleanupPaths) {
    const info = await FileSystem.getInfoAsync(cleanupPath);
    if (info.exists) {
      await FileSystem.deleteAsync(cleanupPath, { idempotent: true });
    }
  }
}

export async function deleteCatalogTextPackArtifacts(path: string): Promise<void> {
  await deleteDatabaseArtifactsIfExists(path);
}

export async function recoverInterruptedCatalogTextPack(paths: {
  finalPath: string;
  stagingPath: string;
  rollbackPath: string;
}): Promise<'current' | 'current-without-rollback' | 'previous' | 'none'> {
  const suffixes = ['', '-journal', '-shm', '-wal'];
  const state = await Promise.all(
    suffixes.map(async (suffix) => ({
      suffix,
      final: (await FileSystem.getInfoAsync(`${paths.finalPath}${suffix}`)).exists,
      rollback: (await FileSystem.getInfoAsync(`${paths.rollbackPath}${suffix}`)).exists,
      staging: (await FileSystem.getInfoAsync(`${paths.stagingPath}${suffix}`)).exists,
    }))
  );

  const finalMain = state[0]?.final ?? false;
  const rollbackMain = state[0]?.rollback ?? false;
  const stagingMain = state[0]?.staging ?? false;
  let result: 'current' | 'current-without-rollback' | 'previous' | 'none' = finalMain
    ? 'current-without-rollback'
    : 'none';

  if (rollbackMain && !finalMain) {
    // Activation moves the main database before its sidecars. If a process died in that
    // interval, the final-path sidecars still belong to the rollback database and must be
    // reunited with it before validation. If both generations have a sidecar, preserve the
    // ambiguous bytes in quarantine instead of attaching them to the wrong main file.
    for (const suffix of ['-journal', '-shm', '-wal']) {
      const finalSidecar = `${paths.finalPath}${suffix}`;
      const rollbackSidecar = `${paths.rollbackPath}${suffix}`;
      const [finalInfo, rollbackInfo] = await Promise.all([
        FileSystem.getInfoAsync(finalSidecar),
        FileSystem.getInfoAsync(rollbackSidecar),
      ]);
      if (finalInfo.exists && !rollbackInfo.exists) {
        await FileSystem.moveAsync({ from: finalSidecar, to: rollbackSidecar });
      } else if (finalInfo.exists) {
        const quarantinePath = `${paths.finalPath}.recovery-orphan-${Date.now()}${suffix}`;
        await FileSystem.moveAsync({ from: finalSidecar, to: quarantinePath });
      }
    }
    await validateCatalogTextPack(paths.rollbackPath);
    // Move sidecars first and the main database last. A kill during recovery therefore leaves
    // the rollback main file as the unambiguous source for the next run.
    for (const suffix of ['-journal', '-shm', '-wal', '']) {
      if ((await FileSystem.getInfoAsync(`${paths.rollbackPath}${suffix}`)).exists) {
        await FileSystem.moveAsync({
          from: `${paths.rollbackPath}${suffix}`,
          to: `${paths.finalPath}${suffix}`,
        });
      }
    }
    result = 'previous';
  } else if (finalMain && rollbackMain) {
    // The replacement won and only cleanup was interrupted. Keep the old generation until the
    // coordinator has validated the candidate and completed a registered-source readback.
    await validateCatalogTextPack(paths.finalPath);
    result = 'current';
  } else if (state.some((artifact) => artifact.rollback) && !rollbackMain) {
    // A previous recovery may have moved the rollback main file before a process kill. Keep
    // orphaned sidecars attributable for the next recovery instead of attaching or deleting them.
  }

  if (stagingMain || state.some((artifact) => artifact.staging)) {
    try {
      await deleteDatabaseArtifactsIfExists(paths.stagingPath);
    } catch {
      // The install journal remains durable when staging cleanup is interrupted.
    }
  }
  return result;
}

export interface CatalogTextPackRepresentative {
  translationId: string;
  bookId: string;
  chapter: number;
}

export async function validateCatalogTextPack(
  finalPath: string,
  expectedVerseCount = 1,
  expectedSha256?: string,
  expectedTranslationId?: string
): Promise<CatalogTextPackRepresentative> {
  if (expectedSha256) {
    await verifyTextPackSha256({ fileUri: finalPath, expectedSha256 });
  }
  const separator = finalPath.lastIndexOf('/');
  const directory = separator >= 0 ? finalPath.slice(0, separator) : undefined;
  const databaseName = separator >= 0 ? finalPath.slice(separator + 1) : finalPath;
  return verifyInstalledTranslationDatabase({
    directory: directory ?? '',
    databaseName,
    expectedVerseCount: Math.max(1, expectedVerseCount),
    expectedTranslationId,
  });
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
  try {
    await deleteDatabaseArtifactsIfExists(backupPath);
  } catch {
    // A successful activation remains usable if rollback cleanup is interrupted. Keep the
    // backup so the journal/recovery pass can retire it after the active registration settles.
  }
}

// Hermes has neither Web Crypto nor atob. Use the same pure-JS primitives as EL
// catalog verification, and fail closed whenever a declared checksum cannot be verified.
async function verifyTextPackSha256({
  fileUri,
  expectedSha256,
  isCancelled,
}: {
  fileUri: string;
  expectedSha256: string;
  isCancelled?: () => boolean;
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
  if (isCancelled?.()) {
    throw new TextPackDownloadCancelledError();
  }
  // Hashing is pure JavaScript on Hermes. Feed bounded chunks with a runtime yield between them
  // so a cancellation tap can be observed without retaining a second full-file copy.
  const hasher = sha256.create();
  const chunkSize = 256 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    if (isCancelled?.()) {
      throw new TextPackDownloadCancelledError();
    }
    hasher.update(bytes.subarray(offset, offset + chunkSize));
    await yieldToRuntime();
  }
  const digest = Array.from(hasher.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== expectedSha256.toLowerCase()) {
    throw new Error('Downloaded translation failed integrity verification (checksum mismatch).');
  }
  if (isCancelled?.()) {
    throw new TextPackDownloadCancelledError();
  }
}

async function verifyInstalledTranslationDatabase({
  directory,
  databaseName,
  expectedVerseCount,
  expectedTranslationId,
}: {
  directory: string;
  databaseName: string;
  expectedVerseCount: number;
  expectedTranslationId?: string;
}): Promise<CatalogTextPackRepresentative> {
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

    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(verses)');
    const requiredColumns = ['translation_id', 'book_id', 'chapter', 'verse', 'text'];
    if (!requiredColumns.every((column) => columns.some((item) => item.name === column))) {
      throw new Error('Downloaded translation database has an incompatible verses schema.');
    }

    const countResult = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM verses'
    );

    if ((countResult?.count ?? 0) < expectedVerseCount) {
      throw new Error(
        `Downloaded translation database is incomplete (${countResult?.count ?? 0}/${expectedVerseCount} verses).`
      );
    }

    const representative = await database.getFirstAsync<{
      translation_id: string;
      book_id: string;
      chapter: number;
      text: string;
    }>('SELECT translation_id, book_id, chapter, text FROM verses ORDER BY rowid LIMIT 1');
    if (!representative || !representative.text.trim()) {
      throw new Error('Downloaded translation database has no readable verse.');
    }
    if (
      expectedTranslationId &&
      representative.translation_id.toLowerCase() !== expectedTranslationId.toLowerCase()
    ) {
      throw new Error('Downloaded translation database has the wrong translation identity.');
    }
    return {
      translationId: representative.translation_id,
      bookId: representative.book_id,
      chapter: representative.chapter,
    };
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
      expectedTranslationId: translationId,
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
    try {
      await deleteDatabaseArtifactsIfExists(stagingDbPath);
    } catch {
      // Leave the journal/rollback evidence for the next recovery pass.
    }

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

async function downloadCatalogTextPackImpl(params: {
  downloadUrl: string;
  expectedVerseCount?: number;
  expectedSha256?: string;
  onProgress?: CloudDownloadProgressCallback;
  operationId?: string;
  onPhase?: (phase: 'verifying' | 'activating') => void;
  translationId: string;
}): Promise<string> {
  const packPaths = getCatalogTextPackPaths(params.translationId, params.operationId);
  const finalDbPath = packPaths.finalPath;
  const stagingDbPath = packPaths.stagingPath;
  // Prefer the catalog's real verse count when the caller provides one; only fall back to the
  // permissive "≥1 verse" threshold when no expected count is known (M6). Combined with the
  // SHA-256 check below, this stops a stale/partial pack from silently activating.
  const expectedVerseCount = Math.max(1, params.expectedVerseCount ?? 1);
  const progressTotalVerses = params.expectedVerseCount ?? 0;
  if (activeCatalogTextDownloads.has(params.translationId)) {
    throw new Error(`A text pack download is already in progress for ${params.translationId}.`);
  }
  const operation: CatalogTextDownloadOperation = {
    translationId: params.translationId,
    cancelled: false,
    phase: 'transferring',
    cancelNative: null,
  };
  activeCatalogTextDownloads.set(params.translationId, operation);
  const reportProgress: CloudDownloadProgressCallback = (progress) => {
    if (!operation.cancelled) {
      params.onProgress?.(progress);
    }
  };

  try {
    await ensureTranslationsDirectoryExists();
    await deleteDatabaseArtifactsIfExists(stagingDbPath);

    const resolvedDownloadUrl = resolveBibleAssetUrl(params.downloadUrl);

    if (!resolvedDownloadUrl) {
      throw new Error(
        `No reachable Bible asset URL is configured for ${params.translationId.toUpperCase()}.`
      );
    }

    reportProgress({
      phase: 'fetching',
      versesDownloaded: 0,
      totalVerses: progressTotalVerses,
    });

    type DownloadResult = { uri: string; status: number };
    type DownloadTask = {
      downloadAsync: () => Promise<DownloadResult | undefined>;
      cancelAsync?: () => Promise<void>;
    };
    type DownloadFactory = (
      url: string,
      fileUri: string,
      options: Record<string, never>,
      callback: (progress: {
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void
    ) => DownloadTask;

    const resumableFactory = (FileSystem as typeof FileSystem & {
      createDownloadResumable?: DownloadFactory;
    }).createDownloadResumable;
    const download = resumableFactory
      ? await (async () => {
          const task = resumableFactory(
            resolvedDownloadUrl,
            stagingDbPath,
            {},
            ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
              reportProgress({
                phase: 'fetching',
                versesDownloaded: 0,
                totalVerses: progressTotalVerses,
                bytesDownloaded: totalBytesWritten,
                bytesTotal:
                  totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : undefined,
              });
            }
          );
          operation.cancelNative = async () => {
            await task.cancelAsync?.();
          };
          const result = await task.downloadAsync();
          if (!result || operation.cancelled) {
            throw new TextPackDownloadCancelledError();
          }
          return result;
        })()
      : await FileSystem.downloadAsync(resolvedDownloadUrl, stagingDbPath);

    if (operation.cancelled) {
      throw new TextPackDownloadCancelledError();
    }
    if (download.status < 200 || download.status >= 300) {
      throw new Error(`Translation download failed with HTTP ${download.status}.`);
    }

    operation.phase = 'verifying';
    params.onPhase?.('verifying');
    if (params.expectedSha256 !== undefined) {
      await verifyTextPackSha256({
        fileUri: stagingDbPath,
        expectedSha256: params.expectedSha256,
        isCancelled: () => operation.cancelled,
      });
    }

    if (operation.cancelled) {
      throw new TextPackDownloadCancelledError();
    }

    reportProgress({
      phase: 'indexing',
      versesDownloaded: progressTotalVerses,
      totalVerses: progressTotalVerses,
    });

    const directory = getTranslationsDirectory();
    await verifyInstalledTranslationDatabase({
      directory,
      databaseName: stagingDbPath.slice(stagingDbPath.lastIndexOf('/') + 1),
      expectedVerseCount,
      expectedTranslationId: params.operationId ? params.translationId : undefined,
    });
    if (operation.cancelled) {
      throw new TextPackDownloadCancelledError();
    }
    operation.phase = 'activating';
    params.onPhase?.('activating');
    await activateStagedTranslationDatabase(stagingDbPath, finalDbPath);

    reportProgress({
      phase: 'complete',
      versesDownloaded: progressTotalVerses,
      totalVerses: progressTotalVerses,
    });

    return finalDbPath;
  } catch (err) {
    try {
      await deleteDatabaseArtifactsIfExists(stagingDbPath);
    } catch {
      // Leave the journal/rollback evidence for the next recovery pass.
    }

    if (operation.cancelled) {
      throw new TextPackDownloadCancelledError();
    }

    const message = err instanceof Error ? err.message : 'Unknown download error';

    if (!(err instanceof TextPackDownloadCancelledError)) {
      reportProgress({
        phase: 'error',
        versesDownloaded: 0,
        totalVerses: progressTotalVerses,
        error: message,
      });
    }

    throw err;
  } finally {
    if (activeCatalogTextDownloads.get(params.translationId) === operation) {
      activeCatalogTextDownloads.delete(params.translationId);
    }
  }
}

export function downloadCatalogTextPack(params: {
  downloadUrl: string;
  expectedVerseCount?: number;
  expectedSha256?: string;
  onProgress?: CloudDownloadProgressCallback;
  operationId?: string;
  onPhase?: (phase: 'verifying' | 'activating') => void;
  translationId: string;
}): Promise<string> {
  const promise = downloadCatalogTextPackImpl(params);
  activeCatalogTextDownloadSettlements.set(params.translationId, promise);
  void promise.then(
    () => {
      if (activeCatalogTextDownloadSettlements.get(params.translationId) === promise) {
        activeCatalogTextDownloadSettlements.delete(params.translationId);
      }
    },
    () => {
      if (activeCatalogTextDownloadSettlements.get(params.translationId) === promise) {
        activeCatalogTextDownloadSettlements.delete(params.translationId);
      }
    }
  );
  return promise;
}
