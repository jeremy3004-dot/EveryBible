import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  mergeGuestAnnotations,
  mergeGuestFourFields,
  mergeGuestGather,
  mergeGuestLibrary,
  type FourFieldsData,
  type GatherData,
  type LibraryData,
} from './privateDataAdoption';
import { HISTORY_LIMIT } from './libraryModel';
import type { UserAnnotation } from '../services/supabase/types';

// ---------------------------------------------------------------------------
// Randomised checks of the guest-into-account merges run at the first sign-in
// (privateDataScope). The contract in privateDataAdoption.ts: nothing from
// either side is dropped, and merging the same guest state twice gives the same
// result (an adoption interrupted by an app kill is retried).
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=5000 node --test --import tsx \
//     src/stores/privateDataAdoption.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 300),
};

const BASE_MS = Date.parse('2026-09-20T06:00:00.000Z');
const stampArb = fc
  .integer({ min: 0, max: 5 })
  .map((n) => new Date(BASE_MS + n * 1000).toISOString());

const annotationArb: fc.Arbitrary<UserAnnotation> = fc
  .record({
    id: fc.integer({ min: 1, max: 10 }).map((n) => `local-annotation-${n}`),
    verse: fc.integer({ min: 1, max: 3 }),
    type: fc.constantFrom<UserAnnotation['type']>('highlight', 'note'),
    content: fc.constantFrom<string | null>(null, 'grace', 'faith'),
    created: stampArb,
    updated: stampArb,
    deleted: fc.boolean(),
  })
  .map(({ id, verse, type, content, created, updated, deleted }) => ({
    id,
    user_id: 'local-device',
    book: 'ROM',
    chapter: 8,
    verse_start: verse,
    verse_end: null,
    type,
    color: null,
    content,
    created_at: created,
    updated_at: updated,
    synced_at: updated,
    deleted_at: deleted ? updated : null,
  }));
// One version per id within a bucket, as the store keeps them.
const bucketArb = fc.uniqueArray(annotationArb, { maxLength: 8, selector: (item) => item.id });

const visibleKeys = (annotations: UserAnnotation[]) =>
  annotations
    .filter((annotation) => annotation.deleted_at == null)
    .map((annotation) => `${annotation.verse_start}|${annotation.type}`);

test('annotation adoption keeps every id, shows one per verse and type, and is idempotent', () => {
  fc.assert(
    fc.property(bucketArb, bucketArb, (account, guest) => {
      const once = mergeGuestAnnotations(account, guest);
      const ids = once.map((annotation) => annotation.id);
      assert.equal(new Set(ids).size, ids.length, 'one record per id');
      assert.deepEqual(
        [...new Set(ids)].sort(),
        [...new Set([...account, ...guest].map((annotation) => annotation.id))].sort()
      );
      const keys = visibleKeys(once);
      assert.equal(new Set(keys).size, keys.length, 'one visible annotation per verse and type');
      // Every verse and type that was showing an annotation (by the newest
      // version of each id) still shows one.
      const newestById = new Map<string, UserAnnotation>();
      for (const annotation of [...account, ...guest]) {
        const current = newestById.get(annotation.id);
        if (
          !current ||
          annotation.updated_at > current.updated_at ||
          (annotation.updated_at === current.updated_at && annotation.deleted_at != null)
        ) {
          newestById.set(annotation.id, annotation);
        }
      }
      for (const key of new Set(visibleKeys([...newestById.values()]))) {
        assert.ok(keys.includes(key), `${key} lost its visible annotation`);
      }
      // Notes are joined: the visible note on a verse carries the text of every
      // note that was showing there.
      for (const shown of newestById.values()) {
        if (shown.type !== 'note' || shown.deleted_at != null || !shown.content) continue;
        const visible = once.find(
          (annotation) =>
            annotation.deleted_at == null &&
            annotation.type === 'note' &&
            annotation.verse_start === shown.verse_start
        );
        assert.ok(visible?.content?.includes(shown.content), `note ${shown.id} lost its text`);
      }

      const twice = mergeGuestAnnotations(once, guest);
      const sortById = (list: UserAnnotation[]) =>
        [...list].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      assert.deepEqual(sortById(twice), sortById(once));
    }),
    FC_PARAMS
  );
});

const favoriteArb = fc
  .record({ n: fc.integer({ min: 1, max: 6 }), addedAt: fc.integer({ min: 0, max: 5 }) })
  .map(({ n, addedAt }) => ({ id: `JHN_${n}`, bookId: 'JHN', chapter: n, addedAt }));
const historyArb = fc
  .record({ n: fc.integer({ min: 1, max: 6 }), listenedAt: fc.integer({ min: 0, max: 5 }) })
  .map(({ n, listenedAt }) => ({
    id: `JHN_${n}`,
    bookId: 'JHN',
    chapter: n,
    listenedAt,
    progress: 1,
  }));
const playlistArb = fc
  .record({
    n: fc.integer({ min: 1, max: 3 }),
    createdAt: fc.integer({ min: 0, max: 5 }),
    updatedAt: fc.integer({ min: 0, max: 5 }),
    entries: fc.uniqueArray(favoriteArb, { maxLength: 3, selector: (entry) => entry.id }),
  })
  .map(({ n, createdAt, updatedAt, entries }) => ({
    id: `playlist-${n}`,
    title: `Playlist ${n}`,
    createdAt,
    updatedAt,
    // libraryModel adds an entry at the front, so a playlist is newest first.
    entries: [...entries].sort((left, right) => right.addedAt - left.addedAt),
  }));
const libraryArb: fc.Arbitrary<LibraryData> = fc.record({
  favorites: fc.uniqueArray(favoriteArb, { maxLength: 4, selector: (item) => item.id }),
  playlists: fc.uniqueArray(playlistArb, { maxLength: 2, selector: (item) => item.id }),
  history: fc.uniqueArray(historyArb, { maxLength: 4, selector: (item) => item.id }),
});

test('library adoption keeps every favourite, playlist and entry, and is idempotent', () => {
  fc.assert(
    fc.property(libraryArb, libraryArb, (account, guest) => {
      const once = mergeGuestLibrary(account, guest);
      const ids = (items: { id: string }[]) => [...new Set(items.map((item) => item.id))].sort();
      assert.deepEqual(ids(once.favorites), ids([...account.favorites, ...guest.favorites]));
      assert.deepEqual(ids(once.playlists), ids([...account.playlists, ...guest.playlists]));
      for (const playlist of once.playlists) {
        const sources = [...account.playlists, ...guest.playlists].filter(
          (candidate) => candidate.id === playlist.id
        );
        assert.deepEqual(ids(playlist.entries), ids(sources.flatMap((source) => source.entries)));
      }
      assert.ok(once.history.length <= HISTORY_LIMIT);
      assert.deepEqual(ids(once.history), ids([...account.history, ...guest.history]));
      assert.deepEqual(mergeGuestLibrary(once, guest), once);
    }),
    FC_PARAMS
  );
});

const lessonsArb = fc.dictionary(
  fc.constantFrom('field-1', 'field-2'),
  fc.uniqueArray(fc.constantFrom('l1', 'l2', 'l3'), { maxLength: 3 }),
  { noNullPrototype: true }
);
const flagsArb = fc.dictionary(fc.constantFrom('l1', 'l2', 'l3'), fc.boolean(), {
  noNullPrototype: true,
});

test('Gather adoption unions lesson marks and is idempotent', () => {
  const gatherArb: fc.Arbitrary<GatherData> = fc.record({
    completedLessons: lessonsArb,
    infoBannerDismissed: fc.boolean(),
  });
  fc.assert(
    fc.property(gatherArb, gatherArb, (account, guest) => {
      const once = mergeGuestGather(account, guest);
      for (const source of [account, guest]) {
        for (const [key, lessons] of Object.entries(source.completedLessons)) {
          for (const lesson of lessons) assert.ok(once.completedLessons[key]?.includes(lesson));
        }
      }
      assert.deepEqual(mergeGuestGather(once, guest), once);
    }),
    FC_PARAMS
  );
});

test('Four Fields adoption keeps every mark and group, and is idempotent', () => {
  const groupArb = fc.constantFrom('g1', 'g2').map((id) => ({
    id,
    name: id,
    joinCode: id,
    createdAt: 0,
    createdBy: 'me',
    currentCourseId: 'c',
    currentLessonId: 'l',
    members: [],
  }));
  const fourFieldsArb: fc.Arbitrary<FourFieldsData> = fc.record({
    completedLessons: lessonsArb,
    practiceCompleted: flagsArb,
    taughtCompleted: flagsArb,
    currentField: fc.constantFrom('entry', 'gospel') as fc.Arbitrary<
      FourFieldsData['currentField']
    >,
    currentCourseId: fc.constantFrom<string | null>(null, 'course-1'),
    currentLessonId: fc.constantFrom<string | null>(null, 'lesson-1'),
    groups: fc.uniqueArray(groupArb, { maxLength: 2, selector: (group) => group.id }),
    activeGroupId: fc.constantFrom<string | null>(null, 'g1'),
    groupProgress: fc.dictionary(
      fc.constantFrom('g1', 'g2'),
      fc.constant({ groupId: 'g', completedLessons: [], notes: {} }),
      { noNullPrototype: true }
    ),
  });
  fc.assert(
    fc.property(fourFieldsArb, fourFieldsArb, (account, guest) => {
      const once = { ...account, ...mergeGuestFourFields(account, guest) };
      for (const source of [account, guest]) {
        for (const [lesson, done] of Object.entries(source.practiceCompleted)) {
          if (done) assert.equal(once.practiceCompleted[lesson], true);
        }
        for (const group of source.groups) {
          assert.ok(once.groups.some((candidate) => candidate.id === group.id));
        }
      }
      assert.deepEqual({ ...once, ...mergeGuestFourFields(once, guest) }, once);
    }),
    FC_PARAMS
  );
});
