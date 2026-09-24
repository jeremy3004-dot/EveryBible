import * as SQLite from 'expo-sqlite';

// Downloaded text packs ship without the `verses_fts` index the bundled database has, so word
// search on them had nothing to query. This module builds that index inside the pack file on
// the device, in the background, and records how far it got so an interrupted build resumes
// and an index built for another pack version or index schema is rebuilt.
//
// The index lives in the pack file itself, with the bundled schema, so the existing FTS query
// in bibleDatabase.searchVerses works unchanged and deleting or replacing the pack file deletes
// its index with it. See docs/research/pack-search-index-2026-09-24.md.

/** Bump when the index definition or tokenizer changes; older indexes are then rebuilt. */
export const PACK_SEARCH_INDEX_SCHEMA_VERSION = 1;

// Must stay identical to the bundled database (scripts/build_bible_db.py) and to the optional
// shipped index in scripts/export_translation_text_packs.py. The query side keeps combining
// marks and apostrophes inside a word (buildBibleSearchQuery), which relies on unicode61.
const CREATE_VERSES_FTS_SQL =
  "CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(text, content='verses', content_rowid='id', tokenize='unicode61')";

// One row. completed_at stays NULL until every verse is indexed; last_indexed_id is the resume
// point. The exporter writes the same table when it ships a prebuilt index.
const CREATE_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS search_index_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    index_schema_version INTEGER NOT NULL,
    pack_version TEXT,
    last_indexed_id INTEGER NOT NULL,
    indexed_count INTEGER NOT NULL,
    completed_at TEXT
  )
`;

// Measured on pack-shaped copies of the bundled BSB (31,086 verses) and Nepali (31,102 verses)
// text with node:sqlite on an M-series Mac: a 1,000-verse chunk commits in a median 6-12 ms
// (slowest 86-124 ms, when FTS5 merges segments), the whole pack in 0.4-0.7 s of SQLite work.
// Allow 5-10x on a budget phone. The work runs on the native SQLite queue, not the JS thread;
// small transactions keep the file's write lock short and bound what a failure rolls back.
const PACK_SEARCH_INDEX_CHUNK_SIZE = 1000;
const PAUSE_BETWEEN_CHUNKS_MS = 16;
const FAILED_BUILD_RETRY_MS = 10 * 60 * 1000;

export type PackSearchIndexStatus = 'ready' | 'missing' | 'partial' | 'stale';
export type PackSearchIndexBuildResult = 'ready' | 'cancelled' | 'failed';

type IndexDatabase = Pick<
  SQLite.SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync' | 'withTransactionAsync'
>;

type IndexState = {
  index_schema_version: number;
  pack_version: string | null;
  last_indexed_id: number;
  completed_at: string | null;
};

export async function readPackSearchIndexStatus(
  database: IndexDatabase,
  packVersion: string | undefined
): Promise<PackSearchIndexStatus> {
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('verses_fts', 'search_index_state')"
  );
  const names = new Set(tables.map((table) => table.name));

  if (!names.has('verses_fts')) {
    return names.has('search_index_state') ? 'stale' : 'missing';
  }
  // An index that came inside the file without a marker was built in one step by a build
  // script ('rebuild'), so it is complete. This is how the bundled database ships.
  if (!names.has('search_index_state')) {
    return 'ready';
  }

  const state = await database.getFirstAsync<IndexState>(
    'SELECT index_schema_version, pack_version, last_indexed_id, completed_at FROM search_index_state WHERE id = 1'
  );
  if (!state || state.index_schema_version !== PACK_SEARCH_INDEX_SCHEMA_VERSION) {
    return 'stale';
  }
  if (packVersion && state.pack_version && state.pack_version !== packVersion) {
    return 'stale';
  }
  return state.completed_at ? 'ready' : 'partial';
}

async function dropPackSearchIndex(database: IndexDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync('DROP TABLE IF EXISTS verses_fts');
    await database.execAsync('DROP TABLE IF EXISTS search_index_state');
  });
}

export type BuildPackSearchIndexOptions = {
  packVersion?: string;
  chunkSize?: number;
  pauseBetweenChunks?: () => Promise<void>;
  /** Checked before each chunk. A cancelled build keeps what it committed and resumes later. */
  isCancelled?: () => boolean;
};

const pauseBriefly = () =>
  new Promise<void>((resolve) => setTimeout(resolve, PAUSE_BETWEEN_CHUNKS_MS));

export async function buildPackSearchIndex(
  database: IndexDatabase,
  options: BuildPackSearchIndexOptions = {}
): Promise<PackSearchIndexBuildResult> {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? PACK_SEARCH_INDEX_CHUNK_SIZE));
  const pause = options.pauseBetweenChunks ?? pauseBriefly;
  const isCancelled = options.isCancelled ?? (() => false);

  try {
    const status = await readPackSearchIndexStatus(database, options.packVersion);
    if (status === 'ready') {
      return 'ready';
    }
    if (status === 'stale') {
      await dropPackSearchIndex(database);
    }
    if (status !== 'partial') {
      await database.withTransactionAsync(async () => {
        await database.execAsync(CREATE_VERSES_FTS_SQL);
        await database.execAsync(CREATE_STATE_TABLE_SQL);
        await database.runAsync(
          `INSERT INTO search_index_state
             (id, index_schema_version, pack_version, last_indexed_id, indexed_count, completed_at)
           VALUES (1, ?, ?, 0, 0, NULL)`,
          [PACK_SEARCH_INDEX_SCHEMA_VERSION, options.packVersion ?? null]
        );
      });
    }

    for (;;) {
      if (isCancelled()) {
        return 'cancelled';
      }

      let indexedRows = 0;
      // Each chunk and its resume point commit together, so a kill between chunks loses nothing
      // and a failed chunk (SQLITE_FULL) rolls back whole.
      await database.withTransactionAsync(async () => {
        const state = await database.getFirstAsync<{ last_indexed_id: number }>(
          'SELECT last_indexed_id FROM search_index_state WHERE id = 1'
        );
        const lastIndexedId = state?.last_indexed_id ?? 0;
        const chunkEnd = await database.getFirstAsync<{ id: number | null; count: number }>(
          'SELECT MAX(id) AS id, COUNT(*) AS count FROM (SELECT id FROM verses WHERE id > ? ORDER BY id LIMIT ?)',
          [lastIndexedId, chunkSize]
        );
        indexedRows = chunkEnd?.count ?? 0;

        if (indexedRows === 0 || chunkEnd?.id == null) {
          await database.runAsync(
            "UPDATE search_index_state SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1"
          );
          return;
        }

        await database.runAsync(
          'INSERT INTO verses_fts(rowid, text) SELECT id, text FROM verses WHERE id > ? AND id <= ? ORDER BY id',
          [lastIndexedId, chunkEnd.id]
        );
        await database.runAsync(
          'UPDATE search_index_state SET last_indexed_id = ?, indexed_count = indexed_count + ? WHERE id = 1',
          [chunkEnd.id, indexedRows]
        );
      });

      if (indexedRows === 0) {
        return 'ready';
      }
      await pause();
    }
  } catch (error) {
    console.warn('[Bible] Building the text pack search index failed:', error);
    // Most often the disk is full. Give the space back; search keeps using the substring
    // fallback and a later build starts over.
    try {
      await dropPackSearchIndex(database);
    } catch (dropError) {
      console.warn('[Bible] Removing a partial text pack search index failed:', dropError);
    }
    return 'failed';
  }
}

// ─── Background scheduling ───────────────────────────────────────────────────

export type PackSearchIndexTarget = {
  directory: string;
  databaseName: string;
  packVersion?: string;
};

type ActiveBuild = {
  promise: Promise<PackSearchIndexBuildResult>;
  cancel: () => void;
};

const activeBuilds = new Map<string, ActiveBuild>();
const failedBuildTimes = new Map<string, number>();

function getPackPath(target: Pick<PackSearchIndexTarget, 'directory' | 'databaseName'>) {
  return `${target.directory.replace(/\/+$/, '')}/${target.databaseName}`;
}

async function runBuild(
  target: PackSearchIndexTarget,
  options: Omit<BuildPackSearchIndexOptions, 'packVersion' | 'isCancelled'>,
  isCancelled: () => boolean
): Promise<PackSearchIndexBuildResult> {
  let database: SQLite.SQLiteDatabase | null = null;
  try {
    // A connection of its own: in WAL mode the reader's shared handle keeps serving chapters
    // while this one writes, and closing the reader never lands inside a build transaction.
    database = await SQLite.openDatabaseAsync(
      target.databaseName,
      { finalizeUnusedStatementsBeforeClosing: false, useNewConnection: true },
      target.directory
    );
    await database.execAsync('PRAGMA journal_mode = WAL');
    await database.execAsync('PRAGMA busy_timeout = 5000');
    return await buildPackSearchIndex(database, {
      ...options,
      packVersion: target.packVersion,
      isCancelled,
    });
  } catch (error) {
    console.warn('[Bible] Could not open a text pack to index it:', error);
    return 'failed';
  } finally {
    await database?.closeAsync().catch(() => {});
  }
}

/**
 * Starts building the pack's index in the background, or returns the build already running.
 * Resolves when the build finishes; callers normally do not wait. A build that failed is not
 * retried for ten minutes, so a full disk is not hammered on every search.
 */
export function schedulePackSearchIndexBuild(
  target: PackSearchIndexTarget,
  options: Omit<BuildPackSearchIndexOptions, 'packVersion' | 'isCancelled'> = {}
): Promise<PackSearchIndexBuildResult> {
  const path = getPackPath(target);
  const active = activeBuilds.get(path);
  if (active) {
    return active.promise;
  }

  const failedAt = failedBuildTimes.get(path);
  if (failedAt !== undefined && Date.now() - failedAt < FAILED_BUILD_RETRY_MS) {
    return Promise.resolve('failed');
  }

  let cancelled = false;
  const promise = runBuild(target, options, () => cancelled).then((result) => {
    if (activeBuilds.get(path)?.promise === promise) {
      activeBuilds.delete(path);
    }
    if (result === 'failed') {
      failedBuildTimes.set(path, Date.now());
    } else {
      failedBuildTimes.delete(path);
    }
    return result;
  });
  activeBuilds.set(path, {
    promise,
    cancel: () => {
      cancelled = true;
    },
  });
  return promise;
}

/** Stops any build on this pack and waits for its connection to close. Call before deleting. */
export async function cancelPackSearchIndexBuild(localPath: string): Promise<void> {
  const path = localPath.replace(/\/+$/, '');
  failedBuildTimes.delete(path);
  const active = activeBuilds.get(path);
  if (!active) {
    return;
  }
  active.cancel();
  await active.promise;
}
