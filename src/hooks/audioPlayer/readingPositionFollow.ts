import { useAudioStore } from '../../stores/audioStore';
import { hasAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useBibleStore } from '../../stores/bibleStore';
import { readingPlansStore } from '../../stores/readingPlansStore';

interface ChapterRef {
  bookId: string;
  chapter: number;
}

const isSameChapter = (a: ChapterRef, b: ChapterRef) =>
  a.bookId === b.bookId && a.chapter === b.chapter;

/**
 * Audio finished `finished` and moved on to `next` by itself. A listener who was following
 * along (their saved place is the chapter that just finished) keeps following: the saved
 * reading position, and in a plan session that day's resume point, move to `next`. A place
 * the listener moved elsewhere stays where they left it.
 *
 * A mounted reader that follows the audio writes the same values when it opens `next`, so
 * this matters when the reader is closed; with it open, whichever lands second is a no-op.
 * Nothing is marked as read: listening is recorded in the listening history.
 */
export function followAutoAdvancedChapter(finished: ChapterRef, next: ChapterRef): void {
  if (isSameChapter(finished, next)) return;

  const bible = useBibleStore.getState();
  // A fresh install's Genesis 1 is not a place the listener chose, so it is not followed.
  if (
    bible.hasReaderHistory &&
    isSameChapter({ bookId: bible.currentBook, chapter: bible.currentChapter }, finished)
  ) {
    bible.applySyncedReadingPosition(next);
  }

  followPlanDayResume(finished, next);
}

function followPlanDayResume(finished: ChapterRef, next: ChapterRef): void {
  const { playbackSequence, audioReturnTarget } = useAudioStore.getState();
  const planId = audioReturnTarget?.planId;
  const planDayNumber = audioReturnTarget?.planDayNumber;
  if (!planId || typeof planDayNumber !== 'number') return;
  // Only a step inside the plan day's own chapters belongs to that day.
  if (
    !hasAudioPlaybackSequenceEntry(playbackSequence, finished.bookId, finished.chapter) ||
    !hasAudioPlaybackSequenceEntry(playbackSequence, next.bookId, next.chapter)
  ) {
    return;
  }

  const plans = readingPlansStore.getState();
  const resume = plans.getPlanDayResume(planId, planDayNumber);
  if (!resume || !isSameChapter(resume, finished)) return;
  plans.setPlanDayResume(planId, planDayNumber, next.bookId, next.chapter);
}
