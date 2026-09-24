export async function loadAudioShareDependencies() {
  const [downloadStorage, downloadService, remoteAudio, shareService, FileSystem] =
    await Promise.all([
      import('../../../services/audio/audioDownloadStorage'),
      import('../../../services/audio/audioDownloadService'),
      import('../../../services/audio/audioRemote'),
      import('../../../services/audio/audioShareService'),
      import('expo-file-system/legacy'),
    ]);

  return {
    AUDIO_DOWNLOAD_ROOT_URI: downloadStorage.AUDIO_DOWNLOAD_ROOT_URI,
    expoAudioFileSystemAdapter: downloadStorage.expoAudioFileSystemAdapter,
    fetchRemoteChapterAudio: remoteAudio.fetchRemoteChapterAudio,
    getDownloadedChapterAudioUri: downloadService.getDownloadedChapterAudioUri,
    prepareChapterAudioShareAsset: shareService.prepareChapterAudioShareAsset,
    chapterAudioShareRootUri: `${
      FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? 'file:///'
    }everybible-audio-share/`,
  };
}

// expo-sharing relies on a native module that may not be registered in all
// build configurations (e.g. Expo Go, stale dev client). Wrap the import so
// any "Requiring unknown module" error at the factory level falls back to the
// plain Share.share() path instead of crashing the app.
export async function tryLoadSharing(): Promise<typeof import('expo-sharing') | null> {
  try {
    const mod = await import('expo-sharing');
    return typeof mod.isAvailableAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

export async function loadVideoTrimDependencies() {
  const videoTrimModule = await import('react-native-video-trim');
  const VideoTrimModule = videoTrimModule.default ?? videoTrimModule;

  return {
    VideoTrimModule,
    isValidTrimMediaFile: videoTrimModule.isValidFile,
    trimAudioMedia: videoTrimModule.trim,
  };
}

export interface AudioPortionShareDraft {
  sourceUri: string;
  fileExtension: string;
  mimeType: string;
  durationMs: number;
}
