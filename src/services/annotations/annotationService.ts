import type { UserAnnotation } from '../supabase/types';
import { localAnnotationStore } from '../../stores/annotationStore';
import { mergeAnnotationLists } from './annotationMerge';

export interface AnnotationResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SyncAnnotationsResult {
  success: boolean;
  /** Annotations that should be written into local storage after the sync. */
  merged?: UserAnnotation[];
  error?: string;
}

const isActiveAnnotation = (annotation: UserAnnotation) => annotation.deleted_at == null;

const sortByChapterVerse = (annotations: UserAnnotation[]) =>
  [...annotations].sort((a, b) => {
    const chapterDelta = a.chapter - b.chapter;
    if (chapterDelta !== 0) {
      return chapterDelta;
    }

    return a.verse_start - b.verse_start;
  });

const sortByUpdatedAt = (annotations: UserAnnotation[]) =>
  [...annotations].sort((a, b) => {
    const updatedAtDelta = b.updated_at.localeCompare(a.updated_at);
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return b.created_at.localeCompare(a.created_at);
  });

// ---------------------------------------------------------------------------
// fetchAnnotations
// ---------------------------------------------------------------------------

/**
 * Fetch the locally saved annotations.
 *
 * The app intentionally stays on-device for annotations, so this returns the
 * persisted local store instead of calling a backend.
 *
 * @param bookFilter - Optional BSB book abbreviation (e.g. "GEN") to narrow results.
 */
export const fetchAnnotations = async (
  bookFilter?: string
): Promise<AnnotationResult<UserAnnotation[]>> => {
  try {
    const annotations = localAnnotationStore.annotations.filter(isActiveAnnotation);
    const filtered = bookFilter ? annotations.filter((annotation) => annotation.book === bookFilter) : annotations;

    return { success: true, data: sortByUpdatedAt(filtered) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// upsertAnnotation
// ---------------------------------------------------------------------------

/**
 * Create or update a single local annotation.
 */
export const upsertAnnotation = async (
  annotation: Omit<UserAnnotation, 'user_id' | 'created_at' | 'updated_at' | 'synced_at'>
): Promise<AnnotationResult<UserAnnotation>> => {
  try {
    const saved = localAnnotationStore.upsertAnnotation(annotation);
    return { success: true, data: saved };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// softDeleteAnnotation
// ---------------------------------------------------------------------------

/**
 * Soft-delete a local annotation by id.
 */
export const softDeleteAnnotation = async (
  id: string
): Promise<AnnotationResult> => {
  try {
    const success = localAnnotationStore.softDeleteAnnotation(id);
    if (!success) {
      return { success: false, error: 'Annotation not found' };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// syncAnnotations
// ---------------------------------------------------------------------------

/**
 * Local-only annotation sync.
 *
 * The app no longer syncs annotations to a backend. This function keeps the
 * same API surface but simply reconciles the provided local list with the
 * persisted on-device store.
 */
export const syncAnnotations = async (
  localAnnotations: UserAnnotation[],
  _lastSyncedAt: string | null
): Promise<SyncAnnotationsResult> => {
  try {
    const merged = mergeAnnotationLists(localAnnotationStore.annotations, localAnnotations);
    localAnnotationStore.replaceAnnotations(merged);
    return { success: true, merged };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};

// ---------------------------------------------------------------------------
// getAnnotationsForChapter
// ---------------------------------------------------------------------------

/**
 * Fetch all non-deleted local annotations for a specific book and chapter.
 * Results are ordered by verse_start ascending for display in reading order.
 */
export const getAnnotationsForChapter = async (
  book: string,
  chapter: number
): Promise<AnnotationResult<UserAnnotation[]>> => {
  try {
    const annotations = localAnnotationStore.annotations.filter(
      (annotation) =>
        isActiveAnnotation(annotation) && annotation.book === book && annotation.chapter === chapter
    );

    return { success: true, data: sortByChapterVerse(annotations) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};
