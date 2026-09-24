import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { ElAudioManifest } from '../elMedia/elManifestModel';

// Mock configuration for this file: the manifest SERVICE (network + signature verification) is
// replaced, while the pure manifest model stays real. That leaves audioRemote's production
// default resolver — the one no test seam is installed over — to do the lazy imports and the
// chapter lookup exactly as it does on device.

interface ManifestRequest {
  translationId: string;
  manifestUrl: string;
  audioVersion: string;
  catalogBaseUrl: string;
}

const manifestRequests: ManifestRequest[] = [];
let manifestResponse: () => Promise<ElAudioManifest | null> = async () => null;

mockModule(mock, sourcePath('services/elMedia/elManifestService.ts'), {
  getElManifestForAudioCatalog: (ref: ManifestRequest) => {
    manifestRequests.push(ref);
    return manifestResponse();
  },
});

const MANIFEST: ElAudioManifest = {
  schema: 'everybible-audio-manifest/v1',
  translationId: 'el-lqd',
  audioVersion: 'v1',
  deliveryMode: 'chapter',
  baseUrl: 'https://media.example.test/audio/el-lqd/v1/',
  fileExt: 'mp3',
  mimeType: 'audio/mpeg',
  books: {
    PHM: [{ chapter: 1, path: '/chapters/PHM/1.mp3', bytes: 2_048, sha256: 'ab'.repeat(32) }],
  },
};

type AudioRemoteModule = typeof import('./audioRemote');
let mod: AudioRemoteModule;

const warnings: unknown[][] = [];
const realWarn = console.warn;

before(async () => {
  mod = await import('./audioRemote');
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
});

test.after(() => {
  console.warn = realWarn;
});

afterEach(() => {
  manifestRequests.length = 0;
  warnings.length = 0;
  manifestResponse = async () => null;
  mod.clearRemoteAudioCache();
  mod.setRemoteAudioMetadataResolver(null);
});

function useElTranslation(): void {
  mod.setRemoteAudioMetadataResolver((translationId) =>
    translationId === 'el-lqd'
      ? {
          id: 'el-lqd',
          hasAudio: true,
          fileExtension: 'mp3',
          audio: {
            strategy: 'el-manifest',
            manifestUrl: '/manifests/audio/el-lqd/v1.json',
            audioVersion: 'v1',
            catalogBaseUrl: 'https://media.example.test',
          },
        }
      : null
  );
}

test('the production resolver reads the verified manifest and resolves the chapter from it', async () => {
  useElTranslation();
  manifestResponse = async () => MANIFEST;

  const asset = await mod.fetchRemoteChapterAudio('el-lqd', 'PHM', 1);

  assert.deepEqual(asset, {
    url: 'https://media.example.test/audio/el-lqd/v1/chapters/PHM/1.mp3',
    duration: 0,
    bytes: 2_048,
    sha256: 'ab'.repeat(32),
  });
  assert.deepEqual(manifestRequests, [
    {
      translationId: 'el-lqd',
      manifestUrl: '/manifests/audio/el-lqd/v1.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'https://media.example.test',
    },
  ]);
});

test('a chapter the manifest does not list resolves to no audio', async () => {
  useElTranslation();
  manifestResponse = async () => MANIFEST;

  assert.equal(await mod.fetchRemoteChapterAudio('el-lqd', 'JUD', 1), null);
});

test('an unavailable manifest resolves to no audio without a warning', async () => {
  useElTranslation();

  assert.equal(await mod.fetchRemoteChapterAudio('el-lqd', 'PHM', 1), null);
  assert.equal(manifestRequests.length, 1);
  assert.deepEqual(warnings, []);
});

test('a manifest service failure degrades to no audio instead of throwing', async () => {
  useElTranslation();
  manifestResponse = () => Promise.reject(new Error('signature invalid'));

  assert.equal(await mod.fetchRemoteChapterAudio('el-lqd', 'PHM', 1), null);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]?.[0]), /Failed to resolve EL manifest chapter audio/);
});
