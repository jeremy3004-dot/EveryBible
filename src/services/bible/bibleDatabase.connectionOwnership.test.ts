/**
 * The installed expo-sqlite 16.0.10 Android constructor can return one cached native
 * database to separate JS wrappers. Native close decrements its refCount, but collecting
 * either wrapper calls sharedObjectDidRelease -> NativeDatabaseBinding.close independently.
 * This model explicitly collects an abandoned probe at a deterministic boundary; it does
 * not reproduce Hermes GC timing or prove the exact ERR_USING_RELEASED_SHARED_OBJECT error.
 * Queries execute against real SQLite, through the production database ownership code.
 */
import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mockModule } from '../../testing/mockModules';
import { BUNDLED_BIBLE_SCHEMA_VERSION } from './bibleDataModel';

const root = mkdtempSync(`${tmpdir()}/everybible-db-ownership-`);
const seedPath = `${root}/seed.db`;
const databasePath = `${root}/bible-bsb-v2.db`;
const seed = new DatabaseSync(seedPath);
seed.exec(`
  CREATE TABLE verses (id INTEGER PRIMARY KEY, translation_id TEXT, book_id TEXT,
    chapter INTEGER, verse INTEGER, text TEXT, heading TEXT, formatting TEXT);
  INSERT INTO verses VALUES (1, 'bsb', 'GEN', 1, 1, 'In the beginning', NULL, '{}');
  CREATE VIRTUAL TABLE verses_fts USING fts5(text);
  PRAGMA user_version = ${BUNDLED_BIBLE_SCHEMA_VERSION};
`);
seed.close();
copyFileSync(seedPath, databasePath);

interface NativeBinding {
  database: DatabaseSync;
  refs: number;
  released: boolean;
}
const cache = new Map<string, NativeBinding>();
const bindings: NativeBinding[] = [];
const closedWrappers: Array<{ binding: NativeBinding; collect: () => void }> = [];
let nextWrapperId = 0;
let beforeQuery: (wrapperId: number) => Promise<void> = async () => {};

function releaseBinding(binding: NativeBinding) {
  if (!binding.released) binding.database.close();
  binding.released = true;
}

after(() => {
  bindings.forEach(releaseBinding);
  rmSync(root, { recursive: true, force: true });
});

mockModule(
  mock,
  fileURLToPath(new URL('../../../assets/databases/bible-bsb-v2.db', import.meta.url).href),
  {
    bundledAsset: true,
  }
);
mockModule(mock, 'expo-file-system/legacy', {
  getInfoAsync: async () => ({ exists: true, size: 4096 }),
});
mockModule(mock, 'expo-sqlite', {
  defaultDatabaseDirectory: root,
  importDatabaseFromAssetAsync: async (name: string, options: { forceOverwrite?: boolean }) => {
    if (options.forceOverwrite || !existsSync(`${root}/${name}`)) {
      copyFileSync(seedPath, `${root}/${name}`);
    }
  },
  openDatabaseAsync: async (
    name: string,
    options: { useNewConnection?: boolean },
    directory = root
  ) => {
    mkdirSync(directory, { recursive: true });
    const key = JSON.stringify([`${directory}/${name}`, options]);
    let binding = options.useNewConnection ? undefined : cache.get(key);
    if (binding) binding.refs += 1;
    else {
      binding = { database: new DatabaseSync(`${directory}/${name}`), refs: 1, released: false };
      cache.set(key, binding);
      bindings.push(binding);
    }
    const native = binding;
    const wrapperId = ++nextWrapperId;
    let closed = false;
    const prepare = async (sql: string) => {
      await beforeQuery(wrapperId);
      if (native.released) throw new Error('Another JS wrapper released this native binding');
      return native.database.prepare(sql);
    };
    return {
      execAsync: async (sql: string) => {
        await beforeQuery(wrapperId);
        if (native.released) throw new Error('Another JS wrapper released this native binding');
        native.database.exec(sql);
      },
      getFirstAsync: async (sql: string) => (await prepare(sql)).get() ?? null,
      getAllAsync: async (sql: string) => (await prepare(sql)).all(),
      closeAsync: async () => {
        if (closed) return;
        closed = true;
        native.refs -= 1;
        if (native.refs === 0) {
          if (cache.get(key) === native) cache.delete(key);
          releaseBinding(native);
        }
        // SharedObjectRegistry.delete and NativeDatabase.sharedObjectDidRelease:
        // JS wrapper collection releases the binding regardless of SQLite refCount.
        closedWrappers.push({ binding: native, collect: () => releaseBinding(native) });
      },
    };
  },
});

test('collecting a completed startup probe cannot release the retained warmup database', async () => {
  const { inspectBundledDatabaseStatus, initDatabase, getDatabase } =
    await import('./bibleDatabase');
  let releaseProbe: () => void = () => {};
  let signalProbe: () => void = () => {};
  const probeStarted = new Promise<void>((resolve) => {
    signalProbe = resolve;
  });
  const probeReleased = new Promise<void>((resolve) => {
    releaseProbe = resolve;
  });
  let probeId: number | null = null;
  beforeQuery = async (id) => {
    if (probeId === null) {
      probeId = id;
      signalProbe();
    }
    if (id === probeId) await probeReleased;
  };

  // Home's isBibleDataReady overlaps App's deferred initBibleData warmup.
  const probe = inspectBundledDatabaseStatus(1);
  await probeStarted;
  await initDatabase(1);
  releaseProbe();
  assert.equal((await probe).ready, true);
  beforeQuery = async () => {};

  assert.equal(closedWrappers.length, 1, 'only the temporary probe has relinquished ownership');
  assert.equal(
    bindings.filter((binding) => !binding.released).length,
    1,
    'native close preserves exactly the retained warmup binding'
  );
  closedWrappers.forEach(({ collect }) => collect());
  const database = await getDatabase('bsb');
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM verses'
  );
  assert.equal(result?.count, 1, 'the retained reader connection survives probe collection');
});
