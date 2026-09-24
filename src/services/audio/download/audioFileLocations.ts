/** Local file locations for downloaded chapter audio and native transfer task ids. */
import { assertSafeAssetId } from '../../bible/assetIdentifiers';
import { getRemoteAudioFileExtension } from '../audioRemote';

export const DEFAULT_AUDIO_ROOT_URI = 'file:///everybible-audio/';

// Translation and book ids reach here from a remote catalog / manifest, and this URI is
// the base for every download, delete and directory-listing call below. A `../` segment in
// either id would walk out of the audio root, so both are validated before interpolation.
export function getBookAudioDirectoryUri(
  translationId: string,
  bookId: string,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${rootUri}${assertSafeAssetId(translationId, 'translation id')}/${assertSafeAssetId(
    bookId,
    'book id'
  )}/`;
}

export function getChapterAudioFileUri(
  translationId: string,
  bookId: string,
  chapter: number,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${getBookAudioDirectoryUri(translationId, bookId, rootUri)}${chapter}.${getRemoteAudioFileExtension(
    translationId
  )}`;
}

export function getLegacyChapterAudioFileUri(
  translationId: string,
  bookId: string,
  chapter: number,
  rootUri: string = DEFAULT_AUDIO_ROOT_URI
): string {
  return `${getBookAudioDirectoryUri(translationId, bookId, rootUri)}${chapter}.mp3`;
}

export function createAudioDownloadTaskId(jobId: string, bookId: string, chapter: number): string {
  return `${jobId}:${bookId}:${chapter}`;
}
