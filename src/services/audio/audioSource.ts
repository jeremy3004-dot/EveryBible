import type { RemoteAudioAsset } from './audioDownloadService';

export function resolvePreferredChapterAudio(
  localUri: string | null,
  remoteAudio: RemoteAudioAsset | null
): RemoteAudioAsset | null {
  if (localUri) {
    return {
      url: localUri,
      duration: remoteAudio?.duration ?? 0,
    };
  }

  return remoteAudio;
}
