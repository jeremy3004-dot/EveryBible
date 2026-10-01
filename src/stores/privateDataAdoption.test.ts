import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeGuestAnnotations,
  mergeGuestFourFields,
  mergeGuestGather,
  mergeGuestLibrary,
  mergeGuestProgress,
  type FourFieldsData,
  type LibraryData,
  type ProgressData,
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

test('when both have an active highlight on one verse, the newer colour stays visible and the older is kept hidden', () => {
  const merged = mergeGuestAnnotations(
    [annotation({ id: 'account', color: 'amber', updated_at: '2026-01-01T00:00:00Z' })],
    [annotation({ id: 'guest', color: 'sky', updated_at: '2026-02-01T00:00:00Z' })]
  );

  assert.deepEqual(ids(merged), ['account', 'guest']);
  assert.deepEqual(active(merged), ['guest']);
  assert.equal(merged.find((item) => item.id === 'guest')?.color, 'sky');
  const hidden = merged.find((item) => item.id === 'account');
  assert.equal(hidden?.color, 'amber');
  assert.equal(hidden?.deleted_at, '2026-02-01T00:00:00Z');
});

const note = (overrides: Partial<UserAnnotation>) => annotation({ type: 'note', ...overrides });

test('when both have a note on one verse, one note shows both texts, older edit first', () => {
  const merged = mergeGuestAnnotations(
    [note({ id: 'account', content: 'Written on the phone', updated_at: '2026-02-01T00:00:00Z' })],
    [note({ id: 'guest', content: 'Written signed out', updated_at: '2026-01-01T00:00:00Z' })]
  );

  assert.deepEqual(ids(merged), ['account', 'guest']);
  assert.deepEqual(active(merged), ['account']);
  const visible = merged.find((item) => item.id === 'account');
  assert.equal(visible?.content, 'Written signed out\n\nWritten on the phone');
  assert.equal(visible?.updated_at, '2026-02-01T00:00:00Z');
  // The other note is hidden, not dropped: its own text is still stored.
  const hidden = merged.find((item) => item.id === 'guest');
  assert.equal(hidden?.content, 'Written signed out');
  assert.equal(hidden?.deleted_at, '2026-02-01T00:00:00Z');
});

test('two notes on one verse with the same text are not joined into a repeat', () => {
  const merged = mergeGuestAnnotations(
    [note({ id: 'account', content: 'Grace', updated_at: '2026-01-01T00:00:00Z' })],
    [note({ id: 'guest', content: 'Grace', updated_at: '2026-02-01T00:00:00Z' })]
  );

  assert.deepEqual(active(merged), ['guest']);
  assert.equal(merged.find((item) => item.id === 'guest')?.content, 'Grace');
});

test('a deleted note is not joined into the note on its verse', () => {
  const merged = mergeGuestAnnotations(
    [note({ id: 'account', content: 'Kept', updated_at: '2026-01-01T00:00:00Z' })],
    [
      note({
        id: 'guest',
        content: 'Deleted',
        updated_at: '2026-02-01T00:00:00Z',
        deleted_at: '2026-02-01T00:00:00Z',
      }),
    ]
  );

  assert.deepEqual(active(merged), ['account']);
  assert.equal(merged.find((item) => item.id === 'account')?.content, 'Kept');
});

test('merging the same guest notes again does not join them a second time', () => {
  const account = [note({ id: 'account', content: 'One', updated_at: '2026-01-01T00:00:00Z' })];
  const guest = [note({ id: 'guest', content: 'Two', updated_at: '2026-02-01T00:00:00Z' })];

  const once = mergeGuestAnnotations(account, guest);
  const twice = mergeGuestAnnotations(once, guest);

  assert.equal(once.find((item) => item.id === 'guest')?.content, 'One\n\nTwo');
  assert.deepEqual(twice, once);
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
  // The deleted one keeps the time it was deleted, not the re-created one's edit time.
  assert.deepEqual(
    merged.find((item) => item.id === 'old'),
    guest[0]
  );
});

test('two highlights on one verse last edited at the same moment: the later-created one stays visible', () => {
  const merged = mergeGuestAnnotations(
    [
      annotation({
        id: 'account',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      }),
    ],
    [
      annotation({
        id: 'guest',
        color: 'sky',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      }),
    ]
  );

  assert.deepEqual(active(merged), ['account']);
});

test('a note alone on its verse is adopted exactly as written, spacing included', () => {
  // A highlight on the same verse is a different annotation type, not a collision.
  const written = note({ id: 'guest', content: '  Grace\n' });

  const merged = mergeGuestAnnotations([annotation({ id: 'account' })], [written]);

  assert.deepEqual(active(merged), ['account', 'guest']);
  assert.deepEqual(
    merged.find((item) => item.id === 'guest'),
    written
  );
});

for (const blank of [null, '', '   ']) {
  test(`colliding notes with no text (${JSON.stringify(blank)}) leave the shown note as it was`, () => {
    const shown = note({ id: 'account', content: blank, updated_at: '2026-02-01T00:00:00Z' });

    const merged = mergeGuestAnnotations(
      [shown],
      [note({ id: 'guest', content: null, updated_at: '2026-01-01T00:00:00Z' })]
    );

    assert.deepEqual(active(merged), ['account']);
    assert.deepEqual(
      merged.find((item) => item.id === 'account'),
      shown
    );
  });
}

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

test('a listen recorded at the same moment on both sides keeps the account copy', () => {
  const merged = mergeGuestLibrary(
    library({
      history: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 50, progress: 1 }],
    }),
    library({
      history: [{ id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 50, progress: 0.4 }],
    })
  );

  assert.deepEqual(merged.history, [
    { id: 'GEN:1', bookId: 'GEN', chapter: 1, listenedAt: 50, progress: 1 },
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

test('Four Fields adoption keeps the account active group unless the guest had chosen one', () => {
  const account = fourFields({ groups: [group('g-account')], activeGroupId: 'g-account' });

  assert.equal(mergeGuestFourFields(account, fourFields()).activeGroupId, 'g-account');
  assert.equal(
    mergeGuestFourFields(
      account,
      fourFields({ groups: [group('g-guest')], activeGroupId: 'g-guest' })
    ).activeGroupId,
    'g-guest'
  );
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

// ---------------------------------------------------------------------------
// Reading and listening progress: the streak follows the most recent reading
// ---------------------------------------------------------------------------

const progress = (overrides: Partial<ProgressData> = {}): ProgressData => ({
  chaptersRead: {},
  chaptersListened: {},
  listeningMsByDate: {},
  chaptersByDate: {},
  streakDays: 0,
  lastReadDate: null,
  ...overrides,
});

test('progress adoption takes the guest streak when the guest read on a later day', () => {
  const merged = mergeGuestProgress(
    progress({ streakDays: 9, lastReadDate: '2026-09-07' }),
    progress({ streakDays: 2, lastReadDate: '2026-09-09' })
  );

  assert.deepEqual(merged, progress({ streakDays: 2, lastReadDate: '2026-09-09' }));
});

test('progress adoption keeps the account streak when the account read on a later day, even against a longer guest run', () => {
  const merged = mergeGuestProgress(
    progress({ streakDays: 3, lastReadDate: '2026-09-09' }),
    progress({ streakDays: 10, lastReadDate: '2026-09-08' })
  );

  assert.deepEqual(merged, progress({ streakDays: 3, lastReadDate: '2026-09-09' }));
});

test('when both sides last read on the same day, the longer run is kept, whichever side has it', () => {
  assert.deepEqual(
    mergeGuestProgress(
      progress({ streakDays: 4, lastReadDate: '2026-09-09' }),
      progress({ streakDays: 6, lastReadDate: '2026-09-09' })
    ),
    progress({ streakDays: 6, lastReadDate: '2026-09-09' })
  );
  assert.deepEqual(
    mergeGuestProgress(
      progress({ streakDays: 6, lastReadDate: '2026-09-09' }),
      progress({ streakDays: 4, lastReadDate: '2026-09-09' })
    ),
    progress({ streakDays: 6, lastReadDate: '2026-09-09' })
  );
});

test('a side that never read does not take the streak from a side that did', () => {
  assert.deepEqual(
    mergeGuestProgress(progress(), progress({ streakDays: 4, lastReadDate: '2026-09-09' })),
    progress({ streakDays: 4, lastReadDate: '2026-09-09' })
  );
  assert.deepEqual(
    mergeGuestProgress(progress({ streakDays: 5, lastReadDate: '2026-09-09' }), progress()),
    progress({ streakDays: 5, lastReadDate: '2026-09-09' })
  );
});
