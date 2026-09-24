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
