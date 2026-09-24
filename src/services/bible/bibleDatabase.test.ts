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
import { BUNDLED_BIBLE_SCHEMA_VERSION } from './bibleDataModel';
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
  database.exec(`PRAGMA user_version = ${options.schemaVersion ?? BUNDLED_BIBLE_SCHEMA_VERSION}`);
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

// ─── Failure injection ────────────────────────────────────────────────────────

/**
 * Native failures to inject into the fake. Each queue is consumed one call at a time: an Error
 * makes that call throw, null lets it through, and an empty queue means "healthy".
 */
const sqliteFaults = {
  importAsset: [] as Array<Error | null>,
  open: [] as Array<Error | null>,
  /** Makes the next query whose SQL matches throw, `remaining` times. */
  query: null as { match: RegExp; error: Error; remaining: number } | null,
  /** Awaited before every statement, with the id of the handle it runs on. */
  beforeStatement: null as ((handleId: number, sql: string) => Promise<void> | void) | null,
  /** Awaited before every asset import. */
  beforeImport: null as (() => Promise<void> | void) | null,
};
let handleSequence = 0;
/** Ids of fake handles that were opened and not yet closed. */
const liveHandles = new Set<number>();

function resetSqliteFaults(): void {
  sqliteFaults.importAsset.length = 0;
  sqliteFaults.open.length = 0;
  sqliteFaults.query = null;
  sqliteFaults.beforeStatement = null;
  sqliteFaults.beforeImport = null;
}

const takeFault = (queue: Array<Error | null>): void => {
  const fault = queue.shift();
  if (fault) throw fault;
};

async function beforeStatement(handleId: number, sql: string): Promise<void> {
  await sqliteFaults.beforeStatement?.(handleId, sql);
  const fault = sqliteFaults.query;
  if (fault && fault.remaining > 0 && fault.match.test(sql)) {
    fault.remaining -= 1;
    throw fault.error;
  }
}

function createDatabaseAdapter(path: string) {
  const handle = new DatabaseSync(path);
  const handleId = ++handleSequence;
  liveHandles.add(handleId);
  let closed = false;

  const statements = {
    async execAsync(sql: string): Promise<void> {
      queries.push({ path, sql, params: [] });
      await beforeStatement(handleId, sql);
      handle.exec(sql);
    },
    async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
      queries.push({ path, sql, params: params ?? [] });
      await beforeStatement(handleId, sql);
      return (handle.prepare(sql).get(...toParams(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
      queries.push({ path, sql, params: params ?? [] });
      await beforeStatement(handleId, sql);
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
        liveHandles.delete(handleId);
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
const bundledAssetModule = { __bundledBibleAsset: true };
mockModule(mock, assetModulePath, bundledAssetModule);

mockModule(mock, 'expo-sqlite', {
  defaultDatabaseDirectory: sqliteDirectory,
  openDatabaseAsync: async (name: string, options: unknown, directory?: string) => {
    const resolvedDirectory = directory ?? sqliteDirectory;
    mkdirSync(resolvedDirectory, { recursive: true });
    const path = `${resolvedDirectory}/${name}`;
    opens.push({ name, directory: resolvedDirectory, path, options });
    events.push(`open:${path}`);
    takeFault(sqliteFaults.open);
    return createDatabaseAdapter(path);
  },
  importDatabaseFromAssetAsync: async (
    databaseName: string,
    { assetId, forceOverwrite }: { assetId: unknown; forceOverwrite?: boolean }
  ) => {
    assetImports.push({ databaseName, assetId, forceOverwrite: Boolean(forceOverwrite) });
    events.push(`import:${databaseName}:${forceOverwrite ? 'force' : 'keep'}`);
    await sqliteFaults.beforeImport?.();
    takeFault(sqliteFaults.importAsset);
    const target = `${sqliteDirectory}/${databaseName}`;
    if (!forceOverwrite && existsSync(target)) {
      return;
    }
    copyFileSync(assetSeedPath, target);
  },
});

const fileSystemCalls: Array<{ method: string; path: string }> = [];
const fileSystemFaults = { deleteAsync: false };
const stripFileScheme = (uri: string) => uri.replace(/^file:\/\//, '');
mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory: `${root}/documents/`,
  getInfoAsync: async (uri: string) => {
    fileSystemCalls.push({ method: 'getInfoAsync', path: uri });
    const path = stripFileScheme(uri);
    if (!existsSync(path)) {
      return { exists: false, uri };
    }
    const stats = statSync(path);
    return { exists: true, uri, size: stats.size, isDirectory: stats.isDirectory() };
  },
  deleteAsync: async (uri: string) => {
    fileSystemCalls.push({ method: 'deleteAsync', path: uri });
    events.push(`delete:${uri}`);
    if (fileSystemFaults.deleteAsync) {
      throw new Error('deleteAsync is unavailable');
    }
    // Like the native module on both platforms: a scheme-less path is only readable, so a
    // delete is refused. expo-sqlite's defaultDatabaseDirectory is such a plain path.
    if (!uri.startsWith('file://')) {
      throw new Error(`Location '${uri}' isn't deletable.`);
    }
    rmSync(stripFileScheme(uri), { force: true, recursive: true });
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
  resetSqliteFaults();
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
  assert.equal(status.schemaVersion, BUNDLED_BIBLE_SCHEMA_VERSION);
  assert.equal(status.hasSearchIndex, true);
  assert.equal(status.formattedVerseCount, 1);
  assert.deepEqual(
    events,
    [`import:${BUNDLED_DATABASE_NAME}:keep`, `open:${bundledDatabasePath}`],
    'a first launch copies the asset once and opens it, without the forced-overwrite recovery path'
  );
  assert.equal(existsSync(bundledDatabasePath), true);
  // The Metro-required asset module is the only shipped copy of the database (no expo-asset
  // plugin / Xcode Resources duplicate), so the import must be resolved from exactly that module.
  assert.deepEqual(
    assetImports.map(({ databaseName, assetId }) => ({ databaseName, assetId })),
    [{ databaseName: BUNDLED_DATABASE_NAME, assetId: bundledAssetModule }]
  );
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

test('initDatabase reloads from the asset when the open handle can no longer be inspected', async (t) => {
  const { initDatabase } = await loadModule();
  const warn = t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  await initDatabase(READY_VERSE_COUNT);
  // The shared handle is healthy, then the schema underneath it goes away — the shape of an OS
  // storage sweep or a half-applied replacement on a device mid-session.
  const sideChannel = new DatabaseSync(bundledDatabasePath);
  sideChannel.exec('DROP TABLE verses');
  sideChannel.close();
  resetRecorders();

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT, 'the reader is served a working database');
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true],
    'an uninspectable open handle must fall through to the recovery import, not be trusted'
  );
  assert.ok(
    warn.mock.calls.some((call) =>
      String(call.arguments[0]).includes('Failed to inspect open bundled database')
    )
  );
});

test('initDatabase re-imports the asset when the installed copy has an older schema version', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  // The exact regression from CLAUDE.md rule 11: an existing install whose user_version is
  // below BUNDLED_BIBLE_SCHEMA_VERSION must be replaced, not silently kept.
  writeSeedDatabase(bundledDatabasePath, { schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION - 1 });

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.schemaVersion, BUNDLED_BIBLE_SCHEMA_VERSION);
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
  assert.deepEqual(deletions.sort(), [
    `file://${bundledDatabasePath}-shm`,
    `file://${bundledDatabasePath}-wal`,
  ]);
  assert.ok(
    events.indexOf(`delete:file://${bundledDatabasePath}-wal`) <
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
      BUNDLED_BIBLE_SCHEMA_VERSION,
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

// ─── Injected native failures ─────────────────────────────────────────────────

const diskFull = () =>
  Object.assign(new Error('ENOSPC: no space left on device, copyfile'), { code: 'ENOSPC' });

/** Handles opened since `before` was taken that are still open. */
const handlesOpenedSince = (before: ReadonlySet<number>): number[] =>
  [...liveHandles].filter((id) => !before.has(id));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test('an asset copy that fails for lack of space rejects with that error and is retried next time', async (t) => {
  const { initDatabase } = await loadModule();
  t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  rmSync(bundledDatabasePath, { force: true });
  const before = new Set(liveHandles);
  sqliteFaults.importAsset.push(diskFull(), diskFull());

  await assert.rejects(() => initDatabase(READY_VERSE_COUNT), /ENOSPC/);

  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true],
    'the forced recovery copy is attempted before giving up'
  );
  assert.deepEqual(handlesOpenedSince(before), [], 'a failed start leaves no handle open');

  resetRecorders();
  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(
    status.verseCount,
    READY_VERSE_COUNT,
    'the failure is not latched: the next call copies the asset'
  );
  assert.equal(assetImports.length, 1);
});

test('an asset copy that fails once is recovered by the forced copy in the same launch', async (t) => {
  const { initDatabase } = await loadModule();
  t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  rmSync(bundledDatabasePath, { force: true });
  sqliteFaults.importAsset.push(diskFull());

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
});

test('a database that cannot be opened is recovered by the forced copy', async (t) => {
  const { initDatabase } = await loadModule();
  t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  sqliteFaults.open.push(new Error('SQLITE_CANTOPEN: unable to open database file'));

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
});

test('an integrity check that errors is treated as a failed check and the copy is replaced', async (t) => {
  const { initDatabase } = await loadModule();
  t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  const before = new Set(liveHandles);
  sqliteFaults.query = {
    match: /quick_check/,
    error: new Error('SQLITE_IOERR: disk I/O error'),
    remaining: 1,
  };

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
  assert.equal(handlesOpenedSince(before).length, 1, 'the handle that failed its check was closed');
});

test('a copy the app was killed in the middle of is replaced on the next launch, not trusted', async (t) => {
  const { initDatabase } = await loadModule();
  t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  // The native copy writes in place. A process kill leaves the first half of the file, which the
  // next launch's non-forced import skips because a file already exists at the path.
  writeSeedDatabase(bundledDatabasePath, { padRows: 400 });
  const whole = readFileSync(bundledDatabasePath);
  writeFileSync(bundledDatabasePath, whole.subarray(0, Math.floor(whole.length / 2)));

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
  assert.equal(statSync(bundledDatabasePath).size, statSync(assetSeedPath).size);
});

test('an empty file left by a copy killed before its first write is replaced', async (t) => {
  const { initDatabase } = await loadModule();
  t.mock.method(console, 'warn', () => {});
  await resetBundledDatabase();
  writeFileSync(bundledDatabasePath, '');

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false, true]
  );
});

test('a database the OS removed between launches is copied again without a forced recovery', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${bundledDatabasePath}${suffix}`, { force: true });
  }

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false]
  );
});

test('a copy with a newer schema version than the asset is kept rather than downgraded', async () => {
  const { initDatabase } = await loadModule();
  await resetBundledDatabase();
  writeSeedDatabase(bundledDatabasePath, { schemaVersion: BUNDLED_BIBLE_SCHEMA_VERSION + 1 });

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.schemaVersion, BUNDLED_BIBLE_SCHEMA_VERSION + 1);
  assert.deepEqual(
    assetImports.map((entry) => entry.forceOverwrite),
    [false]
  );
});

test('a chapter query that fails reaches the caller and the next read succeeds', async () => {
  const { initDatabase, getChapter } = await loadModule();
  await resetBundledDatabase();
  await initDatabase(READY_VERSE_COUNT);
  sqliteFaults.query = {
    match: /FROM verses\s+WHERE translation_id = \? AND book_id/,
    error: new Error('SQLITE_IOERR: disk I/O error'),
    remaining: 1,
  };

  await assert.rejects(() => getChapter('bsb', 'GEN', 1), /SQLITE_IOERR/);
  const verses = await getChapter('bsb', 'GEN', 1);

  assert.equal(verses.length, 3);
});

test('a readiness probe that finishes after initialization leaves only the shared handle open', async () => {
  const { initDatabase, inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();
  const before = new Set(liveHandles);
  const probeStarted = deferred();
  const releaseProbe = deferred();
  let probeHandle: number | null = null;
  sqliteFaults.beforeStatement = async (handleId) => {
    if (probeHandle === null) {
      probeHandle = handleId;
      probeStarted.resolve();
    }
    if (handleId === probeHandle) await releaseProbe.promise;
  };

  // Home asks whether the Bible is ready while the reader's first read initialises it.
  const probe = inspectBundledDatabaseStatus(READY_VERSE_COUNT);
  await probeStarted.promise;
  const initStatus = await initDatabase(READY_VERSE_COUNT);
  releaseProbe.resolve();
  const probeStatus = await probe;

  assert.equal(initStatus.verseCount, READY_VERSE_COUNT);
  assert.equal(probeStatus.ready, true);
  assert.equal(
    handlesOpenedSince(before).length,
    1,
    'the probe must close its own handle once initialization has installed the shared one'
  );
});

test('a readiness probe does not adopt its handle while an initialization is replacing the database', async () => {
  const { initDatabase, inspectBundledDatabaseStatus, getDatabase } = await loadModule();
  await resetBundledDatabase();
  const before = new Set(liveHandles);
  const probeStarted = deferred();
  const releaseProbe = deferred();
  const importStarted = deferred();
  const releaseImport = deferred();
  let probeHandle: number | null = null;
  sqliteFaults.beforeStatement = async (handleId) => {
    if (probeHandle === null) {
      probeHandle = handleId;
      probeStarted.resolve();
    }
    if (handleId === probeHandle) await releaseProbe.promise;
  };
  sqliteFaults.beforeImport = async () => {
    importStarted.resolve();
    await releaseImport.promise;
  };

  const probe = inspectBundledDatabaseStatus(READY_VERSE_COUNT);
  await probeStarted.promise;
  const initialization = initDatabase(READY_VERSE_COUNT);
  await importStarted.promise;
  releaseProbe.resolve();
  await probe;
  releaseImport.resolve();
  await initialization;
  sqliteFaults.beforeStatement = null;
  sqliteFaults.beforeImport = null;

  assert.equal(
    handlesOpenedSince(before).length,
    1,
    'an adopted probe would be overwritten by the initialization and never closed'
  );
  const shared = await getDatabase('bsb');
  assert.ok(shared, 'the initialization handle is the one readers get');
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

test('a readiness probe on a fresh install leaves no empty database behind to block the first import', async () => {
  const { initDatabase, inspectBundledDatabaseStatus } = await loadModule();
  await resetBundledDatabase();
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${bundledDatabasePath}${suffix}`, { force: true });
  }

  // Home asks isBibleDataReady() before anything has imported the asset.
  const probe = await inspectBundledDatabaseStatus(READY_VERSE_COUNT);

  assert.equal(probe.ready, false);
  assert.equal(probe.verseCount, 0);
  assert.equal(
    existsSync(bundledDatabasePath),
    false,
    'opening a missing database creates an empty file, and the native import skips any existing file'
  );
  assert.ok(
    fileSystemCalls.some(
      ({ method, path }) => method === 'getInfoAsync' && path === `file://${bundledDatabasePath}`
    ),
    'the existence check needs a file:// URI; the native module reports a bare path as missing'
  );

  const status = await initDatabase(READY_VERSE_COUNT);

  assert.equal(status.verseCount, READY_VERSE_COUNT);
  assert.deepEqual(
    assetImports.map(({ forceOverwrite }) => forceOverwrite),
    [false],
    'the first launch copies the asset once, without falling into the forced-recovery import'
  );
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

test('resolvers registered through bibleDatabaseSources before the database loads drive the first read', async () => {
  // bibleStore registers both resolvers at import through bibleDatabaseSources
  // and only loads this module later; the first read must still see them.
  const sources = await import('./bibleDatabaseSources');
  const { getDatabase } = await loadModule();
  writeSeedDatabase(`${installedDirectory}/sources-kjv.db`, {
    verses: [
      {
        translationId: 'kjv',
        bookId: 'GEN',
        chapter: 1,
        verse: 1,
        text: 'In the beginning God created the heaven and the earth.',
      },
    ],
  });
  const readiness: Array<{ translationId: string; opensSoFar: number }> = [];
  sources.setBibleTranslationReadinessResolver(async (translationId) => {
    readiness.push({ translationId, opensSoFar: opens.length });
  });
  sources.setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'kjv' ? installedSource('kjv', 'sources-kjv.db') : null
  );
  resetRecorders();

  try {
    await getDatabase('kjv');

    assert.deepEqual(readiness, [{ translationId: 'kjv', opensSoFar: 0 }]);
    assert.equal(opens[0]?.path, `${installedDirectory}/sources-kjv.db`);
  } finally {
    sources.setBibleTranslationReadinessResolver(null);
    sources.setBibleDatabaseSourceResolver(null);
  }
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

test('invalidateInstalledBibleDatabaseAtPath drops cached chapter text even with no open handle', async () => {
  const { invalidateInstalledBibleDatabaseAtPath } = await loadModule();
  const { chapterCache } = await import('./chapterCache');
  const cachedVerse: Verse[] = [{ id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'old' }];
  await chapterCache.get('installed:web', async () => cachedVerse);

  await invalidateInstalledBibleDatabaseAtPath(`${installedDirectory}/never-opened.db`);

  const reread = await chapterCache.get('installed:web', async () => [
    { id: 1, bookId: 'GEN', chapter: 1, verse: 1, text: 'new' },
  ]);
  assert.equal(reread[0]?.text, 'new', 'a replaced pack must not keep serving the old text');
  chapterCache.clear();
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

test('search results reinstate prose that stored poetry lines do not cover, like the reader', async () => {
  const { searchVerses } = await loadModule();

  const [verse] = await searchVerses('bsb', 'Word');

  assert.equal(`${verse.bookId} ${verse.chapter}:${verse.verse}`, 'JHN 1:1');
  assert.deepEqual(verse.formatting, {
    mode: 'poetry',
    lines: [
      { text: 'In the beginning was the Word,', indentLevel: 1 },
      { text: 'and the Word was with God, and the Word was God.', prose: true },
    ],
  });
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

  const probes = queries.filter(
    (entry) => entry.sql.includes('sqlite_master') && entry.sql.includes('verses_fts')
  );
  assert.equal(probes.length, 1, 'the second search reuses the cached search-index probe');
});

const NO_INDEX_PACK_VERSES: SeedVerse[] = [
  { translationId: 'noindex', bookId: 'GEN', chapter: 1, verse: 1, text: 'In the beginning.' },
  {
    translationId: 'noindex',
    bookId: 'PSA',
    chapter: 23,
    verse: 1,
    text: 'The LORD is my shepherd; I shall not want.',
  },
  {
    translationId: 'noindex',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world that He gave His one and only Son.',
  },
  {
    translationId: 'noindex',
    bookId: 'GEN',
    chapter: 1,
    verse: 3,
    text: 'And God said, “Let there be light.”',
  },
  {
    translationId: 'noindex',
    bookId: '1JN',
    chapter: 4,
    verse: 8,
    text: 'Whoever does not love does not know God, because God is love.',
  },
];

function installPackWithoutIndex(name: string, verses: SeedVerse[] = NO_INDEX_PACK_VERSES): void {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${installedDirectory}/${name}${suffix}`, { force: true });
  }
  writeSeedDatabase(`${installedDirectory}/${name}`, { searchIndex: false, verses });
}

const verseRefs = (verses: Verse[]) =>
  verses.map((verse) => `${verse.bookId} ${verse.chapter}:${verse.verse}`);
const ranMatch = () => queries.some((entry) => entry.sql.includes('MATCH'));

test('searchVerses on a pack without an index answers from a substring scan meanwhile', async () => {
  const { searchVerses, scheduleTextPackSearchIndexBuild, setBibleDatabaseSourceResolver } =
    await loadModule();
  installPackWithoutIndex('noindex.db');
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex' ? installedSource('noindex', 'noindex.db') : null
  );
  resetRecorders();

  // Lowercase, capitalised and all-caps spellings of the word all match, in canonical order.
  assert.deepEqual(verseRefs(await searchVerses('noindex', 'lord')), ['PSA 23:1']);
  assert.deepEqual(verseRefs(await searchVerses('noindex', 'god')), [
    'GEN 1:3',
    'JHN 3:16',
    '1JN 4:8',
  ]);
  assert.equal(ranMatch(), false);
  await scheduleTextPackSearchIndexBuild('noindex');
});

test('searchVerses builds the pack index in the background and then uses it', async () => {
  const { searchVerses, scheduleTextPackSearchIndexBuild, setBibleDatabaseSourceResolver } =
    await loadModule();
  installPackWithoutIndex('noindex-build.db');
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex' ? installedSource('noindex', 'noindex-build.db') : null
  );
  await searchVerses('noindex', 'shepherd');

  assert.equal(await scheduleTextPackSearchIndexBuild('noindex'), 'ready');
  resetRecorders();

  assert.deepEqual(verseRefs(await searchVerses('noindex', 'shepherd')), ['PSA 23:1']);
  assert.equal(ranMatch(), true, 'the search now runs against the built FTS index');
  // FTS prefix matching, like the bundled database: "love" also finds "loved".
  assert.deepEqual(verseRefs(await searchVerses('noindex', 'love')).sort(), [
    '1JN 4:8',
    'JHN 3:16',
  ]);
});

test('the substring fallback requires every word and caps results at the limit', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver, scheduleTextPackSearchIndexBuild } =
    await loadModule();
  installPackWithoutIndex('noindex-terms.db');
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex' ? installedSource('noindex', 'noindex-terms.db') : null
  );

  assert.deepEqual(verseRefs(await searchVerses('noindex', 'God love')), ['JHN 3:16', '1JN 4:8']);
  assert.deepEqual(verseRefs(await searchVerses('noindex', 'god', 2)), ['GEN 1:3', 'JHN 3:16']);
  assert.deepEqual(await searchVerses('noindex', '100% _'), []);
  await scheduleTextPackSearchIndexBuild('noindex');
});

test('a pack replaced at the same path is searched without the old index and indexed again', async () => {
  const {
    invalidateInstalledBibleDatabaseAtPath,
    scheduleTextPackSearchIndexBuild,
    searchVerses,
    setBibleDatabaseSourceResolver,
  } = await loadModule();
  installPackWithoutIndex('noindex-replaced.db');
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex' ? installedSource('noindex', 'noindex-replaced.db') : null
  );
  await searchVerses('noindex', 'shepherd');
  assert.equal(await scheduleTextPackSearchIndexBuild('noindex'), 'ready');
  await searchVerses('noindex', 'shepherd');

  await invalidateInstalledBibleDatabaseAtPath(`${installedDirectory}/noindex-replaced.db`);
  installPackWithoutIndex('noindex-replaced.db');
  resetRecorders();

  assert.deepEqual(verseRefs(await searchVerses('noindex', 'shepherd')), ['PSA 23:1']);
  assert.equal(ranMatch(), false, 'the cached "index ready" answer was dropped with the handle');
  assert.equal(await scheduleTextPackSearchIndexBuild('noindex'), 'ready');
});

test('an index built for an older pack version is rebuilt for the new one', async () => {
  const { scheduleTextPackSearchIndexBuild, searchVerses, setBibleDatabaseSourceResolver } =
    await loadModule();
  installPackWithoutIndex('noindex-versioned.db');
  let packVersion = '2026.09.01-v1';
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex'
      ? { ...installedSource('noindex', 'noindex-versioned.db'), packVersion }
      : null
  );
  assert.equal(await scheduleTextPackSearchIndexBuild('noindex'), 'ready');
  await searchVerses('noindex', 'shepherd');

  packVersion = '2026.09.20-v2';
  resetRecorders();
  assert.deepEqual(verseRefs(await searchVerses('noindex', 'shepherd')), ['PSA 23:1']);
  assert.equal(ranMatch(), false);
  assert.equal(await scheduleTextPackSearchIndexBuild('noindex'), 'ready');

  const database = new DatabaseSync(`${installedDirectory}/noindex-versioned.db`);
  const state = database
    .prepare('SELECT pack_version, completed_at FROM search_index_state')
    .get() as { pack_version: string; completed_at: string | null };
  database.close();
  assert.equal(state.pack_version, '2026.09.20-v2');
  assert.ok(state.completed_at);
});

test('invalidating a pack stops its index build before the file can be deleted', async () => {
  const {
    invalidateInstalledBibleDatabaseAtPath,
    scheduleTextPackSearchIndexBuild,
    setBibleDatabaseSourceResolver,
  } = await loadModule();
  const localPath = `${installedDirectory}/noindex-deleted.db`;
  installPackWithoutIndex('noindex-deleted.db');
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'noindex' ? installedSource('noindex', 'noindex-deleted.db') : null
  );
  resetRecorders();

  const build = scheduleTextPackSearchIndexBuild('noindex');
  await invalidateInstalledBibleDatabaseAtPath(localPath);

  assert.equal(await build, 'cancelled');
  assert.ok(
    closes.includes(localPath),
    'the build connection was closed before invalidate returned'
  );
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${localPath}${suffix}`, { force: true });
  }
  assert.equal(existsSync(localPath), false, 'the index lived in the pack file and went with it');
});

test('the bundled translation has no pack index to build', async () => {
  const { scheduleTextPackSearchIndexBuild, setBibleDatabaseSourceResolver } = await loadModule();
  setBibleDatabaseSourceResolver(null);
  resetRecorders();

  assert.equal(await scheduleTextPackSearchIndexBuild('bsb'), null);
  assert.equal(opens.length, 0);
});

test('searchVerses keeps a Devanagari word whole instead of splitting it at its vowel signs', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver } = await loadModule();
  // Devanagari vowel signs and the virama are combining marks (Unicode category M), so a
  // letters-and-digits-only tokenizer cut प्रेम ("love") into प, र and म. Those fragments then
  // matched almost every Nepali verse: 21,046 of npiulb's verses instead of about 500.
  writeSeedDatabase(`${installedDirectory}/devanagari.db`, {
    verses: [
      {
        translationId: 'devanagari',
        bookId: '1JN',
        chapter: 4,
        verse: 8,
        text: 'परमेश्‍वर प्रेम हुनुहुन्छ।',
      },
      {
        translationId: 'devanagari',
        bookId: 'GEN',
        chapter: 1,
        verse: 1,
        text: 'सुरुमा परमेश्‍वरले आकाश र पृथ्वी मलाई सृष्‍टि गर्नुभयो।',
      },
    ],
  });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'devanagari' ? installedSource('devanagari', 'devanagari.db') : null
  );

  const results = await searchVerses('devanagari', 'प्रेम');

  assert.deepEqual(
    results.map((verse) => `${verse.bookId} ${verse.chapter}:${verse.verse}`),
    ['1JN 4:8']
  );
});

test('searchVerses treats an apostrophe inside a word as part of that word', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver } = await loadModule();
  writeSeedDatabase(`${installedDirectory}/apostrophe.db`, {
    verses: [
      {
        translationId: 'apostrophe',
        bookId: 'LUK',
        chapter: 2,
        verse: 49,
        text: 'Did you not know that I must be in My Father’s house?',
      },
      {
        translationId: 'apostrophe',
        bookId: 'GEN',
        chapter: 2,
        verse: 24,
        text: 'For this reason a man will leave his father and mother; s is a letter.',
      },
    ],
  });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'apostrophe' ? installedSource('apostrophe', 'apostrophe.db') : null
  );

  const straight = await searchVerses('apostrophe', "Father's");
  const curly = await searchVerses('apostrophe', 'Father’s');

  assert.deepEqual(
    straight.map((verse) => `${verse.bookId} ${verse.chapter}:${verse.verse}`),
    ['LUK 2:49']
  );
  assert.deepEqual(
    curly.map((verse) => `${verse.bookId} ${verse.chapter}:${verse.verse}`),
    ['LUK 2:49']
  );
});

test('searchVerses treats SQL wildcard and quote characters as plain text', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(await searchVerses('bsb', '%'), []);
  assert.deepEqual(await searchVerses('bsb', '_'), []);
  assert.deepEqual(await searchVerses('bsb', "'"), []);
  assert.deepEqual(await searchVerses('bsb', '"'), []);
  assert.deepEqual(
    (await searchVerses('bsb', '"loved" % the_world')).map((verse) => verse.text),
    ['For God so loved the world that He gave His one and only Son.']
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

// ─── Search without spaces between words (CJK, Thai) ──────────────────────────

const CJK_PACK_VERSES: SeedVerse[] = [
  // Deliberately out of canonical order: 1 John is inserted before John and Genesis.
  {
    translationId: 'cuv',
    bookId: '1JN',
    chapter: 4,
    verse: 8,
    text: '没有爱心的，就不认识神，因为神就是爱。',
  },
  { translationId: 'cuv', bookId: 'GEN', chapter: 1, verse: 1, text: '起初，神创造天地。' },
  {
    translationId: 'cuv',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: '神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。',
  },
  {
    translationId: 'jpn',
    bookId: 'GEN',
    chapter: 1,
    verse: 1,
    text: '初めに、神は天と地を創造された。',
  },
  {
    translationId: 'jpn',
    bookId: 'GEN',
    chapter: 1,
    verse: 3,
    text: '神は言われた。「光あれ。」こうして、光があった。',
  },
  {
    translationId: 'kor',
    bookId: 'JHN',
    chapter: 3,
    verse: 16,
    text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니',
  },
  { translationId: 'kor', bookId: '1JN', chapter: 4, verse: 8, text: '하나님은사랑이시라' },
  {
    translationId: 'kor',
    bookId: 'GEN',
    chapter: 1,
    verse: 3,
    text: '하나님이 이르시되 빛이 있으라 하시니',
  },
  {
    translationId: 'tha',
    bookId: 'GEN',
    chapter: 1,
    verse: 1,
    text: 'ในปฐมกาลพระเจ้าทรงเนรมิตสร้างฟ้าและแผ่นดิน',
  },
];

function installCjkPack(options: { searchIndex: boolean }): void {
  const name = options.searchIndex ? 'cjk-indexed.db' : 'cjk-pack.db';
  writeSeedDatabase(`${installedDirectory}/${name}`, {
    searchIndex: options.searchIndex,
    verses: CJK_PACK_VERSES,
  });
}

const refs = (verses: Verse[]) =>
  verses.map((verse) => `${verse.bookId} ${verse.chapter}:${verse.verse}`);

test('searchVerses finds a Chinese word inside a run of characters with no spaces', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver } = await loadModule();
  // Downloaded text packs ship without verses_fts, and unicode61 indexes a whole clause
  // (神爱世人) as one token anyway, so 世人 was unfindable either way.
  installCjkPack({ searchIndex: false });
  setBibleDatabaseSourceResolver((translationId) =>
    ['cuv', 'jpn', 'kor', 'tha'].includes(translationId)
      ? installedSource(translationId, 'cjk-pack.db')
      : null
  );

  assert.deepEqual(refs(await searchVerses('cuv', '世人')), ['JHN 3:16']);
  assert.deepEqual(refs(await searchVerses('cuv', '独生子')), ['JHN 3:16']);
});

test('searchVerses lists substring matches in canonical book order', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('cuv', '爱')), ['JHN 3:16', '1JN 4:8']);
  assert.deepEqual(refs(await searchVerses('cuv', '神')), ['GEN 1:1', 'JHN 3:16', '1JN 4:8']);
});

test('searchVerses requires every space-separated CJK term to appear', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('cuv', '神 天地')), ['GEN 1:1']);
  assert.deepEqual(refs(await searchVerses('cuv', '天地 永生')), []);
});

test('searchVerses finds Japanese words written in kanji and kana', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('jpn', '創造')), ['GEN 1:1']);
  assert.deepEqual(refs(await searchVerses('jpn', '光あれ')), ['GEN 1:3']);
  assert.deepEqual(refs(await searchVerses('jpn', '神')), ['GEN 1:1', 'GEN 1:3']);
});

test('searchVerses finds a Korean noun whatever particle is attached to it', async () => {
  const { searchVerses } = await loadModule();

  // 세상을 (object particle), 사랑하사 (verb stem), 사랑이시라 (copula, no space before it).
  assert.deepEqual(refs(await searchVerses('kor', '세상')), ['JHN 3:16']);
  assert.deepEqual(refs(await searchVerses('kor', '사랑')), ['JHN 3:16', '1JN 4:8']);
  assert.deepEqual(refs(await searchVerses('kor', '빛')), ['GEN 1:3']);
  assert.deepEqual(refs(await searchVerses('kor', '하나님 사랑')), ['JHN 3:16', '1JN 4:8']);
});

test('searchVerses finds a Thai word inside an unspaced phrase', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('tha', 'พระเจ้า')), ['GEN 1:1']);
});

test('searchVerses keeps CJK substring search inside the requested translation', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('jpn', '世人')), []);
  assert.deepEqual(refs(await searchVerses('kor', '神')), []);
});

test('searchVerses caps CJK substring results at the limit', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('cuv', '神', 2)), ['GEN 1:1', 'JHN 3:16']);
});

test('searchVerses treats SQL wildcard characters in a CJK query as plain text', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('cuv', '%爱')), ['JHN 3:16', '1JN 4:8']);
  assert.deepEqual(refs(await searchVerses('cuv', '爱_')), ['JHN 3:16', '1JN 4:8']);
  assert.deepEqual(refs(await searchVerses('cuv', "神'")), ['GEN 1:1', 'JHN 3:16', '1JN 4:8']);
});

test('searchVerses matches decomposed Hangul typed against precomposed verse text', async () => {
  const { searchVerses } = await loadModule();

  assert.deepEqual(refs(await searchVerses('kor', '세상'.normalize('NFD'))), ['JHN 3:16']);
});

test('searchVerses uses substring matching for CJK even when the pack has an FTS index', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver } = await loadModule();
  installCjkPack({ searchIndex: true });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'cuv' ? installedSource('cuv', 'cjk-indexed.db') : null
  );

  assert.deepEqual(refs(await searchVerses('cuv', '世人')), ['JHN 3:16']);
});

test('searchVerses answers a Latin query on a CJK pack without an index by substring', async () => {
  const { searchVerses, setBibleDatabaseSourceResolver, scheduleTextPackSearchIndexBuild } =
    await loadModule();
  installCjkPack({ searchIndex: false });
  setBibleDatabaseSourceResolver((translationId) =>
    translationId === 'cuv' ? installedSource('cuv', 'cjk-pack.db') : null
  );

  assert.deepEqual(await searchVerses('cuv', 'God'), []);
  await scheduleTextPackSearchIndexBuild('cuv');
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
