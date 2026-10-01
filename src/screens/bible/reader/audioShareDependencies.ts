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

/** Deletes one file the app exported for sharing. A file that is already gone is not an error. */
export async function deleteSharedAudioFile(uri: string): Promise<void> {
  const FileSystem = await import('expo-file-system/legacy');
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Keeps the chapter-audio export cache bounded: deletes the export handed to sharing last time
 * (the recipient may read it until then), then prunes the cache by age and size. `keepUris` are
 * the files the share now starting uses; they are never deleted. Never throws, since a stale file
 * must not block a share.
 */
export async function releaseStaleAudioShares({
  previousUri,
  keepUris,
}: {
  previousUri: string | null;
  keepUris: readonly string[];
}): Promise<void> {
  try {
    const [FileSystem, shareService] = await Promise.all([
      import('expo-file-system/legacy'),
      import('../../../services/audio/audioShareService'),
    ]);
    if (previousUri && !keepUris.includes(previousUri)) {
      await FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(() => {});
    }
    const rootUri = `${
      FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? 'file:///'
    }everybible-audio-share/`;
    await shareService.pruneAudioShareCache({
      fileSystem: shareService.createExpoAudioShareCacheFileSystem(FileSystem),
      rootUri,
      protectedUris: keepUris,
    });
  } catch {
    // Cleanup is best effort.
  }
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
