import { gatherFoundations } from '../../data/gatherFoundations';
import { formatBibleReferenceLabel } from '../../services/gather/gatherReferenceLabel';
import type { GatherFoundation, GatherLesson } from '../../types/gather';

export interface GatherUpNext {
  foundation: GatherFoundation;
  lesson: GatherLesson;
  /** Scripture reference with the book named in the reader's language. */
  referenceLabel: string;
}

/**
 * How many of `lessons` are marked complete. Stored progress can hold ids the
 * catalog no longer ships (a renamed or retired lesson), so the count is taken
 * from the catalog side: a stale id must neither push the count past the total
 * nor fill in for a lesson that is still unfinished.
 */
export function countCompletedLessons(
  completedIds: readonly string[] | undefined,
  lessons: readonly Pick<GatherLesson, 'id'>[]
): number {
  if (!completedIds || completedIds.length === 0) {
    return 0;
  }
  const done = new Set(completedIds);
  return lessons.filter((lesson) => done.has(lesson.id)).length;
}

/**
 * The Foundations path is linear, so "up next" is the first lesson nobody has
 * ticked off yet. Once every lesson is complete there is nothing to resume and
 * the caller drops the card rather than pointing back at finished work.
 */
export function resolveGatherUpNext(
  completedLessons: Record<string, string[]>,
  resolveBookName: (bookId: string) => string
): GatherUpNext | null {
  for (const foundation of gatherFoundations) {
    const done = completedLessons[foundation.id] ?? [];
    const lesson = foundation.lessons.find((candidate) => !done.includes(candidate.id));
    if (lesson) {
      return {
        foundation,
        lesson,
        referenceLabel: formatBibleReferenceLabel(lesson.references, resolveBookName),
      };
    }
  }
  return null;
}
