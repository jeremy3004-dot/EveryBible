export {
  fetchAnnotations,
  upsertAnnotation,
  softDeleteAnnotation,
  syncAnnotations,
  getAnnotationsForChapter,
} from './annotationService';

export type { AnnotationResult, SyncAnnotationsResult } from './annotationService';
