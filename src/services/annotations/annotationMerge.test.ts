import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAnnotationLists,
  selectAnnotationsToPush,
  indexAnnotationsByKey,
  makeAnnotationCompositeKey,
} from './annotationMerge';
import type { UserAnnotation } from '../supabase/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnnotation(overrides: Partial<UserAnnotation> = {}): UserAnnotation {
  return {
    id: 'anno-1',
    user_id: 'user-1',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'bookmark',
    color: null,
    content: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    synced_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// makeAnnotationCompositeKey
// ---------------------------------------------------------------------------

test('makeAnnotationCompositeKey encodes book, chapter, verse_start and type', () => {
  const annotation = makeAnnotation({ book: 'REV', chapter: 22, verse_start: 13, type: 'note' });
  assert.equal(makeAnnotationCompositeKey(annotation), 'REV|22|13|note');
});

test('makeAnnotationCompositeKey distinguishes different annotation types at the same verse', () => {
  const bookmark = makeAnnotation({ type: 'bookmark' });
  const highlight = makeAnnotation({ type: 'highlight' });
  const note = makeAnnotation({ type: 'note' });

  assert.notEqual(makeAnnotationCompositeKey(bookmark), makeAnnotationCompositeKey(highlight));
  assert.notEqual(makeAnnotationCompositeKey(bookmark), makeAnnotationCompositeKey(note));
  assert.notEqual(makeAnnotationCompositeKey(highlight), makeAnnotationCompositeKey(note));
});

test('makeAnnotationCompositeKey distinguishes different chapters', () => {
  const ch1 = makeAnnotation({ chapter: 1 });
  const ch2 = makeAnnotation({ chapter: 2 });
  assert.notEqual(makeAnnotationCompositeKey(ch1), makeAnnotationCompositeKey(ch2));
});

// ---------------------------------------------------------------------------
// mergeAnnotationLists
// ---------------------------------------------------------------------------

test('mergeAnnotationLists returns local annotations when remote list is empty', () => {
  const local = [makeAnnotation({ id: 'a1', book: 'GEN', chapter: 1, verse_start: 1 })];
  const merged = mergeAnnotationLists(local, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'a1');
});

test('mergeAnnotationLists returns remote annotations when local list is empty', () => {
  const remote = [makeAnnotation({ id: 'r1', book: 'JHN', chapter: 3, verse_start: 16 })];
  const merged = mergeAnnotationLists([], remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'r1');
});

test('mergeAnnotationLists keeps the newer remote annotation when timestamps differ', () => {
  const older = makeAnnotation({
    id: 'local-id',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'bookmark',
    updated_at: '2026-01-01T00:00:00Z',
  });
  const newer = makeAnnotation({
    id: 'remote-id',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'bookmark',
    updated_at: '2026-03-01T00:00:00Z',
  });

  const merged = mergeAnnotationLists([older], [newer]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'remote-id');
});

test('mergeAnnotationLists keeps the local annotation when it is newer than remote', () => {
  const local = makeAnnotation({
    id: 'local-id',
    updated_at: '2026-03-01T00:00:00Z',
  });
  const remote = makeAnnotation({
    id: 'remote-id',
    updated_at: '2026-01-01T00:00:00Z',
  });

  const merged = mergeAnnotationLists([local], [remote]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'local-id');
});

test('mergeAnnotationLists combines non-overlapping local and remote annotations', () => {
  const local = makeAnnotation({ id: 'l1', chapter: 1, verse_start: 1 });
  const remote = makeAnnotation({ id: 'r1', chapter: 2, verse_start: 5 });

  const merged = mergeAnnotationLists([local], [remote]);
  assert.equal(merged.length, 2);
  const ids = merged.map((a) => a.id).sort();
  assert.deepEqual(ids, ['l1', 'r1']);
});

test('mergeAnnotationLists propagates soft-deleted remote records', () => {
  const local = makeAnnotation({ id: 'a1', updated_at: '2026-01-01T00:00:00Z' });
  const remoteDeleted = makeAnnotation({
    id: 'a1',
    updated_at: '2026-03-01T00:00:00Z',
    deleted_at: '2026-03-01T00:00:00Z',
  });

  const merged = mergeAnnotationLists([local], [remoteDeleted]);
  assert.equal(merged.length, 1);
  assert.ok(
    merged[0].deleted_at !== null,
    'Deletion should propagate from remote to merged result'
  );
});

test('mergeAnnotationLists does not propagate a stale remote deletion when local is newer', () => {
  const localRestored = makeAnnotation({
    id: 'a1',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
  });
  const remoteDeleted = makeAnnotation({
    id: 'a1',
    updated_at: '2026-02-01T00:00:00Z',
    deleted_at: '2026-02-01T00:00:00Z',
  });

  const merged = mergeAnnotationLists([localRestored], [remoteDeleted]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].deleted_at, null);
});

// ---------------------------------------------------------------------------
// indexAnnotationsByKey
// ---------------------------------------------------------------------------

test('indexAnnotationsByKey builds a map with one entry per composite key', () => {
  const annotations = [
    makeAnnotation({ book: 'GEN', chapter: 1, verse_start: 1, type: 'bookmark' }),
    makeAnnotation({ book: 'GEN', chapter: 1, verse_start: 1, type: 'highlight' }),
    makeAnnotation({ book: 'GEN', chapter: 2, verse_start: 3, type: 'bookmark' }),
  ];
  const index = indexAnnotationsByKey(annotations);
  assert.equal(index.size, 3);
});

test('indexAnnotationsByKey is stable — last-write when duplicate keys exist in input', () => {
  // Two annotations with the same composite key (should not happen in practice,
  // but the index function should not crash)
  const first = makeAnnotation({
    id: 'first',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'note',
  });
  const second = makeAnnotation({
    id: 'second',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'note',
  });

  const index = indexAnnotationsByKey([first, second]);
  assert.equal(index.size, 1);
  assert.equal(index.get('GEN|1|1|note')?.id, 'second');
});

// ---------------------------------------------------------------------------
// selectAnnotationsToPush
// ---------------------------------------------------------------------------

test('selectAnnotationsToPush includes local annotations absent from remote', () => {
  const local = [makeAnnotation({ id: 'local-only', book: 'PSA', chapter: 23, verse_start: 1 })];
  const remoteByKey = indexAnnotationsByKey([]);

  const toPush = selectAnnotationsToPush(local, remoteByKey);
  assert.equal(toPush.length, 1);
  assert.equal(toPush[0].id, 'local-only');
});

test('selectAnnotationsToPush excludes local annotations that are older than or equal to remote', () => {
  const local = makeAnnotation({
    id: 'local',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'bookmark',
    updated_at: '2026-01-01T00:00:00Z',
  });
  const remote = makeAnnotation({
    id: 'remote',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'bookmark',
    updated_at: '2026-03-01T00:00:00Z',
  });

  const remoteByKey = indexAnnotationsByKey([remote]);
  const toPush = selectAnnotationsToPush([local], remoteByKey);
  assert.equal(toPush.length, 0);
});

test('selectAnnotationsToPush includes local annotations that are strictly newer than remote', () => {
  const local = makeAnnotation({
    id: 'local',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'note',
    updated_at: '2026-04-01T00:00:00Z',
  });
  const remote = makeAnnotation({
    id: 'remote',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'note',
    updated_at: '2026-01-01T00:00:00Z',
  });

  const remoteByKey = indexAnnotationsByKey([remote]);
  const toPush = selectAnnotationsToPush([local], remoteByKey);
  assert.equal(toPush.length, 1);
  assert.equal(toPush[0].id, 'local');
});

test('selectAnnotationsToPush includes soft-deleted local annotations so deletions reach the server', () => {
  const deleted = makeAnnotation({
    id: 'deleted',
    updated_at: '2026-03-01T00:00:00Z',
    deleted_at: '2026-03-01T00:00:00Z',
  });
  const remoteByKey = indexAnnotationsByKey([]);
  const toPush = selectAnnotationsToPush([deleted], remoteByKey);
  assert.equal(toPush.length, 1);
});
