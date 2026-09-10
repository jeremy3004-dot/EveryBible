/**
 * Behavioural tests for the translation catalog / preference service.
 *
 * Loads the shipped module through the real loader against the shared Supabase fake, and
 * covers every exported function including the unconfigured-backend and signed-out paths.
 */
import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  createSupabaseFake,
  makeFakeSession,
  type SupabaseQueryCall,
} from '../../testing/supabaseFake';
import type {
  TranslationCatalogEntry,
  TranslationVersion,
  UserTranslationPreferences,
} from '../supabase/types';

const supabaseFake = createSupabaseFake();
const supabaseState = { configured: true };
// mockSupabaseModule pins `isSupabaseConfigured` for the file, and every exported function here
// has a distinct unconfigured-backend contract, so the flag is kept mutable instead.
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => supabaseState.configured,
  getCurrentUserId: async () => {
    if (!supabaseState.configured) {
      return null;
    }
    const { data } = await supabaseFake.client.auth.getUser();
    return data.user?.id ?? null;
  },
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

type TranslationServiceModule = typeof import('./translationService');
let translationService: TranslationServiceModule;

const loadModule = async (): Promise<TranslationServiceModule> => {
  translationService ??= await import('./translationService');
  return translationService;
};

const signIn = (userId = 'user-1') => {
  supabaseFake.auth.setSession(makeFakeSession({ user: { id: userId } as never }));
};

afterEach(() => {
  supabaseState.configured = true;
  supabaseFake.auth.setSession(null);
  supabaseFake.reset();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCatalogEntry(overrides: Partial<TranslationCatalogEntry>): TranslationCatalogEntry {
  return {
    id: `row-${overrides.translation_id ?? 'x'}`,
    translation_id: 'asv',
    name: 'American Standard Version',
    abbreviation: 'ASV',
    language_code: 'en',
    language_name: 'English',
    license_type: 'public-domain',
    license_url: null,
    source_url: null,
    has_audio: false,
    has_text: true,
    is_bundled: false,
    is_available: true,
    sort_order: 1,
    catalog: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const publishedTextCatalog = {
  version: '2026.01.01',
  updatedAt: '2026-01-01T00:00:00.000Z',
  text: {
    format: 'sqlite' as const,
    version: '2026.01.01',
    downloadUrl: 'https://media.everybible.app/text/asv.db',
    sha256: 'a'.repeat(64),
  },
};

const makeVersion = (overrides: Partial<TranslationVersion>): TranslationVersion => ({
  id: 'version-1',
  translation_id: 'hincv',
  version_number: 3,
  changelog: null,
  data_checksum: null,
  total_books: 66,
  total_chapters: 1189,
  total_verses: 31102,
  published_at: '2026-01-01T00:00:00.000Z',
  is_current: true,
  ...overrides,
});

const makePreferences = (
  overrides: Partial<UserTranslationPreferences> = {}
): UserTranslationPreferences => ({
  id: 'prefs-1',
  user_id: 'user-1',
  primary_translation: 'BSB',
  secondary_translation: 'asv',
  audio_translation: 'web',
  synced_at: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

const stepArgs = (call: SupabaseQueryCall, method: string): unknown[] | undefined =>
  call.steps.find((step) => step.method === method)?.args;

// ─── listAvailableTranslations ────────────────────────────────────────────────

test('listAvailableTranslations reports an empty catalog without querying an unconfigured backend', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseState.configured = false;

  assert.deepEqual(await listAvailableTranslations(), { success: true, data: [] });
  assert.deepEqual(supabaseFake.calls, []);
});

test('listAvailableTranslations returns only entries a user could actually install', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseFake.respondTo('translation_catalog', () => ({
    data: [
      makeCatalogEntry({ translation_id: 'eng-asv', catalog: publishedTextCatalog as never }),
      makeCatalogEntry({
        translation_id: 'engbsb',
        name: 'Berean Standard Bible',
        is_bundled: true,
      }),
      makeCatalogEntry({ translation_id: 'hincv', name: 'Hindi Contemporary' }),
      makeCatalogEntry({ translation_id: 'engylt', name: 'Young s Literal', has_text: false }),
      makeCatalogEntry({ translation_id: 'web', name: 'World English Bible' }),
    ],
  }));
  supabaseFake.respondTo('translation_versions', () => ({
    data: [
      makeVersion({ translation_id: 'engbsb' }),
      makeVersion({ translation_id: 'hincv' }),
      makeVersion({ translation_id: 'engylt', total_verses: 0 }),
    ],
  }));

  const result = await listAvailableTranslations();

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((entry) => entry.translation_id),
    ['asv', 'bsb'],
    [
      'asv has a published text pack; bsb is bundled and has a current version (matched through',
      'the backend alias). hincv claims text with nothing published, ylt has an empty version,',
      'and web is hidden from the picker.',
    ].join(' ')
  );
});

test('listAvailableTranslations asks only for available translations in catalog order', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseFake.respondTo('translation_catalog', () => ({ data: [] }));
  supabaseFake.respondTo('translation_versions', () => ({ data: [] }));

  await listAvailableTranslations();

  const [catalogCall, versionCall] = supabaseFake.calls;
  assert.deepEqual(stepArgs(catalogCall, 'eq'), ['is_available', true]);
  assert.deepEqual(stepArgs(catalogCall, 'order'), ['sort_order', { ascending: true }]);
  assert.equal(versionCall.columns, 'translation_id,total_verses');
  assert.deepEqual(stepArgs(versionCall, 'eq'), ['is_current', true]);
});

test('listAvailableTranslations surfaces a catalog query error', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseFake.respondTo('translation_catalog', () => ({
    data: null,
    error: { message: 'permission denied for table translation_catalog' },
  }));

  assert.deepEqual(await listAvailableTranslations(), {
    success: false,
    error: 'permission denied for table translation_catalog',
  });
  assert.equal(supabaseFake.callsFor('translation_versions').length, 0);
});

test('listAvailableTranslations surfaces a version query error', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseFake.respondTo('translation_catalog', () => ({ data: [] }));
  supabaseFake.respondTo('translation_versions', () => ({
    data: null,
    error: { message: 'statement timeout' },
  }));

  assert.deepEqual(await listAvailableTranslations(), {
    success: false,
    error: 'statement timeout',
  });
});

test('listAvailableTranslations reports a thrown transport failure as an error result', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseFake.respondTo('translation_catalog', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await listAvailableTranslations(), {
    success: false,
    error: 'Network request failed',
  });
});

test('listAvailableTranslations reports a non-Error rejection as an unknown error', async () => {
  const { listAvailableTranslations } = await loadModule();
  supabaseFake.respondTo('translation_catalog', () => {
    throw 'offline';
  });

  assert.deepEqual(await listAvailableTranslations(), { success: false, error: 'Unknown error' });
});

// ─── getTranslationVersions ───────────────────────────────────────────────────

test('getTranslationVersions returns nothing when the backend is not configured', async () => {
  const { getTranslationVersions } = await loadModule();
  supabaseState.configured = false;

  assert.deepEqual(await getTranslationVersions('asv'), { success: true, data: [] });
});

test('getTranslationVersions asks for one translation newest first', async () => {
  const { getTranslationVersions } = await loadModule();
  const versions = [makeVersion({ version_number: 3 }), makeVersion({ version_number: 2 })];
  supabaseFake.respondTo('translation_versions', () => ({ data: versions }));

  const result = await getTranslationVersions('hincv');

  assert.deepEqual(result, { success: true, data: versions });
  const [call] = supabaseFake.calls;
  assert.deepEqual(stepArgs(call, 'eq'), ['translation_id', 'hincv']);
  assert.deepEqual(stepArgs(call, 'order'), ['version_number', { ascending: false }]);
});

test('getTranslationVersions returns an empty list when the table has no rows', async () => {
  const { getTranslationVersions } = await loadModule();
  supabaseFake.respondTo('translation_versions', () => ({ data: null }));

  assert.deepEqual(await getTranslationVersions('hincv'), { success: true, data: [] });
});

test('getTranslationVersions surfaces a query error', async () => {
  const { getTranslationVersions } = await loadModule();
  supabaseFake.respondTo('translation_versions', () => ({
    data: null,
    error: { message: 'relation does not exist' },
  }));

  assert.deepEqual(await getTranslationVersions('hincv'), {
    success: false,
    error: 'relation does not exist',
  });
});

test('getTranslationVersions reports a thrown transport failure as an error result', async () => {
  const { getTranslationVersions } = await loadModule();
  supabaseFake.respondTo('translation_versions', () => {
    throw new Error('socket hang up');
  });

  assert.deepEqual(await getTranslationVersions('hincv'), {
    success: false,
    error: 'socket hang up',
  });
});

// ─── getCurrentVersion ────────────────────────────────────────────────────────

test('getCurrentVersion returns no version when the backend is not configured', async () => {
  const { getCurrentVersion } = await loadModule();
  supabaseState.configured = false;

  assert.deepEqual(await getCurrentVersion('asv'), { success: true, data: null });
});

test('getCurrentVersion returns the row flagged as current', async () => {
  const { getCurrentVersion } = await loadModule();
  const current = makeVersion({});
  supabaseFake.respondTo('translation_versions', () => ({ data: current }));

  const result = await getCurrentVersion('hincv');

  assert.deepEqual(result, { success: true, data: current });
  const [call] = supabaseFake.calls;
  assert.equal(call.single, true);
  assert.deepEqual(
    call.steps.filter((step) => step.method === 'eq').map((step) => step.args),
    [
      ['translation_id', 'hincv'],
      ['is_current', true],
    ]
  );
});

test('getCurrentVersion treats "no rows" as an absent version rather than a failure', async () => {
  const { getCurrentVersion } = await loadModule();
  supabaseFake.respondTo('translation_versions', () => ({
    data: null,
    error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
  }));

  assert.deepEqual(await getCurrentVersion('hincv'), { success: true, data: null });
});

test('getCurrentVersion surfaces any other query error', async () => {
  const { getCurrentVersion } = await loadModule();
  supabaseFake.respondTo('translation_versions', () => ({
    data: null,
    error: { code: '42501', message: 'permission denied' },
  }));

  assert.deepEqual(await getCurrentVersion('hincv'), {
    success: false,
    error: 'permission denied',
  });
});

test('getCurrentVersion reports a thrown transport failure as an error result', async () => {
  const { getCurrentVersion } = await loadModule();
  supabaseFake.respondTo('translation_versions', () => {
    throw new Error('offline');
  });

  assert.deepEqual(await getCurrentVersion('hincv'), { success: false, error: 'offline' });
});

// ─── getUserTranslationPreferences ────────────────────────────────────────────

test('getUserTranslationPreferences returns nothing when the backend is not configured', async () => {
  const { getUserTranslationPreferences } = await loadModule();
  supabaseState.configured = false;

  assert.deepEqual(await getUserTranslationPreferences(), { success: true, data: null });
  assert.deepEqual(supabaseFake.calls, []);
});

test('getUserTranslationPreferences fails for a signed-out reader', async () => {
  const { getUserTranslationPreferences } = await loadModule();

  assert.deepEqual(await getUserTranslationPreferences(), {
    success: false,
    error: 'Not signed in',
  });
  assert.deepEqual(supabaseFake.calls, [], 'a signed-out reader never reaches the table');
});

test('getUserTranslationPreferences returns the signed-in user own row', async () => {
  const { getUserTranslationPreferences } = await loadModule();
  signIn('user-7');
  const stored = makePreferences({ user_id: 'user-7' });
  supabaseFake.respondTo('user_translation_preferences', () => ({ data: stored }));

  const result = await getUserTranslationPreferences();

  assert.deepEqual(result, { success: true, data: stored });
  assert.deepEqual(stepArgs(supabaseFake.calls[0], 'eq'), ['user_id', 'user-7']);
});

test('getUserTranslationPreferences treats "no rows" as no saved preferences', async () => {
  const { getUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', () => ({
    data: null,
    error: { code: 'PGRST116', message: 'no rows' },
  }));

  assert.deepEqual(await getUserTranslationPreferences(), { success: true, data: null });
});

test('getUserTranslationPreferences surfaces any other query error', async () => {
  const { getUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', () => ({
    data: null,
    error: { code: '42501', message: 'permission denied' },
  }));

  assert.deepEqual(await getUserTranslationPreferences(), {
    success: false,
    error: 'permission denied',
  });
});

test('getUserTranslationPreferences reports a thrown transport failure as an error result', async () => {
  const { getUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await getUserTranslationPreferences(), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── setUserTranslationPreferences ────────────────────────────────────────────

test('setUserTranslationPreferences succeeds silently when the backend is not configured', async () => {
  const { setUserTranslationPreferences } = await loadModule();
  supabaseState.configured = false;

  assert.deepEqual(await setUserTranslationPreferences({ primary: 'asv' }), { success: true });
  assert.deepEqual(supabaseFake.calls, []);
});

test('setUserTranslationPreferences fails for a signed-out reader', async () => {
  const { setUserTranslationPreferences } = await loadModule();

  assert.deepEqual(await setUserTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'Not signed in',
  });
});

test('setUserTranslationPreferences merges the change into the saved row', async (t) => {
  const { setUserTranslationPreferences } = await loadModule();
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-04T05:06:07.000Z') });
  signIn('user-7');
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert' ? { data: null } : { data: makePreferences({ user_id: 'user-7' }) }
  );

  const result = await setUserTranslationPreferences({ primary: 'ylt', secondary: null });

  assert.deepEqual(result, { success: true });
  const upsert = supabaseFake.callsFor('user_translation_preferences')[1];
  assert.deepEqual(upsert.payload, {
    user_id: 'user-7',
    primary_translation: 'ylt',
    secondary_translation: null,
    audio_translation: 'web',
    synced_at: '2026-03-04T05:06:07.000Z',
  });
  assert.deepEqual(upsert.options, { onConflict: 'user_id' });
});

test('setUserTranslationPreferences creates a first row that defaults the primary to BSB', async () => {
  const { setUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert'
      ? { data: null }
      : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
  );

  assert.deepEqual(await setUserTranslationPreferences({ audio: 'web' }), { success: true });

  const upsert = supabaseFake.callsFor('user_translation_preferences')[1];
  assert.equal((upsert.payload as { primary_translation: string }).primary_translation, 'BSB');
  assert.equal(
    (upsert.payload as { secondary_translation: string | null }).secondary_translation,
    null
  );
});

test('a failed preference read never overwrites the saved row', async () => {
  const { setUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert'
      ? { data: null }
      : { data: null, error: { code: '503', message: 'Network unavailable' } }
  );

  assert.deepEqual(await setUserTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'Network unavailable',
  });
  assert.equal(
    supabaseFake.calls.filter((call) => call.operation === 'upsert').length,
    0,
    'merging against an unknown remote row would reset the fields the caller omitted'
  );
});

test('setUserTranslationPreferences surfaces an upsert error', async () => {
  const { setUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert'
      ? { error: { message: 'row level security violation' } }
      : { data: makePreferences() }
  );

  assert.deepEqual(await setUserTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'row level security violation',
  });
});

test('setUserTranslationPreferences reports a thrown transport failure as an error result', async () => {
  const { setUserTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', () => {
    throw new Error('socket hang up');
  });

  assert.deepEqual(await setUserTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'socket hang up',
  });
});

// ─── syncTranslationPreferences ───────────────────────────────────────────────

test('syncTranslationPreferences is inert when the backend is not configured', async () => {
  const { syncTranslationPreferences } = await loadModule();
  supabaseState.configured = false;

  assert.deepEqual(await syncTranslationPreferences({ primary: 'asv' }), {
    success: true,
    data: null,
  });
  assert.deepEqual(supabaseFake.calls, []);
});

test('syncTranslationPreferences is inert for a signed-out reader', async () => {
  const { syncTranslationPreferences } = await loadModule();

  assert.deepEqual(await syncTranslationPreferences({ primary: 'asv' }), {
    success: true,
    data: null,
  });
  assert.deepEqual(
    supabaseFake.calls,
    [],
    'signing out is not an error for a background sync, and must not write'
  );
});

test('syncTranslationPreferences adopts a remote row that is newer than the local snapshot', async () => {
  const { syncTranslationPreferences } = await loadModule();
  signIn();
  const remote = makePreferences({
    primary_translation: 'ylt',
    synced_at: '2026-02-02T00:00:00.000Z',
  });
  supabaseFake.respondTo('user_translation_preferences', () => ({ data: remote }));

  const result = await syncTranslationPreferences({
    primary: 'asv',
    syncedAt: '2026-02-01T00:00:00.000Z',
  });

  assert.deepEqual(result, { success: true, data: remote });
  assert.equal(
    supabaseFake.calls.filter((call) => call.operation === 'upsert').length,
    0,
    'the newer remote row wins without a write-back'
  );
});

test('syncTranslationPreferences pushes a local snapshot that is newer than the remote row', async (t) => {
  const { syncTranslationPreferences } = await loadModule();
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-03-04T05:06:07.000Z') });
  signIn('user-7');
  const remote = makePreferences({ user_id: 'user-7', synced_at: '2026-02-01T00:00:00.000Z' });
  const upserted = makePreferences({
    user_id: 'user-7',
    primary_translation: 'ylt',
    synced_at: '2026-03-04T05:06:07.000Z',
  });
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert' ? { data: upserted } : { data: remote }
  );

  const result = await syncTranslationPreferences({
    primary: 'ylt',
    syncedAt: '2026-02-05T00:00:00.000Z',
  });

  assert.deepEqual(result, { success: true, data: upserted });
  const upsert = supabaseFake.callsFor('user_translation_preferences')[1];
  assert.deepEqual(upsert.payload, {
    user_id: 'user-7',
    primary_translation: 'ylt',
    secondary_translation: 'asv',
    audio_translation: 'web',
    synced_at: '2026-03-04T05:06:07.000Z',
  });
});

test('syncTranslationPreferences creates the remote row when the user has none', async () => {
  const { syncTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert'
      ? { data: makePreferences({ primary_translation: 'asv' }) }
      : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
  );

  const result = await syncTranslationPreferences({ primary: 'asv' });

  assert.equal(result.success, true);
  const upsert = supabaseFake.callsFor('user_translation_preferences')[1];
  assert.deepEqual(
    {
      primary: (upsert.payload as { primary_translation: string }).primary_translation,
      secondary: (upsert.payload as { secondary_translation: string | null }).secondary_translation,
      audio: (upsert.payload as { audio_translation: string | null }).audio_translation,
    },
    { primary: 'asv', secondary: null, audio: null }
  );
});

test('syncTranslationPreferences surfaces a failed remote read', async () => {
  const { syncTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', () => ({
    data: null,
    error: { code: '42501', message: 'permission denied' },
  }));

  assert.deepEqual(await syncTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'permission denied',
  });
});

test('syncTranslationPreferences surfaces a failed write-back', async () => {
  const { syncTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', (call) =>
    call.operation === 'upsert'
      ? { data: null, error: { message: 'conflict' } }
      : { data: makePreferences() }
  );

  assert.deepEqual(await syncTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'conflict',
  });
});

test('syncTranslationPreferences reports a thrown transport failure as an error result', async () => {
  const { syncTranslationPreferences } = await loadModule();
  signIn();
  supabaseFake.respondTo('user_translation_preferences', () => {
    throw new Error('Network request failed');
  });

  assert.deepEqual(await syncTranslationPreferences({ primary: 'asv' }), {
    success: false,
    error: 'Network request failed',
  });
});

// ─── Re-exports ───────────────────────────────────────────────────────────────

test('the service re-exports the catalog mapping helpers its callers import from here', async () => {
  const service = await loadModule();

  assert.equal(typeof service.buildCatalogLanguageFilters, 'function');
  assert.equal(typeof service.filterCatalogEntriesByLanguage, 'function');
  assert.equal(typeof service.mapCatalogEntryToBibleTranslation, 'function');
});
