/**
 * Text-pack installs on a file-system module without `createDownloadResumable`.
 *
 * The service falls back to `FileSystem.downloadAsync`, which has no native cancel handle, so a
 * cancel can only be observed once the transfer returns. That fallback is decided by the
 * mocked module's shape, so it needs its own file (one mock configuration per file); the main
 * behaviour suite lives in cloudTranslationService.behavior.test.ts.
 */
import test, { after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { mockModule } from '../../testing/mockModules';

const root = mkdtempSync(`${tmpdir()}/everybible-plainpack-`);
const documentDirectory = `${root}/documents/`;
const translationsDirectory = `${root}/documents/translations`;
mkdirSync(documentDirectory, { recursive: true });

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function buildPackBytes(verses = 3): Buffer {
  const path = `${root}/seed-${Math.random().toString(36).slice(2)}.db`;
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = DELETE');
  database.exec(`
    CREATE TABLE verses (
      translation_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL
    );
  `);
  const insert = database.prepare('INSERT INTO verses VALUES (?, ?, ?, ?, ?)');
  for (let index = 1; index <= verses; index += 1) {
    insert.run('plain', 'GEN', 1, index, `Verse ${index}`);
  }
  database.close();
  const bytes = readFileSync(path);
  rmSync(path, { force: true });
  return bytes;
}

type SqlParam = string | number | bigint | null | Uint8Array;

mockModule(mock, 'expo-sqlite', {
  openDatabaseAsync: async (name: string, _options: unknown, directory: string) => {
    const handle = new DatabaseSync(`${directory}/${name}`);
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
        handle.close();
      },
    };
  },
});

/** Runs while the plain download is "in flight", before its bytes land. */
let duringDownload: (() => void) | null = null;
const downloadedUrls: string[] = [];

// Deliberately no createDownloadResumable.
mockModule(mock, 'expo-file-system/legacy', {
  documentDirectory,
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: async (path: string) =>
    existsSync(path)
      ? { exists: true, uri: path, size: statSync(path).size, isDirectory: false }
      : { exists: false, uri: path },
  makeDirectoryAsync: async (path: string) => {
    mkdirSync(path, { recursive: true });
  },
  deleteAsync: async (path: string) => {
    rmSync(path, { force: true, recursive: true });
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    renameSync(from, to);
  },
  downloadAsync: async (url: string, path: string) => {
    downloadedUrls.push(url);
    duringDownload?.();
    writeFileSync(path, buildPackBytes());
    return { uri: path, status: 200 };
  },
  readAsStringAsync: async () => '',
});

const loadModule = () => import('./cloudTranslationService');

afterEach(() => {
  duringDownload = null;
  downloadedUrls.length = 0;
});

test('installs a pack through the plain download API when resumable downloads are unavailable', async () => {
  const { downloadCatalogTextPack } = await loadModule();

  const installedPath = await downloadCatalogTextPack({
    translationId: 'plain',
    downloadUrl: 'https://media.example.test/plain.db',
    expectedVerseCount: 3,
  });

  assert.equal(installedPath, `${translationsDirectory}/plain.db`);
  assert.deepEqual(downloadedUrls, ['https://media.example.test/plain.db']);
  assert.equal(existsSync(`${translationsDirectory}/plain.staging.db`), false);
});

test('a cancel during a plain download is honoured once the transfer returns', async () => {
  const {
    cancelActiveCatalogTextPackDownload,
    downloadCatalogTextPack,
    isTextPackDownloadCancelled,
  } = await loadModule();
  let accepted: boolean | null = null;
  duringDownload = () => {
    accepted = cancelActiveCatalogTextPackDownload('plaincancel');
  };

  await assert.rejects(
    downloadCatalogTextPack({
      translationId: 'plaincancel',
      downloadUrl: 'https://media.example.test/plaincancel.db',
      expectedVerseCount: 3,
    }),
    (error: unknown) => isTextPackDownloadCancelled(error)
  );

  assert.equal(accepted, true, 'there is no native handle, but the cancel is still accepted');
  assert.equal(existsSync(`${translationsDirectory}/plaincancel.db`), false);
  assert.equal(existsSync(`${translationsDirectory}/plaincancel.staging.db`), false);
});
