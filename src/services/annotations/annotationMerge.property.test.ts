import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  indexAnnotationsByKey,
  makeAnnotationCompositeKey,
  mergeAnnotationLists,
  selectAnnotationsToPush,
} from './annotationMerge';
import type { UserAnnotation } from '../supabase/types';

// ---------------------------------------------------------------------------
// Randomised checks of mergeAnnotationLists: per verse-and-type, the most
// recently edited record wins, and nothing depends on which list is "local".
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=5000 node --test --import tsx \
//     src/services/annotations/annotationMerge.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 300),
};

const BASE_MS = Date.parse('2026-09-20T06:00:00.000Z');
const stampArb = fc
  .integer({ min: 0, max: 6 })
  .map((n) => new Date(BASE_MS + n * 1000).toISOString());

const annotationArb: fc.Arbitrary<UserAnnotation> = fc
  .record({
    id: fc.integer({ min: 1, max: 12 }).map((n) => `local-annotation-${n}`),
    verse: fc.integer({ min: 1, max: 3 }),
    type: fc.constantFrom<UserAnnotation['type']>('highlight', 'note', 'bookmark'),
    content: fc.constantFrom<string | null>(null, 'grace', 'faith'),
    created: stampArb,
    updated: stampArb,
    deleted: fc.boolean(),
  })
  .map(({ id, verse, type, content, created, updated, deleted }) => ({
    id,
    user_id: 'local-device',
    book: 'JHN',
    chapter: 3,
    verse_start: verse,
    verse_end: null,
    type,
    color: type === 'highlight' ? 'amber' : null,
    content,
    created_at: created,
    updated_at: updated,
    synced_at: updated,
    deleted_at: deleted ? updated : null,
  }));
const listArb = fc.array(annotationArb, { maxLength: 10 });

const byKey = (annotations: UserAnnotation[]) =>
  [...indexAnnotationsByKey(annotations).entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );

test('the merge keeps one record per verse and type: the most recently edited one', () => {
  fc.assert(
    fc.property(listArb, listArb, (local, remote) => {
      const merged = mergeAnnotationLists(local, remote);
      const keys = merged.map(makeAnnotationCompositeKey);
      assert.equal(new Set(keys).size, keys.length, 'one record per key');
      const inputKeys = new Set([...local, ...remote].map(makeAnnotationCompositeKey));
      assert.deepEqual([...new Set(keys)].sort(), [...inputKeys].sort());
      for (const record of merged) {
        const key = makeAnnotationCompositeKey(record);
        const newest = [...local, ...remote]
          .filter((candidate) => makeAnnotationCompositeKey(candidate) === key)
          .reduce(
            (max, candidate) => (candidate.updated_at > max ? candidate.updated_at : max),
            ''
          );
        assert.equal(record.updated_at, newest, `${key} lost its newest edit`);
      }
    }),
    FC_PARAMS
  );
});

test('the merge is commutative, associative and idempotent', () => {
  fc.assert(
    fc.property(listArb, listArb, listArb, (a, b, c) => {
      const ab = mergeAnnotationLists(a, b);
      assert.deepEqual(byKey(ab), byKey(mergeAnnotationLists(b, a)));
      assert.deepEqual(
        byKey(mergeAnnotationLists(ab, c)),
        byKey(mergeAnnotationLists(a, mergeAnnotationLists(b, c)))
      );
      assert.deepEqual(byKey(mergeAnnotationLists(ab, ab)), byKey(ab));
      assert.deepEqual(byKey(mergeAnnotationLists(ab, b)), byKey(ab));
    }),
    FC_PARAMS
  );
});

test('after a merge, nothing local is newer than the merged copy, so nothing needs pushing twice', () => {
  fc.assert(
    fc.property(listArb, listArb, (local, remote) => {
      const merged = mergeAnnotationLists(local, remote);
      assert.deepEqual(selectAnnotationsToPush(merged, indexAnnotationsByKey(merged)), []);
    }),
    FC_PARAMS
  );
});
