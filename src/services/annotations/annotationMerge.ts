import type { UserAnnotation } from '../supabase/types';

// Composite key that uniquely identifies an annotation's position and type.
// Used for additive merge: same position+type from two sources → pick latest updated_at.
export type AnnotationCompositeKey = `${string}|${number}|${number}|${string}`;

export const makeAnnotationCompositeKey = (a: UserAnnotation): AnnotationCompositeKey =>
  `${a.book}|${a.chapter}|${a.verse_start}|${a.type}`;

/**
 * Perform an additive merge of two annotation lists.
 * For each composite key (book+chapter+verse_start+type), the record with the
 * later `updated_at` timestamp wins.  Both active and soft-deleted records are
 * included so that deletions propagate across devices.
 *
 * This is the pure core of the sync algorithm — no network I/O here.
 */
export const mergeAnnotationLists = (
  local: UserAnnotation[],
  remote: UserAnnotation[]
): UserAnnotation[] => {
  const mergedByKey = new Map<AnnotationCompositeKey, UserAnnotation>();

  // One list can hold several records for a key (the store keeps a deleted
  // highlight next to the one re-created on the same verse, newest first), so
  // local entries are compared too: seeding them in order let an older one
  // replace a newer one.
  for (const annotation of [...local, ...remote]) {
    const key = makeAnnotationCompositeKey(annotation);
    const existing = mergedByKey.get(key);
    if (!existing || supersedes(annotation, existing)) {
      mergedByKey.set(key, annotation);
    }
  }

  return Array.from(mergedByKey.values());
};

/**
 * Whether `candidate` wins over `existing` at the same verse and type: the later
 * edit; on the same instant a deletion (the later act on a record); then a
 * fixed order, so the result never depends on which list was local.
 */
const supersedes = (candidate: UserAnnotation, existing: UserAnnotation): boolean => {
  if (candidate.updated_at !== existing.updated_at) {
    return candidate.updated_at > existing.updated_at;
  }
  const candidateDeleted = candidate.deleted_at != null;
  if (candidateDeleted !== (existing.deleted_at != null)) {
    return candidateDeleted;
  }
  return JSON.stringify(candidate) > JSON.stringify(existing);
};

/**
 * Determine which local annotations need to be pushed to the remote.
 * A local annotation should be pushed when it is absent from the remote set
 * or it is strictly newer than its remote counterpart.
 */
export const selectAnnotationsToPush = (
  local: UserAnnotation[],
  remoteByKey: Map<AnnotationCompositeKey, UserAnnotation>
): UserAnnotation[] => {
  return local.filter((annotation) => {
    const key = makeAnnotationCompositeKey(annotation);
    const remote = remoteByKey.get(key);
    return !remote || annotation.updated_at > remote.updated_at;
  });
};

/**
 * Build an index of annotations keyed by their composite key.
 * Used during sync to do O(1) lookups instead of repeated linear scans.
 */
export const indexAnnotationsByKey = (
  annotations: UserAnnotation[]
): Map<AnnotationCompositeKey, UserAnnotation> => {
  const map = new Map<AnnotationCompositeKey, UserAnnotation>();
  for (const annotation of annotations) {
    map.set(makeAnnotationCompositeKey(annotation), annotation);
  }
  return map;
};
