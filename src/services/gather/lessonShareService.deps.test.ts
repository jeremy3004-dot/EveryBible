import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';

// loadLessonAudioShareDeps wires the lesson sheet's "Share audio" to the same
// native modules the reader's chapter-audio share uses, loaded on demand.
const sharing = {
  available: true as boolean | 'throws',
  shared: [] as unknown[][],
};
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: async () => {
    if (sharing.available === 'throws') throw new Error('native module missing');
    return sharing.available;
  },
  shareAsync: async (...args: unknown[]) => {
    sharing.shared.push(args);
  },
});

mockPackage(mock, 'expo-file-system/legacy', {
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
});

const fileSystemAdapter = { name: 'expo-audio-fs' };
mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  expoAudioFileSystemAdapter: fileSystemAdapter,
  AUDIO_DOWNLOAD_ROOT_URI: 'file:///documents/audio/',
});
const downloadedLookups: unknown[][] = [];
mockModule(mock, sourcePath('services/audio/audioDownloadService.ts'), {
  getDownloadedChapterAudioUri: async (...args: unknown[]) => {
    downloadedLookups.push(args);
    return 'file:///documents/audio/bsb/GEN/1.mp3';
  },
});
const fetchRemoteChapterAudio = async () => null;
mockModule(mock, sourcePath('services/audio/audioRemote.ts'), { fetchRemoteChapterAudio });

type PrepareInput = {
  translationId: string;
  bookId: string;
  chapter: number;
  fileSystem: unknown;
  rootUri: string;
  resolveDownloadedAudioUri: (translationId: string, bookId: string, chapter: number) => unknown;
  resolveRemoteAudio: unknown;
};
const prepared: PrepareInput[] = [];
mockModule(mock, sourcePath('services/audio/audioShareService.ts'), {
  prepareChapterAudioShareAsset: async (input: PrepareInput) => {
    prepared.push(input);
    return { uri: `${input.rootUri}GEN-1.mp3`, mimeType: 'audio/mpeg' };
  },
});

const source = {
  translationId: 'bsb',
  bookId: 'GEN',
  chapter: 1,
  url: 'https://audio.test/bsb/GEN/1.mp3',
};
const noMessage = async () => {};

beforeEach(() => {
  sharing.available = true;
  sharing.shared = [];
  downloadedLookups.length = 0;
  prepared.length = 0;
});

test('the recording is prepared in the cache share folder from the downloaded or remote copy', async () => {
  const { loadLessonAudioShareDeps } = await import('./lessonShareService');
  const deps = await loadLessonAudioShareDeps('ios', noMessage, 'Share');

  const asset = await deps.prepareAsset(source);

  assert.deepEqual(asset, {
    uri: 'file:///cache/everybible-audio-share/GEN-1.mp3',
    mimeType: 'audio/mpeg',
  });
  const [input] = prepared;
  assert.deepEqual(
    {
      translationId: input.translationId,
      bookId: input.bookId,
      chapter: input.chapter,
      rootUri: input.rootUri,
    },
    {
      translationId: 'bsb',
      bookId: 'GEN',
      chapter: 1,
      rootUri: 'file:///cache/everybible-audio-share/',
    }
  );
  assert.equal(input.fileSystem, fileSystemAdapter);
  assert.equal(input.resolveRemoteAudio, fetchRemoteChapterAudio);

  await input.resolveDownloadedAudioUri('bsb', 'GEN', 1);
  assert.deepEqual(downloadedLookups, [
    ['bsb', 'GEN', 1, fileSystemAdapter, 'file:///documents/audio/'],
  ]);
});

test('the file goes to the native share sheet as audio under the given title', async () => {
  const { loadLessonAudioShareDeps } = await import('./lessonShareService');
  const deps = await loadLessonAudioShareDeps('ios', noMessage, 'Share lesson');

  assert.ok(deps.shareFile);
  await deps.shareFile('file:///cache/a.mp3', 'audio/mpeg');

  assert.deepEqual(sharing.shared, [
    [
      'file:///cache/a.mp3',
      { dialogTitle: 'Share lesson', mimeType: 'audio/mpeg', UTI: 'public.audio' },
    ],
  ]);
});

test('file sharing is off when the native sharing module says it is unavailable', async () => {
  sharing.available = false;
  const { loadLessonAudioShareDeps } = await import('./lessonShareService');

  const deps = await loadLessonAudioShareDeps('ios', noMessage, 'Share');

  assert.equal(deps.shareFile, null);
  assert.equal(deps.os, 'ios');
  assert.equal(deps.shareMessage, noMessage);
});

test('file sharing is off, not a crash, when the native sharing module is missing', async () => {
  sharing.available = 'throws';
  const { loadLessonAudioShareDeps, shareLessonAudio } = await import('./lessonShareService');
  const messages: unknown[] = [];

  const deps = await loadLessonAudioShareDeps(
    'ios',
    async (payload) => {
      messages.push(payload);
    },
    'Share'
  );

  assert.equal(deps.shareFile, null);
  assert.equal(await shareLessonAudio(source, 'Creation', deps), 'link');
  assert.deepEqual(messages, [{ message: 'Creation', url: source.url }]);
});
