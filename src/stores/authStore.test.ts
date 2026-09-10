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
import type { UserPreferences } from '../types';

// ---------------------------------------------------------------------------
// Mocks. Everything authStore reaches for at an auth boundary is real except
// bibleStore (its import graph pulls expo-sqlite / expo-file-system / the expo
// runtime, which is far more mocking than this store's behaviour is worth) and
// the notifications barrel (expo-notifications). progressStore, bibleStore's
// four siblings and persistedStateSanitizers all load for real.
// ---------------------------------------------------------------------------

const SEEDED_AUTH_STORAGE = JSON.stringify({
  state: {
    // A signed-in flag and a user survived to disk in older builds; the
    // sanitizer must refuse to restore them.
    user: { uid: 'seeded-user', email: 'seeded@example.com' },
    isAuthenticated: true,
    preferences: {
      fontSize: 'large',
      theme: 'dark',
      language: 'es',
      onboardingCompleted: true,
      notificationsEnabled: true,
      reminderTime: '07:30',
    },
    preferencesUpdatedAt: '2026-05-01T00:00:00.000Z',
    lastSyncedUserId: 'seeded-user',
  },
  version: 3,
});

const mmkv = mockMmkvStorage(mock, { 'auth-storage': SEEDED_AUTH_STORAGE });

const supabaseFake = createSupabaseFake();
const defaultAuthHandlers = { ...supabaseFake.auth.handlers };
const authHandlers = supabaseFake.auth.handlers as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;

let supabaseConfigured = true;
let configCheckError: Error | null = null;
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => {
    if (configCheckError) {
      throw configCheckError;
    }
    return supabaseConfigured;
  },
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

// authStore lazy-`require`s the auth barrel inside initialize()/signOut(), so the
// real authService loads: it needs expo-crypto (Apple nonce) and the translator
// review store needs expo-secure-store (the passcode moved into the keystore).
mockExpoCrypto(mock);
const secureStore = mockSecureStore(mock);

const events: string[] = [];
let bibleResetCount = 0;
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: {
    getState: () => ({
      resetForSignOut: () => {
        bibleResetCount += 1;
        events.push('bibleStore.resetForSignOut');
      },
    }),
  },
});

const deactivatedTokensFor: string[] = [];
let deactivatePushTokenError: Error | null = null;
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  deactivatePushToken: async (userId: string) => {
    if (deactivatePushTokenError) {
      throw deactivatePushTokenError;
    }
    deactivatedTokensFor.push(userId);
    events.push('deactivatePushToken');
  },
});

// ---------------------------------------------------------------------------

let useAuthStore: typeof import('./authStore').useAuthStore;
let useProgressStore: typeof import('./progressStore').useProgressStore;
let readingPlansStore: typeof import('./readingPlansStore').readingPlansStore;
let useFourFieldsStore: typeof import('./fourFieldsStore').useFourFieldsStore;
let useTranslatorReviewStore: typeof import('./translatorReviewStore').useTranslatorReviewStore;
let defaultAuthPreferences: UserPreferences;
/** State as it stood immediately after the persist middleware hydrated it. */
let hydratedState: ReturnType<typeof useAuthStore.getState>;

before(async () => {
  ({ useAuthStore } = await import('./authStore'));
  hydratedState = { ...useAuthStore.getState() };
  ({ useProgressStore } = await import('./progressStore'));
  ({ readingPlansStore } = await import('./readingPlansStore'));
  ({ useFourFieldsStore } = await import('./fourFieldsStore'));
  ({ useTranslatorReviewStore } = await import('./translatorReviewStore'));
  ({ defaultAuthPreferences } = await import('./persistedStateSanitizers'));
});

beforeEach(() => {
  supabaseConfigured = true;
  configCheckError = null;
  supabaseFake.reset();
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  supabaseFake.auth.setSession(null);
  rn.Platform.OS = 'ios';
  events.length = 0;
  bibleResetCount = 0;
  deactivatedTokensFor.length = 0;
  deactivatePushTokenError = null;

  useAuthStore.setState({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: false,
    preferences: { ...defaultAuthPreferences },
    preferencesUpdatedAt: null,
    lastSyncedUserId: null,
    authGeneration: 0,
  });
  useProgressStore.getState().resetForSignOut();
  readingPlansStore.getState().resetForSignOut();
  useFourFieldsStore.getState().resetForSignOut();
  useTranslatorReviewStore.getState().resetForSignOut();
});

const appUser = (uid: string) => ({
  uid,
  email: `${uid}@example.com`,
  displayName: null,
  photoURL: null,
  createdAt: 0,
  lastActive: 0,
});

/** Fills every per-user store with data that must not survive an account switch. */
const seedPerUserData = (): void => {
  useProgressStore.setState({ chaptersRead: { 'JHN.3': 1 }, streakDays: 4 });
  readingPlansStore.setState({ enrolledPlanIds: ['plan-a'] });
  useFourFieldsStore.setState({ activeGroupId: 'group-1' });
  useTranslatorReviewStore.setState({ enabled: true, accessPasscode: 'passcode' });
};

const perUserDataIsCleared = (): boolean =>
  Object.keys(useProgressStore.getState().chaptersRead).length === 0 &&
  useProgressStore.getState().streakDays === 0 &&
  readingPlansStore.getState().enrolledPlanIds.length === 0 &&
  useFourFieldsStore.getState().activeGroupId === null &&
  useTranslatorReviewStore.getState().enabled === false;

const readPersistedAuthStorage = () =>
  JSON.parse(mmkv.store.get('auth-storage') ?? '{}') as { state: Record<string, unknown> };

const rehydrateFrom = async (persisted: unknown): Promise<void> => {
  mmkv.store.set('auth-storage', JSON.stringify(persisted));
  await useAuthStore.persist.rehydrate();
};

// ---------------------------------------------------------------------------
// Hydration, sanitisation and migration
// ---------------------------------------------------------------------------

test('persisted preferences are restored on load', () => {
  assert.equal(hydratedState.preferences.fontSize, 'large');
  assert.equal(hydratedState.preferences.theme, 'dark');
  assert.equal(hydratedState.preferences.language, 'es');
  assert.equal(hydratedState.preferences.onboardingCompleted, true);
  assert.equal(hydratedState.preferences.reminderTime, '07:30');
  assert.equal(hydratedState.preferencesUpdatedAt, '2026-05-01T00:00:00.000Z');
});

test('a persisted signed-in flag is never trusted as a live session', () => {
  assert.equal(hydratedState.user, null);
  assert.equal(hydratedState.isAuthenticated, false);
  assert.equal(hydratedState.session, null);
});

test('the last synced account id survives a restart so an account switch can be detected', () => {
  assert.equal(hydratedState.lastSyncedUserId, 'seeded-user');
});

test('only preferences and the account marker are written to disk', () => {
  useAuthStore.getState().setPreferences({ fontSize: 'small' });

  assert.deepEqual(Object.keys(readPersistedAuthStorage().state).sort(), [
    'lastSyncedUserId',
    'preferences',
    'preferencesUpdatedAt',
  ]);
});

test('an unsupported language and font size fall back to the defaults', async () => {
  await rehydrateFrom({
    state: { preferences: { language: 'klingon', fontSize: 'gigantic', theme: 'midnight' } },
    version: 3,
  });

  assert.equal(useAuthStore.getState().preferences.language, 'en');
  assert.equal(useAuthStore.getState().preferences.fontSize, 'medium');
  assert.equal(useAuthStore.getState().preferences.theme, 'light');
});

test('a corrupted persisted payload falls back to the default preferences', async () => {
  await rehydrateFrom({ state: 'corrupted', version: 3 });

  assert.deepEqual(useAuthStore.getState().preferences, defaultAuthPreferences);
  assert.equal(useAuthStore.getState().lastSyncedUserId, null);
});

test('a non-string persisted account marker is dropped', async () => {
  await rehydrateFrom({ state: { lastSyncedUserId: 42 }, version: 3 });

  assert.equal(useAuthStore.getState().lastSyncedUserId, null);
});

test('an install from before the onboarding gate is not sent back through onboarding', async () => {
  await rehydrateFrom({ state: { preferences: { fontSize: 'large' } }, version: 0 });

  assert.equal(useAuthStore.getState().preferences.onboardingCompleted, true);
  assert.equal(useAuthStore.getState().preferences.fontSize, 'large');
  assert.equal(useAuthStore.getState().preferencesUpdatedAt, null);
});

test('an install that had explicitly not finished onboarding keeps that state', async () => {
  await rehydrateFrom({ state: { preferences: { onboardingCompleted: false } }, version: 1 });

  assert.equal(useAuthStore.getState().preferences.onboardingCompleted, false);
});

test('a version 2 install gains the newer preference defaults and re-syncs from scratch', async () => {
  await rehydrateFrom({
    state: {
      preferences: { fontSize: 'small' },
      preferencesUpdatedAt: '2026-01-01T00:00:00.000Z',
    },
    version: 2,
  });

  assert.equal(useAuthStore.getState().preferences.fontSize, 'small');
  assert.equal(
    useAuthStore.getState().preferences.appearancePalette,
    defaultAuthPreferences.appearancePalette
  );
  assert.equal(useAuthStore.getState().preferencesUpdatedAt, null);
});

test('state written by a newer build is accepted rather than discarded', async () => {
  await rehydrateFrom({
    state: {
      preferences: { fontSize: 'small' },
      preferencesUpdatedAt: '2026-01-01T00:00:00.000Z',
    },
    version: 4,
  });

  assert.equal(useAuthStore.getState().preferences.fontSize, 'small');
  assert.equal(useAuthStore.getState().preferencesUpdatedAt, '2026-01-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// setUser / setSession auth boundaries
// ---------------------------------------------------------------------------

test('signing in as a guest for the first time records the account and bumps the generation', () => {
  useAuthStore.getState().setUser(appUser('user-a'));

  assert.equal(useAuthStore.getState().user?.uid, 'user-a');
  assert.equal(useAuthStore.getState().lastSyncedUserId, 'user-a');
  assert.equal(useAuthStore.getState().authGeneration, 1);
});

test("a guest's reading progress survives creating their first account", () => {
  seedPerUserData();

  useAuthStore.getState().setUser(appUser('user-a'));

  assert.deepEqual(useProgressStore.getState().chaptersRead, { 'JHN.3': 1 });
  assert.deepEqual(readingPlansStore.getState().enrolledPlanIds, ['plan-a']);
  assert.equal(bibleResetCount, 0);
});

test("a guest's unenroll tombstones are consumed at the first sign-in", () => {
  readingPlansStore.getState().addPendingUnenroll('plan-a');

  useAuthStore.getState().setUser(appUser('user-a'));

  assert.deepEqual(readingPlansStore.getState().pendingUnenrollPlanIds, []);
});

test('switching to a second account wipes the first account local data', () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  seedPerUserData();

  useAuthStore.getState().setUser(appUser('user-b'));

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(bibleResetCount, 1);
  assert.equal(useAuthStore.getState().lastSyncedUserId, 'user-b');
  assert.equal(useAuthStore.getState().authGeneration, 2);
});

test('a stale account marker from a previous install resets local data on sign-in', () => {
  useAuthStore.setState({ lastSyncedUserId: 'user-a' });
  seedPerUserData();

  useAuthStore.getState().setUser(appUser('user-b'));

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(useAuthStore.getState().lastSyncedUserId, 'user-b');
});

test('setting the same user again leaves the auth generation alone', () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  const generation = useAuthStore.getState().authGeneration;

  useAuthStore.getState().setUser(appUser('user-a'));

  assert.equal(useAuthStore.getState().authGeneration, generation);
});

test('clearing the user resets per-user stores and preferences', () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  useAuthStore.getState().setPreferences({ fontSize: 'large' });
  seedPerUserData();

  useAuthStore.getState().setUser(null);

  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(perUserDataIsCleared(), true);
  assert.deepEqual(useAuthStore.getState().preferences, defaultAuthPreferences);
  assert.equal(useAuthStore.getState().lastSyncedUserId, null);
  assert.equal(useAuthStore.getState().authGeneration, 2);
});

test('clearing the user of a store that never had one changes nothing', () => {
  useAuthStore.getState().setUser(null);

  assert.equal(useAuthStore.getState().authGeneration, 0);
  assert.equal(bibleResetCount, 0);
});

test('a Supabase session is mapped onto the app user and marks the app authenticated', () => {
  useAuthStore.getState().setSession(
    makeFakeSession({
      user: makeFakeUser({
        id: 'user-a',
        email: 'reader@example.com',
        user_metadata: { full_name: 'Ada Lovelace', avatar_url: 'https://cdn/a.png' },
        created_at: '2026-02-03T04:05:06.000Z',
      } as never),
    })
  );

  const { user, isAuthenticated } = useAuthStore.getState();
  assert.equal(isAuthenticated, true);
  assert.equal(user?.uid, 'user-a');
  assert.equal(user?.displayName, 'Ada Lovelace');
  assert.equal(user?.photoURL, 'https://cdn/a.png');
  assert.equal(user?.createdAt, Date.parse('2026-02-03T04:05:06.000Z'));
});

test('a session swap to another account resets the previous account local data', () => {
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  seedPerUserData();

  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-b' }) }));

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(useAuthStore.getState().authGeneration, 2);
});

test('a refreshed session for the same account keeps the auth generation stable', () => {
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  seedPerUserData();

  useAuthStore
    .getState()
    .setSession(makeFakeSession({ access_token: 'rotated', user: makeFakeUser({ id: 'user-a' }) }));

  assert.equal(useAuthStore.getState().authGeneration, 1);
  assert.equal(useAuthStore.getState().session?.access_token, 'rotated');
  assert.deepEqual(useProgressStore.getState().chaptersRead, { 'JHN.3': 1 });
});

test('losing the session signs the app out and clears per-user data', () => {
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  seedPerUserData();

  useAuthStore.getState().setSession(null);

  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(perUserDataIsCleared(), true);
  assert.equal(useAuthStore.getState().authGeneration, 2);
});

test('reconciling the boundary for the account already synced leaves local data alone', () => {
  useAuthStore.setState({ lastSyncedUserId: 'user-a' });
  seedPerUserData();

  useAuthStore.getState().reconcileUserBoundary('user-a', 'user-a');

  assert.equal(perUserDataIsCleared(), false);
  assert.equal(bibleResetCount, 0);
});

test('reconciling with only an account id takes the previous account from the store', () => {
  // useSync calls reconcileUserBoundary(userId) with one argument, so the
  // previous account has to come from the store's own user.
  useAuthStore.setState({ user: appUser('user-a'), isAuthenticated: true });
  seedPerUserData();

  useAuthStore.getState().reconcileUserBoundary('user-b');

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(bibleResetCount, 1);
  assert.equal(useAuthStore.getState().lastSyncedUserId, 'user-b');
});

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

test('setPreferences merges into the existing preferences and stamps the change', () => {
  useAuthStore.getState().setPreferences({ fontSize: 'large' });
  useAuthStore.getState().setPreferences({ notificationsEnabled: true });

  const { preferences, preferencesUpdatedAt } = useAuthStore.getState();
  assert.equal(preferences.fontSize, 'large');
  assert.equal(preferences.notificationsEnabled, true);
  assert.equal(preferences.language, defaultAuthPreferences.language);
  assert.match(String(preferencesUpdatedAt), /^\d{4}-\d{2}-\d{2}T/);
});

test('setLoading toggles the loading flag on its own', () => {
  useAuthStore.getState().setLoading(true);

  assert.equal(useAuthStore.getState().isLoading, true);
  assert.equal(useAuthStore.getState().isInitialized, false);
});

test('synced preferences from another device replace the local ones', () => {
  const incoming: UserPreferences = { ...defaultAuthPreferences, fontSize: 'large', theme: 'dark' };

  useAuthStore.getState().applySyncedPreferences(incoming, '2026-06-01T00:00:00.000Z');

  assert.deepEqual(useAuthStore.getState().preferences, incoming);
  assert.equal(useAuthStore.getState().preferencesUpdatedAt, '2026-06-01T00:00:00.000Z');
});

test('synced preferences identical to the local ones are ignored entirely', () => {
  useAuthStore
    .getState()
    .applySyncedPreferences({ ...defaultAuthPreferences }, '2026-06-01T00:00:00.000Z');
  const settled = useAuthStore.getState();

  useAuthStore
    .getState()
    .applySyncedPreferences({ ...defaultAuthPreferences }, '2026-06-01T00:00:00.000Z');

  assert.equal(useAuthStore.getState(), settled);
});

test('a newer sync timestamp is adopted even when the preference values match', () => {
  useAuthStore
    .getState()
    .applySyncedPreferences({ ...defaultAuthPreferences }, '2026-06-01T00:00:00.000Z');

  useAuthStore
    .getState()
    .applySyncedPreferences({ ...defaultAuthPreferences }, '2026-07-01T00:00:00.000Z');

  assert.equal(useAuthStore.getState().preferencesUpdatedAt, '2026-07-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------

test('signing out deactivates the push token before the session is torn down', async () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  authHandlers.signOut = async () => {
    events.push('supabase.signOut');
    return { error: null };
  };

  await useAuthStore.getState().signOut();

  assert.deepEqual(deactivatedTokensFor, ['user-a']);
  assert.deepEqual(events.slice(0, 2), ['deactivatePushToken', 'supabase.signOut']);
});

test('signing out clears every per-user store and the local preferences', async () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  useAuthStore.getState().setPreferences({ fontSize: 'large' });
  seedPerUserData();

  await useAuthStore.getState().signOut();

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(bibleResetCount, 1);
  assert.deepEqual(useAuthStore.getState().preferences, defaultAuthPreferences);
  assert.equal(useAuthStore.getState().preferencesUpdatedAt, null);
  assert.equal(useAuthStore.getState().lastSyncedUserId, null);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().isAuthenticated, false);
});

test('signing out deletes the translator review passcode from the OS keystore', async () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  seedPerUserData();
  secureStore.store.set('everybible.translatorReview.passcode', 'Secret-1');
  secureStore.calls.length = 0;

  await useAuthStore.getState().signOut();
  // The keystore delete is fire-and-forget inside resetForSignOut.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(useTranslatorReviewStore.getState().accessPasscode, null);
  assert.deepEqual(
    secureStore.calls.map((call) => `${call.op} ${call.key}`),
    ['delete everybible.translatorReview.passcode']
  );
  assert.equal(secureStore.store.has('everybible.translatorReview.passcode'), false);
});

test('signing out still clears local data when Supabase is unreachable', async () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  seedPerUserData();
  authHandlers.signOut = async () => {
    throw new Error('Network request failed');
  };

  await useAuthStore.getState().signOut();

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().authGeneration, 2);
});

test('signing out is not blocked by a failing push token cleanup', async () => {
  useAuthStore.getState().setUser(appUser('user-a'));
  deactivatePushTokenError = new Error('user_devices update rejected');

  await useAuthStore.getState().signOut();

  assert.deepEqual(deactivatedTokensFor, []);
  assert.equal(useAuthStore.getState().user, null);
});

test('signing out a guest touches no push token and leaves the generation alone', async () => {
  await useAuthStore.getState().signOut();

  assert.deepEqual(deactivatedTokensFor, []);
  assert.equal(useAuthStore.getState().authGeneration, 0);
});

// ---------------------------------------------------------------------------
// initialize
//
// `authSubscription` is module state that survives every test, so the
// "no backend" case has to run before the first successful initialize.
// ---------------------------------------------------------------------------

test('initialize on a build with no backend leaves the app signed out and subscribes to nothing', async () => {
  supabaseConfigured = false;

  await useAuthStore.getState().initialize();

  assert.equal(useAuthStore.getState().isInitialized, true);
  assert.equal(useAuthStore.getState().isLoading, false);
  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(supabaseFake.auth.listenerCount, 0);
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('initialize restores a live session and marks the app authenticated', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));

  await useAuthStore.getState().initialize();

  assert.equal(useAuthStore.getState().isAuthenticated, true);
  assert.equal(useAuthStore.getState().user?.uid, 'user-a');
  assert.equal(useAuthStore.getState().lastSyncedUserId, 'user-a');
  assert.equal(useAuthStore.getState().isInitialized, true);
});

test('a cold start that cannot restore a session clears the previously synced account data', async () => {
  useAuthStore.setState({ lastSyncedUserId: 'user-a' });
  useAuthStore.getState().setPreferences({ fontSize: 'large' });
  seedPerUserData();

  await useAuthStore.getState().initialize();

  assert.equal(perUserDataIsCleared(), true);
  assert.equal(bibleResetCount, 1);
  assert.equal(useAuthStore.getState().lastSyncedUserId, null);
  assert.deepEqual(useAuthStore.getState().preferences, defaultAuthPreferences);
});

test('initialize subscribes to Supabase auth changes exactly once', async () => {
  await useAuthStore.getState().initialize();
  useAuthStore.setState({ isInitialized: false });
  await useAuthStore.getState().initialize();

  assert.equal(supabaseFake.auth.listenerCount, 1);
});

test('initialize does nothing once the store is already initialized', async () => {
  useAuthStore.setState({ isInitialized: true });

  await useAuthStore.getState().initialize();

  assert.deepEqual(supabaseFake.authCalls, []);
});

test('initialize survives a failure while reading the build configuration', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  configCheckError = new Error('runtime config unavailable');

  await useAuthStore.getState().initialize();

  assert.equal(logged.mock.callCount(), 1);
  assert.equal(useAuthStore.getState().isInitialized, true);
  assert.equal(useAuthStore.getState().isLoading, false);
});

test('initialize reports the store as loading until the session has been restored', async () => {
  let releaseSession: () => void = () => {};
  authHandlers.getSession = () =>
    new Promise((resolve) => {
      releaseSession = () => resolve({ data: { session: null }, error: null });
    });

  const initializing = useAuthStore.getState().initialize();

  assert.equal(useAuthStore.getState().isLoading, true);
  assert.equal(useAuthStore.getState().isInitialized, false);

  releaseSession();
  await initializing;

  assert.equal(useAuthStore.getState().isLoading, false);
  assert.equal(useAuthStore.getState().isInitialized, true);
});

test('initializing a second time never doubles the handling of an auth event', async () => {
  await useAuthStore.getState().initialize();
  useAuthStore.setState({ isInitialized: false });
  await useAuthStore.getState().initialize();
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  const generation = useAuthStore.getState().authGeneration;

  supabaseFake.auth.emit('SIGNED_OUT', null);

  assert.equal(useAuthStore.getState().authGeneration, generation + 1);
});

test('a SIGNED_IN event for a different account resets the previous account data', async () => {
  await useAuthStore.getState().initialize();
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  seedPerUserData();

  supabaseFake.auth.emit('SIGNED_IN', makeFakeSession({ user: makeFakeUser({ id: 'user-b' }) }));

  assert.equal(useAuthStore.getState().user?.uid, 'user-b');
  assert.equal(perUserDataIsCleared(), true);
  assert.equal(bibleResetCount, 1);
});

test('a TOKEN_REFRESHED event for the same account keeps the auth generation stable', async () => {
  await useAuthStore.getState().initialize();
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  const generation = useAuthStore.getState().authGeneration;

  supabaseFake.auth.emit(
    'TOKEN_REFRESHED',
    makeFakeSession({ access_token: 'rotated', user: makeFakeUser({ id: 'user-a' }) })
  );

  assert.equal(useAuthStore.getState().authGeneration, generation);
  assert.equal(useAuthStore.getState().session?.access_token, 'rotated');
});

test('a SIGNED_OUT event signs the app out and bumps the auth generation', async () => {
  await useAuthStore.getState().initialize();
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));
  seedPerUserData();

  supabaseFake.auth.emit('SIGNED_OUT', null);

  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(perUserDataIsCleared(), true);
  assert.equal(useAuthStore.getState().authGeneration, 2);
});

test('an event that carries a session without a user is treated as a sign-out', async () => {
  await useAuthStore.getState().initialize();
  useAuthStore.getState().setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));

  supabaseFake.auth.emit('USER_UPDATED', { access_token: 'orphan' } as never);

  assert.equal(useAuthStore.getState().isAuthenticated, false);
  assert.equal(useAuthStore.getState().session, null);
});
