import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockExpoCrypto,
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  mockSecureStore,
  sourcePath,
} from '../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../testing/supabaseFake';

// ---------------------------------------------------------------------------
// End-to-end account scoping of private local data (sync review finding 10):
// real authStore, real annotation/library/Gather/Four Fields stores, real
// scope module. Mocks mirror authStore.test.ts.
// ---------------------------------------------------------------------------

// A guest Four Fields bucket from before any sign-in. The Four Fields store is
// deliberately not imported until after the first sign-in (see first test).
const mmkv = mockMmkvStorage(mock, {
  'four-fields-storage': JSON.stringify({
    state: { completedLessons: { 'course-guest': ['lesson-guest'] } },
    version: 1,
  }),
});

const supabaseFake = createSupabaseFake();
const defaultAuthHandlers = { ...supabaseFake.auth.handlers };
const authHandlers = supabaseFake.auth.handlers as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => supabaseFake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);
mockReactNative(mock, { os: 'ios' });
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {},
});
mockModule(mock, 'expo-apple-authentication', {
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
  signInAsync: async () => ({ identityToken: null }),
});
mockModule(mock, '@react-native-google-signin/google-signin', {
  GoogleSignin: {
    configure: () => {},
    hasPlayServices: async () => true,
    signIn: async () => ({ type: 'cancelled', data: null }),
  },
  isErrorWithCode: () => false,
  statusCodes: {},
});
mockExpoCrypto(mock);
mockSecureStore(mock);
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: { getState: () => ({ resetForSignOut: () => {} }) },
});
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  deactivatePushToken: async () => {},
});

let useAuthStore: typeof import('./authStore').useAuthStore;
let localAnnotationStore: typeof import('./annotationStore').localAnnotationStore;
let useLibraryStore: typeof import('./libraryStore').useLibraryStore;
let useGatherStore: typeof import('./gatherStore').useGatherStore;
let scope: typeof import('./privateDataScope');

before(async () => {
  ({ useAuthStore } = await import('./authStore'));
  ({ localAnnotationStore } = await import('./annotationStore'));
  ({ useLibraryStore } = await import('./libraryStore'));
  ({ useGatherStore } = await import('./gatherStore'));
  scope = await import('./privateDataScope');
});

beforeEach(() => {
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  supabaseFake.auth.setSession(null);
});

const session = (uid: string) => makeFakeSession({ user: makeFakeUser({ id: uid }) });
const signIn = (uid: string) => supabaseFake.auth.emit('SIGNED_IN', session(uid));
const signOut = () => useAuthStore.getState().signOut();

const addNote = (verse: number, content: string) =>
  localAnnotationStore.upsertAnnotation({
    id: '',
    book: 'JHN',
    chapter: 3,
    verse_start: verse,
    verse_end: null,
    type: 'note',
    color: null,
    content,
    deleted_at: null,
  });

const visibleNotes = () =>
  localAnnotationStore.annotations
    .filter((annotation) => annotation.deleted_at == null)
    .map((annotation) => annotation.content)
    .sort();

const fourFields = async () => (await import('./fourFieldsStore')).useFourFieldsStore;

/** Everything a reader can see of the private stores right now. */
const visiblePrivateData = async () => ({
  notes: visibleNotes(),
  favorites: useLibraryStore.getState().favorites.map((favorite) => favorite.id),
  gather: useGatherStore.getState().completedLessons,
  fourFields: (await fourFields()).getState().completedLessons,
});

const EMPTY = { notes: [], favorites: [], gather: {}, fourFields: {} };

// Stands in for a cold start: nothing in memory, owner and buckets re-read from
// disk. Auth state is what the persist middleware restores (no user/session).
const relaunch = () => {
  useAuthStore.setState({
    user: null,
    session: null,
    isAuthenticated: false,
    isInitialized: false,
  });
  scope.restartPrivateDataScopeForTests();
};

const RETRYABLE_OFFLINE = async () => ({
  data: { session: null },
  error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 },
});

// Runs first: the only test that sees the seeded guest Four Fields bucket.
test('the first sign-in adopts guest data of a store no screen had opened yet', async () => {
  await useAuthStore.getState().initialize();
  addNote(1, 'guest note');

  signIn('user-a');

  const { useFourFieldsStore } = await import('./fourFieldsStore');
  assert.deepEqual(useFourFieldsStore.getState().completedLessons, {
    'course-guest': ['lesson-guest'],
  });
  assert.deepEqual(visibleNotes(), ['guest note']);
  assert.equal(mmkv.store.has('four-fields-storage'), false);
  assert.equal(mmkv.store.has('annotation-storage'), false);
  assert.ok(mmkv.store.has(scope.privateDataStorageKey('four-fields-storage', 'user-a')));

  await signOut();
  assert.deepEqual(await visiblePrivateData(), EMPTY);
});

test("another account never sees the first account's private data, and it comes back", async () => {
  signIn('user-c');
  addNote(16, 'c note');
  useLibraryStore.getState().toggleFavorite('JHN', 3);
  useGatherStore.getState().markLessonComplete('foundation-1', 'lesson-1');
  (await fourFields()).setState({ completedLessons: { 'course-1': ['lesson-c'] } });
  const cData = await visiblePrivateData();

  await signOut();
  assert.deepEqual(await visiblePrivateData(), EMPTY);

  signIn('user-d');
  assert.deepEqual(await visiblePrivateData(), EMPTY);
  addNote(17, 'd note');

  await signOut();
  signIn('user-c');
  assert.deepEqual(await visiblePrivateData(), cData);

  await signOut();
  signIn('user-d');
  assert.deepEqual(visibleNotes(), ['d note']);
  await signOut();
});

test('signing in straight over another account swaps the private data without adopting it', async () => {
  signIn('user-e');
  addNote(1, 'e note');

  signIn('user-f');
  assert.deepEqual(visibleNotes(), []);

  signIn('user-e');
  assert.deepEqual(visibleNotes(), ['e note']);
  await signOut();
});

test('notes made while signed out join the account that signs in next, merged with its own', async () => {
  signIn('user-g');
  addNote(1, 'g note');
  await signOut();

  addNote(2, 'signed-out note');
  assert.deepEqual(visibleNotes(), ['signed-out note']);

  signIn('user-g');
  assert.deepEqual(visibleNotes(), ['g note', 'signed-out note']);

  await signOut();
  assert.deepEqual(visibleNotes(), []);
  await signOut();
});

test('an offline launch keeps showing the signed-in account private data', async () => {
  signIn('user-h');
  addNote(1, 'h note');
  useGatherStore.getState().markLessonComplete('foundation-2', 'lesson-h');

  relaunch();
  authHandlers.getSession = RETRYABLE_OFFLINE;
  await useAuthStore.getState().initialize();
  supabaseFake.auth.emit('INITIAL_SESSION', null);

  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.deepEqual(visibleNotes(), ['h note']);
  assert.deepEqual(useGatherStore.getState().completedLessons, { 'foundation-2': ['lesson-h'] });

  // Back online, the same account refreshes; nothing moves.
  supabaseFake.auth.emit('TOKEN_REFRESHED', session('user-h'));
  assert.deepEqual(visibleNotes(), ['h note']);
  await signOut();
});

test('a launch whose session is really gone hides the account data until it signs in again', async () => {
  signIn('user-i');
  addNote(1, 'i note');

  relaunch();
  await useAuthStore.getState().initialize();

  assert.deepEqual(visibleNotes(), []);
  assert.ok(mmkv.store.has(scope.privateDataStorageKey('annotation-storage', 'user-i')));

  signIn('user-i');
  assert.deepEqual(visibleNotes(), ['i note']);
  await signOut();
});

test('signing out hides the private data even when Supabase is unreachable', async () => {
  signIn('user-j');
  addNote(1, 'j note');
  authHandlers.signOut = async () => ({
    error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 },
  });

  await signOut();

  assert.deepEqual(visibleNotes(), []);
  assert.equal(scope.getPrivateDataOwner(), null);
});

test('an account switch discovered by the sync boundary also swaps the private data', async () => {
  signIn('user-k');
  addNote(1, 'k note');
  // The sync hook reconciles before its first pull; with a fresh uid it must
  // not leave k's notes visible.
  useAuthStore.setState({ user: null, session: null, isAuthenticated: false });

  useAuthStore.getState().reconcileUserBoundary('user-l', null);

  assert.deepEqual(visibleNotes(), []);
  useAuthStore.getState().reconcileUserBoundary('user-k', null);
  assert.deepEqual(visibleNotes(), ['k note']);
});
