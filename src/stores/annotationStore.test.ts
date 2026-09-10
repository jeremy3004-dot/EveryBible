import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import type { UserAnnotation } from '../services/supabase/types';

// One mock configuration per file: this persisted store only needs MMKV.
const mmkv = mockMmkvStorage(mock);

let useAnnotationStore: typeof import('./annotationStore').useAnnotationStore;
let localAnnotationStore: typeof import('./annotationStore').localAnnotationStore;

before(async () => {
  ({ useAnnotationStore, localAnnotationStore } = await import('./annotationStore'));
});

const state = () => useAnnotationStore.getState();
const readPersisted = () => JSON.parse(mmkv.store.get('annotation-storage') ?? '{}');

const makeRemoteAnnotation = (overrides: Partial<UserAnnotation> = {}): UserAnnotation => ({
  id: 'remote-1',
  user_id: 'user-7',
  book: 'GEN',
  chapter: 1,
  verse_start: 1,
  verse_end: null,
  type: 'highlight',
  color: 'amber',
  content: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  synced_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...overrides,
});

beforeEach(() => {
  useAnnotationStore.setState(useAnnotationStore.getInitialState(), true);
  mmkv.store.clear();
});

// ---------------------------------------------------------------------------
// upsertAnnotation — creation
// ---------------------------------------------------------------------------

test('a new annotation is stamped with the local user id and fresh timestamps', () => {
  const saved = state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });

  assert.equal(saved.user_id, 'local-device');
  assert.equal(saved.created_at, saved.updated_at);
  assert.equal(saved.synced_at, saved.updated_at);
  assert.equal(saved.deleted_at, null);
  assert.match(saved.created_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('an annotation saved without an id is given a generated local id', () => {
  const saved = state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'first note',
    deleted_at: null,
  });

  assert.match(saved.id, /^local-annotation-\d+-[a-z0-9]+$/);
});

test('generated local annotation ids are unique across rapid saves', () => {
  const ids = new Set(
    Array.from(
      { length: 25 },
      (_, index) =>
        state().upsertAnnotation({
          id: '',
          book: 'GEN',
          chapter: 1,
          verse_start: index + 1,
          verse_end: null,
          type: 'highlight',
          color: 'amber',
          content: null,
          deleted_at: null,
        }).id
    )
  );

  assert.equal(ids.size, 25);
});

test('a caller-supplied id is kept as-is', () => {
  const saved = state().upsertAnnotation({
    id: 'caller-chosen',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'bookmark',
    color: null,
    content: null,
    deleted_at: null,
  });

  assert.equal(saved.id, 'caller-chosen');
});

test('a new annotation is added to the store and persisted to MMKV', () => {
  const saved = state().upsertAnnotation({
    id: 'a1',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });

  assert.deepEqual(state().annotations, [saved]);
  assert.deepEqual(readPersisted().state.annotations, [saved]);
});

// ---------------------------------------------------------------------------
// upsertAnnotation — composite-key dedup
// ---------------------------------------------------------------------------

test('re-saving the same book/chapter/verse/type replaces the existing row instead of adding one', () => {
  useAnnotationStore.setState({
    annotations: [makeRemoteAnnotation({ id: 'existing', color: 'amber' })],
  });

  const saved = state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'rose',
    content: null,
    deleted_at: null,
  });

  assert.equal(state().annotations.length, 1);
  assert.equal(saved.id, 'existing');
  assert.equal(saved.color, 'rose');
});

test('an update through the composite key keeps the original created_at', () => {
  useAnnotationStore.setState({
    annotations: [makeRemoteAnnotation({ id: 'existing', created_at: '2020-05-05T00:00:00.000Z' })],
  });

  const saved = state().upsertAnnotation({
    id: 'existing',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'rose',
    content: null,
    deleted_at: null,
  });

  assert.equal(saved.created_at, '2020-05-05T00:00:00.000Z');
  assert.notEqual(saved.updated_at, '2020-05-05T00:00:00.000Z');
});

test('a different annotation type on the same verse is a separate row', () => {
  state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });
  state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'a note',
    deleted_at: null,
  });

  assert.equal(state().annotations.length, 2);
});

test('matching by id updates a row even when it sits on a different verse', () => {
  useAnnotationStore.setState({
    annotations: [makeRemoteAnnotation({ id: 'moved', verse_start: 4 })],
  });

  const saved = state().upsertAnnotation({
    id: 'moved',
    book: 'GEN',
    chapter: 1,
    verse_start: 9,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });

  assert.equal(state().annotations.length, 1);
  assert.equal(saved.verse_start, 9);
});

test('a soft-deleted row is never revived by a new annotation on the same verse', () => {
  useAnnotationStore.setState({
    annotations: [
      makeRemoteAnnotation({ id: 'tombstone', deleted_at: '2026-02-02T00:00:00.000Z' }),
    ],
  });

  const saved = state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'rose',
    content: null,
    deleted_at: null,
  });

  assert.equal(state().annotations.length, 2);
  assert.notEqual(saved.id, 'tombstone');
  assert.equal(
    state().annotations.find((annotation) => annotation.id === 'tombstone')?.deleted_at,
    '2026-02-02T00:00:00.000Z'
  );
});

test('upserting with an explicit deleted_at writes a tombstone straight through', () => {
  const saved = state().upsertAnnotation({
    id: 'a1',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: '2026-03-03T00:00:00.000Z',
  });

  assert.equal(saved.deleted_at, '2026-03-03T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// sorting
// ---------------------------------------------------------------------------

test('annotations are ordered newest updated_at first', () => {
  state().replaceAnnotations([
    makeRemoteAnnotation({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
    makeRemoteAnnotation({ id: 'new', updated_at: '2026-06-01T00:00:00.000Z' }),
    makeRemoteAnnotation({ id: 'mid', updated_at: '2026-03-01T00:00:00.000Z' }),
  ]);

  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['new', 'mid', 'old']
  );
});

test('rows sharing an updated_at fall back to newest created_at first', () => {
  state().replaceAnnotations([
    makeRemoteAnnotation({
      id: 'created-early',
      updated_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    makeRemoteAnnotation({
      id: 'created-late',
      updated_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
    }),
  ]);

  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['created-late', 'created-early']
  );
});

test('rows identical on both timestamps keep their relative input order', () => {
  state().replaceAnnotations([
    makeRemoteAnnotation({ id: 'first' }),
    makeRemoteAnnotation({ id: 'second' }),
  ]);

  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['first', 'second']
  );
});

test('a freshly saved annotation is sorted to the front of older rows', () => {
  useAnnotationStore.setState({
    annotations: [makeRemoteAnnotation({ id: 'old', verse_start: 8 })],
  });

  const saved = state().upsertAnnotation({
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });

  assert.equal(state().annotations[0].id, saved.id);
});

// ---------------------------------------------------------------------------
// softDeleteAnnotation
// ---------------------------------------------------------------------------

test('soft deleting stamps deleted_at, updated_at and synced_at together', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation({ id: 'a1' })] });

  assert.equal(state().softDeleteAnnotation('a1'), true);

  const [annotation] = state().annotations;
  assert.notEqual(annotation.deleted_at, null);
  assert.equal(annotation.updated_at, annotation.deleted_at);
  assert.equal(annotation.synced_at, annotation.deleted_at);
});

test('soft deleting keeps the row so the tombstone can propagate', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation({ id: 'a1' })] });

  state().softDeleteAnnotation('a1');

  assert.equal(state().annotations.length, 1);
  assert.equal(readPersisted().state.annotations.length, 1);
});

test('soft deleting an unknown id reports failure and changes nothing', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation({ id: 'a1' })] });

  assert.equal(state().softDeleteAnnotation('missing'), false);
  assert.equal(state().annotations[0].deleted_at, null);
});

test('soft deleting an already-deleted annotation reports failure and keeps the first tombstone', () => {
  useAnnotationStore.setState({
    annotations: [makeRemoteAnnotation({ id: 'a1', deleted_at: '2026-02-02T00:00:00.000Z' })],
  });

  assert.equal(state().softDeleteAnnotation('a1'), false);
  assert.equal(state().annotations[0].deleted_at, '2026-02-02T00:00:00.000Z');
});

test('soft deleting one row leaves its siblings untouched', () => {
  useAnnotationStore.setState({
    annotations: [
      makeRemoteAnnotation({ id: 'a1', verse_start: 1 }),
      makeRemoteAnnotation({ id: 'a2', verse_start: 2 }),
    ],
  });

  state().softDeleteAnnotation('a1');

  assert.equal(state().annotations.find((annotation) => annotation.id === 'a2')?.deleted_at, null);
});

// ---------------------------------------------------------------------------
// replaceAnnotations / clearAnnotations
// ---------------------------------------------------------------------------

test('replacing annotations discards the previous list entirely', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation({ id: 'gone' })] });

  state().replaceAnnotations([makeRemoteAnnotation({ id: 'kept', verse_start: 3 })]);

  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['kept']
  );
  assert.deepEqual(
    readPersisted().state.annotations.map((annotation: UserAnnotation) => annotation.id),
    ['kept']
  );
});

test('replacing with an empty list empties the store', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation()] });

  state().replaceAnnotations([]);

  assert.deepEqual(state().annotations, []);
});

test('replaceAnnotations does not mutate the caller-supplied array', () => {
  const input = [
    makeRemoteAnnotation({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
    makeRemoteAnnotation({ id: 'new', updated_at: '2026-06-01T00:00:00.000Z' }),
  ];

  state().replaceAnnotations(input);

  assert.deepEqual(
    input.map((annotation) => annotation.id),
    ['old', 'new']
  );
});

test('clearing annotations empties both memory and storage', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation()] });

  state().clearAnnotations();

  assert.deepEqual(state().annotations, []);
  assert.deepEqual(readPersisted().state.annotations, []);
});

// ---------------------------------------------------------------------------
// hydration
// ---------------------------------------------------------------------------

test('a persisted snapshot rehydrates its annotations', async () => {
  mmkv.store.set(
    'annotation-storage',
    JSON.stringify({ state: { annotations: [makeRemoteAnnotation({ id: 'stored' })] }, version: 0 })
  );

  await useAnnotationStore.persist.rehydrate();

  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['stored']
  );
});

test('a persisted snapshot is hydrated in its stored order, unsorted', async () => {
  mmkv.store.set(
    'annotation-storage',
    JSON.stringify({
      state: {
        annotations: [
          makeRemoteAnnotation({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
          makeRemoteAnnotation({ id: 'new', updated_at: '2026-06-01T00:00:00.000Z' }),
        ],
      },
      version: 0,
    })
  );

  await useAnnotationStore.persist.rehydrate();

  // No `merge`/sanitizer on this store, so hydration trusts what was written.
  // Every write path sorts, so a snapshot this store produced is already ordered.
  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['old', 'new']
  );
});

test('an empty storage slot leaves the annotation list empty', async () => {
  await useAnnotationStore.persist.rehydrate();

  assert.deepEqual(state().annotations, []);
});

// ---------------------------------------------------------------------------
// localAnnotationStore facade
// ---------------------------------------------------------------------------

test('the facade reads the live annotation list rather than a snapshot', () => {
  assert.equal(localAnnotationStore.annotations.length, 0);

  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation({ id: 'live' })] });

  assert.deepEqual(
    localAnnotationStore.annotations.map((annotation) => annotation.id),
    ['live']
  );
});

test('the facade upsert writes through to the store', () => {
  const saved = localAnnotationStore.upsertAnnotation({
    id: 'facade-1',
    book: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'For God so loved',
    deleted_at: null,
  });

  assert.deepEqual(state().annotations, [saved]);
});

test('the facade soft delete writes through and reports its result', () => {
  useAnnotationStore.setState({ annotations: [makeRemoteAnnotation({ id: 'a1' })] });

  assert.equal(localAnnotationStore.softDeleteAnnotation('a1'), true);
  assert.equal(localAnnotationStore.softDeleteAnnotation('a1'), false);
  assert.notEqual(state().annotations[0].deleted_at, null);
});

test('the facade replace and clear write through to the store', () => {
  localAnnotationStore.replaceAnnotations([makeRemoteAnnotation({ id: 'kept' })]);
  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['kept']
  );

  localAnnotationStore.clearAnnotations();
  assert.deepEqual(state().annotations, []);
});

// ---------------------------------------------------------------------------
// sync-shaped input
// ---------------------------------------------------------------------------

test('replaceAnnotations keeps the remote owner rather than stamping the local user id', () => {
  state().replaceAnnotations([makeRemoteAnnotation({ id: 'from-server', user_id: 'user-7' })]);

  assert.equal(state().annotations[0].user_id, 'user-7');
});

test('replacing with a list carrying tombstones keeps them so the reader can filter', () => {
  state().replaceAnnotations([
    makeRemoteAnnotation({ id: 'live', verse_start: 1 }),
    makeRemoteAnnotation({ id: 'dead', verse_start: 2, deleted_at: '2026-02-02T00:00:00.000Z' }),
  ]);

  assert.deepEqual(
    state()
      .annotations.map((annotation) => [annotation.id, annotation.deleted_at != null])
      .sort(),
    [
      ['dead', true],
      ['live', false],
    ]
  );
});

test('sorting tolerates a hydrated row whose timestamps are missing', () => {
  const malformed = { ...makeRemoteAnnotation({ id: 'no-times' }) } as UserAnnotation;
  delete (malformed as Partial<UserAnnotation>).updated_at;
  delete (malformed as Partial<UserAnnotation>).created_at;

  state().replaceAnnotations([malformed, makeRemoteAnnotation({ id: 'timed', verse_start: 2 })]);

  assert.equal(state().annotations.length, 2);
  assert.deepEqual(
    state()
      .annotations.map((annotation) => annotation.id)
      .sort(),
    ['no-times', 'timed']
  );
});

// ---------------------------------------------------------------------------
// identity boundaries
// ---------------------------------------------------------------------------

test('the returned annotation is the very row that landed in the store', () => {
  const saved = state().upsertAnnotation({
    id: 'a1',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'amber',
    content: null,
    deleted_at: null,
  });

  assert.equal(state().annotations[0] as unknown, saved as unknown);
});

// Documents current behaviour: the composite key is book|chapter|verse_start|type,
// so two highlights that start on the same verse but span different ranges collide
// and the second overwrites the first.
// QUESTION for review — the reader dedups on verse_end too (BibleReaderScreen
// matches `getAnnotationVerseEnd(annotation) === range.verse_end`), so should
// verse_end be part of the store's composite key as well?
test('two highlights starting on the same verse but ending differently collapse into one', () => {
  const base = {
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    type: 'highlight' as const,
    color: 'amber',
    content: null,
    deleted_at: null,
  };

  state().upsertAnnotation({ ...base, verse_end: 3 });
  state().upsertAnnotation({ ...base, verse_end: 7 });

  assert.equal(state().annotations.length, 1);
  assert.equal(state().annotations[0].verse_end, 7);
});

// Documents current behaviour: the `existing.deleted_at == null` guard that stops
// a new annotation reviving a tombstone also blocks an *id-targeted* upsert from
// matching one, so the row is appended instead and the store ends up holding two
// rows under the same id — which sync would then push as two rows for one PK.
// Not reachable from BibleReaderScreen today (it only reuses ids of live rows).
// QUESTION for review — should the id branch match regardless of deleted_at,
// leaving only the composite-key branch guarded?
test('an id-targeted upsert of a soft-deleted row appends a second row under that same id', () => {
  useAnnotationStore.setState({
    annotations: [makeRemoteAnnotation({ id: 'a1', deleted_at: '2026-02-02T00:00:00.000Z' })],
  });

  const saved = state().upsertAnnotation({
    id: 'a1',
    book: 'GEN',
    chapter: 1,
    verse_start: 1,
    verse_end: null,
    type: 'highlight',
    color: 'rose',
    content: null,
    deleted_at: null,
  });

  assert.equal(saved.id, 'a1');
  assert.deepEqual(
    state().annotations.map((annotation) => annotation.id),
    ['a1', 'a1']
  );
});

// Documents current behaviour: createAnnotationId is `Date.now()` plus a random
// suffix and is not checked against ids already in the store. With both seams
// frozen, two saves on different verses generate the same id.
// QUESTION for review — should the generator re-roll on an id already in use?
test('generated ids can collide when the clock and the random suffix both repeat', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  t.mock.method(Math, 'random', () => 0);
  const base = {
    id: '',
    book: 'GEN',
    chapter: 1,
    verse_end: null,
    type: 'highlight' as const,
    color: 'amber',
    content: null,
    deleted_at: null,
  };

  const first = state().upsertAnnotation({ ...base, verse_start: 1 });
  const second = state().upsertAnnotation({ ...base, verse_start: 2 });

  assert.equal(first.id, second.id);
  assert.equal(state().annotations.length, 2);
});
