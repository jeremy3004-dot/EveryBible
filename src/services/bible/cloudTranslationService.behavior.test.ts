/**
 * Behavioural tests for translation pack download + install, loaded through the real loader.
 *
 * `cloudTranslationInstall.test.ts` covers the same installer through a `vm` transpile of the
 * source; this file exercises the shipped module itself with `expo-sqlite` backed by real
 * `node:sqlite` databases and `expo-file-system/legacy` backed by a real temp directory, so the
 * SQL, the SHA-256 verification (pure-JS, no WebCrypto) and the file moves all really happen.
 *
 * The module never calls `fetch`; downloads go through `FileSystem.downloadAsync`, which the
 * fake below scripts per test.
 */
import test, { after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, type SupabaseQueryCall } from '../../testing/supabaseFake';
import type { CloudDownloadProgress } from './cloudTranslationService';

// ─── Temp filesystem ──────────────────────────────────────────────────────────

const root = mkdtempSync(`${tmpdir()}/everybible-cloudpack-`);
const documentDirectory = `${root}/documents/`;
const translationsDirectory = `${root}/documents/translations`;
mkdirSync(documentDirectory, { recursive: true });

after(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── Seed databases ───────────────────────────────────────────────────────────

interface SeedOptions {
  translationId?: string;
  verses?: number;
  versesTable?: boolean;
}

function buildPackBytes(options: SeedOptions = {}): Buffer {
  const path = `${root}/seed-${Math.random().toString(36).slice(2)}.db`;
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = DELETE');
  if (options.versesTable !== false) {
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
    `);
    const insert = database.prepare(
      'INSERT INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?, ?, ?, ?, ?)'
    );
    for (let index = 1; index <= (options.verses ?? 3); index += 1) {
      insert.run(options.translationId ?? 'pack', 'GEN', 1, index, `Verse ${index}`);
    }
  } else {
    database.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY)');
  }
  database.close();
  const bytes = readFileSync(path);
  rmSync(path, { force: true });
  return bytes;
}

const readVerseCount = (path: string): number => {
  const database = new DatabaseSync(path);
  try {
    return Number(
      (database.prepare('SELECT COUNT(*) as count FROM verses').get() as { count: number }).count
    );
  } finally {
    database.close();
  }
};

const readUserVersion = (path: string): number => {
  const database = new DatabaseSync(path);
  try {
    return Number(
      (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    );
  } finally {
    database.close();
  }
};

// ─── expo-sqlite fake over node:sqlite ────────────────────────────────────────

type SqlParam = string | number | bigint | null | Uint8Array;

const opens: Array<{ name: string; directory: string; options: unknown }> = [];
const closedPaths: string[] = [];
const openHandles: Array<{ path: string; closed: boolean }> = [];

mockModule(mock, 'expo-sqlite', {
  openDatabaseAsync: async (name: string, options: unknown, directory?: string) => {
    const resolvedDirectory = directory ?? `${root}/SQLite`;
    mkdirSync(resolvedDirectory, { recursive: true });
    const path = `${resolvedDirectory}/${name}`;
    opens.push({ name, directory: resolvedDirectory, options });
    const handle = new DatabaseSync(path);
    const record = { path, closed: false };
    openHandles.push(record);

    const statements = {
      async execAsync(sql: string): Promise<void> {
        handle.exec(sql);
      },
      async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
        return (
          (handle.prepare(sql).get(...((params ?? []) as SqlParam[])) as T | undefined) ?? null
        );
      },
      async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
        return handle.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[];
      },
      async runAsync(sql: string, params?: unknown[]) {
        const result = handle.prepare(sql).run(...((params ?? []) as SqlParam[]));
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
    };

    return {
      ...statements,
      async withExclusiveTransactionAsync(callback: (txn: typeof statements) => Promise<unknown>) {
        handle.exec('BEGIN IMMEDIATE');
        try {
          await callback(statements);
          handle.exec('COMMIT');
        } catch (error) {
          handle.exec('ROLLBACK');
          throw error;
        }
      },
      async closeAsync() {
        closedPaths.push(path);
        if (!record.closed) {
          record.closed = true;
          handle.close();
        }
      },
    };
  },
});

// ─── expo-file-system fake over a real temp directory ─────────────────────────

const download = {
  status: 200,
  bytes: buildPackBytes(),
  error: null as Error | null,
};
const fileSystemFaults = {
  failMove: null as ((from: string, to: string) => boolean) | null,
  unreadableBytes: false,
};
const fileSystemCalls: string[] = [];

mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory,
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: async (path: string) => {
    if (!existsSync(path)) {
      return { exists: false, uri: path };
    }
    const stats = statSync(path);
    return { exists: true, uri: path, size: stats.size, isDirectory: stats.isDirectory() };
  },
  makeDirectoryAsync: async (path: string) => {
    fileSystemCalls.push(`makeDirectory:${path}`);
    mkdirSync(path, { recursive: true });
  },
  deleteAsync: async (path: string) => {
    fileSystemCalls.push(`delete:${path}`);
    rmSync(path, { force: true, recursive: true });
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    fileSystemCalls.push(`move:${from}->${to}`);
    if (fileSystemFaults.failMove?.(from, to)) {
      throw new Error('native move failed');
    }
    renameSync(from, to);
  },
  downloadAsync: async (url: string, path: string) => {
    fileSystemCalls.push(`download:${url}`);
    if (download.error) {
      throw download.error;
    }
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, download.bytes);
    return { uri: path, status: download.status };
  },
  readAsStringAsync: async (path: string) =>
    fileSystemFaults.unreadableBytes
      ? 'not base64 at all!%'
      : readFileSync(path).toString('base64'),
});

// ─── Supabase fake ────────────────────────────────────────────────────────────

const supabaseFake = createSupabaseFake();
const supabaseState = { configured: true };
// mockSupabaseModule fixes `isSupabaseConfigured` for the whole file, and this module has an
// "unconfigured backend" branch that must be reachable alongside the configured ones, so the
// two supabase entry points are mocked directly with a mutable flag instead.
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => supabaseState.configured,
  getCurrentUserId: async () => supabaseFake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

const isCountQuery = (call: SupabaseQueryCall): boolean =>
  call.steps.some(
    (step) =>
      step.method === 'select' && (step.args[1] as { head?: boolean } | undefined)?.head === true
  );

const rangeOf = (call: SupabaseQueryCall): [number, number] => {
  const range = call.steps.find((step) => step.method === 'range');
  return [(range?.args[0] as number) ?? 0, (range?.args[1] as number) ?? 0];
};

const eqValue = (call: SupabaseQueryCall, column: string): unknown =>
  call.steps.find((step) => step.method === 'eq' && step.args[0] === column)?.args[1];

interface BackendScript {
  catalogId?: string | null;
  count?: number | null;
  countError?: string;
  pageError?: string;
  verses?: number;
}

function scriptBackend(script: BackendScript): void {
  supabaseFake.respondTo('translation_catalog', () => ({
    data:
      script.catalogId === undefined
        ? null
        : script.catalogId && { translation_id: script.catalogId },
  }));
  supabaseFake.respondTo('bible_verses', (call) => {
    if (isCountQuery(call)) {
      return script.countError
        ? { data: null, error: { message: script.countError } }
        : { data: null, count: script.count ?? null };
    }
    if (script.pageError) {
      return { data: null, error: { message: script.pageError } };
    }
    const [from, to] = rangeOf(call);
    const total = script.verses ?? 0;
    const rows = [];
    for (let index = from; index <= Math.min(to, total - 1); index += 1) {
      rows.push({
        id: index + 1,
        translation_id: eqValue(call, 'translation_id'),
        book_id: 'GEN',
        chapter: Math.floor(index / 50) + 1,
        verse: (index % 50) + 1,
        text: `Verse number ${index + 1}`,
        heading: index === 0 ? 'The Beginning' : null,
        formatting: null,
      });
    }
    return { data: rows };
  });
}

// ─── Module under test ────────────────────────────────────────────────────────

type CloudTranslationModule = typeof import('./cloudTranslationService');
let cloudTranslationService: CloudTranslationModule;

const loadModule = async (): Promise<CloudTranslationModule> => {
  cloudTranslationService ??= await import('./cloudTranslationService');
  return cloudTranslationService;
};

const packPath = (translationId: string) => `${translationsDirectory}/${translationId}.db`;
const stagingPath = (translationId: string) =>
  `${translationsDirectory}/${translationId}.staging.db`;

function collectProgress(): {
  onProgress: (progress: CloudDownloadProgress) => void;
  entries: CloudDownloadProgress[];
  phases: string[];
} {
  const entries: CloudDownloadProgress[] = [];
  return {
    entries,
    onProgress: (progress) => entries.push(progress),
    get phases() {
      return entries.map((entry) => entry.phase);
    },
  };
}

afterEach(() => {
  supabaseState.configured = true;
  download.status = 200;
  download.error = null;
  download.bytes = buildPackBytes();
  fileSystemFaults.failMove = null;
  fileSystemFaults.unreadableBytes = false;
  fileSystemCalls.length = 0;
  opens.length = 0;
  closedPaths.length = 0;
  openHandles.length = 0;
  supabaseFake.reset();
});

// ─── getCloudTranslationVerseCount ────────────────────────────────────────────

test('getCloudTranslationVerseCount refuses to run without a configured backend', async () => {
  const { getCloudTranslationVerseCount } = await loadModule();
  supabaseState.configured = false;

  await assert.rejects(() => getCloudTranslationVerseCount('web'), /Supabase not configured/);
  assert.deepEqual(supabaseFake.calls, [], 'an unconfigured backend must not be queried at all');
});

test('getCloudTranslationVerseCount counts rows under the aliased backend translation id', async () => {
  const { getCloudTranslationVerseCount } = await loadModule();
  scriptBackend({ catalogId: 'web', count: 31102 });

  assert.equal(await getCloudTranslationVerseCount('web'), 31102);

  const countCall = supabaseFake.callsFor('bible_verses')[0];
  assert.equal(
    eqValue(countCall, 'translation_id'),
    'engwebp',
    'the store id is mapped through the known backend aliases before counting'
  );
});

test('getCloudTranslationVerseCount falls back to the catalog id for an unaliased translation', async () => {
  const { getCloudTranslationVerseCount } = await loadModule();
  scriptBackend({ catalogId: 'spaRV1909x', count: 12 });

  assert.equal(await getCloudTranslationVerseCount('sparv1909x'), 12);
  assert.equal(eqValue(supabaseFake.callsFor('bible_verses')[0], 'translation_id'), 'spaRV1909x');
});

test('getCloudTranslationVerseCount keeps the requested id when the catalog has no row', async () => {
  const { getCloudTranslationVerseCount } = await loadModule();
  scriptBackend({ catalogId: null, count: 5 });

  assert.equal(await getCloudTranslationVerseCount('unknown'), 5);
  assert.equal(eqValue(supabaseFake.callsFor('bible_verses')[0], 'translation_id'), 'unknown');
});

test('getCloudTranslationVerseCount surfaces the backend error message', async () => {
  const { getCloudTranslationVerseCount } = await loadModule();
  scriptBackend({ catalogId: 'web', countError: 'statement timeout' });

  await assert.rejects(
    () => getCloudTranslationVerseCount('web'),
    /Failed to get verse count: statement timeout/
  );
});

test('getCloudTranslationVerseCount reports zero when the backend returns no count', async () => {
  const { getCloudTranslationVerseCount } = await loadModule();
  scriptBackend({ catalogId: 'web', count: null });

  assert.equal(await getCloudTranslationVerseCount('web'), 0);
});

// ─── downloadCloudTranslation ─────────────────────────────────────────────────

test('downloadCloudTranslation refuses to run without a configured backend', async () => {
  const { downloadCloudTranslation } = await loadModule();
  supabaseState.configured = false;

  await assert.rejects(() => downloadCloudTranslation('web'), /Supabase not configured/);
});

test('downloadCloudTranslation writes every fetched verse into a reader-compatible database', async () => {
  const { downloadCloudTranslation } = await loadModule();
  scriptBackend({ catalogId: 'demo', count: 7, verses: 7 });
  const progress = collectProgress();

  const installedPath = await downloadCloudTranslation('demo', progress.onProgress);

  assert.equal(installedPath, packPath('demo'));
  assert.equal(readVerseCount(installedPath), 7);
  assert.equal(
    readUserVersion(installedPath),
    5,
    'the pack declares the shared bundled schema version'
  );

  const database = new DatabaseSync(installedPath);
  const indexes = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
  const ftsTables = database
    .prepare("SELECT name FROM sqlite_master WHERE name = 'verses_fts'")
    .all();
  database.close();

  assert.deepEqual(indexes, ['idx_verses_lookup', 'idx_verses_unique']);
  assert.deepEqual(ftsTables, [], 'installed packs deliberately ship without an FTS index');
  assert.equal(
    existsSync(stagingPath('demo')),
    false,
    'the staging file is moved, never left behind'
  );
});

test('downloadCloudTranslation reports fetching, writing, indexing and completion in order', async () => {
  const { downloadCloudTranslation } = await loadModule();
  scriptBackend({ catalogId: 'progress', count: 4, verses: 4 });
  const progress = collectProgress();

  await downloadCloudTranslation('progress', progress.onProgress);

  assert.deepEqual(progress.phases, [
    'fetching',
    'fetching',
    'writing',
    'writing',
    'indexing',
    'complete',
  ]);
  assert.deepEqual(progress.entries[0], { phase: 'fetching', versesDownloaded: 0, totalVerses: 4 });
  assert.deepEqual(progress.entries.at(-1), {
    phase: 'complete',
    versesDownloaded: 4,
    totalVerses: 4,
  });
});

test('downloadCloudTranslation reports an unavailable translation when the backend has no verses', async () => {
  const { downloadCloudTranslation } = await loadModule();
  scriptBackend({ catalogId: 'empty', count: 0, verses: 0 });
  const progress = collectProgress();

  await assert.rejects(
    () => downloadCloudTranslation('empty', progress.onProgress),
    /EMPTY is not currently available from the backend/
  );
  assert.equal(progress.phases.at(-1), 'error');
  assert.equal(existsSync(packPath('empty')), false);
});

test('downloadCloudTranslation refuses to install a short download', async () => {
  const { downloadCloudTranslation } = await loadModule();
  scriptBackend({ catalogId: 'short', count: 9, verses: 4 });
  const progress = collectProgress();

  await assert.rejects(
    () => downloadCloudTranslation('short', progress.onProgress),
    /Incomplete backend download for SHORT: expected 9 verses, received 4/
  );
  assert.deepEqual(progress.entries.at(-1), {
    phase: 'error',
    versesDownloaded: 0,
    totalVerses: 0,
    error: 'Incomplete backend download for SHORT: expected 9 verses, received 4.',
  });
  assert.equal(existsSync(packPath('short')), false);
});

test('downloadCloudTranslation surfaces the offset of a failed page fetch', async () => {
  const { downloadCloudTranslation } = await loadModule();
  scriptBackend({ catalogId: 'broken', count: 10, pageError: 'connection reset' });

  await assert.rejects(
    () => downloadCloudTranslation('broken'),
    /Failed to fetch verses at offset 0: connection reset/
  );
  assert.equal(
    existsSync(stagingPath('broken')),
    false,
    'a failed fetch leaves no staging artifacts'
  );
});

test('downloadCloudTranslation keeps the previously installed pack when the new install fails', async () => {
  const { downloadCloudTranslation } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('keep'), buildPackBytes({ verses: 2 }));
  scriptBackend({ catalogId: 'keep', count: 3, pageError: 'gateway timeout' });

  await assert.rejects(() => downloadCloudTranslation('keep'));

  assert.equal(
    readVerseCount(packPath('keep')),
    2,
    'the working install survives a failed replacement'
  );
});

test('downloadCloudTranslation closes its writer handle even when the install fails later', async () => {
  const { downloadCloudTranslation } = await loadModule();
  scriptBackend({ catalogId: 'closed', count: 3, verses: 3 });
  fileSystemFaults.failMove = (from) => from.endsWith('closed.staging.db');

  await assert.rejects(() => downloadCloudTranslation('closed'));

  assert.ok(openHandles.length > 0);
  assert.ok(
    openHandles.every((handle) => handle.closed),
    'every sqlite handle opened during a failed install must be closed'
  );
});

// ─── downloadCatalogTextPack ──────────────────────────────────────────────────

test('downloadCatalogTextPack installs a downloaded pack and reports progress', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const progress = collectProgress();

  const installedPath = await downloadCatalogTextPack({
    translationId: 'catalog',
    downloadUrl: 'https://media.example.test/catalog.db',
    expectedVerseCount: 3,
    onProgress: progress.onProgress,
  });

  assert.equal(installedPath, packPath('catalog'));
  assert.equal(readVerseCount(installedPath), 3);
  assert.deepEqual(progress.phases, ['fetching', 'indexing', 'complete']);
  assert.ok(fileSystemCalls.includes('download:https://media.example.test/catalog.db'));
});

test('downloadCatalogTextPack resolves a relative download path against the asset base URL', async () => {
  const { downloadCatalogTextPack } = await loadModule();

  await downloadCatalogTextPack({
    translationId: 'relative',
    downloadUrl: 'text/relative.db',
    expectedVerseCount: 1,
  });

  assert.ok(
    fileSystemCalls.includes('download:https://media.everybible.app/text/relative.db'),
    'a catalog-relative path is resolved against the configured Bible asset host'
  );
});

test('downloadCatalogTextPack rejects a download URL that resolves to nothing reachable', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const progress = collectProgress();

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'unreachable',
        downloadUrl: 'file:///private/local.db',
        onProgress: progress.onProgress,
      }),
    /No reachable Bible asset URL is configured for UNREACHABLE/
  );
  assert.deepEqual(
    fileSystemCalls.filter((call) => call.startsWith('download:')),
    [],
    'an unresolvable reference must not reach the network layer'
  );
  assert.equal(progress.phases.at(-1), 'error');
});

test('downloadCatalogTextPack rejects a non-2xx download', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.status = 503;

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'http',
        downloadUrl: 'https://media.example.test/http.db',
        expectedVerseCount: 1,
      }),
    /Translation download failed with HTTP 503/
  );
  assert.equal(existsSync(stagingPath('http')), false);
});

test('downloadCatalogTextPack accepts a pack whose checksum matches', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const expectedSha256 = createHash('sha256').update(download.bytes).digest('hex');

  const installedPath = await downloadCatalogTextPack({
    translationId: 'checked',
    downloadUrl: 'https://media.example.test/checked.db',
    expectedVerseCount: 3,
    expectedSha256: expectedSha256.toUpperCase(),
  });

  assert.equal(readVerseCount(installedPath), 3, 'an uppercase digest still verifies');
});

test('downloadCatalogTextPack rejects a pack whose checksum does not match', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const otherBytes = buildPackBytes({ verses: 3, translationId: 'other' });

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'mismatch',
        downloadUrl: 'https://media.example.test/mismatch.db',
        expectedVerseCount: 3,
        expectedSha256: createHash('sha256').update(otherBytes).digest('hex'),
      }),
    /failed integrity verification \(checksum mismatch\)/
  );
  assert.equal(existsSync(packPath('mismatch')), false);
});

test('downloadCatalogTextPack rejects a malformed expected checksum without hashing anything', async () => {
  const { downloadCatalogTextPack } = await loadModule();

  for (const expectedSha256 of ['', 'not-a-sha256', 'a'.repeat(63), 'g'.repeat(64)]) {
    await assert.rejects(
      () =>
        downloadCatalogTextPack({
          translationId: 'malformed',
          downloadUrl: 'https://media.example.test/malformed.db',
          expectedVerseCount: 3,
          expectedSha256,
        }),
      /invalid expected checksum/
    );
  }
  assert.equal(existsSync(packPath('malformed')), false);
});

test('downloadCatalogTextPack fails closed when the downloaded bytes cannot be decoded', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  fileSystemFaults.unreadableBytes = true;

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'undecodable',
        downloadUrl: 'https://media.example.test/undecodable.db',
        expectedVerseCount: 3,
        expectedSha256: createHash('sha256').update(download.bytes).digest('hex'),
      }),
    /could not be decoded for checksum verification/
  );
  assert.equal(existsSync(packPath('undecodable')), false);
});

test('downloadCatalogTextPack rejects a pack with no verses table', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildPackBytes({ versesTable: false });

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'notadb',
        downloadUrl: 'https://media.example.test/notadb.db',
        expectedVerseCount: 1,
      }),
    /missing the verses table/
  );
  assert.equal(existsSync(packPath('notadb')), false);
});

test('downloadCatalogTextPack rejects a pack with fewer verses than the catalog promises', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildPackBytes({ verses: 2 });

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'partial',
        downloadUrl: 'https://media.example.test/partial.db',
        expectedVerseCount: 9,
      }),
    /incomplete \(2\/9 verses\)/
  );
});

test('downloadCatalogTextPack still requires at least one verse when no count is declared', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildPackBytes({ verses: 0 });

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'noverses',
        downloadUrl: 'https://media.example.test/noverses.db',
      }),
    /incomplete \(0\/1 verses\)/
  );
});

test('downloadCatalogTextPack restores the previous install when activation fails', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('rollback'), buildPackBytes({ verses: 2 }));
  writeFileSync(`${packPath('rollback')}-wal`, 'previous wal');
  fileSystemFaults.failMove = (from) => from.endsWith('rollback.staging.db');

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'rollback',
        downloadUrl: 'https://media.example.test/rollback.db',
        expectedVerseCount: 3,
      }),
    /native move failed/
  );

  // Read the sidecar first: opening the restored database checkpoints and removes it.
  assert.equal(readFileSync(`${packPath('rollback')}-wal`, 'utf8'), 'previous wal');
  assert.equal(readVerseCount(packPath('rollback')), 2, 'the installed pack is put back');
  assert.equal(
    readdirSync(translationsDirectory).some((entry) => entry.includes('.rollback')),
    false,
    'a completed rollback leaves no backup files behind'
  );
});

test('downloadCatalogTextPack keeps the backup when the rollback itself fails', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('doomed'), buildPackBytes({ verses: 2 }));
  // The installed copy is backed up, activation fails, and putting the backup back fails too.
  fileSystemFaults.failMove = (from) => from.endsWith('.staging.db') || from.includes('.rollback');

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'doomed',
        downloadUrl: 'https://media.example.test/doomed.db',
        expectedVerseCount: 3,
      }),
    /Translation activation and rollback failed; recover the backup at .*doomed\.db\.rollback/
  );

  assert.equal(
    readVerseCount(`${packPath('doomed')}.rollback`),
    2,
    'an unrecoverable rollback must leave the backup on disk for manual recovery'
  );
});

test('downloadCatalogTextPack refuses to run while a previous rollback is still pending', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('pending'), buildPackBytes({ verses: 2 }));
  writeFileSync(`${packPath('pending')}.rollback`, 'unrecovered backup');

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'pending',
        downloadUrl: 'https://media.example.test/pending.db',
        expectedVerseCount: 3,
      }),
    /A previous translation rollback needs recovery/
  );

  assert.equal(readFileSync(`${packPath('pending')}.rollback`, 'utf8'), 'unrecovered backup');
  assert.equal(readVerseCount(packPath('pending')), 2);
  assert.deepEqual(
    fileSystemCalls.filter((call) => call.startsWith('move:')),
    [],
    'nothing is moved while an unrecovered backup exists'
  );
});

test('downloadCatalogTextPack cleans up staging artifacts when the download throws', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(stagingPath('leftover'), 'partial file from an earlier attempt');
  writeFileSync(`${stagingPath('leftover')}-wal`, 'partial wal');
  download.error = new Error('the network went away');

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'leftover',
        downloadUrl: 'https://media.example.test/leftover.db',
        expectedVerseCount: 3,
      }),
    /the network went away/
  );

  assert.equal(existsSync(stagingPath('leftover')), false);
  assert.equal(existsSync(`${stagingPath('leftover')}-wal`), false);
});
