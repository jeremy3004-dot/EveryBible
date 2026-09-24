/**
 * Chapter, book and translation audio downloads. The implementation lives in ./download/ (types,
 * file locations, file verification, free-space checks, the job registry and active-download
 * registry, chapter transfer, and the orchestration entry points); this file keeps the public
 * import path, which tests also mock by path, stable.
 */
export type {
  AudioDownloadBookProgress,
  AudioDownloadCollectionProgress,
  AudioDownloadJobRecord,
  AudioDownloadJobScope,
  AudioDownloadJobStatus,
  AudioDownloadJobStore,
  AudioDownloadLifecycleHooks,
  AudioDownloadTransport,
  AudioFileSystemAdapter,
  RemoteAudioAsset,
  ResolveRemoteAudio,
} from './download/types';
export {
  AudioDownloadCancelledError,
  AudioDownloadInsufficientSpaceError,
  AudioDownloadStopError,
  isAudioDownloadCancellation,
} from './download/errors';
export { getBookAudioDirectoryUri, getChapterAudioFileUri } from './download/audioFileLocations';
export {
  AUDIO_DOWNLOAD_MIN_VALID_BYTES,
  downloadAndValidateAudioFile,
  getDownloadedChapterAudioUri,
} from './download/fileVerification';
export { AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES } from './download/freeSpace';
export {
  cancelAudioDownloadsForTranslation,
  requestAudioDownloadCancellation,
} from './download/activeDownloads';
export {
  AUDIO_DOWNLOAD_JOB_ID_PREFIX,
  audioDownloadTaskIdMatchesJob,
  completeAudioDownloadJob,
  createAudioDownloadJobId,
  createAudioDownloadJobStore,
  failAudioDownloadJob,
  reattachAudioDownloadJob,
  startAudioDownloadJob,
} from './download/jobRegistry';
export { downloadAudioBook, downloadAudioTranslation } from './download/orchestrator';
