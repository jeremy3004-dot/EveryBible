import type { UserAnnotation } from '../../services/supabase/types';
import {
  buildBibleSelectionVerseRanges,
  normalizeBibleSelectionVerses,
} from './bibleSelectionModel';

/** What the reader hands to upsertAnnotation. */
export type ReaderAnnotationDraft = Omit<
  UserAnnotation,
  'user_id' | 'created_at' | 'updated_at' | 'synced_at'
>;

export interface ReaderAnnotationEdits {
  softDeleteIds: string[];
  upserts: ReaderAnnotationDraft[];
}

interface ReaderAnnotationEditInput {
  book: string;
  chapter: number;
  /** The chapter's annotations, as the reader holds them. */
  annotations: readonly UserAnnotation[];
  selectedVerses: readonly number[];
  createId: () => string;
}

type AnnotationRange = Pick<UserAnnotation, 'verse_start' | 'verse_end'>;

const rangeEnd = (range: AnnotationRange) => range.verse_end ?? range.verse_start;

const toStoredEnd = (start: number, end: number) => (start === end ? null : end);

const isActive = (annotation: UserAnnotation, type: UserAnnotation['type']) =>
  annotation.type === type && annotation.deleted_at == null;

const overlapsSelection = (annotation: AnnotationRange, selected: ReadonlySet<number>) => {
  for (let verse = annotation.verse_start; verse <= rangeEnd(annotation); verse += 1) {
    if (selected.has(verse)) return true;
  }
  return false;
};

/** The runs of an annotation's verses that fall outside the selection. */
const unselectedRuns = (annotation: AnnotationRange, selected: ReadonlySet<number>) => {
  const kept: number[] = [];
  for (let verse = annotation.verse_start; verse <= rangeEnd(annotation); verse += 1) {
    if (!selected.has(verse)) kept.push(verse);
  }
  return buildBibleSelectionVerseRanges(kept);
};

function draft(
  input: Pick<ReaderAnnotationEditInput, 'book' | 'chapter'>,
  fields: Pick<UserAnnotation, 'id' | 'type' | 'color' | 'content'> & {
    verse_start: number;
    verse_end_inclusive: number;
  }
): ReaderAnnotationDraft {
  return {
    id: fields.id,
    book: input.book,
    chapter: input.chapter,
    verse_start: fields.verse_start,
    verse_end: toStoredEnd(fields.verse_start, fields.verse_end_inclusive),
    type: fields.type,
    color: fields.color,
    content: fields.content,
    deleted_at: null,
  };
}

/**
 * Takes the selected verses out of each matching highlight: the highlight is deleted and
 * whatever it covered outside the selection is written back as new highlights of its colour.
 */
function trimHighlights(
  input: ReaderAnnotationEditInput,
  matches: (highlight: UserAnnotation) => boolean,
  keepIds: ReadonlySet<string>
): ReaderAnnotationEdits {
  const selected = new Set(input.selectedVerses);
  const edits: ReaderAnnotationEdits = { softDeleteIds: [], upserts: [] };
  for (const highlight of input.annotations) {
    if (
      !isActive(highlight, 'highlight') ||
      keepIds.has(highlight.id) ||
      !matches(highlight) ||
      !overlapsSelection(highlight, selected)
    ) {
      continue;
    }
    edits.softDeleteIds.push(highlight.id);
    for (const run of unselectedRuns(highlight, selected)) {
      edits.upserts.push(
        draft(input, {
          id: input.createId(),
          type: 'highlight',
          color: highlight.color,
          content: null,
          verse_start: run.verse_start,
          verse_end_inclusive: run.verse_end,
        })
      );
    }
  }
  return edits;
}

/**
 * The annotation store keeps one live highlight per first verse: writing a highlight that
 * starts where a live one starts rewrites that row under the new id. Planned as a new row
 * plus a delete, the delete then found nothing, the edit reported failure and any deletes
 * after it never ran, leaving overlapping highlights. So a replacement that starts where a
 * highlight it replaces started takes over that row (its id) and the row is not deleted.
 */
function reuseRowsOfReplacedHighlights(
  edits: ReaderAnnotationEdits,
  annotations: readonly UserAnnotation[]
): ReaderAnnotationEdits {
  const byId = new Map(annotations.map((annotation) => [annotation.id, annotation]));
  const softDeleteIds = [...edits.softDeleteIds];
  const upserts = edits.upserts.map((upsert) => {
    if (upsert.type !== 'highlight' || byId.has(upsert.id)) return upsert;
    const index = softDeleteIds.findIndex((id) => byId.get(id)?.verse_start === upsert.verse_start);
    if (index < 0) return upsert;
    const [id] = softDeleteIds.splice(index, 1);
    return { ...upsert, id };
  });
  return { softDeleteIds, upserts };
}

/**
 * Paints the selected verses one colour. The reader shows one highlight per verse, so any
 * highlight already under the selection gives those verses up; a highlight covering exactly
 * one selected run is recoloured in place.
 */
export function planReaderHighlightApply(
  input: ReaderAnnotationEditInput & { color: string }
): ReaderAnnotationEdits {
  const runs = buildBibleSelectionVerseRanges([...input.selectedVerses]);
  const reusedIds = runs.map(
    (run) =>
      input.annotations.find(
        (annotation) =>
          isActive(annotation, 'highlight') &&
          annotation.verse_start === run.verse_start &&
          rangeEnd(annotation) === run.verse_end
      )?.id
  );
  const trimmed = trimHighlights(
    input,
    () => true,
    new Set(reusedIds.filter((id): id is string => id != null))
  );
  return reuseRowsOfReplacedHighlights(
    {
      softDeleteIds: trimmed.softDeleteIds,
      upserts: [
        ...trimmed.upserts,
        ...runs.map((run, index) =>
          draft(input, {
            id: reusedIds[index] ?? input.createId(),
            type: 'highlight',
            color: input.color,
            content: null,
            verse_start: run.verse_start,
            verse_end_inclusive: run.verse_end,
          })
        ),
      ],
    },
    input.annotations
  );
}

/**
 * Clears one colour from the selected verses, whether it was saved as one long highlight
 * or verse by verse. The same colour stays on any verse outside the selection.
 */
export function planReaderHighlightRemove(
  input: ReaderAnnotationEditInput & { color: string }
): ReaderAnnotationEdits {
  return reuseRowsOfReplacedHighlights(
    trimHighlights(input, (highlight) => highlight.color === input.color, new Set()),
    input.annotations
  );
}

/**
 * Saves the note sheet. The sheet opens with the first note overlapping the selection
 * already filled in, so saving edits that note; only a selection with no note creates one.
 */
export function planReaderNoteSave(
  input: ReaderAnnotationEditInput & { content: string }
): ReaderAnnotationEdits {
  const selected = new Set(normalizeBibleSelectionVerses([...input.selectedVerses]));
  const existing = input.annotations.find(
    (annotation) => isActive(annotation, 'note') && overlapsSelection(annotation, selected)
  );
  if (existing) {
    return {
      softDeleteIds: [],
      upserts: [
        draft(input, {
          id: existing.id,
          type: 'note',
          color: null,
          content: input.content,
          verse_start: existing.verse_start,
          verse_end_inclusive: rangeEnd(existing),
        }),
      ],
    };
  }
  return {
    softDeleteIds: [],
    upserts: buildBibleSelectionVerseRanges([...selected]).map((run) =>
      draft(input, {
        id: input.createId(),
        type: 'note',
        color: null,
        content: input.content,
        verse_start: run.verse_start,
        verse_end_inclusive: run.verse_end,
      })
    ),
  };
}

interface AnnotationWriteResult {
  success: boolean;
}

/**
 * Writes the edits and reports whether every write succeeded. The replacement highlights are
 * written before the ones they split are deleted: a write that fails partway then leaves an
 * overlap the reader can retry, never a verse outside the selection that lost its highlight.
 */
export async function applyReaderAnnotationEdits(
  edits: ReaderAnnotationEdits,
  store: {
    softDelete: (id: string) => Promise<AnnotationWriteResult>;
    upsert: (draft: ReaderAnnotationDraft) => Promise<AnnotationWriteResult>;
  }
): Promise<boolean> {
  for (const annotation of edits.upserts) {
    if (!(await store.upsert(annotation)).success) return false;
  }
  for (const id of edits.softDeleteIds) {
    if (!(await store.softDelete(id)).success) return false;
  }
  return true;
}
