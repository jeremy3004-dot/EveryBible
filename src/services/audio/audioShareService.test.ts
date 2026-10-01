import test from 'node:test';
import assert from 'node:assert/strict';
import { setRemoteAudioMetadataResolver } from './audioRemote';
import {
  createExpoAudioShareCacheFileSystem,
  getChapterAudioShareFileUri,
  prepareChapterAudioShareAsset,
  pruneAudioShareCache,
  type AudioShareCacheFileSystem,
  type AudioShareFileSystemAdapter,
} from './audioShareService';

const createFileSystemDouble = () => {
  const files = new Set<string>();
  const directories = new Set<string>();
  const downloads: Array<{ from: string; to: string }> = [];

  const fileSystem: AudioShareFileSystemAdapter = {
    ensureDirectory: async (directoryUri) => {
      directories.add(directoryUri);
    },
    fileExists: async (fileUri) => files.has(fileUri),
    downloadFile: async (from, to) => {
      downloads.push({ from, to });
      files.add(to);
    },
  };

  return { fileSystem, files, directories, downloads };
};

test.afterEach(() => {
  setRemoteAudioMetadataResolver(null);
});

test('getChapterAudioShareFileUri writes shared chapter audio into a dedicated export cache', () => {
  assert.equal(
    getChapterAudioShareFileUri('bsb', 'JHN', 3, 'm4a'),
    'file:///everybible-audio-share/bsb/JHN/3.m4a'
  );
});

test('prepareChapterAudioShareAsset prefers an already-downloaded chapter file', async () => {
  const { fileSystem } = createFileSystemDouble();

  const asset = await prepareChapterAudioShareAsset({
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    fileSystem,
    resolveDownloadedAudioUri: async () => 'file:///everybible-audio/bsb/JHN/3.m4a',
    resolveRemoteAudio: async () => ({
      url: 'https://cdn.everybible.app/audio/bsb/JHN/3.m4a',
      duration: 0,
    }),
  });

  assert.deepEqual(asset, {
    uri: 'file:///everybible-audio/bsb/JHN/3.m4a',
    mimeType: 'audio/mp4',
    fileExtension: 'm4a',
    isTemporary: false,
  });
});

test('prepareChapterAudioShareAsset downloads remote chapter audio into a share cache when needed', async () => {
  const { fileSystem, directories, downloads } = createFileSystemDouble();

  const asset = await prepareChapterAudioShareAsset({
    translationId: 'web',
    bookId: 'GEN',
    chapter: 1,
    fileSystem,
    resolveDownloadedAudioUri: async () => null,
    resolveRemoteAudio: async () => ({
      url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_002_GEN_01.mp3',
      duration: 0,
    }),
  });

  assert.deepEqual(asset, {
    uri: 'file:///everybible-audio-share/web/GEN/1.mp3',
    mimeType: 'audio/mpeg',
    fileExtension: 'mp3',
    isTemporary: true,
  });
  assert.deepEqual(Array.from(directories), ['file:///everybible-audio-share/web/GEN/']);
  assert.deepEqual(downloads, [
    {
      from: 'https://ebible.org/eng-webbe/mp3/eng-webbe_002_GEN_01.mp3',
      to: 'file:///everybible-audio-share/web/GEN/1.mp3',
    },
  ]);
});

test('prepareChapterAudioShareAsset returns null when the chapter audio cannot be resolved', async () => {
  const { fileSystem } = createFileSystemDouble();

  const asset = await prepareChapterAudioShareAsset({
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    fileSystem,
    resolveDownloadedAudioUri: async () => null,
    resolveRemoteAudio: async () => null,
  });

  assert.equal(asset, null);
});

test('getChapterAudioShareFileUri refuses ids that would escape the share cache', () => {
  assert.throws(
    () => getChapterAudioShareFileUri('../../Library', 'JHN', 3, 'm4a'),
    /translation id/
  );
  assert.throws(() => getChapterAudioShareFileUri('bsb', '../Documents', 3, 'm4a'), /book id/);
  assert.throws(() => getChapterAudioShareFileUri('bsb', 'JHN/..', 3, 'm4a'), /book id/);
});

test('getChapterAudioShareFileUri refuses a chapter or extension that is not a plain file-name part', () => {
  assert.throws(() => getChapterAudioShareFileUri('bsb', 'JHN', Number.NaN, 'm4a'), /chapter/);
  assert.throws(() => getChapterAudioShareFileUri('bsb', 'JHN', -1, 'm4a'), /chapter/);
  assert.throws(() => getChapterAudioShareFileUri('bsb', 'JHN', 3, 'm4a/../../x'), /extension/);
});

test('prepareChapterAudioShareAsset touches no file when the ids are unsafe', async () => {
  const { fileSystem, directories, downloads } = createFileSystemDouble();

  await assert.rejects(
    prepareChapterAudioShareAsset({
      translationId: '../../tmp',
      bookId: 'GEN',
      chapter: 1,
      fileSystem,
      resolveDownloadedAudioUri: async () => null,
      resolveRemoteAudio: async () => ({
        url: 'https://ebible.org/eng-webbe/mp3/eng-webbe_002_GEN_01.mp3',
        duration: 0,
      }),
    }),
    /translation id/
  );

  assert.deepEqual(Array.from(directories), []);
  assert.deepEqual(downloads, []);
});

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MB = 1024 * 1024;
const root = 'file:///cache/everybible-audio-share/';

const createCacheDouble = (
  entries: Array<{ name: string; size: number; ageMs: number }>,
  failing: string[] = []
) => {
  const files = new Map(
    entries.map(({ name, size, ageMs }) => [
      `${root}${name}`,
      { uri: `${root}${name}`, size, modifiedAtMs: NOW - ageMs },
    ])
  );
  const deleted: string[] = [];
  const fileSystem: AudioShareCacheFileSystem = {
    listFiles: async () => Array.from(files.values()),
    deleteFile: async (uri) => {
      if (failing.includes(uri)) throw new Error('locked');
      files.delete(uri);
      deleted.push(uri);
    },
  };
  return { fileSystem, deleted, files };
};

test('pruneAudioShareCache removes exports older than a day and keeps recent ones', async () => {
  const { fileSystem, deleted } = createCacheDouble([
    { name: 'bsb/JHN/1.mp3', size: 2 * MB, ageMs: 25 * HOUR },
    { name: 'bsb/JHN/2.mp3', size: 2 * MB, ageMs: 2 * HOUR },
  ]);

  await pruneAudioShareCache({ fileSystem, rootUri: root, nowMs: NOW });

  assert.deepEqual(deleted, [`${root}bsb/JHN/1.mp3`]);
});

test('pruneAudioShareCache trims the oldest exports until the cache fits its byte budget', async () => {
  const { fileSystem, deleted } = createCacheDouble([
    { name: 'a.mp3', size: 30 * MB, ageMs: 5 * HOUR },
    { name: 'b.mp3', size: 30 * MB, ageMs: 3 * HOUR },
    { name: 'c.mp3', size: 30 * MB, ageMs: 1 * HOUR },
  ]);

  await pruneAudioShareCache({ fileSystem, rootUri: root, nowMs: NOW });

  // 90 MB -> 60 MB is still over 50 MB -> 30 MB; the newest export stays.
  assert.deepEqual(deleted, [`${root}a.mp3`, `${root}b.mp3`]);
});

test('pruneAudioShareCache never deletes a protected file or one inside the grace window', async () => {
  const { fileSystem, deleted } = createCacheDouble([
    { name: 'in-use.mp3', size: 60 * MB, ageMs: 48 * HOUR },
    { name: 'just-shared.mp3', size: 60 * MB, ageMs: 2 * MINUTE },
    { name: 'old.mp3', size: 1 * MB, ageMs: 30 * HOUR },
  ]);

  await pruneAudioShareCache({
    fileSystem,
    rootUri: root,
    nowMs: NOW,
    protectedUris: [`${root}in-use.mp3`],
  });

  assert.deepEqual(deleted, [`${root}old.mp3`]);
});

test('pruneAudioShareCache skips a file it cannot delete and carries on', async () => {
  const { fileSystem, deleted } = createCacheDouble(
    [
      { name: 'stuck.mp3', size: 1 * MB, ageMs: 40 * HOUR },
      { name: 'old.mp3', size: 1 * MB, ageMs: 30 * HOUR },
    ],
    [`${root}stuck.mp3`]
  );

  const result = await pruneAudioShareCache({ fileSystem, rootUri: root, nowMs: NOW });

  assert.deepEqual(result, [`${root}old.mp3`]);
  assert.deepEqual(deleted, [`${root}old.mp3`]);
});

test('createExpoAudioShareCacheFileSystem walks nested directories and deletes idempotently', async () => {
  const tree: Record<string, string[]> = {
    [root]: ['bsb'],
    [`${root}bsb/`]: ['JHN'],
    [`${root}bsb/JHN/`]: ['3.mp3'],
  };
  const deletions: Array<[string, unknown]> = [];
  const adapter = createExpoAudioShareCacheFileSystem({
    readDirectoryAsync: async (uri) => {
      const names = tree[uri];
      if (!names) throw new Error('missing');
      return names;
    },
    getInfoAsync: async (uri) =>
      uri.endsWith('.mp3')
        ? { exists: true, isDirectory: false, size: 123, modificationTime: 1000 }
        : { exists: true, isDirectory: true },
    deleteAsync: async (uri, options) => {
      deletions.push([uri, options]);
    },
  });

  assert.deepEqual(await adapter.listFiles(root), [
    { uri: `${root}bsb/JHN/3.mp3`, size: 123, modifiedAtMs: 1_000_000 },
  ]);
  assert.deepEqual(await adapter.listFiles(`${root}nothing/`), []);
  await adapter.deleteFile(`${root}bsb/JHN/3.mp3`);
  assert.deepEqual(deletions, [[`${root}bsb/JHN/3.mp3`, { idempotent: true }]]);
});
