import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from './audioDownloadService';
import * as activeDownloads from './download/activeDownloads';
import * as audioFileLocations from './download/audioFileLocations';
import * as errors from './download/errors';
import * as fileVerification from './download/fileVerification';
import * as freeSpace from './download/freeSpace';
import * as jobRegistry from './download/jobRegistry';
import * as orchestrator from './download/orchestrator';

// The runtime exports audioDownloadService.ts had before it was split into ./download/. Importers
// and path-based module mocks depend on this exact surface, so it must not grow or shrink.
const PUBLIC_RUNTIME_EXPORTS = [
  'AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES',
  'AUDIO_DOWNLOAD_JOB_ID_PREFIX',
  'AUDIO_DOWNLOAD_MIN_VALID_BYTES',
  'AudioDownloadCancelledError',
  'AudioDownloadInsufficientSpaceError',
  'AudioDownloadStopError',
  'audioDownloadTaskIdMatchesJob',
  'cancelAudioDownloadsForTranslation',
  'completeAudioDownloadJob',
  'createAudioDownloadJobId',
  'createAudioDownloadJobStore',
  'downloadAndValidateAudioFile',
  'downloadAudioBook',
  'downloadAudioTranslation',
  'failAudioDownloadJob',
  'getBookAudioDirectoryUri',
  'getChapterAudioFileUri',
  'getDownloadedChapterAudioUri',
  'isAudioDownloadCancellation',
  'reattachAudioDownloadJob',
  'requestAudioDownloadCancellation',
  'startAudioDownloadJob',
];

test('the audio download service keeps exactly its pre-split public exports', () => {
  assert.deepEqual(Object.keys(service).sort(), [...PUBLIC_RUNTIME_EXPORTS].sort());
});

test('every public export is the implementation module value itself, not a copy', () => {
  const modules: Record<string, unknown>[] = [
    activeDownloads,
    audioFileLocations,
    errors,
    fileVerification,
    freeSpace,
    jobRegistry,
    orchestrator,
  ];
  for (const [name, value] of Object.entries(service)) {
    const owners = modules.filter((module) => name in module && module[name] === value);
    assert.equal(owners.length, 1, `${name} should come from exactly one download module`);
  }
});
