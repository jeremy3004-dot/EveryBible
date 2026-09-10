/**
 * Behavioural tests for the Bible SQLite access layer.
 *
 * `expo-sqlite` is replaced with a fake whose `openDatabaseAsync` returns an adapter over a
 * real `node:sqlite` `DatabaseSync`, so every statement this module issues (schema probes,
 * PRAGMAs, FTS5 MATCH queries, transactions) actually executes against a real SQLite file in a
 * temp directory. `importDatabaseFromAssetAsync` copies a seed file the same way the native
 * implementation copies the bundled asset, which is what makes the upgrade gate (CLAUDE.md
 * rule 11) testable: the seed is the "new build", the file already on disk is the "existing
 * install".
 *
 * Tests in this file share module state (the bundled singleton, the installed-handle cache and
 * the search-index cache), so they run in a deliberate order and use `resetBundledDatabase()`
 * between groups.
 */
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../../testing/mockModules';
import type { Verse } from '../../types';

// ─── Temp filesystem ──────────────────────────────────────────────────────────

const root = mkdtempSync(`${tmpdir()}/everybible-bibledb-`);
const sqliteDirectory = `${root}/SQLite`;
const installedDirectory = `${root}/translations`;
mkdirSync(sqliteDirectory, { recursive: true });
mkdirSync(installedDirectory, { recursive: true });

const BUNDLED_DATABASE_NAME = 'bible-bsb-v2.db';
const bundledDatabasePath = `${sqliteDirectory}/${BUNDLED_DATABASE_NAME}`;
const assetSeedPath = `${root}/asset-seed.db`;

after(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── Seed data ────────────────────────────────────────────────────────────────

interface SeedVerse {
  translationId: string;
  bookId: string;
  chapter: number;
  verse: number;
  text: string;
  heading?: string;
  formatting?: string;
}

const JOHN_1_1_TEXT =
  'In the beginning was the Word, and the Word was with God, and the Word was God.';

const SEED_VERSES: SeedVerse[] = [
  {
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    verse: 1,
    text: 'In the beginning God created the heavens and the earth.',
    heading: 'The Creation',
  },
  {
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    verse: 2,
    text: 'Now the earth was formless and void, and darkness was over the surface of the deep.',
  },
  {
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    verse: 3,
    text: 'And God said, "Let there be light," and there was light.',
  },
  {
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 1,
    verse: 1,
    text: JOHN_1_1_TEXT,
    formatting: JSON.stringify({
      mode: 'poetry',
      lines: [{ text: 'In the beginning was the Word,', indentLevel: 1 }],
    }),
  },
  {
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world that He gave His one and only Son.',
  },
  {
    translationId: 'asv',
    bookId: 'GEN',
    chapter: 1,
    verse: 1,
    text: 'In the beginning God created the heaven and the earth.',
  },
  {
    translationId: 'asv',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world, that he gave his only begotten Son.',
  },
];

const READY_VERSE_COUNT = SEED_VERSES.length;

interface SeedOptions {
  verses?: SeedVerse[];
  schemaVersion?: number;
  searchIndex?: boolean;
  /** Extra filler rows, used only to grow the file past the pages a corruption test rewrites. */
  padRows?: number;
}

function writeSeedDatabase(path: string, options: SeedOptions = {}): void {
  rmSync(path, { force: true });
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = DELETE');
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      translation_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      heading TEXT,
      formatting TEXT,
      UNIQUE(translation_id, book_id, chapter, verse)
    );
    CREATE INDEX idx_verses_translation_book_chapter
      ON verses(translation_id, book_id, chapter, verse);
  `);
  if (options.searchIndex !== false) {
    database.exec(
      "CREATE VIRTUAL TABLE verses_fts USING fts5(text, content='verses', content_rowid='id', tokenize='unicode61')"
    );
  }

  const insert = database.prepare(
    `INSERT INTO verses (translation_id, book_id, chapter, verse, text, heading, formatting)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const verse of options.verses ?? SEED_VERSES) {
    insert.run(
      verse.translationId,
      verse.bookId,
      verse.chapter,
      verse.verse,
      verse.text,
      verse.heading ?? null,
      verse.formatting ?? null
    );
  }
  for (let index = 0; index < (options.padRows ?? 0); index += 1) {
    insert.run(
      'pad',
      'PAD',
      1,
      index + 1,
      `Padding verse ${index} with enough text to fill pages.`,
      null,
      null
    );
  }

  if (options.searchIndex !== false) {
    database.exec("INSERT INTO verses_fts(verses_fts) VALUES ('rebuild')");
  }
  database.exec(`PRAGMA user_version = ${options.schemaVersion ?? 7}`);
  database.close();
}

/** Rewrite the second and third pages so `PRAGMA quick_check` reports a corrupt b-tree. */
function corruptDatabaseFile(path: string): void {
  const bytes = readFileSync(path);
  assert.ok(bytes.length > 8192, 'the corruption fixture needs a database of at least three pages');
  bytes.fill(0xff, 4096, 8192);
  writeFileSync(path, bytes);
}

writeSeedDatabase(assetSeedPath);

// ─── expo-sqlite fake over node:sqlite ────────────────────────────────────────

interface RecordedQuery {
  path: string;
  sql: string;
  params: unknown[];
}

type SqlParam = string | number | bigint | null | Uint8Array;

const opens: Array<{ name: string; directory: string; path: string; options: unknown }> = [];
const closes: string[] = [];
const assetImports: Array<{ databaseName: string; assetId: unknown; forceOverwrite: boolean }> = [];
const queries: RecordedQuery[] = [];
/** Imports, opens, closes and file deletions in the order they happened. */
const events: string[] = [];

function resetRecorders(): void {
  opens.length = 0;
  closes.length = 0;
  assetImports.length = 0;
  queries.length = 0;
  events.length = 0;
}

const toParams = (params: unknown[] | undefined): SqlParam[] => (params ?? []) as SqlParam[];

function createDatabaseAdapter(path: string) {
  const handle = new DatabaseSync(path);
  let closed = false;

  const statements = {
    async execAsync(sql: string): Promise<void> {
      queries.push({ path, sql, params: [] });
      handle.exec(sql);
    },
    async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
      queries.push({ path, sql, params: params ?? [] });
      return (handle.prepare(sql).get(...toParams(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
      queries.push({ path, sql, params: params ?? [] });
      return handle.prepare(sql).all(...toParams(params)) as T[];
    },
    async runAsync(sql: string, params?: unknown[]) {
      queries.push({ path, sql, params: params ?? [] });
      const result = handle.prepare(sql).run(...toParams(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };

  const runTransaction = async (begin: string, callback: (txn: unknown) => Promise<unknown>) => {
    handle.exec(begin);
    try {
      await callback(statements);
      handle.exec('COMMIT');
    } catch (error) {
      handle.exec('ROLLBACK');
      throw error;
    }
  };

  return {
    ...statements,
    async withTransactionAsync(callback: () => Promise<unknown>) {
      await runTransaction('BEGIN', callback);
    },
    async withExclusiveTransactionAsync(callback: (txn: unknown) => Promise<unknown>) {
      await runTransaction('BEGIN IMMEDIATE', callback);
    },
    async closeAsync() {
      closes.push(path);
      events.push(`close:${path}`);
      if (!closed) {
        closed = true;
        handle.close();
      }
    },
  };
}

const assetModulePath = fileURLToPath(
  new URL('../../../assets/databases/bible-bsb-v2.db', import.meta.url).href
);
// The module resolves the bundled asset with a bundler `require()` of the .db file, which Node
// cannot compile. Mocking that specifier makes the module loadable without touching production
// code; the value is opaque and only ever handed back to importDatabaseFromAssetAsync.
mockModule(mock, assetModulePath, { __bundledBibleAsset: true });

mockModule(mock, 'expo-sqlite', {
  defaultDatabaseDirectory: sqliteDirectory,
  openDatabaseAsync: async (name: string, options: unknown, directory?: string) => {
    const resolvedDirectory = directory ?? sqliteDirectory;
    mkdirSync(resolvedDirectory, { recursive: true });
    const path = `${resolvedDirectory}/${name}`;
    opens.push({ name, directory: resolvedDirectory, path, options });
    events.push(`open:${path}`);
    return createDatabaseAdapter(path);
  },
  importDatabaseFromAssetAsync: async (
    databaseName: string,
    { assetId, forceOverwrite }: { assetId: unknown; forceOverwrite?: boolean }
  ) => {
    assetImports.push({ databaseName, assetId, forceOverwrite: Boolean(forceOverwrite) });
    events.push(`import:${databaseName}:${forceOverwrite ? 'force' : 'keep'}`);
    const target = `${sqliteDirectory}/${databaseName}`;
    if (!forceOverwrite && existsSync(target)) {
      return;
    }
    copyFileSync(assetSeedPath, target);
  },
});

const fileSystemCalls: Array<{ method: string; path: string }> = [];
const fileSystemFaults = { deleteAsync: false };
mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: `${root}/documents/`,
  getInfoAsync: async (path: string) => {
    fileSystemCalls.push({ method: 'getInfoAsync', path });
    if (!existsSync(path)) {
      return { exists: false, uri: path };
    }
    const stats = statSync(path);
    return { exists: true, uri: path, size: stats.size, isDirectory: stats.isDirectory() };
  },
  deleteAsync: async (path: string) => {
    fileSystemCalls.push({ method: 'deleteAsync', path });
    events.push(`delete:${path}`);
    if (fileSystemFaults.deleteAsync) {
      throw new Error('deleteAsync is unavailable');
    }
    rmSync(path, { force: true, recursive: true });
  },
});

// ─── Module under test ────────────────────────────────────────────────────────

type BibleDatabaseModule = typeof import('./bibleDatabase');
let bibleDatabase: BibleDatabaseModule;

const loadModule = async (): Promise<BibleDatabaseModule> => {
  bibleDatabase ??= await import('./bibleDatabase');
  return bibleDatabase;
};

/**
 * Force the module's bundled singleton back to null and the file on disk back to the pristine
 * asset. An impossible readiness threshold makes recovery fail, which is the module's own
 * "drop the broken handle" path, so no private state is touched.
 */
async function resetBundledDatabase(): Promise<void> {
  const { initDatabase } = await loadModule();
  await assert.rejects(initDatabase(Number.MAX_SAFE_INTEGER));
  resetRecorders();
  fileSystemCalls.length = 0;
}

const installedSource = (translationId: string, databaseName: string) => ({
  kind: 'installed' as const,
  translationId,
  databaseName,
  directory: installedDirectory,
});

// ─── Bundled import + upgrade gate ────────────────────────────────────────────

test('initDatabase imports the bundled asset on first launch and reports what it contains', async () => {
  const { initDatabase } = await loadModule();
  resetRecorders();

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.equal(status.schemaVersion, 7);
  assert.equal(status.hasSearchIndex, true);
  assert.equal(status.formattedVerseCount, 1);
  assert.deepEqual(
    events,
    [`import:${BUNDLED_DATABASE_NAME}:keep`, `open:${bundledDatabasePath}`],
    'a first launch copies the asset once and opens it, without the forced-overwrite recovery path'
  );
  assert.equal(existsSync(bundledDatabasePath), true);
});

test('the status returned by initDatabase reports readiness against the shipped threshold', async () => {
  const { initDatabase, DEFAULT_MINIMUM_READY_VERSE_COUNT } = await loadModule();

  // Documents current behaviour: inspectOpenDatabase always computes `ready` from
  // DEFAULT_MINIMUM_READY_VERSE_COUNT, so a caller-supplied (lower) threshold decides whether
  // the database is reloaded but is not reflected in the returned flag. See report QUESTION 1.
  const status = await initDatabase(READY_VERSE_COUNT);

  assert.ok(READY_VERSE_COUNT < DEFAULT_MINIMUM_READY_VERSE_COUNT);
  assert.equal(status.ready, false);
});

test('the bundled open applies the performance PRAGMAs and the formatted-verse index', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  await initDatabase(READY_VERSE_COUNT);

  const executed = queries
    .filter((entry) => entry.path === bundledDatabasePath)
    .map((entry) => entry.sql.trim());
  assert.ok(executed.includes('PRAGMA journal_mode = WAL'));
  assert.ok(executed.includes('PRAGMA cache_size = -4096'));
  assert.ok(executed.includes('PRAGMA temp_store = MEMORY'));
  assert.ok(
    executed.some((sql) => sql.startsWith('CREATE INDEX IF NOT EXISTS idx_verses_formatted')),
    'the partial index that keeps the formatted-verse count cheap is created at open time'
  );
});

test('initDatabase reuses an already-open ready database instead of re-importing the asset', async () => {
  const { initDatabase } = await loadModule();
  resetRecorders();

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(assetImports, [], 'a healthy open handle must not trigger another asset copy');
  assert.deepEqual(opens, [], 'a healthy open handle must not be reopened');
});

test('initDatabase re-imports the asset when the installed copy has an older schema version', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  // The exact regression from CLAUDE.md rule 11: an existing install whose user_version is
  // below BUNDLED_BIBLE_SCHEMA_VERSION must be replaced, not silently kept.
  writeSeedDatabase(bundledDatabasePath, { schemaVersion: 6 });

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.schemaVersion, 7);
  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true],
    'the non-forced import leaves the stale file alone, so recovery must force the overwrite'
  );
});

test('initDatabase re-imports the asset when the installed copy holds too few verses', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, { verses: SEED_VERSES.slice(0, 2) });

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
});

test('initDatabase re-imports the asset when the installed copy has no verse formatting', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, {
    verses: SEED_VERSES.map(({ formatting: _formatting, ...verse }) => verse),
  });

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.formattedVerseCount, 1);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true],
    'a schema- and count-matching copy without formatting data is still stale'
  );
});

test('initDatabase re-imports the asset when the installed copy has no search index', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, { searchIndex: false });

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.hasSearchIndex, true);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
});

test('a forced re-import deletes the stale WAL and SHM sidecars before copying', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, { schemaVersion: 1 });
  writeFileSync(`${bundledDatabasePath}-wal`, 'stale wal frames');
  writeFileSync(`${bundledDatabasePath}-shm`, 'stale shm');

  await initDatabase(READY_VERSE_COUNT);

  const deletions = fileSystemCalls
    .filter((call) => call.method === 'deleteAsync')
    .map((call) => call.path);
  assert.deepEqual(deletions.sort(), [`${bundledDatabasePath}-shm`, `${bundledDatabasePath}-wal`]);
  assert.ok(
    events.indexOf(`delete:${bundledDatabasePath}-wal`) <
      events.indexOf(`import:${BUNDLED_DATABASE_NAME}:force`),
    'stale journal files must be gone before the fresh copy lands, or WAL frames replay onto it'
  );
  assert.equal(
    readFileSync(`${bundledDatabasePath}-wal`, 'utf8').includes('stale wal frames'),
    false,
    'the sidecar left behind belongs to the fresh database, not the replaced one'
  );
});

test('a journal cleanup that fails does not stop the forced re-import', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, { schemaVersion: 1 });
  fileSystemFaults.deleteAsync = true;

  try {
    const status = await initDatabase(READY_VERSE_COUNT);
    assert.equal(
      status.schemaVersion,
      7,
      'recovery must proceed even when the sidecars cannot be removed'
    );
  } finally {
    fileSystemFaults.deleteAsync = false;
  }
});

test('initDatabase recovers from a copy that fails its integrity check', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, { padRows: 400 });
  corruptDatabaseFile(bundledDatabasePath);

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(
    status.verseCount,
    READY_VERSE_COUNT,
    'the padded corrupt copy was replaced by the asset'
  );
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
  assert.ok(
    closes.includes(bundledDatabasePath),
    'the handle that failed the integrity check must be closed, never kept as the singleton'
  );
});

test('initDatabase recovers when the file on disk is not a database at all', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeFileSync(bundledDatabasePath, 'this is not a SQLite file');

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
});

test('initDatabase rejects and drops the singleton when even a forced re-import is not ready', async () => {
  const { initDatabase, inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();

  await assert.rejects(
    () => initDatabase(READY_VERSE_COUNT + 1),
    /not ready after recovery \(7 verses\)/
  );

  resetRecorders();
  await inspectBundledDatabaseStatus(READY_VERSE_COUNT);
  assert.equal(
    opens.length,
    1,
    'the rejected initialization must leave no shared handle behind, so the next caller reopens'
  );
});

test('concurrent cold-start initializations share a single asset import', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  rmSync(bundledDatabasePath, { force: true });

  const [first, second] = await Promise.all([
    initDatabase(READY_VERSE_COUNT),
    initDatabase(READY_VERSE_COUNT),
  ]);

  assert.equal(first.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(first, second);
  assert.equal(
    assetImports.length,
    1,
    'the single-flight guard must collapse both cold starts into one import'
  );
  assert.equal(opens.length, 1);
});

// ─── Status inspection ────────────────────────────────────────────────────────

test('inspectBundledDatabaseStatus adopts a ready database as the shared handle', async () => {
  const { inspectBundledDatabaseStatus, getDatabase } = await loadModule();
  await resetBundledDatabase();

  const status = await inspectBundledDatabaseStatus(READY_VERSE_COUNT);

  assert.equal(status.ready, true);
  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(closes, [], 'an adopted handle must stay open');
  const openCount = opens.length;
  await getDatabase('bsb');
  assert.equal(opens.length, openCount, 'the adopted handle is reused by later callers');
});

test('inspectBundledDatabaseStatus closes its probe handle when the database is not ready', async () => {
  const { inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();

  const status = await inspectBundledDatabaseStatus(READY_VERSE_COUNT + 1);

  assert.equal(status.ready, false);
  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    closes,
    [bundledDatabasePath],
    'a probe that adopts nothing must not leak the handle'
  );
});

test('inspectBundledDatabaseStatus reports an empty status when the database cannot be read', async () => {
  const { inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();
  writeFileSync(bundledDatabasePath, 'not a database');

  const status = await inspectBundledDatabaseStatus(READY_VERSE_COUNT);

  assert.deepEqual(status, {
    verseCount: 0,
    schemaVersion: 0,
    hasSearchIndex: false,
    formattedVerseCount: 0,
    ready: false,
  });
});

test('inspectBundledDatabaseStatus waits for an initialization that is still in flight', async () => {
  const { initDatabase, inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();
  rmSync(bundledDatabasePath, { force: true });

  const initialization = initDatabase(READY_VERSE_COUNT);
  const status = await inspectBundledDatabaseStatus(READY_VERSE_COUNT);
  await initialization;

  assert.equal(status.ready, true);
  assert.equal(assetImports.length, 1, 'the probe joins the in-flight import instead of racing it');
});

test('inspectBundledDatabaseStatus probes the file after an in-flight initialization fails', async () => {
  const { initDatabase, inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();

  const failing = initDatabase(READY_VERSE_COUNT + 1);
  const status = await inspectBundledDatabaseStatus(READY_VERSE_COUNT);
  await assert.rejects(failing);

  assert.equal(status.ready, true, 'the probe reports the state the file is actually in');
  assert.equal(status.verseCount, READY_VERSE_COUNT);
});

test('getVerseCount reports the verse count of the bundled database', async () => {
  const { getVerseCount } = await loadModule();
  await resetBundledDatabase();

  assert.equal(await getVerseCount(), READY_VERSE_COUNT);
});

// ─── Source resolution ────────────────────────────────────────────────────────

test('getChapterSourceKey distinguishes the bundled source from an installed one', async () => {
  const { getChapterSourceKey, setBibleDatabaseSourceResolver } = await loadModule();

  assert.equal(getChapterSourceKey('bsb'), `bundled:${BUNDLED_DATABASE_NAME}:`);

  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'web' ? installedSource('web', 'web.db') : null
  );
  assert.equal(getChapterSourceKey('web'), `installed:web.db:${installedDirectory}`);
  assert.equal(
    getChapterSourceKey('bsb'),
    `bundled:${BUNDLED_DATABASE_NAME}:`,
    'unresolved ids fall back to bundled'
  );

  setBibleDatabaseSourceResolver(null);
  assert.equal(getChapterSourceKey('web'), `bundled:${BUNDLED_DATABASE_NAME}:`);
});

test('getDatabase opens an installed translation from its own directory and caches the handle', async () => {
  const { getDatabase, setBibleDatabaseSourceResolver } = await loadModule();
  writeSeedDatabase(`${installedDirectory}/web.db`, {
    verses: [
      {
        translationId: 'web',
        bookId: 'GEN',
        chapter: 1,
        verse: 1,
        text: 'In the beginning, God created the heavens and the earth.',
      },
    ],
  });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'web' ? installedSource('web', 'web.db') : null
  );
  resetRecorders();

  const first = await getDatabase('web');
  const second = await getDatabase('web');

  assert.equal(first, second, 'the installed handle is cached per source');
  assert.deepEqual(opens, [
    {
      name: 'web.db',
      directory: installedDirectory,
      path: `${installedDirectory}/web.db`,
      options: { finalizeUnusedStatementsBeforeClosing: false },
    },
  ]);
  assert.ok(
    queries.some(
      (entry) =>
        entry.path === `${installedDirectory}/web.db` && entry.sql === 'PRAGMA journal_mode = WAL'
    )
  );
});

test('getDatabase reports a missing installed pack instead of opening an empty database', async () => {
  const { getDatabase, setBibleDatabaseSourceResolver, MissingInstalledDatabaseError } =
    await loadModule();
  setBibleDatabaseSourceResolver(() => installedSource('gone', 'gone.db'));
  resetRecorders();

  await assert.rejects(
    () => getDatabase('gone'),
    (error: unknown) => {
      assert.ok(error instanceof MissingInstalledDatabaseError);
      assert.equal(error.translationId, 'gone');
      assert.equal(error.localPath, `${installedDirectory}/gone.db`);
      return true;
    }
  );
  assert.deepEqual(
    opens,
    [],
    'a missing pack must never be opened, which would create an empty file'
  );
});

test('getDatabase treats a zero-byte installed pack as missing', async () => {
  const { getDatabase, setBibleDatabaseSourceResolver } = await loadModule();
  writeFileSync(`${installedDirectory}/empty.db`, '');
  setBibleDatabaseSourceResolver(() => installedSource('empty', 'empty.db'));
  resetRecorders();

  await assert.rejects(() => getDatabase('empty'), /Installed database file is missing/);
  assert.deepEqual(opens, []);
});

test('invalidateInstalledBibleDatabaseAtPath closes and forgets the cached handle', async () => {
  const { getDatabase, invalidateInstalledBibleDatabaseAtPath, setBibleDatabaseSourceResolver } =
    await loadModule();
  const localPath = `${installedDirectory}/web.db`;
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'web' ? installedSource('web', 'web.db') : null
  );
  const cached = await getDatabase('web');
  resetRecorders();

  await invalidateInstalledBibleDatabaseAtPath(localPath);

  assert.deepEqual(closes, [localPath]);
  const reopened = await getDatabase('web');
  assert.notEqual(reopened, cached, 'the next read opens a fresh handle on the replaced file');
  assert.equal(opens.length, 1);
});

test('invalidateInstalledBibleDatabaseAtPath ignores a path that names no database file', async () => {
  const { invalidateInstalledBibleDatabaseAtPath } = await loadModule();
  resetRecorders();

  await invalidateInstalledBibleDatabaseAtPath('web.db');
  await invalidateInstalledBibleDatabaseAtPath(`${installedDirectory}/never-opened.db`);

  assert.deepEqual(closes, [], 'an unparsable or uncached path is a no-op, not an error');
});

// ─── Chapter reads ────────────────────────────────────────────────────────────

test('getChapter returns only the requested translation, ordered by verse', async () => {
  const { getChapter, setBibleDatabaseSourceResolver } = await loadModule();
  setBibleDatabaseSourceResolver(null);
  await resetBundledDatabase();
  await (await loadModule()).initDatabase(READY_VERSE_COUNT);

  const verses = await getChapter('bsb', 'GEN', 1);

  assert.deepEqual(
    verses.map((verse) => verse.verse),
    [1, 2, 3]
  );
  assert.equal(verses[0].bookId, 'GEN');
  assert.equal(verses[0].heading, 'The Creation');
  assert.equal(verses[1].heading, undefined, 'a NULL heading is reported as absent, not as null');

  const asv = await getChapter('asv', 'GEN', 1);
  assert.deepEqual(
    asv.map((verse) => verse.text),
    ['In the beginning God created the heaven and the earth.']
  );
});

test('getChapter reinstates prose that stored poetry lines do not cover', async () => {
  const { getChapter } = await loadModule();

  const [verse] = await getChapter('bsb', 'JHN', 1);

  assert.deepEqual(verse.formatting, {
    mode: 'poetry',
    lines: [
      { text: 'In the beginning was the Word,', indentLevel: 1 },
      { text: 'and the Word was with God, and the Word was God.', prose: true },
    ],
  });
});

test('getChapter returns an empty list for a chapter the translation does not have', async () => {
  const { getChapter } = await loadModule();

  assert.deepEqual(await getChapter('bsb', 'GEN', 99), []);
  assert.deepEqual(await getChapter('nope', 'GEN', 1), []);
});

// ─── Search ───────────────────────────────────────────────────────────────────

test('searchVerses returns nothing for a query with no searchable characters', async () => {
  const { searchVerses } = await loadModule();
  resetRecorders();

  assert.deepEqual(await searchVerses('bsb', '   '), []);
  assert.deepEqual(await searchVerses('bsb', '!?-'), []);
  assert.deepEqual(queries, [], 'an unsearchable query must not reach SQLite at all');
});

test('searchVerses matches case-insensitively and on word prefixes', async () => {
  const { searchVerses } = await loadModule();

  const results = await searchVerses('bsb', 'BEGIN');

  assert.deepEqual(
    results.map((verse) => `${verse.bookId} ${verse.chapter}:${verse.verse}`).sort(),
    ['GEN 1:1', 'JHN 1:1']
  );
});

test('searchVerses only returns verses from the requested translation', async () => {
  const { searchVerses } = await loadModule();

  const bsb = await searchVerses('bsb', 'loved the world');
  const asv = await searchVerses('asv', 'loved the world');

  assert.deepEqual(
    bsb.map((verse) => verse.text),
    ['For God so loved the world that He gave His one and only Son.']
  );
  assert.deepEqual(
    asv.map((verse) => verse.text),
    ['For God so loved the world, that he gave his only begotten Son.']
  );
});

test('searchVerses honours the result limit', async () => {
  const { searchVerses } = await loadModule();

  const all = await searchVerses('bsb', 'God');
  const limited = await searchVerses('bsb', 'God', 1);

  assert.ok(all.length > 1, 'the fixture needs more than one match for the limit to mean anything');
  assert.equal(limited.length, 1);
});

test('searchVerses returns an empty list when the index holds no match', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(await searchVerses('bsb', 'zebra'), []);
});

test('searchVerses probes the search index once per source and caches the answer', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver } = await loadModule();
  writeSeedDatabase(`${installedDirectory}/probed.db`, {
    verses: [
      { translationId: 'probed', bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning.' },
    ],
  });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'probed' ? installedSource('probed', 'probed.db') : null
  );
  resetRecorders();

  await searchVerses('probed', 'beginning');
  await searchVerses('probed', 'beginning');

  const probes = queries.filter((entry) => entry.sql.includes("name = 'verses_fts'"));
  assert.equal(probes.length, 1, 'the second search reuses the cached search-index probe');
});

test('searchVerses reports an unavailable index for a translation without verses_fts', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver, BibleSearchUnavailableError } =
    await loadModule();
  writeSeedDatabase(`${installedDirectory}/noindex.db`, {
    searchIndex: false,
    verses: [
      { translationId: 'noindex', bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning.' },
    ],
  });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex' ? installedSource('noindex', 'noindex.db') : null
  );

  await assert.rejects(
    () => searchVerses('noindex', 'beginning'),
    (error: unknown) => {
      assert.ok(error instanceof BibleSearchUnavailableError);
      assert.equal(error.translationId, 'noindex');
      assert.match(error.message, /Full-text search is not available/);
      return true;
    }
  );
});

test('searchVerses rethrows when the indexed query itself fails', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver } = await loadModule();
  // A plain table called verses_fts passes the "does the index exist" probe but cannot answer
  // a MATCH, which is the shape of a half-built index on a downloaded pack.
  const path = `${installedDirectory}/fakeindex.db`;
  writeSeedDatabase(path, {
    searchIndex: false,
    verses: [
      {
        translationId: 'fakeindex',
        bookId: 'GEN',
        chapter: 1,
        verse: 1,
        text: 'In the beginning.',
      },
    ],
  });
  const seeded = new DatabaseSync(path);
  seeded.exec('CREATE TABLE verses_fts (rowid INTEGER, text TEXT)');
  seeded.close();
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'fakeindex' ? installedSource('fakeindex', 'fakeindex.db') : null
  );

  await assert.rejects(() => searchVerses('fakeindex', 'beginning'), /no such column: verses_fts/);
});

// ─── Writes ───────────────────────────────────────────────────────────────────

test('insertVerse adds a verse that getChapter reads back', async () => {
  const { getChapter, insertVerse, setBibleDatabaseSourceResolver } = await loadModule();
  writeSeedDatabase(`${installedDirectory}/writable.db`, { verses: [] });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'writable' ? installedSource('writable', 'writable.db') : null
  );

  await insertVerse('writable', {
    bookId: 'GEN',
    chapter: 1,
    verse: 1,
    text: 'In the beginning God created the heavens and the earth.',
    heading: 'The Creation',
    formatting: {
      mode: 'lines',
      lines: [{ text: 'In the beginning God created the heavens and the earth.' }],
    },
  });

  const [verse] = await getChapter('writable', 'GEN', 1);
  assert.equal(verse.text, 'In the beginning God created the heavens and the earth.');
  assert.equal(verse.heading, 'The Creation');
  assert.deepEqual(verse.formatting, {
    mode: 'lines',
    lines: [{ text: 'In the beginning God created the heavens and the earth.' }],
  });
});

test('insertVerses writes the whole batch inside one transaction', async () => {
  const { getChapter, insertVerses } = await loadModule();
  const batch: Omit<Verse, 'id'>[] = [
    { bookId: 'JHN', chapter: 1, verse: 1, text: 'In the beginning was the Word.' },
    { bookId: 'JHN', chapter: 1, verse: 2, text: 'He was with God in the beginning.' },
  ];
  resetRecorders();

  await insertVerses('writable', batch);

  const path = `${installedDirectory}/writable.db`;
  const executed = queries.filter((entry) => entry.path === path).map((entry) => entry.sql.trim());
  assert.equal(
    executed.filter((sql) => sql.startsWith('INSERT INTO verses')).length,
    2,
    'each verse is one statement inside the shared transaction'
  );
  assert.deepEqual(
    (await getChapter('writable', 'JHN', 1)).map((verse) => verse.verse),
    [1, 2]
  );
});

test('insertVerses rolls the whole batch back when one row violates the unique index', async () => {
  const { getChapter, insertVerses } = await loadModule();

  await assert.rejects(() =>
    insertVerses('writable', [
      { bookId: 'MRK', chapter: 1, verse: 1, text: 'The beginning of the gospel.' },
      { bookId: 'JHN', chapter: 1, verse: 1, text: 'Duplicate of an existing verse.' },
    ])
  );

  assert.deepEqual(
    await getChapter('writable', 'MRK', 1),
    [],
    'the row written before the failure must not survive the rollback'
  );
  assert.deepEqual(
    (await getChapter('writable', 'JHN', 1)).map((verse) => verse.text),
    ['In the beginning was the Word.', 'He was with God in the beginning.']
  );
});
