import { assertSafeAssetId } from '../bible/assetIdentifiers';
import type { RemoteAudioAsset, AudioFileSystemAdapter } from './audioDownloadService';
import { getRemoteAudioFileExtension } from './audioRemote';

export type AudioShareFileSystemAdapter = Pick<
  AudioFileSystemAdapter,
  'ensureDirectory' | 'fileExists' | 'downloadFile'
>;

export interface ChapterAudioShareAsset {
  uri: string;
  mimeType: string;
  fileExtension: string;
  isTemporary: boolean;
}

export interface PrepareChapterAudioShareAssetOptions {
  translationId: string;
  bookId: string;
  chapter: number;
  fileSystem: AudioShareFileSystemAdapter;
  rootUri?: string;
  resolveDownloadedAudioUri: (
    translationId: string,
    bookId: string,
    chapter: number
  ) => Promise<string | null>;
  resolveRemoteAudio: (
    translationId: string,
    bookId: string,
    chapter: number
  ) => Promise<RemoteAudioAsset | null>;
}

const AUDIO_SHARE_EXPORT_ROOT_URI = 'file:///everybible-audio-share/';

const SAFE_FILE_EXTENSION_RE = /^[a-z0-9]{1,8}$/i;

// The export cache path is built from ids that ultimately come from remote catalog data and
// is handed to ensureDirectory/downloadFile. Callers resolve the ids through validated
// builders today, but the guard lives here too so no future caller can walk out of the
// share cache with a `../` id (same rule as getBookAudioDirectoryUri).
function getAudioShareDirectoryUri(
  translationId: string,
  bookId: string,
  rootUri: string = AUDIO_SHARE_EXPORT_ROOT_URI
): string {
  return `${rootUri}${assertSafeAssetId(translationId, 'translation id')}/${assertSafeAssetId(
    bookId,
    'book id'
  )}/`;
}

function inferAudioFileExtension(uri: string, fallbackExtension: string): string {
  const match = uri.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  const extension = match?.[1]?.trim().toLowerCase();
  return extension && extension.length > 0 ? extension : fallbackExtension;
}

function getAudioShareMimeType(extension: string): string {
  switch (extension) {
    case 'm4a':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    default:
      return `audio/${extension}`;
  }
}

export function getChapterAudioShareFileUri(
  translationId: string,
  bookId: string,
  chapter: number,
  extension: string,
  rootUri: string = AUDIO_SHARE_EXPORT_ROOT_URI
): string {
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new Error(`Unsafe chapter rejected: ${JSON.stringify(chapter)}`);
  }
  if (!SAFE_FILE_EXTENSION_RE.test(extension)) {
    throw new Error(`Unsafe audio file extension rejected: ${JSON.stringify(extension)}`);
  }
  return `${getAudioShareDirectoryUri(translationId, bookId, rootUri)}${chapter}.${extension}`;
}

export async function prepareChapterAudioShareAsset({
  translationId,
  bookId,
  chapter,
  fileSystem,
  rootUri = AUDIO_SHARE_EXPORT_ROOT_URI,
  resolveDownloadedAudioUri,
  resolveRemoteAudio,
}: PrepareChapterAudioShareAssetOptions): Promise<ChapterAudioShareAsset | null> {
  const defaultExtension = getRemoteAudioFileExtension(translationId);
  const localUri = await resolveDownloadedAudioUri(translationId, bookId, chapter);

  if (localUri) {
    const fileExtension = inferAudioFileExtension(localUri, defaultExtension);
    return {
      uri: localUri,
      mimeType: getAudioShareMimeType(fileExtension),
      fileExtension,
      isTemporary: false,
    };
  }

  const remoteAudio = await resolveRemoteAudio(translationId, bookId, chapter);
  if (!remoteAudio) {
    return null;
  }

  const fileExtension = inferAudioFileExtension(remoteAudio.url, defaultExtension);
  const exportDirectoryUri = getAudioShareDirectoryUri(translationId, bookId, rootUri);
  const exportUri = getChapterAudioShareFileUri(
    translationId,
    bookId,
    chapter,
    fileExtension,
    rootUri
  );

  await fileSystem.ensureDirectory(exportDirectoryUri);
  if (!(await fileSystem.fileExists(exportUri))) {
    await fileSystem.downloadFile(remoteAudio.url, exportUri);
  }

  return {
    uri: exportUri,
    mimeType: getAudioShareMimeType(fileExtension),
    fileExtension,
    isTemporary: true,
  };
}

/** Exports older than this are always removed; nobody is still sharing a day-old file. */
export const AUDIO_SHARE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** The export cache is trimmed, oldest first, once it holds more than this. */
export const AUDIO_SHARE_CACHE_MAX_BYTES = 50 * 1024 * 1024;
/**
 * A file touched within this window is never removed: a recipient may still be reading a file
 * the native share sheet just handed over, even after `shareAsync` has returned.
 */
export const AUDIO_SHARE_CACHE_GRACE_MS = 10 * 60 * 1000;

export interface AudioShareCacheFile {
  uri: string;
  size: number;
  modifiedAtMs: number;
}

export interface AudioShareCacheFileSystem {
  /** Every file under `rootUri`, nested directories included; empty when it does not exist. */
  listFiles: (rootUri: string) => Promise<AudioShareCacheFile[]>;
  deleteFile: (fileUri: string) => Promise<void>;
}

export interface PruneAudioShareCacheOptions {
  fileSystem: AudioShareCacheFileSystem;
  rootUri?: string;
  nowMs?: number;
  /** Files a share in progress is using; they are kept whatever their age or size. */
  protectedUris?: readonly string[];
  maxAgeMs?: number;
  maxBytes?: number;
  graceMs?: number;
}

/**
 * Bounds the chapter-audio export cache: removes exports older than a day, then the oldest
 * ones until the rest fit the byte budget. Protected files and anything younger than the
 * grace window are never removed, so a share in progress cannot lose its file. Returns the
 * uris it deleted; a file that cannot be deleted is skipped.
 */
export async function pruneAudioShareCache({
  fileSystem,
  rootUri = AUDIO_SHARE_EXPORT_ROOT_URI,
  nowMs = Date.now(),
  protectedUris = [],
  maxAgeMs = AUDIO_SHARE_CACHE_MAX_AGE_MS,
  maxBytes = AUDIO_SHARE_CACHE_MAX_BYTES,
  graceMs = AUDIO_SHARE_CACHE_GRACE_MS,
}: PruneAudioShareCacheOptions): Promise<string[]> {
  const files = await fileSystem.listFiles(rootUri);
  const protectedSet = new Set(protectedUris);
  const ageOf = (file: AudioShareCacheFile) => nowMs - file.modifiedAtMs;
  const removable = files
    .filter((file) => !protectedSet.has(file.uri) && ageOf(file) >= graceMs)
    .sort((left, right) => left.modifiedAtMs - right.modifiedAtMs);

  const deleted: string[] = [];
  let remainingBytes = files.reduce((total, file) => total + file.size, 0);
  for (const file of removable) {
    if (ageOf(file) <= maxAgeMs && remainingBytes <= maxBytes) {
      // Oldest first, so nothing later is old enough either, and the budget is met.
      break;
    }
    try {
      await fileSystem.deleteFile(file.uri);
      deleted.push(file.uri);
      remainingBytes -= file.size;
    } catch {
      // A stale file that cannot be deleted must not block this share.
    }
  }
  return deleted;
}

/** The parts of expo-file-system/legacy the export cache walk needs. */
export interface ExpoLegacyFileSystemSubset {
  readDirectoryAsync: (directoryUri: string) => Promise<string[]>;
  getInfoAsync: (
    uri: string
  ) => Promise<
    | { exists: false }
    | { exists: true; isDirectory: boolean; size?: number; modificationTime?: number }
  >;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
}

export function createExpoAudioShareCacheFileSystem(
  fileSystem: ExpoLegacyFileSystemSubset
): AudioShareCacheFileSystem {
  const listFiles = async (directoryUri: string): Promise<AudioShareCacheFile[]> => {
    const directory = directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
    let names: string[];
    try {
      names = await fileSystem.readDirectoryAsync(directory);
    } catch {
      return [];
    }
    const files: AudioShareCacheFile[] = [];
    for (const name of names) {
      const uri = `${directory}${name}`;
      const info = await fileSystem.getInfoAsync(uri);
      if (!info.exists) continue;
      if (info.isDirectory) {
        files.push(...(await listFiles(uri)));
      } else {
        // modificationTime is in seconds; a file without one counts as brand new, so it is kept.
        files.push({
          uri,
          size: info.size ?? 0,
          modifiedAtMs: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
        });
      }
    }
    return files;
  };
  return {
    listFiles,
    deleteFile: (fileUri) => fileSystem.deleteAsync(fileUri, { idempotent: true }),
  };
}
