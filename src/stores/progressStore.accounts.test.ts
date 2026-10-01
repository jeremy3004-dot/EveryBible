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
// Account scoping of the reading/listening ledger: real authStore, real
// progressStore, real scope module. Listening history and per-day tallies never
// sync, so signing out or switching accounts must neither delete them nor show
// them to another account. Mocks mirror privateDataAccounts.test.ts.
// ---------------------------------------------------------------------------

const mmkv = mockMmkvStorage(mock);

const supabaseFake = createSupabaseFake();
const defaultAuthHandlers = { ...supabaseFake.auth.handlers };
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
// Listening a chapter queues a debounced progress sync; keep it off the network.
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncProgress: async () => ({ success: true }),
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
let useProgressStore: typeof import('./progressStore').useProgressStore;
let scope: typeof import('./privateDataScope');

before(async () => {
  ({ useAuthStore } = await import('./authStore'));
  ({ useProgressStore } = await import('./progressStore'));
  scope = await import('./privateDataScope');
  // Subscribes to the fake's auth events, so signIn() reaches the store.
  await useAuthStore.getState().initialize();
});

beforeEach(() => {
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  supabaseFake.auth.setSession(null);
});

const session = (uid: string) => makeFakeSession({ user: makeFakeUser({ id: uid }) });
const signIn = (uid: string) => supabaseFake.auth.emit('SIGNED_IN', session(uid));
const signOut = () => useAuthStore.getState().signOut();
const progress = () => useProgressStore.getState();

const TODAY = (() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

/** What the Home ledger can show right now: the local-only maps. */
const ledger = () => ({
  listened: Object.keys(progress().chaptersListened).sort(),
  listeningMs: progress().listeningMsByDate,
  chaptersByDate: progress().chaptersByDate,
});

const EMPTY = { listened: [], listeningMs: {}, chaptersByDate: {} };

const listen = (book: string, ms: number) => {
  progress().markChapterListened(book, 1);
  progress().recordListeningTime(ms);
};

test('signing out keeps the account listening history and signing back in restores it', async () => {
  signIn('user-a');
  listen('JHN', 60_000);
  progress().markChapterRead('ROM', 1);

  await signOut();
  assert.deepEqual(ledger(), EMPTY);
  assert.deepEqual(progress().chaptersRead, {});

  signIn('user-a');
  assert.deepEqual(ledger().listened, ['JHN_1']);
  assert.deepEqual(ledger().listeningMs, { [TODAY]: 60_000 });
  assert.deepEqual(ledger().chaptersByDate, { [TODAY]: 2 });
  assert.deepEqual(Object.keys(progress().chaptersRead), ['ROM_1']);
  await signOut();
});

test('another account never sees the first account listening history', async () => {
  signIn('user-b');
  listen('PSA', 30_000);
  const bData = ledger();

  signIn('user-c');
  assert.deepEqual(ledger(), EMPTY);
  listen('GEN', 10_000);

  signIn('user-b');
  assert.deepEqual(ledger(), bData);
  await signOut();

  signIn('user-c');
  assert.deepEqual(ledger().listened, ['GEN_1']);
  assert.deepEqual(ledger().listeningMs, { [TODAY]: 10_000 });
  await signOut();
});

test('listening done while signed out joins the account that signs in next', async () => {
  listen('MAT', 20_000);

  signIn('user-d');
  assert.deepEqual(ledger().listened, ['MAT_1']);
  assert.deepEqual(ledger().listeningMs, { [TODAY]: 20_000 });

  await signOut();
  assert.deepEqual(ledger(), EMPTY);
  signIn('user-d');
  assert.deepEqual(ledger().listened, ['MAT_1']);
  await signOut();
});

test('a guest adopted into an account is merged with that account without double counting', async () => {
  signIn('user-e');
  listen('JHN', 60_000);
  await signOut();

  listen('MRK', 5_000);
  signIn('user-e');

  assert.deepEqual(ledger().listened, ['JHN_1', 'MRK_1']);
  // Merging is idempotent (an interrupted adoption is retried), so a day's
  // minutes are the larger side, never the sum of both.
  assert.deepEqual(ledger().listeningMs, { [TODAY]: 60_000 });
  await signOut();
});

test('the persisted ledger lands in the account bucket, not the guest key', async () => {
  signIn('user-f');
  listen('LUK', 15_000);

  assert.ok(mmkv.store.has(scope.privateDataStorageKey('progress-storage', 'user-f')));
  assert.equal(mmkv.store.has('progress-storage'), false);
  await signOut();
});
