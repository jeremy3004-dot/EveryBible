/**
 * Trusting a chapter file on disk: size floors, exact byte counts and sha256 checks after a
 * transfer, the per-book record of verified sizes that lets a resume skip lookups, and locating an
 * already-downloaded chapter for playback.
 */
import type { AudioFileSystemAdapter } from './types';
import { AudioDownloadStopError, isAudioDownloadCancellation } from './errors';
import { getChapterAudioFileUri, getLegacyChapterAudioFileUri } from './audioFileLocations';

// Real chapter audio is always far larger than this. Anything smaller on disk is
// almost certainly a truncated download or an HTTP error body (404/500 page) that
// got written to the destination file — treat it as not-yet-downloaded rather than
// letting the fileExists short-circuit mark it "complete" forever.
export const AUDIO_DOWNLOAD_MIN_VALID_BYTES = 1024;

export async function getDownloadedChapterAudioUri(
  translationId: string,
  bookId: string,
  chapter: number,
  fileSystem: AudioFileSystemAdapter,
  rootUri?: string
): Promise<string | null> {
  const fileUri = getChapterAudioFileUri(translationId, bookId, chapter, rootUri);
  if (await isValidDownloadedAudioFile(fileSystem, fileUri)) {
    return fileUri;
  }

  const legacyFileUri = getLegacyChapterAudioFileUri(translationId, bookId, chapter, rootUri);
  if (legacyFileUri !== fileUri && (await isValidDownloadedAudioFile(fileSystem, legacyFileUri))) {
    return legacyFileUri;
  }

  return null;
}

// Size metadata establishes existence too, avoiding two native filesystem reads.
// Playback lookup must not delete a partial file an active download is writing.
// The download worker opts into cleanup before retrying a corrupted cached file.
export async function isValidDownloadedAudioFile(
  fileSystem: AudioFileSystemAdapter,
  fileUri: string,
  deleteInvalid = false
): Promise<boolean> {
  if (!fileSystem.getFileSize) {
    return fileSystem.fileExists(fileUri);
  }

  const size = await fileSystem.getFileSize(fileUri);
  if (size != null && Number.isFinite(size) && size >= AUDIO_DOWNLOAD_MIN_VALID_BYTES) {
    return true;
  }

  if (deleteInvalid && size != null) await fileSystem.deleteFile?.(fileUri);
  return false;
}

export async function isCachedChapterSizeWrong(
  fileSystem: AudioFileSystemAdapter,
  fileUri: string,
  expectedBytes: number | undefined
): Promise<boolean> {
  if (expectedBytes == null || !fileSystem.getFileSize) return false;
  return (await fileSystem.getFileSize(fileUri)) !== expectedBytes;
}

// The size each chapter of a book was accepted at, kept as a file in the book's own directory so
// deleting the book or translation removes it too. A resume walks every chapter again, and some
// sources need one request per chapter to publish its size; a chapter whose file still has exactly
// its recorded size is trusted without asking again. A partial left by an interrupted rewrite has
// a different size, so it is still looked up and replaced.
const VERIFIED_CHAPTER_SIZES_FILENAME = 'verified-sizes.json';

export interface VerifiedChapterSizes {
  isVerified: (chapter: number, fileUri: string) => Promise<boolean>;
  record: (chapter: number, fileUri: string) => Promise<void>;
  /** Resolves once every recorded size has been written. */
  flush: () => Promise<void>;
}

export const UNTRACKED_CHAPTER_SIZES: VerifiedChapterSizes = {
  isVerified: async () => false,
  record: async () => {},
  flush: async () => {},
};

function parseVerifiedChapterSizes(contents: string | null): Map<number, number> {
  const sizes = new Map<number, number>();
  if (!contents) return sizes;
  try {
    const parsed: unknown = JSON.parse(contents);
    if (parsed && typeof parsed === 'object') {
      for (const [chapter, bytes] of Object.entries(parsed)) {
        const chapterNumber = Number(chapter);
        if (Number.isInteger(chapterNumber) && typeof bytes === 'number' && bytes > 0) {
          sizes.set(chapterNumber, bytes);
        }
      }
    }
  } catch {
    // An unreadable record only costs a lookup per chapter.
  }
  return sizes;
}

export async function openVerifiedChapterSizes(
  fileSystem: AudioFileSystemAdapter,
  directoryUri: string
): Promise<VerifiedChapterSizes> {
  const { readTextFile, writeTextFile, getFileSize } = fileSystem;
  if (!readTextFile || !writeTextFile || !getFileSize) return UNTRACKED_CHAPTER_SIZES;

  const recordUri = `${directoryUri}${VERIFIED_CHAPTER_SIZES_FILENAME}`;
  const sizes = parseVerifiedChapterSizes(await readTextFile(recordUri).catch(() => null));
  let writes: Promise<void> = Promise.resolve();

  return {
    isVerified: async (chapter, fileUri) => {
      const recorded = sizes.get(chapter);
      return recorded != null && (await getFileSize(fileUri)) === recorded;
    },
    record: async (chapter, fileUri) => {
      const size = await getFileSize(fileUri);
      if (size == null || size <= 0) return;
      sizes.set(chapter, size);
      const contents = JSON.stringify(Object.fromEntries(sizes));
      // Chapters finish concurrently; writing in order keeps the last write the fullest.
      writes = writes
        .then(() => writeTextFile(recordUri, contents))
        .catch((error: unknown) => {
          console.warn('[AudioDownload] Could not save verified chapter sizes:', error);
        });
      await writes;
    },
    flush: () => writes,
  };
}

const AUDIO_DOWNLOAD_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Validates a completed download before it is trusted: rejects HTTP error statuses
// and undersized files (a 404/500 error page saved to disk would otherwise look like
// a "successful" download), and deletes the bad file so it doesn't linger and get
// picked up by the fileExists short-circuit on a future run.
export async function downloadAndValidateAudioFile({
  sourceUrl,
  runDownload,
  getFileSize,
  deleteFile,
  timeoutMs = AUDIO_DOWNLOAD_TIMEOUT_MS,
  minValidBytes = AUDIO_DOWNLOAD_MIN_VALID_BYTES,
}: {
  sourceUrl: string;
  // expectedBytes: the size the server declared (Content-Length), when known.
  runDownload: () => Promise<{ status: number; expectedBytes?: number | null }>;
  getFileSize: () => Promise<number>;
  deleteFile: () => Promise<void>;
  // Progress-aware transports use the chapter inactivity deadline instead.
  timeoutMs?: number | null;
  minValidBytes?: number;
}): Promise<void> {
  let result: { status: number; expectedBytes?: number | null };
  try {
    result =
      timeoutMs === null
        ? await runDownload()
        : await withTimeout(
            runDownload(),
            timeoutMs,
            `Download timed out after ${timeoutMs}ms: ${sourceUrl}`
          );
  } catch (error) {
    if (isAudioDownloadCancellation(error) || error instanceof AudioDownloadStopError) throw error;
    await deleteFile();
    throw error;
  }

  if (result.status < 200 || result.status >= 300) {
    await deleteFile();
    throw new Error(`Download failed with HTTP ${result.status}: ${sourceUrl}`);
  }

  const size = await getFileSize();
  if (size < minValidBytes) {
    await deleteFile();
    throw new Error(`Downloaded file too small (${size} bytes): ${sourceUrl}`);
  }

  // A connection dropped mid-body can still report success with a truncated file.
  const expectedBytes = result.expectedBytes;
  if (expectedBytes != null && expectedBytes > 0 && size !== expectedBytes) {
    await deleteFile();
    throw new Error(`Downloaded file incomplete (${size} of ${expectedBytes} bytes): ${sourceUrl}`);
  }
}

// Post-download validation. Preference order: an exact byte count, then a sha256, then the crude
// 1KB floor as the last-resort fallback when the source publishes neither. A failure deletes the
// file (nothing resumes partials) and throws a plain Error so the chapter retry loop can try
// again. (N23)
export async function verifyDownloadedChapterAudio({
  fileSystem,
  fileUri,
  expected,
}: {
  fileSystem: AudioFileSystemAdapter;
  fileUri: string;
  expected: { bytes?: number; sha256?: string };
}): Promise<void> {
  const discard = async () => {
    await fileSystem.deleteFile?.(fileUri);
  };

  if (fileSystem.getFileSize) {
    const size = await fileSystem.getFileSize(fileUri);
    if (expected.bytes != null) {
      if (size !== expected.bytes) {
        await discard();
        throw new Error(
          `Downloaded audio size mismatch (expected ${expected.bytes} bytes, got ${
            size ?? 0
          }): ${fileUri}`
        );
      }
    } else if (size == null || !Number.isFinite(size) || size < AUDIO_DOWNLOAD_MIN_VALID_BYTES) {
      await discard();
      throw new Error(`Downloaded audio is missing or incomplete: ${fileUri}`);
    }
  }

  // Hermes has no Web Crypto, so this reuses the same pure-JS hasher as text-pack verification.
  const readBase64Chunk = fileSystem.readBase64Chunk;
  if (expected.sha256 && readBase64Chunk) {
    const { sha256HexOfBase64Chunks } = await import('../../elMedia/elEs256');
    const size = (await fileSystem.getFileSize?.(fileUri)) ?? expected.bytes ?? 0;
    const digest =
      size > 0
        ? await sha256HexOfBase64Chunks({
            size,
            readChunk: (position, length) => readBase64Chunk(fileUri, position, length),
          })
        : null;
    if (!digest) {
      await discard();
      throw new Error(`Downloaded audio could not be read for verification: ${fileUri}`);
    }
    if (digest !== expected.sha256.toLowerCase()) {
      await discard();
      throw new Error(`Downloaded audio failed integrity verification (checksum): ${fileUri}`);
    }
  }
}
