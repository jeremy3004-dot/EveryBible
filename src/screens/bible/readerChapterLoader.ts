import { shouldAttemptChapterTextLoad } from '../../services/bible/presentation';
import type { BibleTranslation, Verse } from '../../types';
import { shouldShowChapterLoadSkeleton } from './bibleReaderModel';

export interface CancellableTask {
  cancel: () => void;
}

/** The refs the reader keeps across renders so a superseded load can be ignored. */
export interface ReaderChapterLoadRefs {
  requestIdRef: { current: number };
  prefetchTaskRef: { current: CancellableTask | null };
}

export interface ReaderChapterLoad extends ReaderChapterLoadRefs {
  translationId: string;
  bookId: string;
  chapter: number;
  translation: Pick<BibleTranslation, 'hasText'> | undefined;
  currentVerseCount: number;
  returnToPlanOnComplete: boolean;
  getChapter: (translationId: string, bookId: string, chapter: number) => Promise<Verse[]>;
  prefetchNextChapter: (translationId: string, bookId: string, chapter: number) => Promise<void>;
  runAfterInteractions: (task: () => void) => CancellableTask;
  markChapterRead: (bookId: string, chapter: number) => void;
  recoverMissingInstalledPack: (translationId: string) => Promise<unknown>;
  setIsLoading: (isLoading: boolean) => void;
  setError: (message: string | null) => void;
  setVerses: (verses: Verse[]) => void;
  /** Records which chapter `verses` now holds (see readerChapterKey). */
  setVersesChapterKey: (key: string) => void;
  t: (key: 'bible.packMissingRecovering' | 'bible.failedToLoad') => string;
}

/**
 * Identifies the chapter and translation the reader's verses belong to. A chapter or
 * translation change keeps the old verses visible until the new ones load, so the reader
 * compares this key with the route's chapter before highlighting or selecting anything.
 */
export function readerChapterKey(translationId: string, bookId: string, chapter: number): string {
  return `${translationId}:${bookId}:${chapter}`;
}

/** Makes any in-flight load and its queued text prefetch stale. */
export function invalidateReaderChapterLoad({
  requestIdRef,
  prefetchTaskRef,
}: ReaderChapterLoadRefs) {
  requestIdRef.current += 1;
  prefetchTaskRef.current?.cancel();
  prefetchTaskRef.current = null;
}

/**
 * Loads the reader's chapter text. Only the newest request may touch reader state,
 * and the next chapter's text is prefetched only after interactions settle and
 * only for a successful, nonempty load that is still current.
 */
export async function loadReaderChapter(load: ReaderChapterLoad): Promise<void> {
  const { requestIdRef, prefetchTaskRef, translationId, bookId, chapter } = load;
  invalidateReaderChapterLoad(load);
  const requestId = requestIdRef.current;
  // HARD RULE (do not change): chapter-to-chapter transitions must NEVER show a
  // loading skeleton. Only show the skeleton on the very first load (no verses yet).
  // For chapter-to-chapter transitions, keep the old content visible to avoid a
  // layout flash / button jump. This guard is what keeps `showPremiumReadMode`
  // (which includes `!isLoading`) from flashing the skeleton mid-chapter. See
  // bibleReaderModel.test.ts: "isLoading stays false on chapter change with existing verses".
  if (shouldShowChapterLoadSkeleton(load.currentVerseCount)) {
    load.setIsLoading(true);
  }
  load.setError(null);

  // An audio-only translation has no text pack, so querying for one throws and
  // the resulting error card would hide the audio-first chapter screen. Clear the
  // verses instead: an empty chapter with audio available IS the audio-first state.
  if (!shouldAttemptChapterTextLoad(load.translation)) {
    load.setVerses([]);
    load.setVersesChapterKey(readerChapterKey(translationId, bookId, chapter));
    load.setIsLoading(false);
    return;
  }

  try {
    const data = await load.getChapter(translationId, bookId, chapter);
    if (requestId !== requestIdRef.current) {
      return;
    }
    load.setVerses(data);
    load.setVersesChapterKey(readerChapterKey(translationId, bookId, chapter));
    if (data.length > 0) {
      prefetchTaskRef.current = load.runAfterInteractions(() => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        prefetchTaskRef.current = null;
        void load.prefetchNextChapter(translationId, bookId, chapter);
      });
    }
    if (!load.returnToPlanOnComplete) {
      load.markChapterRead(bookId, chapter);
    }
  } catch (err) {
    if (requestId !== requestIdRef.current) {
      return;
    }
    // Matched by name: MissingInstalledDatabaseError sets it, and importing the class
    // would pull the SQLite database module into this loader.
    if (err instanceof Error && err.name === 'MissingInstalledDatabaseError') {
      // Installed pack vanished mid-session (e.g. OS storage cleanup). Trigger the
      // store self-heal to reset pack state and re-download, and surface a recoverable
      // message instead of the generic load failure.
      void load.recoverMissingInstalledPack(translationId);
      load.setError(load.t('bible.packMissingRecovering'));
    } else {
      load.setError(load.t('bible.failedToLoad'));
    }
    console.error('Error loading chapter:', err);
  } finally {
    if (requestId === requestIdRef.current) {
      load.setIsLoading(false);
    }
  }
}
