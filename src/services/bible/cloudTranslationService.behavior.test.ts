/**
 * Behavioural tests for translation pack download + install, loaded through the real loader.
 *
 * This file exercises the shipped module itself with `expo-sqlite` backed by real `node:sqlite`
 * databases and `expo-file-system/legacy` backed by a real temp directory, so the SQL, the
 * SHA-256 verification (pure-JS, no WebCrypto) and the file moves all really happen.
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
import { mockModule } from '../../testing/mockModules';
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

// ─── expo-sqlite fake over node:sqlite ────────────────────────────────────────

type SqlParam = string | number | bigint | null | Uint8Array;

const opens: Array<{ name: string; directory: string; options: unknown }> = [];
const openHandles: Array<{ path: string; closed: boolean }> = [];

const sqliteFaults = { failOpen: false };

mockModule(mock, 'expo-sqlite', {
  openDatabaseAsync: async (name: string, options: unknown, directory?: string) => {
    if (sqliteFaults.failOpen) {
      throw new Error('native sqlite open failed');
    }
    const resolvedDirectory = directory ?? `${root}/SQLite`;
    mkdirSync(resolvedDirectory, { recursive: true });
    const path = `${resolvedDirectory}/${name}`;
    opens.push({ name, directory: resolvedDirectory, options });
    const handle = new DatabaseSync(path);
    const record = { path, closed: false };
    openHandles.push(record);

    return {
      async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
        return (
          (handle.prepare(sql).get(...((params ?? []) as SqlParam[])) as T | undefined) ?? null
        );
      },
      async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
        return handle.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[];
      },
      async closeAsync() {
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
const resumable = {
  enabled: false,
  cancelled: false,
  resolve: null as (() => void) | null,
  started: null as (() => void) | null,
};
const fileSystemFaults = {
  failMove: null as ((from: string, to: string) => boolean) | null,
  unreadableBytes: false,
};
const fileSystemCalls: string[] = [];

const fakeDownload = async (url: string, path: string) => {
  fileSystemCalls.push(`download:${url}`);
  if (download.error) throw download.error;
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, download.bytes);
  return { uri: path, status: download.status };
};

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
  downloadAsync: async (url: string, path: string) => fakeDownload(url, path),
  createDownloadResumable: (url: string, path: string) => ({
    downloadAsync: async () => {
      if (resumable.enabled) {
        await new Promise<void>((resolve) => {
          resumable.resolve = resolve;
          resumable.started?.();
        });
        if (resumable.cancelled) return undefined;
      }
      return fakeDownload(url, path);
    },
    cancelAsync: async () => {
      resumable.cancelled = true;
    },
  }),
  readAsStringAsync: async (path: string) =>
    fileSystemFaults.unreadableBytes
      ? 'not base64 at all!%'
      : readFileSync(path).toString('base64'),
});

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
  download.status = 200;
  download.error = null;
  download.bytes = buildPackBytes();
  resumable.enabled = false;
  resumable.cancelled = false;
  resumable.resolve = null;
  resumable.started = null;
  fileSystemFaults.failMove = null;
  fileSystemFaults.unreadableBytes = false;
  sqliteFaults.failOpen = false;
  fileSystemCalls.length = 0;
  opens.length = 0;
  openHandles.length = 0;
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

test('cancelActiveCatalogTextPackDownload prevents a late native completion from installing', async () => {
  const {
    cancelActiveCatalogTextPackDownload,
    downloadCatalogTextPack,
    isTextPackDownloadCancelled,
  } = await loadModule();
  resumable.enabled = true;
  const started = new Promise<void>((resolve) => {
    resumable.started = resolve;
  });

  const promise = downloadCatalogTextPack({
    translationId: 'cancelled',
    downloadUrl: 'https://media.example.test/cancelled.db',
    expectedVerseCount: 3,
  });
  await started;

  cancelActiveCatalogTextPackDownload();
  resumable.resolve?.();

  await assert.rejects(promise, (error: unknown) => isTextPackDownloadCancelled(error));
  assert.equal(existsSync(packPath('cancelled')), false);
});

test('recoverInterruptedCatalogTextPack restores a complete legacy rollback set', async () => {
  const { recoverInterruptedCatalogTextPack, getCatalogTextPackPaths } = await loadModule();
  const paths = getCatalogTextPackPaths('legacy-recovery');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(paths.rollbackPath, buildPackBytes({ translationId: 'legacy-recovery' }));
  writeFileSync(`${paths.finalPath}-wal`, Buffer.from('stale sidecar'));

  await recoverInterruptedCatalogTextPack(paths);

  assert.equal(readVerseCount(paths.finalPath), 3);
  assert.equal(existsSync(`${paths.finalPath}-wal`), false);
  assert.equal(existsSync(paths.rollbackPath), false);
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
  assert.ok(openHandles.length > 0);
  assert.ok(
    openHandles.every((handle) => handle.closed),
    'the verification handle must be closed even when the pack is rejected'
  );
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

test('an invalid pack is rejected before the working install is touched at all', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('untouched'), buildPackBytes({ verses: 2 }));
  download.bytes = buildPackBytes({ versesTable: false });
  fileSystemCalls.length = 0;

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'untouched',
        downloadUrl: 'https://media.example.test/untouched.db',
        expectedVerseCount: 1,
      }),
    /missing the verses table/
  );

  assert.equal(readVerseCount(packPath('untouched')), 2);
  assert.deepEqual(
    fileSystemCalls.filter((call) => call.startsWith('move:')),
    [],
    'verification runs before the installed copy is backed up or replaced'
  );
});

// ─── Native-crash and Hermes guards ───────────────────────────────────────────

test('every sqlite handle an install opens disables expo-sqlite auto-finalization', async () => {
  const { downloadCatalogTextPack } = await loadModule();

  await downloadCatalogTextPack({
    translationId: 'finalize',
    downloadUrl: 'https://media.example.test/finalize.db',
    expectedVerseCount: 3,
  });

  assert.ok(opens.length >= 1);
  assert.deepEqual(
    [...new Set(opens.map((entry) => JSON.stringify(entry.options)))],
    [JSON.stringify({ finalizeUnusedStatementsBeforeClosing: false })],
    'expo-sqlite crashes natively in closeDatabase when it auto-finalizes statements'
  );
});

test('an install whose sqlite open fails leaves the previous pack and no staging file', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('unopenable'), buildPackBytes({ verses: 2 }));
  sqliteFaults.failOpen = true;

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'unopenable',
        downloadUrl: 'https://media.example.test/unopenable.db',
        expectedVerseCount: 3,
      }),
    /native sqlite open failed/
  );

  assert.equal(readVerseCount(packPath('unopenable')), 2);
  assert.equal(existsSync(stagingPath('unopenable')), false);
});

test('checksum verification runs on Hermes, where Web Crypto and atob do not exist', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const expectedSha256 = createHash('sha256').update(download.bytes).digest('hex');
  const savedCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const savedAtob = Object.getOwnPropertyDescriptor(globalThis, 'atob');
  Reflect.deleteProperty(globalThis, 'crypto');
  Reflect.deleteProperty(globalThis, 'atob');

  try {
    assert.equal(
      readVerseCount(
        await downloadCatalogTextPack({
          translationId: 'hermes',
          downloadUrl: 'https://media.example.test/hermes.db',
          expectedVerseCount: 3,
          expectedSha256,
        })
      ),
      3
    );

    await assert.rejects(
      () =>
        downloadCatalogTextPack({
          translationId: 'hermesbad',
          downloadUrl: 'https://media.example.test/hermesbad.db',
          expectedVerseCount: 3,
          expectedSha256: 'a'.repeat(64),
        }),
      /checksum mismatch/,
      'a pure-JS digest must still reject the wrong bytes, never pass them through'
    );
  } finally {
    if (savedCrypto) Object.defineProperty(globalThis, 'crypto', savedCrypto);
    if (savedAtob) Object.defineProperty(globalThis, 'atob', savedAtob);
  }
});
