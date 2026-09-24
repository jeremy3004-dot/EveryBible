import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  createSupabaseFake,
  makeFakeUser,
  type SupabaseFakeResult,
  type SupabaseQueryCall,
} from '../../testing/supabaseFake';
import {
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../../constants/appearancePalettes';
import {
  checkAdmits,
  readRepoMigrations,
  replayTableMigrations,
} from '../../testing/migrationSchema';
import { STALE_SYNC_ERROR } from './syncIdentity';
import type { PreferenceFieldStamps, UserPreferences } from '../../types';
import type {
  UserPreferences as RemoteUserPreferences,
  UserProgress as RemoteUserProgress,
} from '../supabase/types';
import type * as SyncService from './syncService';

const realSetTimeout = setTimeout;

const USER_A = 'user-a';
const USER_B = 'user-b';

const LOCAL_PREFERENCES: UserPreferences = {
  fontSize: 'medium',
  theme: 'light',
  appearancePalette: DEFAULT_APPEARANCE_PALETTE,
  language: 'en',
  countryCode: null,
  countryName: null,
  contentLanguageCode: null,
  contentLanguageName: null,
  contentLanguageNativeName: null,
  chapterFeedbackName: null,
  chapterFeedbackRole: null,
  onboardingCompleted: true,
  chapterFeedbackEnabled: false,
  hidePlayButtonFromReadingTab: false,
  notificationsEnabled: false,
  reminderTime: null,
};

// ---------------------------------------------------------------------------
// Local test doubles. The real stores are another engineer's scope; these are
// the smallest getState/setState shapes syncService actually reads and writes,
// so a test can pin the local snapshot exactly and observe every store write.
// ---------------------------------------------------------------------------

interface StoreStub<T extends object> {
  getState: () => T;
  setState: (partial: Partial<T>) => void;
}

const createStoreStub = <T extends object>(initial: T): StoreStub<T> => {
  let state = initial;
  return {
    getState: () => state,
    setState: (partial: Partial<T>) => {
      state = { ...state, ...partial };
    },
  };
};

interface AppliedPreferences {
  preferences: UserPreferences;
  updatedAt: string | null;
  base?: UserPreferences;
}
interface AppliedProgress {
  chaptersRead: Record<string, number>;
  streakDays: number;
  lastReadDate: string | null;
}
interface AppliedPosition {
  bookId: string;
  chapter: number;
}

const appliedPreferences: AppliedPreferences[] = [];
const appliedProgress: AppliedProgress[] = [];
const appliedPositions: AppliedPosition[] = [];

interface AuthStubState {
  user: { uid: string } | null;
  authGeneration: number;
  preferences: UserPreferences;
  preferencesUpdatedAt: string | null;
  preferencesSyncBase?: UserPreferences | null;
  preferenceFieldStamps?: PreferenceFieldStamps;
  applySyncedPreferences: (
    preferences: UserPreferences,
    updatedAt: string | null,
    base?: UserPreferences,
    fieldStamps?: PreferenceFieldStamps
  ) => void;
  markPreferencesSynced: (base: UserPreferences) => void;
}

interface ProgressStubState {
  chaptersRead: Record<string, number>;
  streakDays: number;
  lastReadDate: string | null;
  applySyncedProgress: (progress: AppliedProgress) => void;
}

interface BibleStubState {
  currentBook: string;
  currentChapter: number;
  applySyncedReadingPosition: (position: AppliedPosition) => void;
}

const authStore: StoreStub<AuthStubState> = createStoreStub<AuthStubState>({
  user: { uid: USER_A },
  authGeneration: 1,
  preferences: LOCAL_PREFERENCES,
  preferencesUpdatedAt: null,
  preferencesSyncBase: null,
  preferenceFieldStamps: {},
  applySyncedPreferences: (preferences, updatedAt, base, fieldStamps) => {
    appliedPreferences.push(base ? { preferences, updatedAt, base } : { preferences, updatedAt });
    authStore.setState({
      preferences,
      preferencesUpdatedAt: updatedAt,
      preferencesSyncBase: base ?? preferences,
      ...(fieldStamps ? { preferenceFieldStamps: fieldStamps } : {}),
    });
  },
  markPreferencesSynced: (base) => {
    authStore.setState({ preferencesSyncBase: base });
  },
});

const progressStore: StoreStub<ProgressStubState> = createStoreStub<ProgressStubState>({
  chaptersRead: {},
  streakDays: 0,
  lastReadDate: null,
  applySyncedProgress: (progress) => {
    appliedProgress.push(progress);
    progressStore.setState(progress);
  },
});

const bibleStore: StoreStub<BibleStubState> = createStoreStub<BibleStubState>({
  currentBook: 'GEN',
  currentChapter: 1,
  applySyncedReadingPosition: (position) => {
    appliedPositions.push(position);
    bibleStore.setState({ currentBook: position.bookId, currentChapter: position.chapter });
  },
});

const readingPlansStore = createStoreStub<{ progressByPlanId: Record<string, unknown> }>({
  progressByPlanId: {},
});

interface PlanSyncCall {
  progress: unknown[];
  userId: string;
  generation: number | undefined;
  identityUserId: string | undefined;
}
interface PlanPullCall {
  planId: string | undefined;
  userId: string | undefined;
  generation: number | undefined;
  identityUserId: string | undefined;
}
const planSyncCalls: PlanSyncCall[] = [];
const planPullCalls: PlanPullCall[] = [];
let syncPlanProgressResult: () => { success: boolean; error?: string } = () => ({ success: true });
let getUserPlanProgressResult: () => {
  success: boolean;
  error?: string;
  data?: unknown[];
} = () => ({
  success: true,
  data: [],
});

// ---------------------------------------------------------------------------
// Mocks (one configuration for the whole file; scenarios are driven by the
// mutable state above).
// ---------------------------------------------------------------------------

const supabaseFake = createSupabaseFake();
let backendConfigured = true;
/** Overrides what the auth server reports for the live session, if set. */
let resolveRemoteUserId: (() => Promise<string | null>) | null = null;

const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => backendConfigured,
  getCurrentUserId: async (): Promise<string | null> =>
    resolveRemoteUserId ? resolveRemoteUserId() : (authStore.getState().user?.uid ?? null),
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore: authStore });
mockModule(mock, sourcePath('stores/progressStore.ts'), { useProgressStore: progressStore });
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });
mockModule(mock, sourcePath('stores/readingPlansStore.ts'), { readingPlansStore });
mockModule(mock, sourcePath('services/plans/index.ts'), {
  syncPlanProgress: async (
    progress: unknown[],
    userId: string,
    generation: number | undefined,
    identity: { expectedUserId?: string } | undefined
  ) => {
    planSyncCalls.push({ progress, userId, generation, identityUserId: identity?.expectedUserId });
    return syncPlanProgressResult();
  },
  getUserPlanProgress: async (
    planId: string | undefined,
    userId: string | undefined,
    generation: number | undefined,
    identity: { expectedUserId?: string } | undefined
  ) => {
    planPullCalls.push({ planId, userId, generation, identityUserId: identity?.expectedUserId });
    return getUserPlanProgressResult();
  },
});

// ---------------------------------------------------------------------------
// Scripted Supabase responses. One default responder reads a mutable script so
// every test can answer per table and per operation, including with a function
// that mutates auth state mid-request to simulate an account switch.
// ---------------------------------------------------------------------------

type ScriptedResult = SupabaseFakeResult | (() => SupabaseFakeResult);
type TableScript = { select?: ScriptedResult; write?: ScriptedResult };
let script: Record<string, TableScript> = {};

const scriptedResponder = (call: SupabaseQueryCall): SupabaseFakeResult => {
  const entry = script[call.table]?.[call.operation === 'select' ? 'select' : 'write'];
  const result = typeof entry === 'function' ? entry() : entry;
  return result ?? { data: call.single || call.maybeSingle ? null : [], error: null };
};

const originalGetUser = supabaseFake.auth.handlers.getUser;

const remoteProgressRow = (overrides: Partial<RemoteUserProgress> = {}): RemoteUserProgress => ({
  id: 'progress-1',
  user_id: USER_A,
  chapters_read: { JHN_3: 1000 },
  streak_days: 4,
  last_read_date: '2026-09-01',
  current_book: 'JHN',
  current_chapter: 3,
  synced_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const remotePreferenceRow = (
  overrides: Partial<RemoteUserPreferences> = {}
): RemoteUserPreferences => ({
  id: 'prefs-1',
  user_id: USER_A,
  font_size: 'large',
  theme: 'dark',
  appearance_palette: 'ember',
  language: 'es',
  country_code: 'ES',
  country_name: 'Spain',
  content_language_code: 'es',
  content_language_name: 'Spanish',
  content_language_native_name: 'Español',
  chapter_feedback_name: 'Ana',
  chapter_feedback_role: 'translator',
  chapter_feedback_id_number: null,
  onboarding_completed: true,
  chapter_feedback_enabled: true,
  hide_play_button_from_reading_tab: true,
  notifications_enabled: true,
  reminder_time: '07:30',
  synced_at: '2026-09-05T00:00:00.000Z',
  ...overrides,
});

const PROGRESS_MERGE_RPC_TABLE = 'rpc:merge_user_progress';
// PostgREST's answer while migration 20260924041000 is not applied.
const MISSING_PROGRESS_MERGE_RPC: SupabaseFakeResult = {
  data: null,
  error: {
    code: 'PGRST202',
    message:
      'Could not find the function public.merge_user_progress(p_progress) in the schema cache',
  },
  status: 404,
};

const callsFor = (table: string, operation: SupabaseQueryCall['operation']) =>
  supabaseFake.callsFor(table).filter((call) => call.operation === operation);

const payloadOf = (table: string, index = 0): Record<string, unknown> =>
  callsFor(table, 'upsert')[index]?.payload as Record<string, unknown>;

/**
 * Runs an operation with `setTimeout` faked so the transient-retry backoff
 * (250-750ms of jittered sleep) costs no wall-clock time. The tick is larger
 * than the maximum jitter, so the random delay never makes this flaky.
 */
const withoutBackoffDelay = async <T>(start: () => Promise<T>): Promise<T> => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let settled = false;
    const running = start().finally(() => {
      settled = true;
    });
    for (let attempt = 0; attempt < 1000 && !settled; attempt += 1) {
      await new Promise((resolve) => realSetTimeout(resolve, 5));
      mock.timers.tick(1000);
    }
    assert.ok(settled, 'sync operation must settle while advancing retry timers');
    return await running;
  } finally {
    mock.timers.reset();
  }
};

let syncProgress: typeof SyncService.syncProgress;
let syncPreferences: typeof SyncService.syncPreferences;
let syncAll: typeof SyncService.syncAll;
let pullFromCloud: typeof SyncService.pullFromCloud;

before(async () => {
  ({ syncProgress, syncPreferences, syncAll, pullFromCloud } = await import('./syncService'));
});

beforeEach(() => {
  supabaseFake.reset();
  supabaseFake.setDefaultResponder(scriptedResponder);
  supabaseFake.auth.handlers.getUser = originalGetUser;
  supabaseFake.auth.setUser(
    makeFakeUser({ id: USER_A, email: 'reader@example.com', user_metadata: {} })
  );
  // Most scenarios below describe the merge rules and the write the client sends,
  // which are the same whichever way the row is written; they run against a
  // server without merge_user_progress, so the write is the plain upsert. The
  // merge RPC itself is covered in its own section.
  script = { [PROGRESS_MERGE_RPC_TABLE]: { write: MISSING_PROGRESS_MERGE_RPC } };
  backendConfigured = true;
  resolveRemoteUserId = null;
  authStore.setState({
    user: { uid: USER_A },
    authGeneration: 1,
    preferences: LOCAL_PREFERENCES,
    preferencesUpdatedAt: null,
    preferencesSyncBase: null,
    preferenceFieldStamps: {},
  });
  progressStore.setState({ chaptersRead: {}, streakDays: 0, lastReadDate: null });
  bibleStore.setState({ currentBook: 'GEN', currentChapter: 1 });
  readingPlansStore.setState({ progressByPlanId: {} });
  appliedPreferences.length = 0;
  appliedProgress.length = 0;
  appliedPositions.length = 0;
  planSyncCalls.length = 0;
  planPullCalls.length = 0;
  syncPlanProgressResult = () => ({ success: true });
  getUserPlanProgressResult = () => ({ success: true, data: [] });
});

// ---------------------------------------------------------------------------
// Unconfigured backend and signed-out readers
// ---------------------------------------------------------------------------

test('every sync entry point succeeds silently when Supabase is not configured', async () => {
  backendConfigured = false;

  assert.deepEqual(await syncProgress(), { success: true });
  assert.deepEqual(await syncPreferences(), { success: true });
  assert.deepEqual(await syncAll(), { success: true });
  assert.deepEqual(await pullFromCloud(), { success: true });
  assert.deepEqual(supabaseFake.calls, []);
});

test('a signed-out reader with no expected account is a no-op success, not an error', async () => {
  authStore.setState({ user: null });

  assert.deepEqual(await syncProgress(), { success: true });
  assert.deepEqual(await syncPreferences(), { success: true });
  assert.deepEqual(await syncAll(), { success: true });
  assert.deepEqual(supabaseFake.calls, []);
});

test('a sync asked for a specific account reports staleness when nobody is signed in', async () => {
  authStore.setState({ user: null });

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(await syncPreferences(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(await syncAll(USER_A), { success: false, error: STALE_SYNC_ERROR });
});

test('pullFromCloud reports staleness rather than success when nobody is signed in', async () => {
  authStore.setState({ user: null });

  assert.deepEqual(await pullFromCloud(), { success: false, error: STALE_SYNC_ERROR });
});

test('a sync for a different account than the one signed in never touches the backend', async () => {
  const result = await syncProgress(USER_B);

  assert.deepEqual(result, { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(supabaseFake.calls, []);
});

test('a local session the auth server no longer recognises is treated as stale', async () => {
  resolveRemoteUserId = async () => USER_B;

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(supabaseFake.calls, []);
});

test('a sign-out that lands between the local and the remote identity check aborts the sync', async () => {
  resolveRemoteUserId = async () => null;

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
});

test('an auth generation bump between capture and validation aborts the sync', async () => {
  resolveRemoteUserId = async () => {
    authStore.setState({ authGeneration: 9 });
    return USER_A;
  };

  assert.deepEqual(await syncProgress(USER_A, 1), { success: false, error: STALE_SYNC_ERROR });
});

test('a sync asked for an auth generation the session has already left never runs', async () => {
  // The caller captured generation 9 before a sign-out/sign-in reset it to 1.
  assert.deepEqual(await syncProgress(USER_A, 9), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(supabaseFake.calls, []);
});

// ---------------------------------------------------------------------------
// ensureCloudProfile
// ---------------------------------------------------------------------------

test('the first sync of a session upserts the profile row from the auth user without its email', async () => {
  supabaseFake.auth.setUser(
    makeFakeUser({
      id: USER_A,
      email: 'reader@example.com',
      user_metadata: { display_name: 'Reader One', avatar_url: 'https://cdn.test/a.png' },
    })
  );

  await syncProgress(USER_A);

  const { updated_at: updatedAt, ...profile } = payloadOf('profiles');
  // profiles.email is maintained from auth.users by a database trigger; the client never
  // writes it (audit 2026-09-24 L8).
  assert.deepEqual(profile, {
    id: USER_A,
    display_name: 'Reader One',
    avatar_url: 'https://cdn.test/a.png',
  });
  assert.ok(Number.isFinite(Date.parse(String(updatedAt))));
  assert.deepEqual(callsFor('profiles', 'upsert')[0]?.options, { onConflict: 'id' });
});

test('a profile with no display name falls back to full name, then to the email local part', async () => {
  supabaseFake.auth.setUser(
    makeFakeUser({ id: USER_A, email: 'x@y.test', user_metadata: { full_name: 'Full Name' } })
  );
  await syncProgress(USER_A);
  assert.equal(payloadOf('profiles').display_name, 'Full Name');

  supabaseFake.reset();
  supabaseFake.setDefaultResponder(scriptedResponder);
  supabaseFake.auth.setUser(makeFakeUser({ id: USER_A, email: 'x@y.test', user_metadata: {} }));
  await syncProgress(USER_A);
  assert.equal(payloadOf('profiles').display_name, 'x');
});

test('a profile for an account with no email at all stores nulls instead of throwing', async () => {
  supabaseFake.auth.setUser(
    makeFakeUser({ id: USER_A, email: undefined, user_metadata: {} } as never)
  );

  await syncProgress(USER_A);

  assert.equal('email' in payloadOf('profiles'), false);
  assert.equal(payloadOf('profiles').display_name, null);
  assert.equal(payloadOf('profiles').avatar_url, null);
});

test('an auth error while reading the user aborts before any write', async () => {
  // The fake types `error` as always null, so an auth-failure scenario needs a
  // cast to install the shape the real client returns.
  supabaseFake.auth.handlers.getUser = (async () => ({
    data: { user: null },
    error: { message: 'JWT expired' },
  })) as unknown as typeof supabaseFake.auth.handlers.getUser;

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: 'JWT expired' });
  assert.deepEqual(supabaseFake.calls, []);
});

test('an auth user that no longer matches the captured identity aborts before any write', async () => {
  supabaseFake.auth.setUser(makeFakeUser({ id: USER_B }));

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(supabaseFake.calls, []);
});

test('each standalone sync upserts the profile again, since only a cycle shares one', async () => {
  await syncProgress(USER_A);
  await syncPreferences(USER_A);

  assert.equal(callsFor('profiles', 'upsert').length, 2);
});

test('concurrent standalone syncs outside a cycle do not share one profile upsert', async () => {
  await Promise.all([syncProgress(USER_A), syncPreferences(USER_A)]);

  assert.equal(callsFor('profiles', 'upsert').length, 2);
});

test('a failing profile upsert stops the progress sync before it reads user_progress', async () => {
  script.profiles = { write: { error: { message: 'profiles RLS denied' } } };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: 'profiles RLS denied' });
  assert.deepEqual(callsFor('user_progress', 'select'), []);
});

// ---------------------------------------------------------------------------
// syncProgress
// ---------------------------------------------------------------------------

test('a fresh device adopts the cloud reading position and progress', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };

  const result = await syncProgress(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.deepEqual(appliedProgress, [
    { chaptersRead: { JHN_3: 1000 }, streakDays: 4, lastReadDate: '2026-09-01' },
  ]);
  assert.deepEqual(appliedPositions, [{ bookId: 'JHN', chapter: 3 }]);
});

test('a fresh device adopts cloud progress without writing identical content back', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };

  const result = await syncProgress(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.deepEqual(progressStore.getState().chaptersRead, { JHN_3: 1000 });
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('repeated unchanged progress syncs skip writes regardless of chapter key order', async () => {
  progressStore.setState({
    chaptersRead: { JHN_3: 1000, GEN_1: 500 },
    streakDays: 4,
    lastReadDate: '2026-09-01',
  });
  bibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  script.user_progress = {
    select: { data: remoteProgressRow({ chapters_read: { GEN_1: 500, JHN_3: 1000 } }) },
  };

  for (let cycle = 0; cycle < 3; cycle++) await syncProgress(USER_A);

  assert.equal(callsFor('user_progress', 'select').length, 3);
  assert.equal(callsFor('user_progress', 'upsert').length, 0);
});

test('a newer timestamp for an existing chapter is still uploaded', async () => {
  progressStore.setState({
    chaptersRead: { JHN_3: 2000 },
    streakDays: 4,
    lastReadDate: '2026-09-01',
  });
  bibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  script.user_progress = { select: { data: remoteProgressRow() } };

  await syncProgress(USER_A);

  assert.equal(callsFor('user_progress', 'upsert').length, 1);
  assert.deepEqual(payloadOf('user_progress').chapters_read, { JHN_3: 2000 });
});

test('a legacy null chapter map is repaired rather than failing the unchanged-content check', async () => {
  script.user_progress = {
    select: {
      data: remoteProgressRow({
        // The database column is nullable, despite the generated client interface.
        chapters_read: null as unknown as Record<string, number>,
        streak_days: 0,
        last_read_date: null,
        current_book: 'GEN',
        current_chapter: 1,
      }),
    },
  };

  const result = await syncProgress(USER_A);

  assert.equal(result.success, true);
  assert.deepEqual(payloadOf('user_progress').chapters_read, {});
});

test('a locally reset streak is uploaded even when chapters and position match', async () => {
  progressStore.setState({
    chaptersRead: { JHN_3: 1000 },
    streakDays: 0,
    lastReadDate: '2026-09-01',
  });
  bibleStore.setState({ currentBook: 'JHN', currentChapter: 3 });
  script.user_progress = { select: { data: remoteProgressRow() } };

  await syncProgress(USER_A);

  assert.equal(payloadOf('user_progress').streak_days, 0);
});

test('a device that has read more recently keeps its own position and pushes it up', async () => {
  progressStore.setState({
    chaptersRead: { ROM_8: 5000, JHN_3: 900 },
    streakDays: 9,
    lastReadDate: '2026-09-09',
  });
  bibleStore.setState({ currentBook: 'ROM', currentChapter: 8 });
  script.user_progress = {
    select: { data: remoteProgressRow({ chapters_read: { JHN_3: 900 }, streak_days: 2 }) },
  };

  const result = await syncProgress(USER_A);

  assert.deepEqual(result, { success: true, merged: false });
  assert.deepEqual(appliedProgress, []);
  assert.deepEqual(appliedPositions, []);
  assert.equal(payloadOf('user_progress').current_book, 'ROM');
  assert.equal(payloadOf('user_progress').streak_days, 9);
});

test('an account with no cloud progress row yet has its local state pushed up unchanged', async () => {
  progressStore.setState({
    chaptersRead: { GEN_1: 42 },
    streakDays: 1,
    lastReadDate: '2026-09-10',
  });
  script.user_progress = {
    select: { data: null, error: { message: 'no rows', code: 'PGRST116' } },
  };

  const result = await syncProgress(USER_A);

  assert.deepEqual(result, { success: true, merged: false });
  assert.deepEqual(payloadOf('user_progress').chapters_read, { GEN_1: 42 });
  assert.equal(payloadOf('user_progress').last_read_date, '2026-09-10');
  assert.deepEqual(appliedProgress, []);
});

test('a real fetch error on user_progress is reported and nothing is written', async () => {
  script.user_progress = {
    select: { data: null, error: { message: 'permission denied', code: '42501' } },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: 'permission denied' });
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('a failing progress upsert is reported after the local merge already happened', async () => {
  // A new local chapter makes an upload necessary after the cloud merge.
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = {
    select: { data: remoteProgressRow() },
    write: { error: { message: 'upsert conflict' } },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: 'upsert conflict' });
  assert.deepEqual(appliedPositions, [{ bookId: 'JHN', chapter: 3 }]);
});

test('an unexpected throw during the progress sync is reported as a message, not a crash', async () => {
  script.user_progress = {
    select: () => {
      throw new Error('socket hang up');
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: 'socket hang up' });
});

test('a non-Error thrown during the progress sync is reported as an unknown error', async () => {
  script.user_progress = {
    select: () => {
      throw 'not an error object';
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: 'Unknown error' });
});

test('an account switch while the cloud row is in flight discards the merge', async () => {
  script.user_progress = {
    select: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: remoteProgressRow() };
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(appliedProgress, []);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('a re-authentication as the same uid while the cloud row is in flight discards the merge', async () => {
  script.user_progress = {
    select: () => {
      authStore.setState({ authGeneration: 2 });
      return { data: remoteProgressRow() };
    },
  };

  assert.deepEqual(await syncProgress(USER_A, 1), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(appliedPositions, []);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('an account switch between the merge and the write discards the write', async () => {
  let firstRead = true;
  script.user_progress = {
    select: () => {
      if (firstRead) {
        firstRead = false;
        // Flip identity only after the merge has been committed locally.
        queueMicrotask(() => authStore.setState({ user: { uid: USER_B } }));
      }
      return { data: remoteProgressRow() };
    },
  };

  const result = await syncProgress(USER_A);

  assert.equal(result.success, false);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('syncProgress without an expected account uses the currently signed-in reader', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };

  const result = await syncProgress();

  assert.deepEqual(result, { success: true, merged: true });
  assert.deepEqual(
    callsFor('user_progress', 'select')[0]?.steps.find((step) => step.method === 'eq')?.args,
    ['user_id', USER_A]
  );
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

// ---------------------------------------------------------------------------
// syncProgress through merge_user_progress (finding 12)
// ---------------------------------------------------------------------------

const progressMergeCalls = () => callsFor(PROGRESS_MERGE_RPC_TABLE, 'rpc');
const progressMergePayload = (index = 0): Record<string, unknown> =>
  (progressMergeCalls()[index]?.payload as { p_progress: Record<string, unknown> }).p_progress;

test('a progress push goes through the server-side merge instead of overwriting the row', async () => {
  progressStore.setState({
    chaptersRead: { ROM_8: 5000, JHN_3: 900 },
    streakDays: 9,
    lastReadDate: '2026-09-09',
  });
  bibleStore.setState({ currentBook: 'ROM', currentChapter: 8 });
  script.user_progress = {
    select: { data: remoteProgressRow({ chapters_read: { JHN_3: 900 }, streak_days: 2 }) },
  };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: {
      data: remoteProgressRow({
        chapters_read: { ROM_8: 5000, JHN_3: 900 },
        streak_days: 9,
        last_read_date: '2026-09-09',
        current_book: 'ROM',
        current_chapter: 8,
      }),
    },
  };

  const result = await syncProgress(USER_A);

  assert.deepEqual(result, { success: true, merged: false });
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
  assert.equal(progressMergeCalls().length, 1);
  assert.equal(progressMergeCalls()[0]?.single, true);
  const { synced_at: syncedAt, ...payload } = progressMergePayload();
  assert.deepEqual(payload, {
    user_id: USER_A,
    chapters_read: { ROM_8: 5000, JHN_3: 900 },
    streak_days: 9,
    last_read_date: '2026-09-09',
    current_book: 'ROM',
    current_chapter: 8,
  });
  assert.ok(Number.isFinite(Date.parse(String(syncedAt))));
  assert.deepEqual(appliedProgress, []);
});

test('chapters another device merged in at the same moment come back from the push', async () => {
  // Both phones read {JHN_3}; the other phone's GEN_1 reached the server first.
  progressStore.setState({ chaptersRead: { JHN_3: 1000, ROM_8: 5000 } });
  bibleStore.setState({ currentBook: 'ROM', currentChapter: 8 });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: {
      data: remoteProgressRow({
        chapters_read: { JHN_3: 1000, ROM_8: 5000, GEN_1: 7000 },
        current_book: 'ROM',
        current_chapter: 8,
      }),
    },
  };

  const result = await syncProgress(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.deepEqual(progressMergePayload().chapters_read, { JHN_3: 1000, ROM_8: 5000 });
  assert.deepEqual(progressStore.getState().chaptersRead, {
    JHN_3: 1000,
    ROM_8: 5000,
    GEN_1: 7000,
  });
});

for (const [name, missing] of [
  ['PGRST202', { error: { code: 'PGRST202', message: 'function not found' } }],
  ['Postgres 42883', { error: { code: '42883', message: 'function does not exist' } }],
  ['HTTP 404', { error: { message: 'Not Found' }, status: 404 }],
] as const) {
  test(`a server without the merge function (${name}) gets the plain upsert instead`, async () => {
    progressStore.setState({ chaptersRead: { GEN_1: 500 } });
    script.user_progress = { select: { data: remoteProgressRow() } };
    script[PROGRESS_MERGE_RPC_TABLE] = { write: { data: null, ...missing } };

    const result = await syncProgress(USER_A);

    assert.equal(result.success, true);
    assert.equal(progressMergeCalls().length, 1);
    assert.equal(callsFor('user_progress', 'upsert').length, 1);
    assert.deepEqual(payloadOf('user_progress'), progressMergePayload());
    assert.deepEqual(callsFor('user_progress', 'upsert')[0]?.options, { onConflict: 'user_id' });
  });
}

test('a merge the server refuses is a failed push, never a blind upsert', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: { data: null, error: { code: '22023', message: 'chapters_read must be an object' } },
  };

  assert.deepEqual(await syncProgress(USER_A), {
    success: false,
    error: 'chapters_read must be an object',
  });
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

// The server refuses a payload naming another account with 42501 (migration
// 20260924051658): the session switched accounts while the push was in flight.
// That push belongs to nobody now; it is dropped, never retried as an upsert.
test('a merge refused as another account (42501) drops the push and reports the sync as stale', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: {
      data: null,
      error: { code: '42501', message: 'p_progress is progress for another account' },
      status: 403,
    },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A));

  assert.equal(result.success, false);
  assert.equal(progressMergeCalls().length, 1, 'not retried');
  assert.equal(progressMergePayload().user_id, USER_A);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('syncProgress reports a merge refused as another account as a stale sync', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: {
      data: null,
      error: { code: '42501', message: 'p_progress is progress for another account' },
      status: 403,
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('a merge that stores the row but returns nothing keeps the local state as pushed', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = { write: { data: null } };

  const result = await syncProgress(USER_A);

  assert.equal(result.success, true);
  assert.equal(progressMergeCalls().length, 1);
  assert.equal(progressStore.getState().chaptersRead.GEN_1, 500);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('an account switch while an empty merge reply is in flight reports the sync as stale', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: null };
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
});

test('an account switch before the fallback upsert of a server without the merge function skips it', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('a transient merge failure is retried by syncAll through the merge again', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  let attempts = 0;
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: () =>
      ++attempts === 1
        ? { data: null, error: { message: 'fetch failed' } }
        : { data: remoteProgressRow({ chapters_read: { GEN_1: 500, JHN_3: 1000 } }) },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A));

  assert.equal(result.success, true);
  assert.equal(progressMergeCalls().length, 2);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
});

test('an account switch while the merge is in flight leaves the returned row unapplied', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 500 } });
  script.user_progress = { select: { data: remoteProgressRow() } };
  script[PROGRESS_MERGE_RPC_TABLE] = {
    write: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: remoteProgressRow({ chapters_read: { GEN_1: 500, MAT_5: 9000 } }) };
    },
  };

  assert.deepEqual(await syncProgress(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.equal(progressStore.getState().chaptersRead.MAT_5, undefined);
});

// ---------------------------------------------------------------------------
// syncPreferences
// ---------------------------------------------------------------------------

test('a device with no local preference stamp adopts the cloud preferences', async () => {
  script.user_preferences = { select: { data: remotePreferenceRow() } };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.equal(appliedPreferences.length, 1);
  assert.equal(appliedPreferences[0]?.updatedAt, '2026-09-05T00:00:00.000Z');
  assert.equal(appliedPreferences[0]?.preferences.fontSize, 'large');
  assert.equal(appliedPreferences[0]?.preferences.language, 'es');
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

// The `merged` flag is what useSync reports upward as "this cycle brought
// something down", so its false case has to be pinned too: with only the
// merged-true cases covered, hard-coding `merged: true` on the remote branch
// passed the whole suite.
test('a cloud row that matches the local preferences exactly reports nothing merged', async () => {
  script.user_preferences = {
    select: {
      data: remotePreferenceRow({
        font_size: 'medium',
        theme: 'light',
        appearance_palette: DEFAULT_APPEARANCE_PALETTE,
        language: 'en',
        country_code: null,
        country_name: null,
        content_language_code: null,
        content_language_name: null,
        content_language_native_name: null,
        chapter_feedback_name: null,
        chapter_feedback_role: null,
        onboarding_completed: true,
        chapter_feedback_enabled: false,
        hide_play_button_from_reading_tab: false,
        notifications_enabled: false,
        reminder_time: null,
        // An unstamped row: the remote branch is taken because the device has no
        // local stamp either, so both the values and the stamp are unchanged.
        // The generated row type says `synced_at: string`, but the column is
        // nullable in practice and mergePreferences reads it as `?? null`.
        synced_at: undefined,
      }),
    },
  };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: false });
  assert.deepEqual(authStore.getState().preferences, LOCAL_PREFERENCES);
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

// Sibling of the case above: same unstamped row, but the values differ. Only
// the value comparison can report this one as merged, so this pins the
// `changed` half of the flag that the stamp comparison would otherwise hide.
test('an unstamped cloud row whose values differ is adopted and reported as merged', async () => {
  script.user_preferences = {
    select: { data: remotePreferenceRow({ synced_at: undefined }) },
  };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.equal(authStore.getState().preferences.fontSize, 'large');
  assert.equal(authStore.getState().preferencesUpdatedAt, null);
});

test('a retired accent palette from an old row is normalised before it reaches the app', async () => {
  script.user_preferences = {
    select: { data: remotePreferenceRow({ appearance_palette: 'ember' }) },
  };

  await syncPreferences(USER_A);

  assert.equal(appliedPreferences[0]?.preferences.appearancePalette, DEFAULT_APPEARANCE_PALETTE);
});

test('a newer cloud stamp wins over an older local stamp', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-01T00:00:00.000Z' });
  script.user_preferences = { select: { data: remotePreferenceRow() } };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.equal(authStore.getState().preferences.fontSize, 'large');
});

test('a newer local stamp pushes every preference column up to the cloud', async () => {
  authStore.setState({
    preferencesUpdatedAt: '2026-09-09T00:00:00.000Z',
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'small', reminderTime: '06:00' },
  });
  script.user_preferences = { select: { data: remotePreferenceRow() } };

  const result = await syncPreferences(USER_A);

  const { synced_at: syncedAt, ...row } = payloadOf('user_preferences');
  assert.deepEqual(row, {
    user_id: USER_A,
    font_size: 'small',
    theme: 'light',
    appearance_palette: DEFAULT_APPEARANCE_PALETTE,
    language: 'en',
    country_code: null,
    country_name: null,
    content_language_code: null,
    content_language_name: null,
    content_language_native_name: null,
    chapter_feedback_name: null,
    chapter_feedback_role: null,
    onboarding_completed: true,
    chapter_feedback_enabled: false,
    hide_play_button_from_reading_tab: false,
    notifications_enabled: false,
    reminder_time: '06:00',
  });
  assert.equal(result.success, true);
  assert.deepEqual(callsFor('user_preferences', 'upsert')[0]?.options, { onConflict: 'user_id' });
  assert.equal(appliedPreferences[0]?.updatedAt, syncedAt);
});

test('an account with no cloud preference row keeps its local preferences and pushes them up', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  script.user_preferences = {
    select: { data: null, error: { message: 'no rows', code: 'PGRST116' } },
  };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.equal(payloadOf('user_preferences').font_size, 'medium');
  assert.equal(appliedPreferences.length, 1);
});

test('a cloud row that would reopen onboarding is refused and the local state is pushed instead', async () => {
  script.user_preferences = {
    select: { data: remotePreferenceRow({ onboarding_completed: false }) },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(payloadOf('user_preferences').onboarding_completed, true);
  assert.equal(appliedPreferences[0]?.preferences.onboardingCompleted, true);
});

test('a preference edit made while the upsert is in flight is not overwritten by the sync stamp', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  script.user_preferences = {
    select: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    write: () => {
      authStore.setState({
        preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
        preferencesUpdatedAt: '2026-09-09T00:00:05.000Z',
      });
      return { error: null };
    },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.deepEqual(appliedPreferences, []);
  assert.equal(authStore.getState().preferences.fontSize, 'large');
});

test('a failing profile upsert stops the preference sync before it reads user_preferences', async () => {
  script.profiles = { write: { error: { message: 'profiles RLS denied' } } };

  assert.deepEqual(await syncPreferences(USER_A), { success: false, error: 'profiles RLS denied' });
  assert.deepEqual(callsFor('user_preferences', 'select'), []);
});

test('a real fetch error on user_preferences is reported and nothing is written', async () => {
  script.user_preferences = {
    select: { data: null, error: { message: 'preferences unavailable', code: '42501' } },
  };

  assert.deepEqual(await syncPreferences(USER_A), {
    success: false,
    error: 'preferences unavailable',
  });
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

test('a failing preference upsert is reported and the local stamp is left alone', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  script.user_preferences = { write: { error: { message: 'preferences write failed' } } };

  assert.deepEqual(await syncPreferences(USER_A), {
    success: false,
    error: 'preferences write failed',
  });
  assert.deepEqual(appliedPreferences, []);
  assert.equal(authStore.getState().preferencesUpdatedAt, '2026-09-09T00:00:00.000Z');
});

test('an unexpected throw during the preference sync is reported as a message', async () => {
  script.user_preferences = {
    select: () => {
      throw new Error('fetch failed');
    },
  };

  assert.deepEqual(await syncPreferences(USER_A), { success: false, error: 'fetch failed' });
});

test('a non-Error thrown during the preference sync is reported as an unknown error', async () => {
  script.user_preferences = {
    select: () => {
      throw 'nope';
    },
  };

  assert.deepEqual(await syncPreferences(USER_A), { success: false, error: 'Unknown error' });
});

test('an account switch while the preference row is in flight discards the merge', async () => {
  script.user_preferences = {
    select: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: remotePreferenceRow() };
    },
  };

  assert.deepEqual(await syncPreferences(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(appliedPreferences, []);
});

test('an account switch between the preference merge and its write discards the write', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  script.user_preferences = {
    select: () => {
      queueMicrotask(() => authStore.setState({ user: { uid: USER_B } }));
      return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, false);
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

test('one syncAll cycle runs progress, reading plans and preferences against a single profile upsert', async () => {
  readingPlansStore.setState({ progressByPlanId: { 'plan-1': { completed: 3 } } });

  const result = await syncAll(USER_A, 1);

  assert.deepEqual(result, { success: true, error: undefined, merged: true });
  assert.equal(callsFor('profiles', 'upsert').length, 1);
  assert.equal(callsFor('user_progress', 'upsert').length, 1);
  assert.equal(callsFor('user_preferences', 'upsert').length, 1);
  assert.deepEqual(planSyncCalls, [
    {
      progress: [{ completed: 3 }],
      userId: USER_A,
      generation: 1,
      identityUserId: USER_A,
    },
  ]);
});

test('syncAll reports merged when any one branch merged something', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };

  const result = await syncAll(USER_A, 1);

  assert.deepEqual(result, { success: true, error: undefined, merged: true });
  assert.deepEqual(appliedPositions, [{ bookId: 'JHN', chapter: 3 }]);
});

test('syncAll surfaces the first failing branch and still runs the others', async () => {
  script.user_progress = {
    select: { data: null, error: { message: 'progress denied', code: '42501' } },
  };

  const result = await syncAll(USER_A, 1);

  assert.equal(result.success, false);
  assert.equal(result.error, 'progress denied');
  assert.equal(planSyncCalls.length, 1);
  assert.equal(callsFor('user_preferences', 'upsert').length, 1);
});

test('a failing reading-plan push fails the cycle without stopping the other branches', async () => {
  syncPlanProgressResult = () => ({ success: false, error: 'plan push rejected' });

  const result = await syncAll(USER_A, 1);

  assert.deepEqual(result, { success: false, error: 'plan push rejected', merged: true });
  assert.equal(callsFor('user_progress', 'upsert').length, 1);
});

test('an account switch while the plans module loads stops the reading-plan push', async () => {
  readingPlansStore.setState({ progressByPlanId: { 'plan-1': { completed: 3 } } });
  script.profiles = {
    write: () => {
      // Lands after the profile write is accepted but before the lazily
      // imported plans module is ready.
      queueMicrotask(() => authStore.setState({ user: { uid: USER_B } }));
      return { error: null };
    },
  };

  const result = await syncAll(USER_A, 1);

  assert.deepEqual(result, { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(planSyncCalls, []);
});

test('a reading-plan branch that throws is normalised into a failed result', async () => {
  syncPlanProgressResult = () => {
    throw new Error('plans module exploded');
  };

  const result = await syncAll(USER_A, 1);

  assert.equal(result.success, false);
  assert.equal(result.error, 'plans module exploded');
});

test('a transient network failure is retried once and the cycle then succeeds', async () => {
  let attempts = 0;
  script.user_progress = {
    write: () => {
      attempts += 1;
      return attempts === 1 ? { error: { message: 'network timeout' } } : { error: null };
    },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A, 1));

  assert.equal(result.success, true);
  assert.equal(attempts, 2);
});

test('a permission failure is not retried, so a real error is never masked by a retry', async () => {
  let attempts = 0;
  script.user_progress = {
    write: () => {
      attempts += 1;
      return { error: { message: 'permission denied for table user_progress' } };
    },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A, 1));

  assert.equal(result.success, false);
  assert.equal(attempts, 1);
});

test('a transient failure that persists through the retry is reported', async () => {
  script.user_progress = { write: { error: { message: 'fetch failed' } } };

  const result = await withoutBackoffDelay(() => syncAll(USER_A, 1));

  assert.deepEqual(result, { success: false, error: 'fetch failed', merged: true });
  assert.equal(callsFor('user_progress', 'upsert').length, 2);
});

test('an upstream 503 is treated as transient, so the cycle retries and recovers', async () => {
  let attempts = 0;
  script.user_progress = {
    write: () => {
      attempts += 1;
      return attempts === 1 ? { error: { message: 'upstream returned 503' } } : { error: null };
    },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A, 1));

  assert.equal(result.success, true);
  assert.equal(attempts, 2);
});

test('a transient profile failure is retried rather than remembered as the cycle answer', async () => {
  // The cycle memo must be evicted on failure, otherwise every branch's retry
  // would be handed the same cached rejection and the whole cycle would fail.
  let attempts = 0;
  script.profiles = {
    write: () => {
      attempts += 1;
      return attempts === 1 ? { error: { message: 'fetch failed' } } : { error: null };
    },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A, 1));

  assert.equal(result.success, true);
  assert.ok(attempts >= 2, `expected the profile upsert to be retried, saw ${attempts} attempt(s)`);
  assert.equal(callsFor('user_progress', 'upsert').length, 1);
  assert.equal(callsFor('user_preferences', 'upsert').length, 1);
  assert.equal(planSyncCalls.length, 1);
});

test('a non-transient profile failure fails every branch of the cycle without a retry', async () => {
  let attempts = 0;
  script.profiles = {
    write: () => {
      attempts += 1;
      return { error: { message: 'profiles RLS denied' } };
    },
  };

  const result = await withoutBackoffDelay(() => syncAll(USER_A, 1));

  assert.deepEqual(result, { success: false, error: 'profiles RLS denied', merged: false });
  assert.equal(attempts, 1);
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
  assert.deepEqual(planSyncCalls, []);
});

test('an account switch during the cycle turns a finished cycle into a stale result', async () => {
  script.user_preferences = {
    select: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    },
  };

  const result = await syncAll(USER_A, 1);

  assert.deepEqual(result, { success: false, error: STALE_SYNC_ERROR });
});

test('two concurrent syncAll cycles for one account serialise their progress writes', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  script.user_progress = {
    select: () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    },
    write: () => {
      inFlight -= 1;
      return { error: null };
    },
  };

  const [first, second] = await Promise.all([syncAll(USER_A, 1), syncAll(USER_A, 1)]);

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(maxInFlight, 1);
});

test('concurrent syncAll cycles for one account share a single profile upsert', async () => {
  await Promise.all([syncAll(USER_A, 1), syncAll(USER_A, 1)]);

  assert.equal(callsFor('profiles', 'upsert').length, 1);
});

test('three overlapping cycles for one account still share a single profile upsert', async () => {
  const results = await Promise.all([syncAll(USER_A, 1), syncAll(USER_A, 1), syncAll(USER_A, 1)]);

  assert.deepEqual(
    results.map((result) => result.success),
    [true, true, true]
  );
  assert.equal(callsFor('profiles', 'upsert').length, 1);
});

test('a later syncAll after the cycle has drained upserts the profile again', async () => {
  await syncAll(USER_A, 1);
  await syncAll(USER_A, 1);

  assert.equal(callsFor('profiles', 'upsert').length, 2);
});

// ---------------------------------------------------------------------------
// pullFromCloud
// ---------------------------------------------------------------------------

test('pullFromCloud applies cloud progress, preferences and reading plans', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };
  script.user_preferences = { select: { data: remotePreferenceRow() } };
  getUserPlanProgressResult = () => ({ success: true, data: [{ planId: 'plan-1' }] });

  const result = await pullFromCloud(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.deepEqual(appliedPositions, [{ bookId: 'JHN', chapter: 3 }]);
  assert.equal(appliedPreferences[0]?.preferences.language, 'es');
  assert.deepEqual(planPullCalls, [
    { planId: undefined, userId: USER_A, generation: 1, identityUserId: USER_A },
  ]);
});

test('pullFromCloud never writes anything back to the cloud', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };
  script.user_preferences = { select: { data: remotePreferenceRow() } };

  await pullFromCloud(USER_A);

  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

// QUESTION for the lead (raised with commit 133c6321, still open): pullFromCloud
// hard-codes `merged: true` on every success, including this one where nothing
// came down at all. Because of that, `pullReadingPlansFromCloud`'s own
// `merged: Boolean(result.data?.length)` is discarded at the call site and
// cannot be observed through any exported function — replacing it with a
// constant `false` leaves the whole suite green. Both are documented here rather
// than changed; if `merged` is meant to mean "something arrived", pullFromCloud
// should be computing it from the branches instead of asserting it.
test('pullFromCloud on an account with no cloud rows leaves the local stores untouched', async () => {
  const result = await pullFromCloud(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.deepEqual(appliedProgress, []);
  assert.deepEqual(appliedPreferences, []);
});

test('pullFromCloud reports a progress fetch error and stops before preferences', async () => {
  script.user_progress = {
    select: { data: null, error: { message: 'progress unreadable', code: '42501' } },
  };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: 'progress unreadable' });
  assert.deepEqual(callsFor('user_preferences', 'select'), []);
});

test('pullFromCloud reports a preferences fetch error and stops before reading plans', async () => {
  script.user_preferences = {
    select: { data: null, error: { message: 'preferences unreadable', code: '42501' } },
  };

  assert.deepEqual(await pullFromCloud(USER_A), {
    success: false,
    error: 'preferences unreadable',
  });
  assert.deepEqual(planPullCalls, []);
});

test('pullFromCloud reports a failing reading-plan pull', async () => {
  getUserPlanProgressResult = () => ({ success: false, error: 'plans unreachable' });

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: 'plans unreachable' });
});

test('pullFromCloud stops when the profile upsert fails', async () => {
  script.profiles = { write: { error: { message: 'profile write failed' } } };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: 'profile write failed' });
  assert.deepEqual(callsFor('user_progress', 'select'), []);
});

test('an account switch while pulling progress discards everything that followed', async () => {
  script.user_progress = {
    select: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: remoteProgressRow() };
    },
  };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(appliedProgress, []);
  assert.deepEqual(planPullCalls, []);
});

test('an account switch while pulling preferences discards the preference merge', async () => {
  script.user_preferences = {
    select: () => {
      authStore.setState({ user: { uid: USER_B } });
      return { data: remotePreferenceRow() };
    },
  };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: STALE_SYNC_ERROR });
  assert.deepEqual(appliedPreferences, []);
});

test('an account switch while the reading plans are pulled discards the pull', async () => {
  getUserPlanProgressResult = () => {
    authStore.setState({ user: { uid: USER_B } });
    return { success: true, data: [{ planId: 'plan-1' }] };
  };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: STALE_SYNC_ERROR });
});

test('an unexpected throw during a pull is reported as a message', async () => {
  script.user_progress = {
    select: () => {
      throw new Error('connection reset');
    },
  };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: 'connection reset' });
});

test('a non-Error thrown during a pull is reported as an unknown error', async () => {
  script.user_preferences = {
    select: () => {
      throw 'boom';
    },
  };

  assert.deepEqual(await pullFromCloud(USER_A), { success: false, error: 'Unknown error' });
});

test('pullFromCloud without an expected account pulls for the signed-in reader', async () => {
  script.user_progress = { select: { data: remoteProgressRow() } };

  const result = await pullFromCloud();

  assert.equal(result.success, true);
  assert.equal(callsFor('user_progress', 'select')[0]?.steps[1]?.args[1], USER_A);
});

// ---------------------------------------------------------------------------
// In-flight local edits and the per-account write queue
// (ported from syncService.races.test.ts and syncServiceSource.test.ts)
// ---------------------------------------------------------------------------

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** Drains the microtask queue enough times for every queued sync to settle in. */
const drain = async (rounds = 20) => {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const NO_ROWS = { data: null, error: { code: 'PGRST116', message: 'no rows' } };

test('a preference edit made while the cloud row is read is the one pushed to the cloud', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  supabaseFake.respondTo('user_preferences', async (call) => {
    if (call.operation !== 'select') {
      return { error: null };
    }
    authStore.setState({
      preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
      preferencesUpdatedAt: '2026-09-09T00:00:05.000Z',
    });
    return NO_ROWS;
  });

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(payloadOf('user_preferences').font_size, 'large');
  assert.equal(authStore.getState().preferences.fontSize, 'large');
});

test('a chapter finished while the cloud progress row is read is merged into the push', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 100 } });
  supabaseFake.respondTo('user_progress', async (call) => {
    if (call.operation !== 'select') {
      return { error: null };
    }
    progressStore.setState({
      chaptersRead: { ...progressStore.getState().chaptersRead, GEN_2: 300 },
    });
    return { data: remoteProgressRow({ chapters_read: { MAT_1: 200 } }), error: null };
  });

  const result = await syncProgress(USER_A);

  assert.equal(result.success, true);
  assert.deepEqual(payloadOf('user_progress').chapters_read, {
    GEN_1: 100,
    GEN_2: 300,
    MAT_1: 200,
  });
  assert.deepEqual(progressStore.getState().chaptersRead, {
    GEN_1: 100,
    GEN_2: 300,
    MAT_1: 200,
  });
});

test('preference syncs queued behind an active write collapse into one follow-up carrying the newest edit', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  const release = createDeferred();
  const started = createDeferred();
  let writes = 0;
  supabaseFake.respondTo('user_preferences', async (call) => {
    if (call.operation !== 'upsert') {
      return NO_ROWS;
    }
    writes += 1;
    if (writes === 1) {
      started.resolve();
      await release.promise;
    }
    return { error: null };
  });

  const initial = syncPreferences(USER_A);
  await started.promise;
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-09T00:00:05.000Z',
  });
  const followups = Array.from({ length: 10 }, () => syncPreferences(USER_A));
  await drain();

  assert.equal(writes, 1, 'a newer sync must wait for the active write');
  release.resolve();
  const results = await Promise.all([initial, ...followups]);

  assert.equal(
    results.every((result) => result.success),
    true
  );
  assert.equal(writes, 2, 'ten queued requests need only one follow-up write');
  assert.equal(payloadOf('user_preferences', 1).font_size, 'large');
});

test('a failing active preference write does not poison the queued follow-up or a later sync', async () => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  const release = createDeferred();
  const started = createDeferred();
  let writes = 0;
  supabaseFake.respondTo('user_preferences', async (call) => {
    if (call.operation !== 'upsert') {
      return NO_ROWS;
    }
    writes += 1;
    if (writes === 1) {
      started.resolve();
      await release.promise;
      throw new Error('offline');
    }
    return { error: null };
  });

  const first = syncPreferences(USER_A);
  await started.promise;
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-09T00:00:05.000Z',
  });
  const queued = syncPreferences(USER_A);
  await drain();
  release.resolve();

  assert.equal((await first).success, false);
  assert.equal((await queued).success, true);
  assert.equal((await syncPreferences(USER_A)).success, true);
  assert.equal(writes, 3);
  assert.equal(payloadOf('user_preferences', 1).font_size, 'large');
});

test('a progress follow-up pushes the chapters finished while the active write was in flight', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 100 } });
  const release = createDeferred();
  const started = createDeferred();
  let writes = 0;
  supabaseFake.respondTo('user_progress', async (call) => {
    if (call.operation !== 'upsert') {
      return NO_ROWS;
    }
    writes += 1;
    if (writes === 1) {
      started.resolve();
      await release.promise;
    }
    return { error: null };
  });

  const first = syncProgress(USER_A);
  await started.promise;
  progressStore.setState({ chaptersRead: { GEN_1: 100, GEN_2: 300 } });
  bibleStore.setState({ currentChapter: 2 });
  const queued = syncProgress(USER_A);
  await drain();

  assert.equal(writes, 1);
  release.resolve();
  await Promise.all([first, queued]);

  assert.equal(writes, 2);
  assert.deepEqual(payloadOf('user_progress', 1).chapters_read, { GEN_1: 100, GEN_2: 300 });
  assert.equal(payloadOf('user_progress', 1).current_chapter, 2);
});

test('a preference sync queued behind an account switch neither applies nor uploads', async () => {
  const release = createDeferred();
  const started = createDeferred();
  supabaseFake.respondTo('user_preferences', async (call) => {
    if (call.operation !== 'select') {
      return { error: null };
    }
    started.resolve();
    await release.promise;
    return NO_ROWS;
  });

  const first = syncPreferences(USER_A);
  await started.promise;
  const queued = syncPreferences(USER_A);
  await drain();
  authStore.setState({ user: { uid: USER_B }, authGeneration: 2 });
  supabaseFake.auth.setUser(makeFakeUser({ id: USER_B, user_metadata: {} }));
  release.resolve();

  const results = await Promise.all([first, queued]);

  assert.deepEqual(
    results.map((result) => result.success),
    [false, false]
  );
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
  assert.deepEqual(appliedPreferences, []);
});

test('a pull keeps the chapters and preferences edited while the cloud rows were read', async () => {
  progressStore.setState({ chaptersRead: { GEN_1: 100 } });
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z' });
  supabaseFake.respondTo('user_progress', async () => {
    progressStore.setState({
      chaptersRead: { ...progressStore.getState().chaptersRead, GEN_2: 300 },
    });
    return { data: remoteProgressRow({ chapters_read: { MAT_1: 200 } }), error: null };
  });
  supabaseFake.respondTo('user_preferences', async () => {
    authStore.setState({
      preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
      preferencesUpdatedAt: '2099-01-01T00:00:00.000Z',
    });
    return { data: remotePreferenceRow(), error: null };
  });

  const result = await pullFromCloud(USER_A);

  assert.equal(result.success, true);
  assert.deepEqual(progressStore.getState().chaptersRead, {
    GEN_1: 100,
    GEN_2: 300,
    MAT_1: 200,
  });
  assert.equal(authStore.getState().preferences.fontSize, 'large');
  assert.deepEqual(callsFor('user_progress', 'upsert'), []);
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

test('one syncAll cycle asks the auth server to confirm the account exactly once', async () => {
  let remoteChecks = 0;
  resolveRemoteUserId = async () => {
    remoteChecks += 1;
    return USER_A;
  };

  const result = await syncAll(USER_A, 1);

  assert.equal(result.success, true);
  assert.equal(remoteChecks, 1, 'continuation checks must not re-read Supabase auth');
});

// ---------------------------------------------------------------------------
// Schema contract. The Supabase fake accepts any row, so these replay the repo
// migrations and hold the real upsert payload to the schema they produce.
// Production rejected every preference upsert for a missing column (42703) and
// for EL palette ids outside the legacy CHECK while this whole file was green.
// ---------------------------------------------------------------------------

const pushLocalPreferences = async (preferences: UserPreferences) => {
  authStore.setState({ preferencesUpdatedAt: '2026-09-09T00:00:00.000Z', preferences });
  script.user_preferences = { select: { data: remotePreferenceRow() } };
  const result = await syncPreferences(USER_A);
  assert.equal(result.success, true);
  return payloadOf('user_preferences');
};

test('every column a preference upsert writes exists in the migrated user_preferences table', async () => {
  const schema = replayTableMigrations('user_preferences', readRepoMigrations());

  const payload = await pushLocalPreferences(LOCAL_PREFERENCES);

  assert.deepEqual(
    Object.keys(payload).filter((column) => !schema.columns.has(column)),
    []
  );
});

test('every current accent palette and retired row value passes the migrated palette check', async () => {
  const schema = replayTableMigrations('user_preferences', readRepoMigrations());

  for (const appearancePalette of APPEARANCE_PALETTE_IDS) {
    supabaseFake.reset();
    supabaseFake.setDefaultResponder(scriptedResponder);
    const payload = await pushLocalPreferences({ ...LOCAL_PREFERENCES, appearancePalette });
    const rejected = Object.entries(payload).filter(
      ([column, value]) => value !== null && !checkAdmits(schema, column, value)
    );
    assert.deepEqual(rejected, [], `palette ${appearancePalette}`);
  }
  // Rows written before the EL reskin keep their value until the device syncs.
  for (const retired of ['ember', 'sapphire', 'teal', 'olive']) {
    assert.equal(checkAdmits(schema, 'appearance_palette', retired), true, retired);
  }
});

// ---------------------------------------------------------------------------
// Per-field preference merge once the device has a sync base
// (docs/research/sync-offline-review-2026-09-24.md, finding 6)
// ---------------------------------------------------------------------------

/** A cloud row carrying exactly these preferences. */
const cloudRowFor = (
  preferences: UserPreferences,
  syncedAt: string | undefined
): RemoteUserPreferences =>
  remotePreferenceRow({
    font_size: preferences.fontSize,
    theme: preferences.theme,
    appearance_palette: preferences.appearancePalette,
    language: preferences.language,
    country_code: preferences.countryCode,
    country_name: preferences.countryName,
    content_language_code: preferences.contentLanguageCode,
    content_language_name: preferences.contentLanguageName,
    content_language_native_name: preferences.contentLanguageNativeName,
    chapter_feedback_name: preferences.chapterFeedbackName,
    chapter_feedback_role: preferences.chapterFeedbackRole,
    onboarding_completed: preferences.onboardingCompleted,
    chapter_feedback_enabled: preferences.chapterFeedbackEnabled,
    hide_play_button_from_reading_tab: preferences.hidePlayButtonFromReadingTab,
    notifications_enabled: preferences.notificationsEnabled,
    reminder_time: preferences.reminderTime,
    synced_at: syncedAt,
  });

const SYNCED_AT = '2026-09-10T00:00:00.000Z';

test('edits to different preferences on two devices both survive when the cloud edit is newer', async () => {
  // This device changed the font; the other device changed the theme later.
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
  });
  script.user_preferences = {
    select: {
      data: cloudRowFor({ ...LOCAL_PREFERENCES, theme: 'dark' }, '2026-09-12T00:00:00.000Z'),
    },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(authStore.getState().preferences.fontSize, 'large');
  assert.equal(authStore.getState().preferences.theme, 'dark');
  assert.equal(payloadOf('user_preferences').font_size, 'large');
  assert.equal(payloadOf('user_preferences').theme, 'dark');
});

test('edits to different preferences on two devices both survive when the local edit is newer', async () => {
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-13T00:00:00.000Z',
  });
  script.user_preferences = {
    select: {
      data: cloudRowFor({ ...LOCAL_PREFERENCES, theme: 'dark' }, '2026-09-12T00:00:00.000Z'),
    },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(authStore.getState().preferences.theme, 'dark');
  assert.equal(payloadOf('user_preferences').theme, 'dark');
  assert.equal(payloadOf('user_preferences').font_size, 'large');
});

test('a device with no pending edit adopts a cloud change even when its own clock runs ahead', async () => {
  // Nothing changed locally since the last sync, but this device's clock is fast,
  // so its stamp is later than the other device's real edit.
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: LOCAL_PREFERENCES,
    preferencesUpdatedAt: '2026-09-20T00:00:00.000Z',
  });
  script.user_preferences = {
    select: {
      data: cloudRowFor({ ...LOCAL_PREFERENCES, fontSize: 'small' }, '2026-09-12T00:00:00.000Z'),
    },
  };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.equal(authStore.getState().preferences.fontSize, 'small');
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

test('a preference changed differently on both devices goes to the newer stamp', async () => {
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
  });
  script.user_preferences = {
    select: {
      data: cloudRowFor({ ...LOCAL_PREFERENCES, fontSize: 'small' }, '2026-09-12T00:00:00.000Z'),
    },
  };

  await syncPreferences(USER_A);

  assert.equal(authStore.getState().preferences.fontSize, 'small');
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

test('an unchanged preference row is not uploaded again on every sync', async () => {
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: LOCAL_PREFERENCES,
    preferencesUpdatedAt: SYNCED_AT,
  });
  script.user_preferences = { select: { data: cloudRowFor(LOCAL_PREFERENCES, SYNCED_AT) } };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: false });
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

test('a failed upload of merged preferences is retried rather than read as a cloud revert', async () => {
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
  });
  const cloud = cloudRowFor({ ...LOCAL_PREFERENCES, theme: 'dark' }, '2026-09-12T00:00:00.000Z');
  script.user_preferences = {
    select: { data: cloud },
    write: { error: { message: 'preferences write failed' } },
  };

  const failed = await syncPreferences(USER_A);
  assert.equal(failed.success, false);
  // The server still holds the old font, so the next sync must upload, not revert.
  script.user_preferences = { select: { data: cloud } };

  const retried = await syncPreferences(USER_A);

  assert.equal(retried.success, true);
  assert.equal(authStore.getState().preferences.fontSize, 'large');
  assert.equal(authStore.getState().preferences.theme, 'dark');
  assert.equal(payloadOf('user_preferences', 1).font_size, 'large');
});

test('a successful upload records the uploaded values as the new sync base', async () => {
  authStore.setState({
    preferencesSyncBase: LOCAL_PREFERENCES,
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'large' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
  });
  script.user_preferences = { select: { data: cloudRowFor(LOCAL_PREFERENCES, SYNCED_AT) } };

  await syncPreferences(USER_A);

  assert.equal(authStore.getState().preferencesSyncBase?.fontSize, 'large');
});

// ---------------------------------------------------------------------------
// Per-field edit stamps once migration 20260924023259 is live
// (docs/research/sync-offline-review-2026-09-24.md, finding 7)
// ---------------------------------------------------------------------------

const stampedCloudRow = (
  preferences: UserPreferences,
  fieldUpdatedAt: Record<string, string>,
  syncedAt = SYNCED_AT
): RemoteUserPreferences => ({
  ...cloudRowFor(preferences, syncedAt),
  field_updated_at: fieldUpdatedAt,
});

test('a newer local edit is uploaded with its stamp and the server copy is adopted', async () => {
  const editedAt = '2026-09-11T00:00:00.000Z';
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, theme: 'dark' },
    preferencesUpdatedAt: editedAt,
    preferenceFieldStamps: { theme: editedAt },
  });
  // The other phone uploaded later, but its theme edit is older than this one.
  const cloud = stampedCloudRow(
    LOCAL_PREFERENCES,
    { theme: '2026-09-10T00:00:00.000Z', font_size: '2026-09-01T00:00:00.000Z' },
    '2026-09-12T00:00:00.000Z'
  );
  // What the server stores after its trigger runs (it may clamp or refuse stamps).
  const stored = stampedCloudRow(
    { ...LOCAL_PREFERENCES, theme: 'dark' },
    { theme: '2026-09-11T00:00:00.000Z', font_size: '2026-09-01T00:00:00.000Z' }
  );
  script.user_preferences = {
    select: { data: cloud },
    write: { data: stored },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  const [upsert] = callsFor('user_preferences', 'upsert');
  assert.deepEqual((upsert?.payload as Record<string, unknown>).field_updated_at, {
    theme: editedAt,
    font_size: '2026-09-01T00:00:00.000Z',
  });
  assert.equal((upsert?.payload as Record<string, unknown>).theme, 'dark');
  assert.equal(upsert?.single, true, 'the upload reads back what the server kept');
  assert.equal(authStore.getState().preferences.theme, 'dark');
  assert.deepEqual(authStore.getState().preferenceFieldStamps, {
    theme: '2026-09-11T00:00:00.000Z',
    fontSize: '2026-09-01T00:00:00.000Z',
  });
});

test('a value the server refused on upload is taken from the server copy it returns', async () => {
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'small' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
    preferenceFieldStamps: { fontSize: '2026-09-11T00:00:00.000Z' },
  });
  script.user_preferences = {
    select: { data: stampedCloudRow(LOCAL_PREFERENCES, {}) },
    // Another phone chose large at 12:00 between this device's read and its write.
    write: {
      data: stampedCloudRow(
        { ...LOCAL_PREFERENCES, fontSize: 'large' },
        { font_size: '2026-09-11T12:00:00.000Z' }
      ),
    },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(authStore.getState().preferences.fontSize, 'large');
  assert.deepEqual(authStore.getState().preferenceFieldStamps, {
    fontSize: '2026-09-11T12:00:00.000Z',
  });
});

test('an older local edit adopts the newer cloud value without uploading anything', async () => {
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'small' },
    preferencesUpdatedAt: '2026-09-20T00:00:00.000Z',
    preferenceFieldStamps: { fontSize: '2026-09-08T00:00:00.000Z' },
  });
  script.user_preferences = {
    select: {
      data: stampedCloudRow(
        { ...LOCAL_PREFERENCES, fontSize: 'large' },
        { font_size: '2026-09-09T00:00:00.000Z' }
      ),
    },
  };

  const result = await syncPreferences(USER_A);

  assert.deepEqual(result, { success: true, merged: true });
  assert.equal(authStore.getState().preferences.fontSize, 'large');
  assert.deepEqual(authStore.getState().preferenceFieldStamps, {
    fontSize: '2026-09-09T00:00:00.000Z',
  });
  assert.deepEqual(callsFor('user_preferences', 'upsert'), []);
});

test('an upload refused because the stamp column is missing is retried without it', async () => {
  // The app shipped before the migration was applied: the account has no row to
  // detect the column from, so the first upload offers the stamps.
  authStore.setState({
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
    preferenceFieldStamps: { fontSize: '2026-09-11T00:00:00.000Z' },
  });
  let writes = 0;
  script.user_preferences = {
    select: NO_ROWS,
    write: () => {
      writes += 1;
      return writes === 1
        ? {
            data: null,
            error: {
              code: 'PGRST204',
              message: "Could not find the 'field_updated_at' column of 'user_preferences'",
            },
          }
        : { data: null, error: null };
    },
  };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(writes, 2);
  assert.ok('field_updated_at' in payloadOf('user_preferences', 0));
  assert.equal('field_updated_at' in payloadOf('user_preferences', 1), false);
});

test('a row from a database without the stamp column is never sent stamps', async () => {
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'small' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
    preferenceFieldStamps: { fontSize: '2026-09-11T00:00:00.000Z' },
  });
  script.user_preferences = { select: { data: cloudRowFor(LOCAL_PREFERENCES, SYNCED_AT) } };

  const result = await syncPreferences(USER_A);

  assert.equal(result.success, true);
  assert.equal(payloadOf('user_preferences').font_size, 'small');
  assert.equal('field_updated_at' in payloadOf('user_preferences'), false);
});

test('every column a stamped preference upsert writes exists in the migrated table', async () => {
  const schema = replayTableMigrations('user_preferences', readRepoMigrations());
  authStore.setState({
    preferences: { ...LOCAL_PREFERENCES, fontSize: 'small' },
    preferencesUpdatedAt: '2026-09-11T00:00:00.000Z',
    preferenceFieldStamps: { fontSize: '2026-09-11T00:00:00.000Z' },
  });
  script.user_preferences = { select: { data: stampedCloudRow(LOCAL_PREFERENCES, {}) } };

  await syncPreferences(USER_A);

  const payload = payloadOf('user_preferences');
  assert.ok('field_updated_at' in payload);
  assert.deepEqual(
    Object.keys(payload).filter((column) => !schema.columns.has(column)),
    []
  );
});
