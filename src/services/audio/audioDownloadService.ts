import type { BibleBook } from '../../constants/books';
import { buildAudioChapterTargets } from './audioDownloads';

const DEFAULT_AUDIO_ROOT_URI = 'file:///everybible-audio/';

export interface AudioFileSystemAdapter {
  ensureDirectory: (directoryUri: string) => Promise<void>;
  fileExists: (fileUri: string) => Promise<boolean>;
  downloadFile: (from: string, to: string) => Promise<void>;
}

export interface RemoteAudioAsset {
  url: string;
  duration: number;
}

export type ResolveRemoteAudio = (
  translationId: string,
  bookId: string,
  chapter: number
) => Promise<RemoteAudioAsset | null>;

interface DownloadAudioBookParams {
  rootUri?: string;
  translationId: string;
  book: BibleBook;
  resolveRemoteAudio: ResolveRemoteAudio;
  fileSystem: AudioFileSystemAdapter;
}

interface DownloadAudioTranslationParams {
  rootUri?: string;
  translationId: string;
  books: BibleBook[];
  resolveRemoteAudio: ResolveRemoteAudio;
  fileSystem: AudioFileSystemAdapter;
}

export function getBookAudioDirectoryUri(
  translationId: string,
  bookId: string,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${rootUri}${translationId}/${bookId}/`;
}

export function getChapterAudioFileUri(
  translationId: string,
  bookId: string,
  chapter: number,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${getBookAudioDirectoryUri(translationId, bookId, rootUri)}${chapter}.mp3`;
}

export async function getDownloadedChapterAudioUri(
  translationId: string,
  bookId: string,
  chapter: number,
  fileSystem: AudioFileSystemAdapter,
  rootUri?: string
): Promise<string | null> {
  const fileUri = getChapterAudioFileUri(translationId, bookId, chapter, rootUri);
  return (await fileSystem.fileExists(fileUri)) ? fileUri : null;
}

export async function downloadAudioBook({
  rootUri,
  translationId,
  book,
  resolveRemoteAudio,
  fileSystem,
}: DownloadAudioBookParams): Promise<{ bookId: string; chapterCount: number }> {
  const directoryUri = getBookAudioDirectoryUri(translationId, book.id, rootUri);
  const chapterTargets = buildAudioChapterTargets([book]);

  await fileSystem.ensureDirectory(directoryUri);

  for (const target of chapterTargets) {
    const fileUri = getChapterAudioFileUri(
      translationId,
      target.bookId,
      target.chapter,
      rootUri
    );
    if (await fileSystem.fileExists(fileUri)) {
      continue;
    }

    const remoteAudio = await resolveRemoteAudio(translationId, target.bookId, target.chapter);
    if (!remoteAudio?.url) {
      throw new Error(`Audio is not available for ${target.bookId} ${target.chapter}`);
    }

    await fileSystem.downloadFile(remoteAudio.url, fileUri);
  }

  return { bookId: book.id, chapterCount: chapterTargets.length };
}

export async function downloadAudioTranslation({
  rootUri,
  translationId,
  books,
  resolveRemoteAudio,
  fileSystem,
}: DownloadAudioTranslationParams): Promise<{ downloadedBookIds: string[] }> {
  const downloadedBookIds: string[] = [];

  for (const book of books) {
    const result = await downloadAudioBook({
      rootUri,
      translationId,
      book,
      resolveRemoteAudio,
      fileSystem,
    });
    downloadedBookIds.push(result.bookId);
  }

  return { downloadedBookIds };
}
