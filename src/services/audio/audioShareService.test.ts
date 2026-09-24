import test from 'node:test';
import assert from 'node:assert/strict';
import { setRemoteAudioMetadataResolver } from './audioRemote';
import {
  getChapterAudioShareFileUri,
  prepareChapterAudioShareAsset,
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
