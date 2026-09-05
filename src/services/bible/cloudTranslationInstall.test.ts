import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as cloudTranslationModel from './cloudTranslationModel';
import * as bibleAssetBaseUrl from './bibleAssetBaseUrl';
import * as verseFormatting from './verseFormatting';
import * as elEs256 from '../elMedia/elEs256';
import type { CloudDownloadProgress } from './cloudTranslationService';

const directory = 'file:///documents/translations';
const finalPath = `${directory}/test.db`;
const stagingPath = `${directory}/test.staging.db`;
const packBytes = Buffer.from([251, 255, 254, 0, 12]);
const expectedSha256 = createHash('sha256').update(packBytes).digest('hex');
type DatabaseFile = { bytes: Buffer; verses: number; table: boolean };
type Failure =
  | 'network'
  | 'http'
  | 'read'
  | 'unavailable-read'
  | 'decode'
  | 'open'
  | 'verify'
  | 'schema'
  | 'transaction'
  | 'activate'
  | 'backup'
  | 'restore';

function loadInstaller(
  options: {
    failure?: Failure;
    invalidDatabase?: boolean;
    wrongBytes?: boolean;
    installed?: boolean;
    sidecars?: boolean;
  } = {}
) {
  const oldFile = { bytes: Buffer.from('previously installed Bible'), verses: 3, table: true };
  const files = new Map<string, DatabaseFile>(
    options.installed === false ? [] : [[finalPath, oldFile]]
  );
  const oldSidecar = { bytes: Buffer.from('previous WAL'), verses: 0, table: false };
  if (options.sidecars) files.set(`${finalPath}-wal`, oldSidecar);
  const events: string[] = [];
  const handles: { path: string; closed: number }[] = [];
  const fail = (failure: Failure) => {
    if (options.failure === failure) throw new Error(`${failure} failure`);
  };
  const fileSystem = {
    documentDirectory: 'file:///documents/',
    EncodingType: { Base64: 'base64' },
    getInfoAsync: async (path: string) => ({ exists: path === directory || files.has(path) }),
    makeDirectoryAsync: async () => {},
    deleteAsync: async (path: string) => {
      events.push(`delete:${path}`);
      files.delete(path);
    },
    moveAsync: async ({ from, to }: { from: string; to: string }) => {
      events.push(`move:${from}:${to}`);
      if (from === finalPath) fail('backup');
      if (from === stagingPath && ['activate', 'restore'].includes(options.failure ?? '')) {
        files.set(to, { bytes: Buffer.from('partial move'), verses: 0, table: false });
        throw new Error('activate failure');
      }
      if (to === finalPath && from !== stagingPath) fail('restore');
      assert.ok(files.has(from), `Missing move source ${from}`);
      assert.equal(files.has(to), false, `Destination already exists ${to}`);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    downloadAsync: async (_url: string, path: string) => {
      files.set(path, {
        bytes: options.wrongBytes ? Buffer.from('wrong contents, same verse count') : packBytes,
        verses: 3,
        table: !options.invalidDatabase,
      });
      fail('network');
      return { uri: path, status: options.failure === 'http' ? 503 : 200 };
    },
    readAsStringAsync: async (path: string) => {
      fail('read');
      return options.failure === 'decode'
        ? 'not base64!%'
        : files.get(path)!.bytes.toString('base64');
    },
  };
  const sqlite = {
    async openDatabaseAsync(
      name: string,
      settings: { finalizeUnusedStatementsBeforeClosing: boolean },
      root: string
    ) {
      const path = `${root}/${name}`;
      events.push(`open:${path}`);
      fail('open');
      assert.equal(settings.finalizeUnusedStatementsBeforeClosing, false);
      if (!files.has(path)) files.set(path, { bytes: packBytes, verses: 0, table: false });
      const handle = { path, closed: 0 };
      handles.push(handle);
      return {
        async execAsync(sql: string) {
          events.push(`sql:${sql}`);
          if (sql.includes('CREATE TABLE')) {
            fail('schema');
            files.get(path)!.table = true;
          }
        },
        async withExclusiveTransactionAsync(
          callback: (tx: { runAsync: () => Promise<void> }) => Promise<void>
        ) {
          fail('transaction');
          await callback({
            runAsync: async () => {
              files.get(path)!.verses += 1;
            },
          });
        },
        async getFirstAsync(sql: string) {
          events.push(`verify:${path}`);
          fail('verify');
          return sql.includes('sqlite_master')
            ? { present: options.invalidDatabase ? 0 : Number(files.get(path)!.table) }
            : { count: files.get(path)!.verses };
        },
        async closeAsync() {
          handle.closed += 1;
          events.push(`close:${path}`);
        },
      };
    },
  };
  const supabase = {
    from(table: string) {
      let countQuery = false;
      const query = {
        select(_columns: string, selectOptions?: { head?: boolean }) {
          countQuery = !!selectOptions?.head;
          return query;
        },
        ilike() {
          return query;
        },
        limit() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        async maybeSingle() {
          return { data: { translation_id: 'test' }, error: null };
        },
        async range() {
          fail('network');
          if (options.failure === 'http')
            return { data: null, error: { message: 'backend unavailable' } };
          return {
            data: [1, 2, 3].map((verse) => ({
              translation_id: 'test',
              book_id: 'GEN',
              chapter: 1,
              verse,
              text: `Verse ${verse}`,
            })),
            error: null,
          };
        },
        then(resolve: (value: unknown) => unknown) {
          assert.equal(table, 'bible_verses');
          assert.equal(countQuery, true);
          return Promise.resolve({ count: 3, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const dependencies: Record<string, unknown> = {
    'expo-file-system/legacy':
      options.failure === 'unavailable-read'
        ? { ...fileSystem, readAsStringAsync: undefined }
        : fileSystem,
    'expo-sqlite': sqlite,
    '../supabase': { supabase, isSupabaseConfigured: () => true },
    './cloudTranslationModel': cloudTranslationModel,
    './bibleAssetBaseUrl': bibleAssetBaseUrl,
    './verseFormatting': verseFormatting,
    '../elMedia/elEs256': elEs256,
  };
  const { outputText } = ts.transpileModule(
    readFileSync(
      fileURLToPath(new URL('./cloudTranslationService.ts', import.meta.url).href),
      'utf8'
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }
  );
  const exports = {};
  // Deliberately omit crypto, atob, and Buffer: the actual installer must work on Hermes.
  runInNewContext(outputText, {
    exports,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), name);
      return dependencies[name];
    },
  });
  const api = exports as typeof import('./cloudTranslationService');
  return {
    files,
    events,
    handles,
    oldFile,
    oldSidecar,
    catalog: (extra: Partial<Parameters<typeof api.downloadCatalogTextPack>[0]> = {}) =>
      api.downloadCatalogTextPack({
        translationId: 'test',
        downloadUrl: 'https://media.example/test.db',
        expectedVerseCount: 3,
        ...extra,
      }),
    cloud: (onProgress?: (progress: CloudDownloadProgress) => void) =>
      api.downloadCloudTranslation('test', onProgress),
  };
}

for (const method of ['catalog', 'cloud'] as const) {
  for (const failure of ['network', 'http', 'open', 'verify', 'activate', 'backup'] as const) {
    test(`${method} reinstall preserves the original database after ${failure} failure`, async () => {
      const runtime = loadInstaller({ failure, sidecars: true });
      await assert.rejects(runtime[method]());
      assert.equal(runtime.files.get(finalPath), runtime.oldFile);
      assert.equal(runtime.files.get(`${finalPath}-wal`), runtime.oldSidecar);
      assert.equal(runtime.files.has(stagingPath), false);
      assert.ok(runtime.handles.every((handle) => handle.closed === 1));
    });
  }
  test(`${method} rejects an invalid staging database before touching the installed copy`, async () => {
    const runtime = loadInstaller({ invalidDatabase: true });
    await assert.rejects(runtime[method](), /missing the verses table/);
    assert.equal(runtime.files.get(finalPath), runtime.oldFile);
    assert.equal(
      runtime.events.some(
        (event) => event.startsWith(`move:${finalPath}:`) || event === `delete:${finalPath}`
      ),
      false
    );
    assert.ok(runtime.handles.every((handle) => handle.closed === 1));
  });
  test(`${method} validates and closes staging before successful replacement`, async () => {
    const runtime = loadInstaller({ sidecars: true });
    assert.equal(await runtime[method](), finalPath);
    const activation = runtime.events.indexOf(`move:${stagingPath}:${finalPath}`);
    const validation = runtime.events.indexOf(`verify:${stagingPath}`);
    assert.ok(validation >= 0 && validation < activation);
    assert.ok(
      runtime.handles.every((handle) => handle.path === stagingPath && handle.closed === 1)
    );
    assert.equal(runtime.files.get(finalPath)?.verses, 3);
    assert.notEqual(runtime.files.get(finalPath), runtime.oldFile);
    assert.deepEqual([...runtime.files.keys()], [finalPath]);
  });
  test(`${method} fresh install succeeds without requiring an old database`, async () => {
    const runtime = loadInstaller({ installed: false });
    assert.equal(await runtime[method](), finalPath);
    assert.equal(runtime.files.get(finalPath)?.verses, 3);
  });
}

for (const failure of ['schema', 'transaction'] as const) {
  test(`cloud writer closes its handle and preserves the old database after ${failure} failure`, async () => {
    const runtime = loadInstaller({ failure });
    await assert.rejects(runtime.cloud(), new RegExp(`${failure} failure`));
    assert.equal(runtime.files.get(finalPath), runtime.oldFile);
    assert.equal(runtime.handles.length, 1);
    assert.equal(runtime.handles[0].closed, 1);
  });
}

test('cloud writer closes its handle after an in-transaction progress callback fails', async () => {
  const runtime = loadInstaller();
  await assert.rejects(
    runtime.cloud((progress) => {
      if (progress.phase === 'writing' && progress.versesDownloaded > 0)
        throw new Error('progress failure');
    }),
    /progress failure/
  );
  assert.equal(runtime.files.get(finalPath), runtime.oldFile);
  assert.equal(runtime.handles[0].closed, 1);
});

for (const failure of ['read', 'decode', 'unavailable-read'] as const) {
  test(`catalog integrity verification fails closed on ${failure} without Web Crypto or atob`, async () => {
    const runtime = loadInstaller({ failure });
    await assert.rejects(runtime.catalog({ expectedSha256 }));
    assert.equal(runtime.files.get(finalPath), runtime.oldFile);
    assert.equal(runtime.handles.length, 0);
  });
}

test('catalog rejects wrong bytes with the right verse count without Web Crypto or atob', async () => {
  const runtime = loadInstaller({ wrongBytes: true });
  await assert.rejects(runtime.catalog({ expectedSha256 }), /checksum mismatch/);
  assert.equal(runtime.files.get(finalPath), runtime.oldFile);
  assert.equal(runtime.handles.length, 0);
});

test('catalog verifies matching standard Base64 bytes without Web Crypto or atob', async () => {
  const runtime = loadInstaller();
  assert.equal(await runtime.catalog({ expectedSha256: expectedSha256.toUpperCase() }), finalPath);
  assert.deepEqual(runtime.files.get(finalPath)?.bytes, packBytes);
});

for (const digest of ['', 'not-a-sha256', 'a'.repeat(63), 'g'.repeat(64)]) {
  test(`catalog rejects malformed expected SHA-256 ${JSON.stringify(digest)}`, async () => {
    const runtime = loadInstaller();
    await assert.rejects(runtime.catalog({ expectedSha256: digest }), /checksum/i);
    assert.equal(runtime.files.get(finalPath), runtime.oldFile);
  });
}

test('failed rollback retains a recoverable original backup instead of deleting it', async () => {
  const runtime = loadInstaller({ failure: 'restore' });
  await assert.rejects(runtime.catalog(), /rollback|restore/i);
  assert.ok([...runtime.files.values()].includes(runtime.oldFile));
  assert.equal(runtime.files.has(stagingPath), false);
});

test('a pending rollback backup is preserved and blocks another replacement', async () => {
  const runtime = loadInstaller();
  const backupPath = `${finalPath}.rollback`;
  runtime.files.set(backupPath, runtime.oldFile);
  await assert.rejects(runtime.catalog(), /previous translation rollback needs recovery/);
  assert.equal(runtime.files.get(backupPath), runtime.oldFile);
  assert.equal(runtime.files.get(finalPath), runtime.oldFile);
  assert.equal(
    runtime.events.some((event) => event.startsWith('move:')),
    false
  );
});
