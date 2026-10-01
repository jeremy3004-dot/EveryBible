import { useAudioStore } from '../../stores/audioStore';
import { hasAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useBibleStore } from '../../stores/bibleStore';
import { readingPlansStore } from '../../stores/readingPlansStore';
import { getRhythmSessionSegmentAtIndex } from '../../services/plans/readingPlanActivity';

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
    bible.setReadingPosition(next);
  }

  followPlanDayResume(finished, next);
}

function followPlanDayResume(finished: ChapterRef, next: ChapterRef): void {
  const { playbackSequence, audioReturnTarget } = useAudioStore.getState();
  let planId = audioReturnTarget?.planId;
  let planDayNumber = audioReturnTarget?.planDayNumber;
  // A rhythm's sequence spans several plans while the return target names the one the
  // reader last showed. The step belongs to the plan whose segment holds both chapters;
  // a step into the next plan's segment is that plan's own reader's to record.
  const rhythm = audioReturnTarget?.sessionContext;
  if (rhythm) {
    const finishedIndex = playbackSequence.findIndex(
      (entry) => entry.bookId === finished.bookId && entry.chapter === finished.chapter
    );
    const segment = getRhythmSessionSegmentAtIndex(rhythm, finishedIndex);
    const nextEntry = playbackSequence[finishedIndex + 1];
    if (
      !segment ||
      segment.type !== 'plan' ||
      finishedIndex + 1 >= segment.endIndex ||
      nextEntry?.bookId !== next.bookId ||
      nextEntry.chapter !== next.chapter
    ) {
      return;
    }
    planId = segment.planId;
    planDayNumber = segment.dayNumber;
  }
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
  // This is still the session that owned the saved chapter, even if the date
  // rolled over with the reader closed. Never promote it into a new occurrence.
  plans.setPlanDayResume(planId, planDayNumber, next.bookId, next.chapter, resume.occurrenceKey);
}
