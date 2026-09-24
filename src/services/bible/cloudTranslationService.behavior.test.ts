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
  /**
   * With `error`, how many bytes land in the destination before the transfer throws: a
   * connection dropped mid-body, or a disk that filled up while writing.
   */
  bytesWrittenBeforeError: 0,
};
const resumable = {
  enabled: false,
  cancelled: false,
  resolve: null as (() => void) | null,
  started: null as (() => void) | null,
  /** Native progress callbacks fired once the transfer is allowed to proceed. */
  progressEvents: [] as { totalBytesWritten: number; totalBytesExpectedToWrite: number }[],
  cancelError: null as Error | null,
};
const fileSystemFaults = {
  failMove: null as ((from: string, to: string) => boolean) | null,
  failDelete: null as ((path: string) => boolean) | null,
  failMakeDirectory: null as Error | null,
  unreadableBytes: false,
};
const fileSystemCalls: string[] = [];
const base64Reads: { path: string; position?: number; length?: number }[] = [];

const fakeDownload = async (url: string, path: string) => {
  fileSystemCalls.push(`download:${url}`);
  if (download.error) {
    if (download.bytesWrittenBeforeError > 0) {
      mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
      writeFileSync(path, download.bytes.subarray(0, download.bytesWrittenBeforeError));
    }
    throw download.error;
  }
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
    if (fileSystemFaults.failMakeDirectory) throw fileSystemFaults.failMakeDirectory;
    mkdirSync(path, { recursive: true });
  },
  deleteAsync: async (path: string) => {
    fileSystemCalls.push(`delete:${path}`);
    if (fileSystemFaults.failDelete?.(path)) {
      throw new Error('native delete failed');
    }
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
  createDownloadResumable: (
    url: string,
    path: string,
    _options: unknown,
    onNativeProgress?: (progress: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void
  ) => ({
    downloadAsync: async () => {
      if (resumable.enabled) {
        await new Promise<void>((resolve) => {
          resumable.resolve = resolve;
          resumable.started?.();
        });
      }
      for (const event of resumable.progressEvents) {
        onNativeProgress?.(event);
      }
      if (resumable.cancelled) return undefined;
      return fakeDownload(url, path);
    },
    cancelAsync: async () => {
      resumable.cancelled = true;
      if (resumable.cancelError) throw resumable.cancelError;
    },
  }),
  readAsStringAsync: async (path: string, options?: { position?: number; length?: number }) => {
    base64Reads.push({ path, position: options?.position, length: options?.length });
    if (fileSystemFaults.unreadableBytes) return 'not base64 at all!%';
    const bytes = readFileSync(path);
    const start = options?.position ?? 0;
    const end = options?.length == null ? bytes.length : start + options.length;
    return bytes.subarray(start, end).toString('base64');
  },
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
  download.bytesWrittenBeforeError = 0;
  fileSystemFaults.failMakeDirectory = null;
  download.bytes = buildPackBytes();
  resumable.enabled = false;
  resumable.cancelled = false;
  resumable.resolve = null;
  resumable.started = null;
  resumable.progressEvents = [];
  resumable.cancelError = null;
  fileSystemFaults.failMove = null;
  fileSystemFaults.failDelete = null;
  fileSystemFaults.unreadableBytes = false;
  base64Reads.length = 0;
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

test('checksum verification reads the pack in bounded chunks, never as one string', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildPackBytes();
  const expectedSha256 = createHash('sha256').update(download.bytes).digest('hex');

  await downloadCatalogTextPack({
    translationId: 'chunked',
    downloadUrl: 'https://media.example.test/chunked.db',
    expectedVerseCount: 3,
    expectedSha256,
  });

  assert.ok(base64Reads.length > 0);
  for (const read of base64Reads) {
    assert.equal(typeof read.position, 'number', 'every read names its offset');
    assert.ok(
      typeof read.length === 'number' && read.length > 0 && read.length <= 256 * 1024,
      `read of ${read.length} bytes must be bounded`
    );
  }
  assert.equal(
    base64Reads.reduce((total, read) => total + (read.length ?? 0), 0),
    download.bytes.length
  );
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

// ─── Custom pack shapes ───────────────────────────────────────────────────────

/** A pack built from arbitrary SQL, for schemas `buildPackBytes` cannot express. */
function buildCustomPackBytes(setupSql: string): Buffer {
  const path = `${root}/custom-${Math.random().toString(36).slice(2)}.db`;
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = DELETE');
  database.exec(setupSql);
  database.close();
  const bytes = readFileSync(path);
  rmSync(path, { force: true });
  return bytes;
}

/** Holds the next resumable transfer open until the returned `release` is called. */
function holdNextTransfer(): { started: Promise<void>; release: () => void } {
  resumable.enabled = true;
  const started = new Promise<void>((resolve) => {
    resumable.started = resolve;
  });
  return { started, release: () => resumable.resolve?.() };
}

const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// ─── Transfer progress and cancellation ───────────────────────────────────────

test('downloadCatalogTextPack reports native byte progress and omits an unknown total size', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const progress = collectProgress();
  resumable.progressEvents = [
    { totalBytesWritten: 512, totalBytesExpectedToWrite: 2048 },
    { totalBytesWritten: 900, totalBytesExpectedToWrite: -1 },
  ];

  await downloadCatalogTextPack({
    translationId: 'bytes',
    downloadUrl: 'https://media.example.test/bytes.db',
    expectedVerseCount: 3,
    onProgress: progress.onProgress,
  });

  assert.deepEqual(
    progress.entries.filter((entry) => entry.bytesDownloaded !== undefined),
    [
      {
        phase: 'fetching',
        versesDownloaded: 0,
        totalVerses: 3,
        bytesDownloaded: 512,
        bytesTotal: 2048,
      },
      {
        phase: 'fetching',
        versesDownloaded: 0,
        totalVerses: 3,
        bytesDownloaded: 900,
        bytesTotal: undefined,
      },
    ]
  );
});

test('cancelActiveCatalogTextPackDownload cancels only the named translation and silences its progress', async () => {
  const {
    cancelActiveCatalogTextPackDownload,
    downloadCatalogTextPack,
    isTextPackDownloadCancelled,
  } = await loadModule();
  const progress = collectProgress();
  const transfer = holdNextTransfer();
  resumable.progressEvents = [{ totalBytesWritten: 10, totalBytesExpectedToWrite: 20 }];
  resumable.cancelError = new Error('native cancel failed');

  const promise = downloadCatalogTextPack({
    translationId: 'named',
    downloadUrl: 'https://media.example.test/named.db',
    expectedVerseCount: 3,
    onProgress: progress.onProgress,
  });
  await transfer.started;

  assert.equal(cancelActiveCatalogTextPackDownload('someone-else'), false);
  assert.equal(cancelActiveCatalogTextPackDownload('named'), true);
  transfer.release();

  await assert.rejects(promise, (error: unknown) => isTextPackDownloadCancelled(error));
  assert.deepEqual(
    progress.phases,
    ['fetching'],
    'no byte, error or completion progress after cancel'
  );
  assert.equal(existsSync(packPath('named')), false);
  assert.equal(existsSync(stagingPath('named')), false);
  assert.equal(cancelActiveCatalogTextPackDownload(), false, 'nothing is active any more');
});

test('a transfer the native layer abandons on its own is reported as cancelled, not as an error', async () => {
  const { downloadCatalogTextPack, isTextPackDownloadCancelled } = await loadModule();
  const progress = collectProgress();
  resumable.enabled = true;
  resumable.cancelled = true;
  resumable.started = () => resumable.resolve?.();

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'abandoned',
      downloadUrl: 'https://media.example.test/abandoned.db',
      expectedVerseCount: 3,
      onProgress: progress.onProgress,
    }),
    (error: unknown) => isTextPackDownloadCancelled(error)
  );
  assert.deepEqual(progress.phases, ['fetching']);
});

test('a cancel during checksum verification stops hashing before the pack is read', async () => {
  const {
    cancelActiveCatalogTextPackDownload,
    downloadCatalogTextPack,
    isTextPackDownloadCancelled,
  } = await loadModule();
  const progress = collectProgress();

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'hashcancel',
      downloadUrl: 'https://media.example.test/hashcancel.db',
      expectedVerseCount: 3,
      expectedSha256: sha256Hex(download.bytes),
      onProgress: progress.onProgress,
      onPhase: (phase) => {
        if (phase === 'verifying') cancelActiveCatalogTextPackDownload('hashcancel');
      },
    }),
    (error: unknown) => isTextPackDownloadCancelled(error)
  );
  assert.equal(base64Reads.length, 0);
  assert.equal(progress.phases.includes('error'), false);
  assert.equal(existsSync(stagingPath('hashcancel')), false);
  assert.equal(existsSync(packPath('hashcancel')), false);
});

test('a cancel during verification of a pack without a checksum still stops the install', async () => {
  const {
    cancelActiveCatalogTextPackDownload,
    downloadCatalogTextPack,
    isTextPackDownloadCancelled,
  } = await loadModule();

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'verifycancel',
      downloadUrl: 'https://media.example.test/verifycancel.db',
      expectedVerseCount: 3,
      onPhase: (phase) => {
        if (phase === 'verifying') cancelActiveCatalogTextPackDownload('verifycancel');
      },
    }),
    (error: unknown) => isTextPackDownloadCancelled(error)
  );
  assert.equal(opens.length, 0, 'the staged database is never opened');
  assert.equal(existsSync(packPath('verifycancel')), false);
});

test('a cancel while the staged database is being checked prevents activation', async () => {
  const {
    cancelActiveCatalogTextPackDownload,
    downloadCatalogTextPack,
    isTextPackDownloadCancelled,
  } = await loadModule();
  const phases: string[] = [];

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'indexcancel',
      downloadUrl: 'https://media.example.test/indexcancel.db',
      expectedVerseCount: 3,
      onProgress: (progress) => {
        if (progress.phase === 'indexing') cancelActiveCatalogTextPackDownload('indexcancel');
      },
      onPhase: (phase) => phases.push(phase),
    }),
    (error: unknown) => isTextPackDownloadCancelled(error)
  );
  assert.deepEqual(phases, ['verifying']);
  assert.equal(existsSync(packPath('indexcancel')), false);
});

test('a cancel that arrives once activation has begun is refused and the install completes', async () => {
  const { cancelActiveCatalogTextPackDownload, downloadCatalogTextPack } = await loadModule();
  let accepted: boolean | null = null;

  const installedPath = await downloadCatalogTextPack({
    translationId: 'lateactivate',
    downloadUrl: 'https://media.example.test/lateactivate.db',
    expectedVerseCount: 3,
    onPhase: (phase) => {
      if (phase === 'activating') accepted = cancelActiveCatalogTextPackDownload('lateactivate');
    },
  });

  assert.equal(accepted, false);
  assert.equal(readVerseCount(installedPath), 3);
});

// ─── Concurrency tracking ─────────────────────────────────────────────────────

test('waitForActiveCatalogTextPackDownload resolves at once when nothing is downloading', async () => {
  const { waitForActiveCatalogTextPackDownload } = await loadModule();

  assert.equal(await waitForActiveCatalogTextPackDownload('idle'), undefined);
});

test('waitForActiveCatalogTextPackDownload settles quietly once a failing download finishes', async () => {
  const { downloadCatalogTextPack, waitForActiveCatalogTextPackDownload } = await loadModule();
  const transfer = holdNextTransfer();
  download.status = 500;

  const promise = downloadCatalogTextPack({
    translationId: 'waitfail',
    downloadUrl: 'https://media.example.test/waitfail.db',
    expectedVerseCount: 3,
  });
  const rejection = assert.rejects(promise, /HTTP 500/);
  await transfer.started;
  const waiting = waitForActiveCatalogTextPackDownload('waitfail');
  transfer.release();

  assert.equal(await waiting, undefined, 'the wait never rethrows the download failure');
  await rejection;
});

test('a second download for the same translation is refused while the first continues', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const transfer = holdNextTransfer();

  const first = downloadCatalogTextPack({
    translationId: 'twice',
    downloadUrl: 'https://media.example.test/twice.db',
    expectedVerseCount: 3,
  });
  await transfer.started;

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'twice',
      downloadUrl: 'https://media.example.test/twice.db',
      expectedVerseCount: 3,
    }),
    /A text pack download is already in progress for twice/
  );
  transfer.release();

  assert.equal(readVerseCount(await first), 3);
});

// Regression: the refused duplicate used to replace the settlement entry for the translation,
// and removed it again when it rejected. waitForActiveCatalogTextPackDownload then resolved
// immediately, so a delete could run while the original transfer was still writing.
test('a refused duplicate download does not stop waitForActiveCatalogTextPackDownload tracking the original', async () => {
  const { downloadCatalogTextPack, waitForActiveCatalogTextPackDownload } = await loadModule();
  const transfer = holdNextTransfer();

  const first = downloadCatalogTextPack({
    translationId: 'tracked',
    downloadUrl: 'https://media.example.test/tracked.db',
    expectedVerseCount: 3,
  });
  await transfer.started;
  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'tracked',
      downloadUrl: 'https://media.example.test/tracked.db',
      expectedVerseCount: 3,
    }),
    /already in progress/
  );

  let waitSettled = false;
  const waiting = waitForActiveCatalogTextPackDownload('tracked').then(() => {
    waitSettled = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(waitSettled, false, 'the original transfer is still in flight');

  transfer.release();
  assert.equal(await first, packPath('tracked'));
  await waiting;
  assert.equal(waitSettled, true);
});

// ─── Failure paths ────────────────────────────────────────────────────────────

test('a non-Error failure is reported as an unknown download error and rethrown as-is', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  const progress = collectProgress();
  download.error = 'socket hang up' as unknown as Error;

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'nonerror',
      downloadUrl: 'https://media.example.test/nonerror.db',
      onProgress: progress.onProgress,
    }),
    (error: unknown) => error === 'socket hang up'
  );
  assert.deepEqual(progress.entries.at(-1), {
    phase: 'error',
    versesDownloaded: 0,
    totalVerses: 0,
    error: 'Unknown download error',
  });
});

test('a staging cleanup failure after a bad download leaves the evidence and keeps the original error', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.status = 404;
  fileSystemFaults.failDelete = (path) => path.includes('stuck.staging.db');

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'stuck',
      downloadUrl: 'https://media.example.test/stuck.db',
      expectedVerseCount: 3,
    }),
    /Translation download failed with HTTP 404/
  );
  assert.equal(existsSync(stagingPath('stuck')), true);
});

test('a successful install survives a failure to delete the previous pack backup', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath('keepbackup'), buildPackBytes({ verses: 2 }));
  fileSystemFaults.failDelete = (path) => path.includes('keepbackup.db.rollback');

  const installedPath = await downloadCatalogTextPack({
    translationId: 'keepbackup',
    downloadUrl: 'https://media.example.test/keepbackup.db',
    expectedVerseCount: 3,
  });

  assert.equal(readVerseCount(installedPath), 3);
  assert.equal(
    readVerseCount(`${packPath('keepbackup')}.rollback`),
    2,
    'the backup is left for the recovery pass to retire'
  );
});

test('downloadCatalogTextPack rejects a verses table missing a required column', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildCustomPackBytes(`
    CREATE TABLE verses (translation_id TEXT, book_id TEXT, chapter INTEGER, verse INTEGER);
    INSERT INTO verses VALUES ('schema', 'GEN', 1, 1);
  `);

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'schema',
      downloadUrl: 'https://media.example.test/schema.db',
    }),
    /incompatible verses schema/
  );
  assert.equal(existsSync(packPath('schema')), false);
});

test('downloadCatalogTextPack rejects a pack whose first verse is blank', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildCustomPackBytes(`
    CREATE TABLE verses (translation_id TEXT, book_id TEXT, chapter INTEGER, verse INTEGER, text TEXT);
    INSERT INTO verses VALUES ('blank', 'GEN', 1, 1, '   ');
  `);

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'blank',
      downloadUrl: 'https://media.example.test/blank.db',
    }),
    /has no readable verse/
  );
});

// ─── Injected transfer failures ───────────────────────────────────────────────

/** A pack of `verses` verses already installed for `translationId`, as a working install. */
function installWorkingPack(translationId: string, verses = 2): void {
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(packPath(translationId), buildPackBytes({ translationId, verses }));
}

const assertWorkingPackKept = (translationId: string, verses = 2): void => {
  assert.equal(readVerseCount(packPath(translationId)), verses, 'the installed pack still reads');
  assert.equal(existsSync(stagingPath(translationId)), false, 'no partial staging file remains');
  assert.equal(existsSync(`${packPath(translationId)}.rollback`), false);
};

test('every error answer, and a redirect the transport did not follow, keeps the installed pack', async () => {
  const { downloadCatalogTextPack } = await loadModule();

  for (const status of [301, 302, 404, 410, 500, 502]) {
    installWorkingPack('statuses');
    download.status = status;

    await assert.rejects(
      () =>
        downloadCatalogTextPack({
          translationId: 'statuses',
          downloadUrl: 'https://media.example.test/statuses.db',
          expectedVerseCount: 3,
        }),
      new RegExp(`Translation download failed with HTTP ${status}\\.`),
      `HTTP ${status}`
    );
    assertWorkingPackKept('statuses');
  }
});

test('a connection that drops mid-transfer discards the partial file and keeps the installed pack', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  installWorkingPack('dropped');
  download.bytesWrittenBeforeError = Math.floor(download.bytes.length / 2);
  download.error = new Error('The network connection was lost.');
  const progress = collectProgress();

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'dropped',
        downloadUrl: 'https://media.example.test/dropped.db',
        expectedVerseCount: 3,
        onProgress: progress.onProgress,
      }),
    /network connection was lost/
  );

  assertWorkingPackKept('dropped');
  assert.equal(progress.entries.at(-1)?.phase, 'error');
  assert.equal(progress.entries.at(-1)?.error, 'The network connection was lost.');
});

test('a disk that fills up mid-transfer surfaces the error and discards the partial file', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  installWorkingPack('diskfull');
  download.bytesWrittenBeforeError = 1024;
  download.error = Object.assign(new Error('ENOSPC: no space left on device, write'), {
    code: 'ENOSPC',
  });

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'diskfull',
        downloadUrl: 'https://media.example.test/diskfull.db',
        expectedVerseCount: 3,
      }),
    /ENOSPC/
  );

  assertWorkingPackKept('diskfull');
});

test('a translations folder that cannot be created fails the download and releases it for a retry', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  rmSync(translationsDirectory, { recursive: true, force: true });
  fileSystemFaults.failMakeDirectory = new Error('ENOSPC: no space left on device, mkdir');

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'nofolder',
        downloadUrl: 'https://media.example.test/nofolder.db',
        expectedVerseCount: 3,
      }),
    /ENOSPC/
  );

  fileSystemFaults.failMakeDirectory = null;
  const installedPath = await downloadCatalogTextPack({
    translationId: 'nofolder',
    downloadUrl: 'https://media.example.test/nofolder.db',
    expectedVerseCount: 3,
  });
  assert.equal(readVerseCount(installedPath), 3);
});

test('a truncated pack with no declared checksum is rejected by the database check', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  installWorkingPack('truncated');
  // A 200 whose body ended early (a proxy that cut the stream) and a catalog row without a hash.
  const whole = buildPackBytes({ translationId: 'truncated', verses: 400 });
  download.bytes = whole.subarray(0, Math.floor(whole.length / 2));

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'truncated',
        downloadUrl: 'https://media.example.test/truncated.db',
        expectedVerseCount: 400,
      }),
    /malformed/
  );

  assertWorkingPackKept('truncated');
  assert.ok(
    openHandles.every((handle) => handle.closed),
    'the handle that read the bad pack is closed'
  );
});

test('a truncated pack with a declared checksum fails the checksum before it is opened', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  installWorkingPack('truncsum');
  const whole = buildPackBytes({ translationId: 'truncsum', verses: 400 });
  download.bytes = whole.subarray(0, Math.floor(whole.length / 2));

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'truncsum',
        downloadUrl: 'https://media.example.test/truncsum.db',
        expectedVerseCount: 400,
        expectedSha256: createHash('sha256').update(whole).digest('hex'),
      }),
    /checksum mismatch/
  );

  assertWorkingPackKept('truncsum');
  assert.deepEqual(opens, [], 'a pack that fails its checksum is never opened as a database');
});

test('a download retried after a failure installs, with nothing left over from the failed attempt', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytesWrittenBeforeError = 512;
  download.error = new Error('The request timed out.');

  await assert.rejects(
    () =>
      downloadCatalogTextPack({
        translationId: 'retry',
        downloadUrl: 'https://media.example.test/retry.db',
        expectedVerseCount: 3,
      }),
    /timed out/
  );
  download.error = null;
  download.bytesWrittenBeforeError = 0;

  const installedPath = await downloadCatalogTextPack({
    translationId: 'retry',
    downloadUrl: 'https://media.example.test/retry.db',
    expectedVerseCount: 3,
  });

  assert.equal(readVerseCount(installedPath), 3);
  assert.deepEqual(
    readdirSync(translationsDirectory).filter((name) => name.startsWith('retry')),
    ['retry.db']
  );
});

test('a partial staging file left by a download killed with the app is replaced by the next one', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  const whole = buildPackBytes({ translationId: 'killed' });
  writeFileSync(stagingPath('killed'), whole.subarray(0, 100));
  writeFileSync(`${stagingPath('killed')}-journal`, 'hot journal from the killed process');

  const installedPath = await downloadCatalogTextPack({
    translationId: 'killed',
    downloadUrl: 'https://media.example.test/killed.db',
    expectedVerseCount: 3,
  });

  assert.equal(readVerseCount(installedPath), 3);
  assert.equal(existsSync(stagingPath('killed')), false);
  assert.equal(
    existsSync(`${stagingPath('killed')}-journal`),
    false,
    'a hot journal left beside the partial file would be replayed onto the fresh download'
  );
});

// ─── Journaled (operation-scoped) installs ────────────────────────────────────

test('getCatalogTextPackPaths scopes paths to a sanitised operation id', async () => {
  const { getCatalogTextPackPaths } = await loadModule();

  assert.deepEqual(getCatalogTextPackPaths('niv', 'op:1/2'), {
    finalPath: `${translationsDirectory}/niv.op_1_2.db`,
    stagingPath: `${translationsDirectory}/niv.op_1_2.staging.db`,
    rollbackPath: `${translationsDirectory}/niv.op_1_2.db.rollback`,
  });
  assert.deepEqual(getCatalogTextPackPaths('niv'), {
    finalPath: `${translationsDirectory}/niv.db`,
    stagingPath: `${translationsDirectory}/niv.staging.db`,
    rollbackPath: `${translationsDirectory}/niv.db.rollback`,
  });
});

test('getCatalogTextPackPaths refuses a translation id that could escape the translations folder', async () => {
  const { getCatalogTextPackPaths } = await loadModule();

  assert.throws(() => getCatalogTextPackPaths('../Library'), /Unsafe translation id rejected/);
  assert.throws(
    () => getCatalogTextPackPaths('../Library', 'op-1'),
    /Unsafe translation operation id rejected/
  );
});

test('an operation-scoped install checks the pack identity case-insensitively and installs to its own path', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildPackBytes({ translationId: 'OPID' });

  const installedPath = await downloadCatalogTextPack({
    translationId: 'opid',
    operationId: 'op-1',
    downloadUrl: 'https://media.example.test/opid.db',
    expectedVerseCount: 3,
  });

  assert.equal(installedPath, `${translationsDirectory}/opid.op-1.db`);
  assert.equal(readVerseCount(installedPath), 3);
});

test('an operation-scoped install rejects a pack that belongs to another translation', async () => {
  const { downloadCatalogTextPack } = await loadModule();
  download.bytes = buildPackBytes({ translationId: 'someone-else' });

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'wrongid',
      operationId: 'op-2',
      downloadUrl: 'https://media.example.test/wrongid.db',
      expectedVerseCount: 3,
    }),
    /wrong translation identity/
  );
  assert.equal(existsSync(`${translationsDirectory}/wrongid.op-2.db`), false);
});

// ─── Standalone validation and cleanup ────────────────────────────────────────

test('validateCatalogTextPack verifies the checksum and returns the first verse location', async () => {
  const { validateCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  const bytes = buildPackBytes({ translationId: 'validated' });
  const path = `${translationsDirectory}/validated.db`;
  writeFileSync(path, bytes);

  assert.deepEqual(await validateCatalogTextPack(path, 3, sha256Hex(bytes), 'VALIDATED'), {
    translationId: 'validated',
    bookId: 'GEN',
    chapter: 1,
  });
  await assert.rejects(
    validateCatalogTextPack(path, 3, sha256Hex(Buffer.from('other bytes'))),
    /checksum mismatch/
  );
});

test('validateCatalogTextPack fails closed on an empty file with a declared checksum', async () => {
  const { validateCatalogTextPack } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  const path = `${translationsDirectory}/empty.db`;
  writeFileSync(path, Buffer.alloc(0));

  await assert.rejects(
    validateCatalogTextPack(path, 1, sha256Hex(Buffer.alloc(0))),
    /could not be decoded for checksum verification/
  );
});

test('deleteCatalogTextPackArtifacts removes a database and every sidecar that exists', async () => {
  const { deleteCatalogTextPackArtifacts } = await loadModule();
  mkdirSync(translationsDirectory, { recursive: true });
  const path = `${translationsDirectory}/retired.db`;
  for (const suffix of ['', '-journal', '-wal']) {
    writeFileSync(`${path}${suffix}`, 'bytes');
  }

  await deleteCatalogTextPackArtifacts(path);

  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    assert.equal(existsSync(`${path}${suffix}`), false, `${suffix || 'main'} removed`);
  }
  assert.equal(
    fileSystemCalls.some((call) => call.endsWith('retired.db-shm')),
    false,
    'a sidecar that never existed is not deleted'
  );
});

// ─── Interrupted-install recovery ─────────────────────────────────────────────

test('recoverInterruptedCatalogTextPack reports nothing to recover for an empty slot', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();

  assert.equal(await recoverInterruptedCatalogTextPack(getCatalogTextPackPaths('vacant')), 'none');
});

test('recoverInterruptedCatalogTextPack keeps a lone installed pack as current without a rollback', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const paths = getCatalogTextPackPaths('lonely');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(paths.finalPath, buildPackBytes({ translationId: 'lonely' }));

  assert.equal(await recoverInterruptedCatalogTextPack(paths), 'current-without-rollback');
  assert.equal(readVerseCount(paths.finalPath), 3);
});

test('recoverInterruptedCatalogTextPack keeps both generations when only cleanup was interrupted', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const paths = getCatalogTextPackPaths('bothgen');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(paths.finalPath, buildPackBytes({ translationId: 'bothgen', verses: 3 }));
  writeFileSync(paths.rollbackPath, buildPackBytes({ translationId: 'bothgen', verses: 2 }));

  assert.equal(await recoverInterruptedCatalogTextPack(paths), 'current');
  assert.equal(readVerseCount(paths.finalPath), 3);
  assert.equal(readVerseCount(paths.rollbackPath), 2, 'the old generation is kept for now');
});

test('recoverInterruptedCatalogTextPack rejects when the surviving replacement is not a valid pack', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const paths = getCatalogTextPackPaths('badcurrent');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(paths.finalPath, buildPackBytes({ versesTable: false }));
  writeFileSync(paths.rollbackPath, buildPackBytes({ translationId: 'badcurrent' }));

  await assert.rejects(recoverInterruptedCatalogTextPack(paths), /missing the verses table/);
  assert.equal(readVerseCount(paths.rollbackPath), 3);
});

test('recoverInterruptedCatalogTextPack quarantines a sidecar both generations claim', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const paths = getCatalogTextPackPaths('ambiguous');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(paths.rollbackPath, buildPackBytes({ translationId: 'ambiguous' }));
  // -shm is ignored by a rollback-journal database, so neither copy disturbs validation.
  writeFileSync(`${paths.rollbackPath}-shm`, 'rollback shm');
  writeFileSync(`${paths.finalPath}-shm`, 'final shm');

  assert.equal(await recoverInterruptedCatalogTextPack(paths), 'previous');

  const quarantined = readdirSync(translationsDirectory).filter(
    (entry) => entry.startsWith('ambiguous.db.recovery-orphan-') && entry.endsWith('-shm')
  );
  assert.equal(quarantined.length, 1);
  assert.equal(readFileSync(`${translationsDirectory}/${quarantined[0]}`, 'utf8'), 'final shm');
  assert.equal(readFileSync(`${paths.finalPath}-shm`, 'utf8'), 'rollback shm');
  assert.equal(readVerseCount(paths.finalPath), 3);
  assert.equal(existsSync(paths.rollbackPath), false);
});

test('recoverInterruptedCatalogTextPack leaves orphaned rollback sidecars in place for the next pass', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const paths = getCatalogTextPackPaths('orphan');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(`${paths.rollbackPath}-journal`, 'orphaned journal');

  assert.equal(await recoverInterruptedCatalogTextPack(paths), 'none');
  assert.equal(readFileSync(`${paths.rollbackPath}-journal`, 'utf8'), 'orphaned journal');
  assert.deepEqual(
    fileSystemCalls.filter((call) => call.startsWith('move:') || call.startsWith('delete:')),
    []
  );
});

test('recoverInterruptedCatalogTextPack discards an abandoned staging download and its sidecars', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const main = getCatalogTextPackPaths('abandonedmain');
  const sidecarOnly = getCatalogTextPackPaths('abandonedsidecar');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(main.stagingPath, 'partial');
  writeFileSync(`${main.stagingPath}-wal`, 'partial wal');
  writeFileSync(`${sidecarOnly.stagingPath}-journal`, 'partial journal');

  assert.equal(await recoverInterruptedCatalogTextPack(main), 'none');
  assert.equal(await recoverInterruptedCatalogTextPack(sidecarOnly), 'none');

  assert.equal(existsSync(main.stagingPath), false);
  assert.equal(existsSync(`${main.stagingPath}-wal`), false);
  assert.equal(existsSync(`${sidecarOnly.stagingPath}-journal`), false);
});

test('recoverInterruptedCatalogTextPack still reports its result when staging cleanup fails', async () => {
  const { getCatalogTextPackPaths, recoverInterruptedCatalogTextPack } = await loadModule();
  const paths = getCatalogTextPackPaths('stagingstuck');
  mkdirSync(translationsDirectory, { recursive: true });
  writeFileSync(paths.finalPath, buildPackBytes({ translationId: 'stagingstuck' }));
  writeFileSync(paths.stagingPath, 'partial');
  fileSystemFaults.failDelete = (path) => path.includes('stagingstuck.staging.db');

  assert.equal(await recoverInterruptedCatalogTextPack(paths), 'current-without-rollback');
  assert.equal(existsSync(paths.stagingPath), true, 'the journal keeps tracking it');
});
