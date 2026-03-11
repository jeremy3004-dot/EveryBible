export interface AudioAvailabilityOptions {
  featureEnabled: boolean;
  translationHasAudio: boolean;
  remoteAudioAvailable: boolean;
  downloadedAudioBooks: string[];
  bookId?: string | null;
}

export interface AudioAvailability {
  canPlayAudio: boolean;
  canDownloadAudio: boolean;
  canManageAudio: boolean;
  canStreamAudio: boolean;
  hasOfflineAudio: boolean;
}

export function getAudioAvailability({
  featureEnabled,
  translationHasAudio,
  remoteAudioAvailable,
  downloadedAudioBooks,
  bookId,
}: AudioAvailabilityOptions): AudioAvailability {
  const hasOfflineAsset =
    bookId == null
      ? downloadedAudioBooks.length > 0
      : downloadedAudioBooks.includes(bookId);
  const canUseAudio = featureEnabled && translationHasAudio;
  const canStreamAudio = canUseAudio && remoteAudioAvailable;
  const hasOfflineAudio = canUseAudio && hasOfflineAsset;
  const canDownloadAudio = canStreamAudio;
  const canPlayAudio = canUseAudio && (canStreamAudio || hasOfflineAudio);
  const canManageAudio = canUseAudio && (canDownloadAudio || hasOfflineAudio);

  return {
    canPlayAudio,
    canDownloadAudio,
    canManageAudio,
    canStreamAudio,
    hasOfflineAudio,
  };
}
