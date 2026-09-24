import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeGuestAnnotations,
  mergeGuestFourFields,
  mergeGuestGather,
  mergeGuestLibrary,
  type FourFieldsData,
  type LibraryData,
} from './privateDataAdoption';
import type { UserAnnotation } from '../services/supabase/types';

const annotation = (overrides: Partial<UserAnnotation> = {}): UserAnnotation => ({
  id: 'a-1',
  user_id: 'local-device',
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

const ids = (annotations: UserAnnotation[]) => annotations.map((item) => item.id).sort();
const active = (annotations: UserAnnotation[]) =>
  ids(annotations.filter((item) => item.deleted_at == null));

// ---------------------------------------------------------------------------
// annotations
// ---------------------------------------------------------------------------

test('guest annotations on other verses are added to the account', () => {
  const merged = mergeGuestAnnotations(
    [annotation({ id: 'account' })],
    [annotation({ id: 'guest', verse_start: 2 })]
  );

  assert.deepEqual(active(merged), ['account', 'guest']);
});

test('when both have an active annotation of one type on one verse, the newer stays visible and the older is kept hidden', () => {
  const merged = mergeGuestAnnotations(
    [
      annotation({
        id: 'account',
        type: 'note',
        content: 'old',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    ],
    [annotation({ id: 'guest', type: 'note', content: 'new', updated_at: '2026-02-01T00:00:00Z' })]
  );

  assert.deepEqual(ids(merged), ['account', 'guest']);
  assert.deepEqual(active(merged), ['guest']);
  const hidden = merged.find((item) => item.id === 'account');
  assert.equal(hidden?.content, 'old');
  assert.equal(hidden?.deleted_at, '2026-02-01T00:00:00Z');
});

test('the same annotation id keeps its newer version', () => {
  const merged = mergeGuestAnnotations(
    [annotation({ id: 'shared', color: 'amber', updated_at: '2026-01-01T00:00:00Z' })],
    [annotation({ id: 'shared', color: 'sky', updated_at: '2026-03-01T00:00:00Z' })]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.color, 'sky');
});

test('a deleted and a re-created annotation on one verse in the same bucket both survive', () => {
  const guest = [
    annotation({
      id: 'old',
      deleted_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }),
    annotation({ id: 'recreated', updated_at: '2026-01-03T00:00:00Z' }),
  ];

  const merged = mergeGuestAnnotations([], guest);

  assert.deepEqual(ids(merged), ['old', 'recreated']);
  assert.deepEqual(active(merged), ['recreated']);
});

test('annotation adoption is idempotent', () => {
  const account = [
    annotation({ id: 'account', type: 'note', updated_at: '2026-01-01T00:00:00Z' }),
    annotation({ id: 'other', verse_start: 9 }),
  ];
  const guest = [annotation({ id: 'guest', type: 'note', updated_at: '2026-02-01T00:00:00Z' })];

  const once = mergeGuestAnnotations(account, guest);
  const twice = mergeGuestAnnotations(once, guest);

  assert.deepEqual(
    [...twice].sort((a, b) => a.id.localeCompare(b.id)),
    [...once].sort((a, b) => a.id.localeCompare(b.id))
  );
});

// ---------------------------------------------------------------------------
// library
// ---------------------------------------------------------------------------

const library = (overrides: Partial<LibraryData> = {}): LibraryData => ({
  favorites: [],
  playlists: [],
  history: [],
  ...overrides,
});

test('library adoption unions favourites, newest first, keeping one entry per chapter', () => {
  const merged = mergeGuestLibrary(
    library({ favorites: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 10 }] }),
    library({
      favorites: [
        { id: 'EXO:2', bookId: 'EXO', chapter: 2, addedAt: 20 },
        { id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 30 },
      ],
    })
  );

  assert.deepEqual(
    merged.favorites.map((favorite) => favorite.id),
    ['EXO:2', 'GEN:1']
  );
});

test('library adoption merges a playlist both sides have and appends guest-only playlists', () => {
  const merged = mergeGuestLibrary(
    library({
      playlists: [
        {
          id: 'saved-chapters',
          title: 'Saved Chapters',
          createdAt: 5,
          updatedAt: 10,
          entries: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 10 }],
        },
      ],
    }),
    library({
      playlists: [
        {
          id: 'saved-chapters',
          title: 'Saved Chapters',
          createdAt: 1,
          updatedAt: 40,
          entries: [
            { id: 'EXO:1', bookId: 'EXO', chapter: 1, addedAt: 40 },
            { id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 3 },
          ],
        },
        { id: 'playlist-9', title: 'Guest', createdAt: 9, updatedAt: 9, entries: [] },
      ],
    })
  );

  assert.deepEqual(
    merged.playlists.map((playlist) => playlist.id),
    ['saved-chapters', 'playlist-9']
  );
  assert.deepEqual(merged.playlists[0], {
    id: 'saved-chapters',
    title: 'Saved Chapters',
    createdAt: 1,
    updatedAt: 40,
    entries: [
      { id: 'EXO:1', bookId: 'EXO', chapter: 1, addedAt: 40 },
      { id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 10 },
    ],
  });
});

test('library adoption keeps the latest listen per chapter, newest first', () => {
  const merged = mergeGuestLibrary(
    library({
      history: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 10, progress: 1 }],
    }),
    library({
      history: [
        { id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 50, progress: 0.5 },
        { id: 'EXO:1', bookId: 'EXO', chapter: 1, listenedAt: 20, progress: 1 },
      ],
    })
  );

  assert.deepEqual(merged.history, [
    { id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 50, progress: 0.5 },
    { id: 'EXO:1', bookId: 'EXO', chapter: 1, listenedAt: 20, progress: 1 },
  ]);
});

test('library adoption is idempotent', () => {
  const account = library({
    favorites: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, addedAt: 10 }],
    history: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 10, progress: 1 }],
  });
  const guest = library({
    favorites: [{ id: 'EXO:1', bookId: 'EXO', chapter: 1, addedAt: 5 }],
    playlists: [{ id: 'p', title: 'P', createdAt: 1, updatedAt: 1, entries: [] }],
    history: [{ id: 'EXO:1', bookId: 'EXO', chapter: 1, listenedAt: 30, progress: 0.2 }],
  });

  const once = mergeGuestLibrary(account, guest);

  assert.deepEqual(mergeGuestLibrary(once, guest), once);
});

// ---------------------------------------------------------------------------
// Gather
// ---------------------------------------------------------------------------

test('Gather adoption unions completed lessons per parent and keeps a dismissed banner dismissed', () => {
  const merged = mergeGuestGather(
    { completedLessons: { 'foundation-1': ['a'], 'topic-x': ['t'] }, infoBannerDismissed: false },
    {
      completedLessons: { 'foundation-1': ['b', 'a'], 'foundation-2': ['c'] },
      infoBannerDismissed: true,
    }
  );

  assert.deepEqual(merged, {
    completedLessons: { 'foundation-1': ['a', 'b'], 'topic-x': ['t'], 'foundation-2': ['c'] },
    infoBannerDismissed: true,
  });
});

test('Gather adoption is idempotent', () => {
  const guest = { completedLessons: { 'foundation-1': ['b'] }, infoBannerDismissed: false };
  const once = mergeGuestGather(
    { completedLessons: { 'foundation-1': ['a'] }, infoBannerDismissed: false },
    guest
  );

  assert.deepEqual(mergeGuestGather(once, guest), once);
});

// ---------------------------------------------------------------------------
// Four Fields
// ---------------------------------------------------------------------------

const fourFields = (overrides: Partial<FourFieldsData> = {}): FourFieldsData => ({
  completedLessons: {},
  practiceCompleted: {},
  taughtCompleted: {},
  currentField: 'entry',
  currentCourseId: null,
  currentLessonId: null,
  groups: [],
  activeGroupId: null,
  groupProgress: {},
  ...overrides,
});

const group = (id: string) => ({
  id,
  name: id,
  joinCode: 'ABC123',
  createdAt: 1,
  createdBy: 'someone',
  currentCourseId: 'course-1',
  currentLessonId: 'lesson-1',
  members: [],
});

test('Four Fields adoption unions progress and groups without dropping either side', () => {
  const merged = mergeGuestFourFields(
    fourFields({
      completedLessons: { 'course-1': ['l1'] },
      practiceCompleted: { l1: true, l2: false },
      taughtCompleted: { l1: true },
      groups: [group('g-account')],
      groupProgress: { 'g-account': { groupId: 'g-account', completedLessons: ['l1'], notes: {} } },
    }),
    fourFields({
      completedLessons: { 'course-1': ['l2'], 'course-2': ['m1'] },
      practiceCompleted: { l2: true },
      taughtCompleted: { l3: true },
      groups: [group('g-guest')],
      groupProgress: { 'g-guest': { groupId: 'g-guest', completedLessons: [], notes: { l: 'n' } } },
    })
  );

  assert.deepEqual(merged.completedLessons, { 'course-1': ['l1', 'l2'], 'course-2': ['m1'] });
  assert.deepEqual(merged.practiceCompleted, { l1: true, l2: true });
  assert.deepEqual(merged.taughtCompleted, { l1: true, l3: true });
  assert.deepEqual(
    merged.groups?.map((item) => item.id),
    ['g-account', 'g-guest']
  );
  assert.deepEqual(Object.keys(merged.groupProgress ?? {}).sort(), ['g-account', 'g-guest']);
});

test('Four Fields adoption continues where the guest left off when the guest had started a course', () => {
  const merged = mergeGuestFourFields(
    fourFields({ currentField: 'gospel', currentCourseId: 'course-1', currentLessonId: 'l1' }),
    fourFields({ currentField: 'discipleship', currentCourseId: 'course-3', currentLessonId: 'l9' })
  );

  assert.equal(merged.currentField, 'discipleship');
  assert.equal(merged.currentCourseId, 'course-3');
  assert.equal(merged.currentLessonId, 'l9');
});

test('Four Fields adoption keeps the account position when the guest never started a course', () => {
  const merged = mergeGuestFourFields(
    fourFields({ currentField: 'gospel', currentCourseId: 'course-1', currentLessonId: 'l1' }),
    fourFields()
  );

  assert.equal(merged.currentField, 'gospel');
  assert.equal(merged.currentCourseId, 'course-1');
  assert.equal(merged.currentLessonId, 'l1');
});

test('Four Fields adoption is idempotent', () => {
  const guest = fourFields({
    completedLessons: { 'course-1': ['l2'] },
    groups: [group('g-guest')],
    activeGroupId: 'g-guest',
  });
  const once = {
    ...fourFields(),
    ...mergeGuestFourFields(fourFields({ groups: [group('g')] }), guest),
  };

  assert.deepEqual({ ...once, ...mergeGuestFourFields(once, guest) }, once);
});
