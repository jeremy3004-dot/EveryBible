/** Free-space pre-flight and restating a mid-download ENOSPC as the not-enough-space error. */
import { AudioDownloadInsufficientSpaceError } from '../audioDownloadErrorMessage';
import type { AudioFileSystemAdapter } from './types';

// Average size of one compressed chapter of narration, used only when the source publishes no real
// byte counts. Deliberately on the optimistic side: a whole-Bible download is ~1,189 chapters, so
// an inflated estimate would refuse downloads that would actually have succeeded. The point of the
// pre-flight is to catch a genuinely full device, not to be an accurate size predictor. Pass an
// exact manifest total through `estimateTotalBytes` when one is available.
export const AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES = 2 * 1024 * 1024;
// A little room for the OS on top of the payload itself.
const AUDIO_DOWNLOAD_FREE_SPACE_HEADROOM = 1.05;

// Refuses a 100MB+ download up front instead of failing chapter-by-chapter on a full device. A
// filesystem adapter without `getFreeDiskBytes` (or a volume that cannot report free space) simply
// skips the check. (N25)
export async function assertEnoughFreeSpaceForAudioDownload({
  fileSystem,
  chapterCount,
  estimateTotalBytes,
}: {
  fileSystem: AudioFileSystemAdapter;
  chapterCount: number;
  estimateTotalBytes?: () => Promise<number | null>;
}): Promise<void> {
  if (!fileSystem.getFreeDiskBytes || chapterCount === 0) {
    return;
  }

  let freeBytes: number | null = null;
  try {
    freeBytes = await fileSystem.getFreeDiskBytes();
  } catch {
    return;
  }
  if (freeBytes == null || !Number.isFinite(freeBytes)) {
    return;
  }

  let totalBytes: number | null = null;
  if (estimateTotalBytes) {
    try {
      totalBytes = await estimateTotalBytes();
    } catch {
      totalBytes = null;
    }
  }
  if (totalBytes == null || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    totalBytes = chapterCount * AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES;
  }

  const requiredBytes = Math.ceil(totalBytes * AUDIO_DOWNLOAD_FREE_SPACE_HEADROOM);
  if (freeBytes < requiredBytes) {
    throw new AudioDownloadInsufficientSpaceError(requiredBytes, freeBytes);
  }
}

// A chapter write that ran the device out of space surfaces as whatever the platform said (ENOSPC,
// NSFileWriteOutOfSpaceError), which the reader only ever saw as "could not download". Restate it
// as the pre-flight's error so they are told to free up space. The write just failed, so however
// low the estimate, the room still needed is more than what is free.
export async function toInsufficientSpaceError(
  fileSystem: AudioFileSystemAdapter,
  remainingChapters: number
): Promise<AudioDownloadInsufficientSpaceError> {
  let freeBytes = 0;
  try {
    const reported = await fileSystem.getFreeDiskBytes?.();
    if (reported != null && Number.isFinite(reported) && reported > 0) {
      freeBytes = reported;
    }
  } catch {
    // Unknown free space on a device that just refused a write: report none.
  }
  const estimatedBytes = Math.ceil(
    Math.max(1, remainingChapters) *
      AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES *
      AUDIO_DOWNLOAD_FREE_SPACE_HEADROOM
  );
  return new AudioDownloadInsufficientSpaceError(
    Math.max(estimatedBytes, freeBytes + AUDIO_DOWNLOAD_ESTIMATED_CHAPTER_BYTES),
    freeBytes
  );
}
