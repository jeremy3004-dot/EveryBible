export {
  fetchAnnotations,
  upsertAnnotation,
  softDeleteAnnotation,
  syncAnnotations,
  getAnnotationsForChapter,
  subscribeToAnnotationChanges,
} from './annotationService';

export type { AnnotationResult, SyncAnnotationsResult } from './annotationService';

export {
  mergeAnnotationLists,
  selectAnnotationsToPush,
  indexAnnotationsByKey,
  makeAnnotationCompositeKey,
} from './annotationMerge';

export type { AnnotationCompositeKey } from './annotationMerge';
