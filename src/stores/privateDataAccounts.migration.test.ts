import test, { before, mock } from 'node:test';
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
// Upgrading an install from before account scoping. MMKV is seeded before any
// store loads, exactly as the device looks on the first launch of the new
// build: device-wide private keys, no owner marker, and user-a recorded as the
// signed-in account in auth storage. Mocks mirror authStore.test.ts.
// ---------------------------------------------------------------------------

const note = {
  id: 'note-1',
  user_id: 'local-device',
  book: 'ROM',
  chapter: 8,
  verse_start: 28,
  verse_end: null,
  type: 'note',
  color: null,
  content: 'written before the upgrade',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  synced_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
};

const LEGACY = {
  'annotation-storage': JSON.stringify({ state: { annotations: [note] }, version: 0 }),
  'gather-storage': JSON.stringify({
    state: { completedLessons: { 'foundation-1': ['lesson-1'] }, infoBannerDismissed: true },
    version: 0,
  }),
  'library-storage': JSON.stringify({
    state: {
      favorites: [{ id: 'ROM:8', bookId: 'ROM', chapter: 8, addedAt: 1 }],
      playlists: [],
      history: [],
    },
    version: 0,
  }),
};

const mmkv = mockMmkvStorage(mock, {
  ...LEGACY,
  'auth-storage': JSON.stringify({
    state: { preferences: { onboardingCompleted: true }, lastSyncedUserId: 'user-a' },
    version: 3,
  }),
});

const supabaseFake = createSupabaseFake();
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
mockReactNative(mock, { os: 'android' });
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
let useGatherStore: typeof import('./gatherStore').useGatherStore;
let useLibraryStore: typeof import('./libraryStore').useLibraryStore;
let scope: typeof import('./privateDataScope');

before(async () => {
  ({ useAuthStore } = await import('./authStore'));
  ({ localAnnotationStore } = await import('./annotationStore'));
  ({ useGatherStore } = await import('./gatherStore'));
  ({ useLibraryStore } = await import('./libraryStore'));
  scope = await import('./privateDataScope');
});

const session = (uid: string) => makeFakeSession({ user: makeFakeUser({ id: uid }) });
const notes = () =>
  localAnnotationStore.annotations
    .filter((annotation) => annotation.deleted_at == null)
    .map((annotation) => annotation.content);
const accountKey = (name: string) => scope.privateDataStorageKey(name, 'user-a');

test('the first launch of the new build shows the signed-in reader their existing data', () => {
  assert.deepEqual(notes(), ['written before the upgrade']);
  assert.deepEqual(useGatherStore.getState().completedLessons, { 'foundation-1': ['lesson-1'] });
  assert.equal(useGatherStore.getState().infoBannerDismissed, true);
  assert.deepEqual(
    useLibraryStore.getState().favorites.map((favorite) => favorite.id),
    ['ROM:8']
  );

  // The data now lives under the account; the device-wide keys are gone.
  for (const name of Object.keys(LEGACY)) {
    assert.equal(mmkv.store.get(accountKey(name)), LEGACY[name as keyof typeof LEGACY]);
    assert.equal(mmkv.store.has(name), false, name);
  }
  assert.deepEqual(JSON.parse(mmkv.store.get(scope.PRIVATE_DATA_OWNER_KEY) ?? 'null'), {
    owner: 'user-a',
  });
});

test('an offline first launch after the upgrade still shows the account data', async () => {
  authHandlers.getSession = async () => ({
    data: { session: null },
    error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 },
  });

  await useAuthStore.getState().initialize();
  supabaseFake.auth.emit('INITIAL_SESSION', null);

  assert.deepEqual(notes(), ['written before the upgrade']);

  supabaseFake.auth.emit('TOKEN_REFRESHED', session('user-a'));
  assert.deepEqual(notes(), ['written before the upgrade']);
});

test('after the upgrade the data follows its account across sign-outs and other accounts', async () => {
  await useAuthStore.getState().signOut();
  assert.deepEqual(notes(), []);
  assert.deepEqual(useGatherStore.getState().completedLessons, {});

  supabaseFake.auth.emit('SIGNED_IN', session('user-b'));
  assert.deepEqual(notes(), []);
  await useAuthStore.getState().signOut();

  supabaseFake.auth.emit('SIGNED_IN', session('user-a'));
  assert.deepEqual(notes(), ['written before the upgrade']);
  assert.deepEqual(useGatherStore.getState().completedLessons, { 'foundation-1': ['lesson-1'] });
});

test('an upgrade killed mid-migration finishes on the next launch without duplicating notes', () => {
  // What a kill leaves: annotations copied to the account but the device key
  // not yet deleted, and no owner marker written.
  mmkv.store.delete(scope.PRIVATE_DATA_OWNER_KEY);
  mmkv.store.set('annotation-storage', LEGACY['annotation-storage']);
  mmkv.store.set(accountKey('annotation-storage'), LEGACY['annotation-storage']);

  scope.restartPrivateDataScopeForTests();

  assert.deepEqual(notes(), ['written before the upgrade']);
  assert.equal(mmkv.store.has('annotation-storage'), false);
  assert.equal(scope.getPrivateDataOwner(), 'user-a');
});
