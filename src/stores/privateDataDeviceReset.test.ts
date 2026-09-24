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
// Settings "Clear cache" and "Delete account" on a phone shared by several
// accounts. Private data (notes, library, Gather, Four Fields) lives only on
// the device, one bucket per account plus the guest bucket (privateDataScope).
// Neither action may touch a bucket that is not the deleted account's own.
// Real authStore, private stores and scope module; mocks mirror
// privateDataAccounts.test.ts.
// ---------------------------------------------------------------------------

const mmkv = mockMmkvStorage(mock);

const supabaseFake = createSupabaseFake();
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
let useGatherStore: typeof import('./gatherStore').useGatherStore;
let scope: typeof import('./privateDataScope');
let clearDeviceCaches: typeof import('./deviceCaches').clearDeviceCaches;
let deleteAccountAndLocalData: typeof import('../services/account/deleteAccount').deleteAccountAndLocalData;

before(async () => {
  ({ useAuthStore } = await import('./authStore'));
  ({ localAnnotationStore } = await import('./annotationStore'));
  await import('./libraryStore');
  ({ useGatherStore } = await import('./gatherStore'));
  await import('./fourFieldsStore');
  scope = await import('./privateDataScope');
  ({ clearDeviceCaches } = await import('./deviceCaches'));
  ({ deleteAccountAndLocalData } = await import('../services/account/deleteAccount'));
  await useAuthStore.getState().initialize();
});

// Every test starts on an empty, signed-out device.
beforeEach(() => {
  supabaseFake.reset();
  supabaseFake.auth.setSession(null);
  useAuthStore.setState({ user: null, session: null, isAuthenticated: false });
  mmkv.store.clear();
  scope.restartPrivateDataScopeForTests();
});

const signIn = (uid: string) => {
  const session = makeFakeSession({ user: makeFakeUser({ id: uid }) });
  supabaseFake.auth.setSession(session);
  supabaseFake.auth.emit('SIGNED_IN', session);
};
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

const bucketsOf = (owner: string | null) =>
  Object.fromEntries(
    scope.PRIVATE_DATA_STORE_NAMES.map((name) => scope.privateDataStorageKey(name, owner))
      .filter((key) => mmkv.store.has(key))
      .map((key) => [key, mmkv.store.get(key)])
  );

// A signed-out phone where account B, then account A, each saved a note and
// signed out, and then someone saved a note without signing in.
const shareThePhone = async () => {
  signIn('user-b');
  addNote(1, 'b note');
  await signOut();
  signIn('user-a');
  addNote(2, 'a note');
  await signOut();
  addNote(3, 'guest note');
};

// Stands in for a cold start: owner and buckets re-read from disk.
const relaunch = () => scope.restartPrivateDataScopeForTests();

test('Clear cache keeps the private data of every account and of the guest', async () => {
  await shareThePhone();
  const before = { a: bucketsOf('user-a'), b: bucketsOf('user-b'), guest: bucketsOf(null) };
  assert.ok(Object.keys(before.b).length > 0);

  clearDeviceCaches();

  assert.deepEqual(
    { a: bucketsOf('user-a'), b: bucketsOf('user-b'), guest: bucketsOf(null) },
    before
  );
  relaunch();
  assert.deepEqual(visibleNotes(), ['guest note']);
});

test('Clear cache while signed in keeps that account signed in to its own notes', async () => {
  await shareThePhone();
  signIn('user-b');
  const otherAccount = bucketsOf('user-a');

  clearDeviceCaches();
  relaunch();

  assert.equal(scope.getPrivateDataOwner(), 'user-b');
  assert.deepEqual(visibleNotes(), ['b note', 'guest note']);
  assert.deepEqual(bucketsOf('user-a'), otherAccount);
});

test('Clear cache removes re-downloadable caches and keeps downloads, plans and install state', () => {
  const kept = {
    'bible-storage': '{"state":{"downloads":true}}',
    'bible-runtime-catalog-v1': '[]',
    'bible.textPackInstallJournal.v1': '{}',
    'audio-storage': '{}',
    'reading-plans-storage': '{"state":{"enrolled":["plan"]}}',
    'translation-preferences': '{}',
    'translator-review-storage': '{}',
    'el-media:last-catalog': '{"sequence":7}',
    'analytics-usage-queue-v1': '[]',
    'diagnostics-crash-log': '[]',
    'async-storage-mmkv-migration-complete': '1',
    'everybible.privacy.installation.v1': '1',
  };
  const caches = {
    'el-media:manifest:https://cdn.example/a.json': '{}',
    'el-media:jwks-cache': '{}',
    'analytics-geo-cache-v1': '{}',
  };
  for (const [key, value] of Object.entries({ ...kept, ...caches })) {
    mmkv.store.set(key, value);
  }

  clearDeviceCaches();

  for (const [key, value] of Object.entries(kept)) {
    assert.equal(mmkv.store.get(key), value, key);
  }
  for (const key of Object.keys(caches)) {
    assert.equal(mmkv.store.has(key), false, key);
  }
});

test("deleting account A removes A's private data and keeps B's and the guest's", async () => {
  await shareThePhone();
  signIn('user-b');
  await signOut();
  // Guest data left on the device while A is signed in (the pre-scoping
  // migration keeps a device copy that differed from the account's own).
  signIn('user-a');
  mmkv.store.set(
    'gather-storage',
    JSON.stringify({ state: { completedLessons: { f1: ['guest-lesson'] } }, version: 0 })
  );
  const accountB = bucketsOf('user-b');

  assert.deepEqual(await deleteAccountAndLocalData(), { success: true });

  assert.deepEqual(bucketsOf('user-a'), {});
  assert.deepEqual(bucketsOf('user-b'), accountB);
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(scope.getPrivateDataOwner(), null);
  assert.deepEqual(visibleNotes(), []);
  assert.deepEqual(useGatherStore.getState().completedLessons, { f1: ['guest-lesson'] });

  signIn('user-b');
  assert.deepEqual(visibleNotes(), ['b note', 'guest note']);
});

test("deleting an account keeps the other account's data after a relaunch too", async () => {
  await shareThePhone();
  signIn('user-a');

  await deleteAccountAndLocalData();
  relaunch();

  assert.equal(scope.getPrivateDataOwner(), null);
  assert.deepEqual(bucketsOf('user-a'), {});
  signIn('user-b');
  assert.deepEqual(visibleNotes(), ['b note']);
});

test('a rejected account deletion leaves the account signed in with its data', async () => {
  await shareThePhone();
  signIn('user-a');
  const accountA = bucketsOf('user-a');
  supabaseFake.respondToRpc('delete_my_account', () => ({
    data: null,
    error: { message: 'permission denied' },
  }));

  assert.deepEqual(await deleteAccountAndLocalData(), {
    success: false,
    error: 'permission denied',
  });

  assert.equal(useAuthStore.getState().user?.uid, 'user-a');
  assert.deepEqual(bucketsOf('user-a'), accountA);
  assert.deepEqual(visibleNotes(), ['a note', 'guest note']);
});

test('account deletion does nothing when nobody is signed in', async () => {
  await shareThePhone();
  const everything = new Map(mmkv.store);

  assert.deepEqual(await deleteAccountAndLocalData(), {
    success: false,
    error: 'Not signed in',
  });

  assert.deepEqual(supabaseFake.callsFor('rpc:delete_my_account'), []);
  assert.deepEqual(new Map(mmkv.store), everything);
});
