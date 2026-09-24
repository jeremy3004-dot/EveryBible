import { newTestamentBooks } from '../../../constants/books';
import { getAudioAvailability } from '../../../services/audio/audioAvailability';
import type { BibleTranslation } from '../../../types';
import { getTranslationSelectionState } from '../bibleTranslationModel';

export type TranslationSelectionOutcome =
  /** Open the Bible, first moving to `jumpToBook` chapter 1 when it is set. */
  | { kind: 'activate'; jumpToBook: string | null }
  /** Audio exists, but not for this book and nowhere it could jump to. */
  | { kind: 'audio-unavailable' }
  /** The text pack has to be downloaded first; ask the reader. */
  | { kind: 'download-required' }
  | { kind: 'coming-soon' };

export interface TranslationSelectionEnvironment {
  currentBook: string;
  audioEnabled: boolean;
  isRemoteAudioAvailable: (translationId: string, bookId: string) => boolean;
  getFirstAvailableAudioBook: (translationId: string) => string | null;
}

/** What tapping a Bible in the picker should do, given where the reader is. */
export function resolveTranslationSelection(
  translation: BibleTranslation,
  {
    currentBook,
    audioEnabled,
    isRemoteAudioAvailable,
    getFirstAvailableAudioBook,
  }: TranslationSelectionEnvironment
): TranslationSelectionOutcome {
  const audioAvailability = getAudioAvailability({
    featureEnabled: audioEnabled,
    translationHasAudio: translation.hasAudio,
    remoteAudioAvailable: isRemoteAudioAvailable(translation.id, currentBook),
    downloadedAudioBooks: translation.downloadedAudioBooks,
    bookId: currentBook,
  });
  const selectionState = getTranslationSelectionState({
    isDownloaded: translation.isDownloaded,
    hasText: translation.hasText,
    hasAudio: translation.hasAudio,
    canPlayAudio: audioAvailability.canPlayAudio,
    hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
    source: translation.source,
    textPackLocalPath: translation.textPackLocalPath,
  });

  if (selectionState.isSelectable) {
    const isCurrentBookOT = !newTestamentBooks.some((book) => book.id === currentBook);
    const isNTOnlyText = translation.totalBooks === newTestamentBooks.length;
    return { kind: 'activate', jumpToBook: isCurrentBookOT && isNTOnlyText ? 'MAT' : null };
  }

  if (selectionState.reason === 'audio-unavailable') {
    // The translation has audio, just not for the book the reader is currently in
    // (e.g. a New-Testament-only audio translation selected from an Old Testament
    // chapter). Jump to the first book it does cover so it "just works" instead of
    // showing a misleading download error.
    const targetBook = getFirstAvailableAudioBook(translation.id);
    if (
      audioEnabled &&
      targetBook &&
      targetBook !== currentBook &&
      isRemoteAudioAvailable(translation.id, targetBook)
    ) {
      return { kind: 'activate', jumpToBook: targetBook };
    }
    return { kind: 'audio-unavailable' };
  }

  if (selectionState.reason === 'download-required') {
    return { kind: 'download-required' };
  }

  return { kind: 'coming-soon' };
}
