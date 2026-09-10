import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { RemoteAudioAsset } from './audioDownloadService';

// ---------------------------------------------------------------------------
// Collaborators
//
// Everything audioService composes that touches the network or the file system
// is replaced with a recorder. ./audioSource (a pure preference rule) is left
// real because it is the behaviour being composed.
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

const calls: RecordedCall[] = [];

const FILE_SYSTEM_ADAPTER = { marker: 'expo-audio-file-system' };
const ROOT_URI = 'file:///documents/everybible-audio/';

let downloadedChapterUri: string | null = null;
let remoteAudio: RemoteAudioAsset | null = null;
let granularity: 'chapter' | 'verse' = 'chapter';
let translationHasAudio = true;
let remoteFailure: unknown = null;

mockModule(mock, sourcePath('services/audio/audioDownloadService.ts'), {
  getDownloadedChapterAudioUri: async (
    translationId: string,
    bookId: string,
    chapter: number,
    fileSystem: unknown,
    rootUri: string
  ) => {
    calls.push({
      method: 'getDownloadedChapterAudioUri',
      args: [translationId, bookId, chapter, fileSystem, rootUri],
    });
    return downloadedChapterUri;
  },
});

mockModule(mock, sourcePath('services/audio/audioDownloadStorage.ts'), {
  AUDIO_DOWNLOAD_ROOT_URI: ROOT_URI,
  expoAudioFileSystemAdapter: FILE_SYSTEM_ADAPTER,
});

mockModule(mock, sourcePath('services/audio/audioRemote.ts'), {
  getConfiguredAudioGranularity: (translationId: string) => {
    calls.push({ method: 'getConfiguredAudioGranularity', args: [translationId] });
    return granularity;
  },
  hasConfiguredTranslationAudio: (translationId: string) => {
    calls.push({ method: 'hasConfiguredTranslationAudio', args: [translationId] });
    return translationHasAudio;
  },
  clearRemoteAudioCache: () => {
    calls.push({ method: 'clearRemoteAudioCache', args: [] });
  },
  fetchRemoteChapterAudio: async (
    translationId: string,
    bookId: string,
    chapter: number,
    verse?: number
  ) => {
    calls.push({
      method: 'fetchRemoteChapterAudio',
      args: [translationId, bookId, chapter, verse],
    });
    if (remoteFailure) {
      throw remoteFailure;
    }
    return remoteAudio;
  },
  prefetchRemoteChapterAudio: async (
    translationId: string,
    bookId: string,
    startChapter: number,
    count: number
  ) => {
    calls.push({
      method: 'prefetchRemoteChapterAudio',
      args: [translationId, bookId, startChapter, count],
    });
  },
});

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type AudioServiceModule = typeof import('./audioService');

let mod: AudioServiceModule;

const methodsCalled = () => calls.map((call) => call.method);

before(async () => {
  mod = await import('./audioService');
});

beforeEach(() => {
  calls.length = 0;
  downloadedChapterUri = null;
  remoteAudio = null;
  granularity = 'chapter';
  translationHasAudio = true;
  remoteFailure = null;
});

// ---------------------------------------------------------------------------
// getChapterAudioUrl
// ---------------------------------------------------------------------------

test('a downloaded chapter is preferred over the remote asset and never hits the network', async () => {
  downloadedChapterUri = 'file:///documents/everybible-audio/bsb/GEN/1.m4a';
  remoteAudio = { url: 'https://media.everybible.app/audio/bsb/GEN/1.m4a', duration: 900_000 };

  const audio = await mod.getChapterAudioUrl('bsb', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'file:///documents/everybible-audio/bsb/GEN/1.m4a',
    duration: 0,
  });
  assert.equal(methodsCalled().includes('fetchRemoteChapterAudio'), false);
});

test('the downloaded-chapter lookup is given the expo adapter and the audio download root', async () => {
  await mod.getChapterAudioUrl('bsb', 'JHN', 3);

  assert.deepEqual(calls[0], {
    method: 'getDownloadedChapterAudioUri',
    args: ['bsb', 'JHN', 3, FILE_SYSTEM_ADAPTER, ROOT_URI],
  });
});

test('nothing downloaded falls back to the remote chapter asset', async () => {
  remoteAudio = { url: 'https://media.everybible.app/audio/bsb/GEN/1.m4a', duration: 900_000 };

  const audio = await mod.getChapterAudioUrl('bsb', 'GEN', 1);

  assert.deepEqual(audio, {
    url: 'https://media.everybible.app/audio/bsb/GEN/1.m4a',
    duration: 900_000,
  });
});

test('a chapter with neither a download nor a remote asset resolves to nothing', async () => {
  assert.equal(await mod.getChapterAudioUrl('kjv', 'GEN', 1), null);
});

test('a verse request on a verse-granular translation skips the downloaded chapter file', async () => {
  granularity = 'verse';
  downloadedChapterUri = 'file:///documents/everybible-audio/npiulb/JHN/3.mp3';
  remoteAudio = { url: 'https://cdn.test/npiulb/JHN/3/16.mp3', duration: 12_000 };

  const audio = await mod.getChapterAudioUrl('npiulb', 'JHN', 3, 16);

  assert.deepEqual(audio, { url: 'https://cdn.test/npiulb/JHN/3/16.mp3', duration: 12_000 });
  assert.deepEqual(methodsCalled(), ['getConfiguredAudioGranularity', 'fetchRemoteChapterAudio']);
  assert.deepEqual(calls[1].args, ['npiulb', 'JHN', 3, 16]);
});

test('a verse request on a chapter-granular translation still uses the downloaded chapter file', async () => {
  downloadedChapterUri = 'file:///documents/everybible-audio/bsb/JHN/3.m4a';

  const audio = await mod.getChapterAudioUrl('bsb', 'JHN', 3, 16);

  assert.deepEqual(audio, {
    url: 'file:///documents/everybible-audio/bsb/JHN/3.m4a',
    duration: 0,
  });
});

test('a chapter request never consults the granularity of the translation', async () => {
  await mod.getChapterAudioUrl('bsb', 'JHN', 3);

  assert.equal(methodsCalled().includes('getConfiguredAudioGranularity'), false);
});

test('a remote lookup failure is surfaced to the caller rather than swallowed as no audio', async () => {
  remoteFailure = new Error('media host unreachable');

  await assert.rejects(() => mod.getChapterAudioUrl('bsb', 'GEN', 1), /media host unreachable/);
});

// ---------------------------------------------------------------------------
// Availability, cache and prefetch
// ---------------------------------------------------------------------------

test('audio availability is answered by the configured-translation check', async () => {
  translationHasAudio = true;
  assert.equal(mod.isAudioAvailable('bsb'), true);

  translationHasAudio = false;
  assert.equal(mod.isAudioAvailable('kjv'), false);

  assert.deepEqual(calls, [
    { method: 'hasConfiguredTranslationAudio', args: ['bsb'] },
    { method: 'hasConfiguredTranslationAudio', args: ['kjv'] },
  ]);
});

test('clearing the audio cache clears the remote url cache', async () => {
  mod.clearAudioCache();

  assert.deepEqual(calls, [{ method: 'clearRemoteAudioCache', args: [] }]);
});

test('prefetching defaults to the next three chapters', async () => {
  await mod.prefetchChapterAudio('bsb', 'GEN', 4);

  assert.deepEqual(calls, [{ method: 'prefetchRemoteChapterAudio', args: ['bsb', 'GEN', 4, 3] }]);
});

test('prefetching forwards an explicit chapter count', async () => {
  await mod.prefetchChapterAudio('bsb', 'GEN', 4, 10);

  assert.deepEqual(calls, [{ method: 'prefetchRemoteChapterAudio', args: ['bsb', 'GEN', 4, 10] }]);
});
