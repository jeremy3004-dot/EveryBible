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
import type { UserPreferences } from '../types';

// ---------------------------------------------------------------------------
// The first moments of a launch. Its own file because authStore and the
// private data scope keep module state: here the auth blob on disk cannot be
// parsed (a write torn by a crash), no private store has loaded, and nothing
// has signed in, signed out or retried a session restore yet. Every test
// relies on that, so none calls signOut() or resetRestoreRetryForTests().
// Mocks mirror authStore.test.ts.
// ---------------------------------------------------------------------------

const READ_AT = Date.parse('2026-09-01T08:00:00.000Z');

// A guest's data in every private store's guest bucket, from before any sign-in.
const GUEST_BUCKETS = {
  'annotation-storage': JSON.stringify({
    state: {
      annotations: [
        {
          id: 'note-1',
          user_id: 'local-device',
          book: 'ROM',
          chapter: 8,
          verse_start: 28,
          verse_end: null,
          type: 'note',
          color: null,
          content: 'written as a guest',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
          synced_at: null,
          deleted_at: null,
        },
      ],
    },
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
  'gather-storage': JSON.stringify({
    state: { completedLessons: { 'foundation-1': ['lesson-1'] } },
    version: 0,
  }),
  'four-fields-storage': JSON.stringify({
    state: { completedLessons: { 'course-guest': ['lesson-guest'] } },
    version: 1,
  }),
  'progress-storage': JSON.stringify({
    state: { chaptersRead: { JHN_3: READ_AT }, streakDays: 1, lastReadDate: '2026-09-01' },
    version: 0,
  }),
};

const mmkv = mockMmkvStorage(mock, {
  ...GUEST_BUCKETS,
  'auth-storage': '{"state":{"preferences":{"fontSi',
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
const rn = mockReactNative(mock, { os: 'ios' });
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
const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: true, isInternetReachable: null }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: { getState: () => ({ resetForSignOut: () => {} }) },
});
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  deactivatePushToken: async () => {},
});

let useAuthStore: typeof import('./authStore').useAuthStore;
let privateDataStorageKey: typeof import('./privateDataScope').privateDataStorageKey;
let defaultAuthPreferences: UserPreferences;
/** State as it stood immediately after the store loaded from the unreadable blob. */
let launchState: ReturnType<typeof useAuthStore.getState>;

before(async () => {
  ({ useAuthStore } = await import('./authStore'));
  launchState = { ...useAuthStore.getState() };
  ({ privateDataStorageKey } = await import('./privateDataScope'));
  ({ defaultAuthPreferences } = await import('./sanitizers/authState'));
});

const signedInAs = (uid: string) => makeFakeSession({ user: makeFakeUser({ id: uid }) });

/** The persisted state in `uid`'s bucket of one private store. */
const accountBucket = (name: string, uid: string): Record<string, unknown> => {
  const raw = mmkv.store.get(privateDataStorageKey(name, uid));
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : {};
};

test('an unreadable auth blob starts the app signed out and idle', () => {
  const { user, session, isAuthenticated, isLoading, isInitialized, awaitingTokenRefresh } =
    launchState;

  assert.deepEqual(
    { user, session, isAuthenticated, isLoading, isInitialized, awaitingTokenRefresh },
    {
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      awaitingTokenRefresh: false,
    }
  );
});

// The guest buckets are deleted once adopted, so a store missed here loses the
// guest's only copy of its data.
test('the first sign-in adopts the guest data of every private store, loaded or not', () => {
  useAuthStore.getState().setSession(signedInAs('user-a'));

  const notes = accountBucket('annotation-storage', 'user-a').annotations as
    | Array<{ content: string }>
    | undefined;
  const favorites = accountBucket('library-storage', 'user-a').favorites as
    | Array<{ id: string }>
    | undefined;
  assert.deepEqual(
    {
      notes: notes?.map((note) => note.content),
      favorites: favorites?.map((favorite) => favorite.id),
      gather: accountBucket('gather-storage', 'user-a').completedLessons,
      fourFields: accountBucket('four-fields-storage', 'user-a').completedLessons,
      chaptersRead: accountBucket('progress-storage', 'user-a').chaptersRead,
    },
    {
      notes: ['written as a guest'],
      favorites: ['ROM:8'],
      gather: { 'foundation-1': ['lesson-1'] },
      fourFields: { 'course-guest': ['lesson-guest'] },
      chaptersRead: { JHN_3: READ_AT },
    }
  );
  for (const name of Object.keys(GUEST_BUCKETS)) {
    assert.equal(mmkv.store.has(name), false, `${name} guest bucket`);
  }
});

test('a session lost before any sign-out on this launch resets onboarding with the rest', () => {
  useAuthStore.getState().setSession(signedInAs('user-a'));
  useAuthStore.getState().setPreferences({ onboardingCompleted: true, fontSize: 'large' });

  useAuthStore.getState().setSession(null);

  assert.deepEqual(useAuthStore.getState().preferences, defaultAuthPreferences);
});

test('a launch that could not read the session retries it on the next three foregrounds', async () => {
  authHandlers.getSession = async () => ({
    data: { session: null },
    error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 },
  });
  await useAuthStore.getState().initialize();

  for (let attempt = 0; attempt < 5; attempt++) {
    rn.AppState.emit('active');
    await new Promise((resolve) => setImmediate(resolve));
  }

  const restores = supabaseFake.authCalls.filter((call) => call.method === 'getSession');
  // The launch itself plus three foreground retries.
  assert.equal(restores.length, 4);
});
