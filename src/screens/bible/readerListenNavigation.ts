import type { AudioStatus } from '../../types/audio';

export interface ReaderChapterRef {
  bookId: string;
  chapter: number;
}

export interface ReaderListenNavigation {
  /** The reader is showing the chapter the audio player has loaded. */
  isCurrentAudioChapter: boolean;
  /** The player's own next/previous step, used when the reader shows the playing chapter. */
  stepPlayer: () => Promise<ReaderChapterRef | null>;
  /** Where the arrow goes when the reader shows a different chapter. */
  fallbackTarget: ReaderChapterRef | null;
  /** Read at press time: the listener may have paused after the controls rendered. */
  getAudioStatus: () => AudioStatus;
  playChapter: (bookId: string, chapter: number) => Promise<void>;
  syncReaderReference: (bookId: string, chapter: number) => void;
  /**
   * Tells a screen reader where the arrow went. The arrows keep focus while the chapter
   * swaps under them. Called with the chapter actually reached: on the playing chapter
   * that is the player's queue or plan step, which can differ from the reader's own guess.
   */
  announceTarget: (target: ReaderChapterRef) => void;
}

/**
 * The listen-mode chapter arrows. On the playing chapter the player walks its own
 * queue or plan session and the reader follows. On another chapter the reader moves
 * to the target, and only starts it sounding if the listener had not paused.
 */
export async function navigateListenChapter(navigation: ReaderListenNavigation): Promise<void> {
  if (navigation.isCurrentAudioChapter) {
    const target = await navigation.stepPlayer();
    if (target) {
      navigation.announceTarget(target);
      navigation.syncReaderReference(target.bookId, target.chapter);
    }
    return;
  }

  const target = navigation.fallbackTarget;
  if (!target) {
    return;
  }

  if (navigation.getAudioStatus() !== 'paused') {
    await navigation.playChapter(target.bookId, target.chapter);
  }
  navigation.announceTarget(target);
  navigation.syncReaderReference(target.bookId, target.chapter);
}
