/**
 * Behavioural tests for building the full-text index of a downloaded text pack on the device.
 *
 * `expo-sqlite` is replaced with an adapter over a real `node:sqlite` database, so the FTS5
 * statements, the chunked transactions and the SQLITE_FULL failure all run against real SQLite
 * files in a temp directory.
 */
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mockModule } from '../../testing/mockModules';

const root = mkdtempSync(`${tmpdir()}/everybible-pack-index-`);
mkdirSync(root, { recursive: true });

after(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── Pack fixtures ────────────────────────────────────────────────────────────

const PACK_VERSES: Array<[string, number, number, string]> = [
  ['GEN', 1, 1, 'In the beginning God created the heavens and the earth.'],
  ['GEN', 1, 3, 'And God said, “Let there be light,” and there was light.'],
  ['PSA', 23, 1, 'The LORD is my shepherd; I shall not want.'],
  ['JHN', 3, 16, 'For God so loved the world that He gave His one and only Son.'],
  ['1JN', 4, 8, 'Whoever does not love does not know God, because God is love.'],
];

/** A pack with the exporter's schema (scripts/export_translation_text_packs.py), no index. */
function writePack(name: string, options: { fillerVerses?: number } = {}): string {
  const path = `${root}/${name}`;
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${path}${suffix}`, { force: true });
  }
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      translation_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      heading TEXT,
      formatting TEXT
    );
    CREATE UNIQUE INDEX idx_verses_unique ON verses(translation_id, book_id, chapter, verse);
  `);
  const insert = database.prepare(
    'INSERT INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [bookId, chapter, verse, text] of PACK_VERSES) {
    insert.run('pack', bookId, chapter, verse, text);
  }
  for (let index = 0; index < (options.fillerVerses ?? 0); index += 1) {
    insert.run('pack', 'REV', 1 + Math.floor(index / 100), 1 + (index % 100), `filler ${index}`);
  }
  database.exec('PRAGMA user_version = 5');
  database.close();
  return path;
}

function countRows(path: string, sql: string): number {
  const database = new DatabaseSync(path);
  try {
    return Number((database.prepare(sql).get() as { count: number }).count);
  } finally {
    database.close();
  }
}

function tableNames(path: string): string[] {
  const database = new DatabaseSync(path);
  try {
    return (
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
  } finally {
    database.close();
  }
}

function matchIds(path: string, query: string): number[] {
  const database = new DatabaseSync(path);
  try {
    return (
      database
        .prepare('SELECT rowid AS id FROM verses_fts WHERE verses_fts MATCH ? ORDER BY rowid')
        .all(query) as Array<{ id: number }>
    ).map((row) => row.id);
  } finally {
    database.close();
  }
}

// ─── expo-sqlite fake over node:sqlite ────────────────────────────────────────

type SqlParam = string | number | bigint | null | Uint8Array;

const opens: Array<{ path: string; options: unknown }> = [];
const faults: { maxPageCountByPath: Map<string, number> } = { maxPageCountByPath: new Map() };

function createAdapter(path: string) {
  const handle = new DatabaseSync(path);
  const maxPageCount = faults.maxPageCountByPath.get(path);
  if (maxPageCount !== undefined) {
    handle.exec(`PRAGMA max_page_count = ${maxPageCount}`);
  }
  const toParams = (params?: unknown[]) => (params ?? []) as SqlParam[];
  const statements = {
    async execAsync(sql: string) {
      handle.exec(sql);
    },
    async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
      return (handle.prepare(sql).get(...toParams(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return handle.prepare(sql).all(...toParams(params)) as T[];
    },
    async runAsync(sql: string, params?: unknown[]) {
      const result = handle.prepare(sql).run(...toParams(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };
  return {
    ...statements,
    async withTransactionAsync(callback: () => Promise<unknown>) {
      handle.exec('BEGIN');
      try {
        await callback();
        handle.exec('COMMIT');
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    },
    async closeAsync() {
      if (handle.isOpen) handle.close();
    },
  };
}

mockModule(mock, 'expo-sqlite', {
  openDatabaseAsync: async (name: string, options: unknown, directory: string) => {
    const path = `${directory}/${name}`;
    opens.push({ path, options });
    return createAdapter(path);
  },
});

type IndexModule = typeof import('./textPackSearchIndex');
let indexModule: IndexModule;
const load = async (): Promise<IndexModule> => {
  indexModule ??= await import('./textPackSearchIndex');
  return indexModule;
};

const target = (name: string, packVersion?: string) => ({
  directory: root,
  databaseName: name,
  packVersion,
});
const noPause = async () => {};

// ─── Status ───────────────────────────────────────────────────────────────────

test('a pack published without an index reports its search index as missing', async () => {
  const { readPackSearchIndexStatus } = await load();
  const path = writePack('status-missing.db');

  const database = createAdapter(path);
  assert.equal(await readPackSearchIndexStatus(database as never, '1'), 'missing');
  await database.closeAsync();
});

test('an index shipped inside the file without a build marker counts as ready', async () => {
  // The bundled database and older fixtures carry verses_fts built by a one-shot 'rebuild'.
  const { readPackSearchIndexStatus } = await load();
  const path = writePack('status-shipped.db');
  const raw = new DatabaseSync(path);
  raw.exec(
    "CREATE VIRTUAL TABLE verses_fts USING fts5(text, content='verses', content_rowid='id', tokenize='unicode61')"
  );
  raw.exec("INSERT INTO verses_fts(verses_fts) VALUES ('rebuild')");
  raw.close();

  const database = createAdapter(path);
  assert.equal(await readPackSearchIndexStatus(database as never, '1'), 'ready');
  await database.closeAsync();
});

// ─── Building ─────────────────────────────────────────────────────────────────

test('building indexes every verse with the unicode61 tokenizer, folding every diacritic', async () => {
  const { buildPackSearchIndex, readPackSearchIndexStatus } = await load();
  const path = writePack('build-basic.db', { fillerVerses: 250 });
  const database = createAdapter(path);

  const result = await buildPackSearchIndex(database as never, {
    packVersion: '2026.09.01-v2',
    chunkSize: 100,
    pauseBetweenChunks: noPause,
  });
  assert.equal(await readPackSearchIndexStatus(database as never, '2026.09.01-v2'), 'ready');
  await database.closeAsync();

  assert.equal(result, 'ready');
  assert.equal(countRows(path, 'SELECT COUNT(*) AS count FROM verses_fts_docsize'), 255);
  // unicode61 folds case, and remove_diacritics 2 folds letters with one mark or several.
  assert.deepEqual(matchIds(path, '"lord"'), [3]);
  assert.deepEqual(matchIds(path, '"love"*'), [4, 5]);
  const schema = new DatabaseSync(path);
  const ftsSql = (
    schema.prepare("SELECT sql FROM sqlite_master WHERE name = 'verses_fts'").get() as {
      sql: string;
    }
  ).sql;
  schema.close();
  assert.match(
    ftsSql,
    /content='verses', content_rowid='id', tokenize='unicode61 remove_diacritics 2'/
  );
});

test('building commits one transaction per chunk and pauses between chunks', async () => {
  const { buildPackSearchIndex } = await load();
  const path = writePack('build-chunks.db', { fillerVerses: 245 });
  const database = createAdapter(path);
  const indexedAtEachPause: number[] = [];

  await buildPackSearchIndex(database as never, {
    chunkSize: 100,
    pauseBetweenChunks: async () => {
      // A second connection sees each chunk as soon as it commits.
      indexedAtEachPause.push(countRows(path, 'SELECT COUNT(*) AS count FROM verses_fts_docsize'));
    },
  });
  await database.closeAsync();

  assert.deepEqual(indexedAtEachPause, [100, 200, 250]);
});

test('a build stopped part way resumes where it stopped instead of starting over', async () => {
  const { buildPackSearchIndex, readPackSearchIndexStatus } = await load();
  const path = writePack('build-resume.db', { fillerVerses: 295 });
  const first = createAdapter(path);
  let chunks = 0;

  const stopped = await buildPackSearchIndex(first as never, {
    packVersion: '3',
    chunkSize: 100,
    pauseBetweenChunks: noPause,
    isCancelled: () => {
      chunks += 1;
      return chunks > 2;
    },
  });
  assert.equal(stopped, 'cancelled');
  assert.equal(await readPackSearchIndexStatus(first as never, '3'), 'partial');
  await first.closeAsync();

  const second = createAdapter(path);
  const insertedCounts: number[] = [];
  const resumed = await buildPackSearchIndex(second as never, {
    packVersion: '3',
    chunkSize: 100,
    pauseBetweenChunks: async () => {
      insertedCounts.push(countRows(path, 'SELECT COUNT(*) AS count FROM verses_fts_docsize'));
    },
  });
  await second.closeAsync();

  assert.equal(resumed, 'ready');
  assert.deepEqual(insertedCounts, [300]);
  assert.equal(countRows(path, 'SELECT COUNT(*) AS count FROM verses_fts_docsize'), 300);
});

test('an index built for another pack version or index schema is rebuilt', async () => {
  const { buildPackSearchIndex, readPackSearchIndexStatus } = await load();
  const path = writePack('build-stale.db');
  const database = createAdapter(path);
  await buildPackSearchIndex(database as never, { packVersion: 'v1', pauseBetweenChunks: noPause });

  assert.equal(await readPackSearchIndexStatus(database as never, 'v2'), 'stale');
  assert.equal(
    await buildPackSearchIndex(database as never, {
      packVersion: 'v2',
      pauseBetweenChunks: noPause,
    }),
    'ready'
  );
  assert.equal(await readPackSearchIndexStatus(database as never, 'v2'), 'ready');
  await database.execAsync('UPDATE search_index_state SET index_schema_version = 0');
  assert.equal(await readPackSearchIndexStatus(database as never, 'v2'), 'stale');
  await database.closeAsync();

  assert.equal(countRows(path, 'SELECT COUNT(*) AS count FROM verses_fts_docsize'), 5);
});

test('a build that runs out of disk space removes its partial index and leaves the pack readable', async () => {
  const { buildPackSearchIndex, readPackSearchIndexStatus } = await load();
  const path = writePack('build-full.db', { fillerVerses: 3000 });
  const database = createAdapter(path);
  const pages = (await database.getFirstAsync<{ page_count: number }>('PRAGMA page_count'))!
    .page_count;
  await database.execAsync(`PRAGMA max_page_count = ${pages + 8}`);

  const result = await buildPackSearchIndex(database as never, {
    chunkSize: 200,
    pauseBetweenChunks: noPause,
  });

  assert.equal(result, 'failed');
  assert.equal(await readPackSearchIndexStatus(database as never, undefined), 'missing');
  await database.closeAsync();
  assert.deepEqual(
    tableNames(path).filter(
      (name) => name.startsWith('verses_fts') || name === 'search_index_state'
    ),
    []
  );
  assert.equal(countRows(path, 'SELECT COUNT(*) AS count FROM verses'), 3005);
});

// ─── Scheduling ───────────────────────────────────────────────────────────────

test('a scheduled build opens its own connection and shares one run per pack', async () => {
  const { schedulePackSearchIndexBuild } = await load();
  writePack('schedule-once.db');
  opens.length = 0;

  const first = schedulePackSearchIndexBuild(target('schedule-once.db', '1'), {
    pauseBetweenChunks: noPause,
  });
  const second = schedulePackSearchIndexBuild(target('schedule-once.db', '1'), {
    pauseBetweenChunks: noPause,
  });

  assert.equal(first, second);
  assert.equal(await first, 'ready');
  assert.equal(opens.length, 1);
  assert.deepEqual(opens[0]!.options, {
    finalizeUnusedStatementsBeforeClosing: false,
    useNewConnection: true,
  });
});

test('cancelling a pack build waits for it to stop before the pack can be deleted', async () => {
  const { schedulePackSearchIndexBuild, cancelPackSearchIndexBuild } = await load();
  const path = writePack('schedule-cancel.db', { fillerVerses: 500 });
  let releasePause!: () => void;
  let pauses = 0;
  const pausedOnce = new Promise<void>((resolve) => {
    releasePause = resolve;
  });
  let firstPauseReached!: () => void;
  const reachedFirstPause = new Promise<void>((resolve) => {
    firstPauseReached = resolve;
  });

  const build = schedulePackSearchIndexBuild(target('schedule-cancel.db'), {
    chunkSize: 100,
    pauseBetweenChunks: async () => {
      pauses += 1;
      firstPauseReached();
      await pausedOnce;
    },
  });
  await reachedFirstPause;
  const cancelled = cancelPackSearchIndexBuild(path);
  releasePause();
  await cancelled;

  assert.equal(await build, 'cancelled');
  assert.equal(pauses, 1);
  rmSync(path);
  assert.equal(existsSync(path), false);
});

test('a failed build is not retried straight away, and cancelling clears that memory', async () => {
  const { schedulePackSearchIndexBuild, cancelPackSearchIndexBuild } = await load();
  const path = writePack('schedule-failed.db', { fillerVerses: 3000 });
  const pageCount = countRows(path, 'SELECT page_count AS count FROM pragma_page_count');
  faults.maxPageCountByPath.set(path, pageCount + 8);
  opens.length = 0;

  assert.equal(
    await schedulePackSearchIndexBuild(target('schedule-failed.db'), {
      chunkSize: 200,
      pauseBetweenChunks: noPause,
    }),
    'failed'
  );
  assert.equal(
    await schedulePackSearchIndexBuild(target('schedule-failed.db'), {
      pauseBetweenChunks: noPause,
    }),
    'failed'
  );
  assert.equal(opens.length, 1, 'the second request did not open the pack again');

  faults.maxPageCountByPath.delete(path);
  await cancelPackSearchIndexBuild(path);
  assert.equal(
    await schedulePackSearchIndexBuild(target('schedule-failed.db'), {
      pauseBetweenChunks: noPause,
    }),
    'ready'
  );
});
