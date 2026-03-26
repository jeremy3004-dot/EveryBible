import {
  getDownloadedChapterAudioUri,
  type RemoteAudioAsset,
} from './audioDownloadService';
import {
  getConfiguredAudioGranularity,
  hasConfiguredTranslationAudio,
} from './audioRemote';
import { AUDIO_DOWNLOAD_ROOT_URI, expoAudioFileSystemAdapter } from './audioDownloadStorage';
import {
  clearRemoteAudioCache,
  fetchRemoteChapterAudio,
  prefetchRemoteChapterAudio,
} from './audioRemote';
import { resolvePreferredChapterAudio } from './audioSource';

export async function getChapterAudioUrl(
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number
): Promise<RemoteAudioAsset | null> {
  const canUseLocalChapterAudio =
    verse == null || getConfiguredAudioGranularity(translationId) !== 'verse';

  const localUri = canUseLocalChapterAudio
    ? await getDownloadedChapterAudioUri(
        translationId,
        bookId,
        chapter,
        expoAudioFileSystemAdapter,
        AUDIO_DOWNLOAD_ROOT_URI
      )
    : null;

  if (localUri) {
    return resolvePreferredChapterAudio(localUri, null);
  }

  const remoteAudio = await fetchRemoteChapterAudio(translationId, bookId, chapter, verse);
  return resolvePreferredChapterAudio(localUri, remoteAudio);
}

export function isAudioAvailable(translationId: string): boolean {
  return hasConfiguredTranslationAudio(translationId);
}

export function clearAudioCache(): void {
  clearRemoteAudioCache();
}

export async function prefetchChapterAudio(
  translationId: string,
  bookId: string,
  startChapter: number,
  count: number = 3
): Promise<void> {
  await prefetchRemoteChapterAudio(translationId, bookId, startChapter, count);
}
