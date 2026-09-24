/**
 * Behaviour of the admin data layer (lib/admin-data.ts) loaded through the real
 * module loader, with only the admin gate and the service-role Supabase client
 * replaced. Covers how RPC and table rows are shaped into what the dashboard
 * renders: analytics overview (metrics, globe rows, translation breakdown),
 * support users, and the translation catalog.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import {
  createSupabaseFake,
  mockModule,
  stepArgs,
  type SupabaseQueryCall,
} from './testing/adminTestHarness';

const service = createSupabaseFake();
const authRejection = new Error('Admin identity required');
let authorized = true;
let serviceClientCreations = 0;

mockModule(mock, '@/lib/admin-auth', {
  requireAdminIdentity: async () => {
    if (!authorized) throw authRejection;
    return { id: 'admin-1', role: 'super_admin' };
  },
});
mockModule(mock, '@/lib/supabase/service', {
  createAdminServiceClient: () => {
    serviceClientCreations += 1;
    return service.client;
  },
});

const data = await import('./admin-data');

beforeEach(() => {
  service.reset();
  authorized = true;
  serviceClientCreations = 0;
});

function onlyCall(table: string): SupabaseQueryCall {
  const calls = service.callsFor(table);
  assert.equal(calls.length, 1, `expected one ${table} call, saw ${calls.length}`);
  return calls[0];
}

// ---------------------------------------------------------------------------
// Authorization at the data boundary
// ---------------------------------------------------------------------------

test('every data loader refuses a non-admin before creating the service-role client', async () => {
  authorized = false;
  const loaders = Object.entries(data).filter(
    ([, value]) => typeof value === 'function' && value.constructor.name === 'AsyncFunction'
  ) as Array<[string, (argument?: unknown) => Promise<unknown>]>;
  assert.ok(loaders.length >= 10);
  for (const [name, loader] of loaders) {
    await assert.rejects(loader('probe'), (error) => error === authRejection, name);
  }
  assert.equal(serviceClientCreations, 0);
  assert.deepEqual(service.calls, []);
});

// ---------------------------------------------------------------------------
// Analytics overview (get_admin_analytics_overview)
// ---------------------------------------------------------------------------

test('the analytics window is whitelisted before it reaches the RPC', () => {
  assert.equal(data.normalizeAnalyticsWindow('7'), 7);
  assert.equal(data.normalizeAnalyticsWindow(['90', '7']), 90);
  for (const untrusted of [undefined, '', '365', '30; drop table', '-7', 30.5, null]) {
    assert.equal(data.normalizeAnalyticsWindow(untrusted), 180, String(untrusted));
  }
});

test('the overview asks the RPC for the selected UTC window including today', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T21:15:00.000Z') });
  await data.getAnalyticsOverview(7);
  const rpc = onlyCall('rpc:get_admin_analytics_overview');
  assert.deepEqual(rpc.payload, { p_since: '2026-09-18T00:00:00.000Z', p_total_days: 7 });
});

test('an empty RPC payload renders as zeros rather than failing the dashboard', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T10:00:00.000Z') });
  service.respondToRpc('get_admin_analytics_overview', () => ({ data: null }));
  assert.deepEqual(await data.getAnalyticsOverview(), {
    retrievedAt: '2026-09-24T10:00:00.000Z',
    collectionHealth: undefined,
    activeCountryCount: 0,
    activeLocationCount: 0,
    averageEngagementScore: 0,
    engagementScoreComputedAt: null,
    countryMetrics: [],
    dailyDownloadUnits: [],
    dailyListeningMinutes: [],
    dailyReadingMinutes: [],
    listeningTotalMinutes: 0,
    locatedListenerCount: 0,
    locationMetrics: [],
    readingTotalMinutes: 0,
    totalDownloadUnits: 0,
    totalTrackedSessions: 0,
    translationBreakdown: [],
    userCountWithListening: 0,
  });
});

test('headline metrics are taken from the RPC and Postgres numerics are coerced to numbers', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      activeCountryCount: '12',
      averageEngagementScore: '41.5',
      listeningTotalMinutes: '9120',
      locatedListenerCount: 301,
      readingTotalMinutes: 4410,
      totalDownloadUnits: '77',
      totalTrackedSessions: '1500',
      userCountWithListening: 377,
    },
  }));
  const overview = await data.getAnalyticsOverview(30);
  assert.deepEqual(
    {
      activeCountryCount: overview.activeCountryCount,
      averageEngagementScore: overview.averageEngagementScore,
      listeningTotalMinutes: overview.listeningTotalMinutes,
      locatedListenerCount: overview.locatedListenerCount,
      readingTotalMinutes: overview.readingTotalMinutes,
      totalDownloadUnits: overview.totalDownloadUnits,
      totalTrackedSessions: overview.totalTrackedSessions,
      userCountWithListening: overview.userCountWithListening,
    },
    {
      activeCountryCount: 12,
      averageEngagementScore: 41.5,
      listeningTotalMinutes: 9120,
      locatedListenerCount: 301,
      readingTotalMinutes: 4410,
      totalDownloadUnits: 77,
      totalTrackedSessions: 1500,
      userCountWithListening: 377,
    }
  );
});

test('active map locations is the RPC’s activeLocationCount, not the number of rows the client could map', async () => {
  // METRICS.md: "Active map locations" traces to `activeLocationCount`. The
  // client drops rows it cannot place and merges rows that share a bucket, so
  // counting what survived would report a different denominator.
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      activeLocationCount: '143',
      locationMetrics: [
        { countryCode: 'NP', latitude: 27.71, longitude: 85.32, listeningMinutes: 4 },
        { countryCode: 'NP', latitude: 27.72, longitude: 85.33, listeningMinutes: 2 },
        { countryCode: 'XX', latitude: null, longitude: null, listeningMinutes: 1 },
      ],
    },
  }));
  const overview = await data.getAnalyticsOverview(180);
  assert.equal(overview.activeLocationCount, 143);
  assert.equal(overview.locationMetrics.length, 1);
});

test('daily series keep their UTC days and map values to minutes or download units', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      dailyListeningMinutes: [
        { day: '2026-09-23', value: '12.5' },
        { day: '2026-09-24', value: null },
      ],
      dailyReadingMinutes: [{ day: '2026-09-24', value: 3 }],
      dailyDownloadUnits: [{ day: '2026-09-24', value: '4' }],
    },
  }));
  const overview = await data.getAnalyticsOverview(7);
  assert.deepEqual(overview.dailyListeningMinutes, [
    { day: '2026-09-23', minutes: 12.5 },
    { day: '2026-09-24', minutes: 0 },
  ]);
  assert.deepEqual(overview.dailyReadingMinutes, [{ day: '2026-09-24', minutes: 3 }]);
  assert.deepEqual(overview.dailyDownloadUnits, [{ day: '2026-09-24', value: 4 }]);
});

test('country rollups become globe rows placed at each country and ranked by listening', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      countryMetrics: [
        {
          code: 'us',
          name: 'United States',
          listeningMinutes: '983.44',
          readingMinutes: 414,
          listenerCount: '145',
          downloadUnits: 134,
        },
        {
          code: 'NP',
          name: 'Nepal',
          listeningMinutes: 2424,
          readingMinutes: 530,
          listenerCount: 137,
          downloadUnits: 4,
        },
      ],
    },
  }));
  const { countryMetrics } = await data.getAnalyticsOverview(30);
  assert.deepEqual(
    countryMetrics.map(({ code, name, listeningMinutes, listenerCount, locationKind }) => ({
      code,
      name,
      listeningMinutes,
      listenerCount,
      locationKind,
    })),
    [
      {
        code: 'NP',
        name: 'Nepal',
        listeningMinutes: 2424,
        listenerCount: 137,
        locationKind: 'country',
      },
      {
        code: 'US',
        name: 'United States',
        listeningMinutes: 983.4,
        listenerCount: 145,
        locationKind: 'country',
      },
    ]
  );
  for (const row of countryMetrics) {
    assert.ok(Number.isFinite(row.latitude) && Number.isFinite(row.longitude), row.code);
  }
});

test('countries the RPC counted keep their table rows even when they have no map position', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      activeCountryCount: 2,
      countryMetrics: [
        {
          code: 'NP',
          name: 'Nepal',
          listeningMinutes: 20,
          readingMinutes: 0,
          listenerCount: 2,
          downloadUnits: 0,
        },
        {
          code: 'EU',
          name: 'EU',
          listeningMinutes: 12,
          readingMinutes: 3,
          listenerCount: 1,
          downloadUnits: 5,
        },
      ],
    },
  }));
  const { activeCountryCount, countryMetrics } = await data.getAnalyticsOverview(30);
  assert.equal(countryMetrics.length, activeCountryCount);
  assert.deepEqual(countryMetrics[1], {
    locationKind: 'country',
    region: undefined,
    subregion: undefined,
    code: 'EU',
    downloadUnits: 5,
    latitude: null,
    listenerCount: 1,
    listeningMinutes: 12,
    readingMinutes: 3,
    longitude: null,
    name: 'Europe (unspecified)',
  });
});

test('approximate location rollups become 0.1° map buckets and country-only rows sit at the country centre', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      locationMetrics: [
        {
          countryCode: 'NP',
          latitude: 27.7172,
          longitude: 85.324,
          listeningMinutes: 10,
          listenerCount: 2,
          downloadUnits: 1,
        },
        {
          countryCode: 'NP',
          latitude: 27.71,
          longitude: 85.33,
          listeningMinutes: 5,
          listenerCount: 3,
          downloadUnits: 0,
        },
        { countryCode: 'KE', listeningMinutes: 1, listenerCount: 1, downloadUnits: 0 },
      ],
    },
  }));
  const { locationMetrics } = await data.getAnalyticsOverview(30);
  assert.deepEqual(
    locationMetrics.map(
      ({ locationKind, code, latitude, longitude, listeningMinutes, listenerCount }) => ({
        locationKind,
        code,
        latitude,
        longitude,
        listeningMinutes,
        listenerCount,
      })
    ),
    [
      {
        locationKind: 'approximate',
        code: 'NP',
        latitude: 27.7,
        longitude: 85.3,
        listeningMinutes: 15,
        // Listener counts are dedup counts; merged buckets never add them.
        listenerCount: 3,
      },
      {
        locationKind: 'country',
        code: 'KE',
        latitude: locationMetrics[1].latitude,
        longitude: locationMetrics[1].longitude,
        listeningMinutes: 1,
        listenerCount: 1,
      },
    ]
  );
});

test('the per-translation breakdown uses the RPC’s totals and distinct listener counts verbatim', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: {
      userCountWithListening: 377,
      translationTotals: [
        {
          translationId: 'bsb',
          listeningMinutes: 3407.6,
          readingMinutes: 944.04,
          downloadUnits: 138,
        },
        { translationId: 'npiulb', listeningMinutes: 20, readingMinutes: 0, downloadUnits: 2 },
      ],
      translationListenerCounts: [
        { translationId: 'bsb', listenerCount: 377 },
        { translationId: 'npiulb', listenerCount: 4 },
      ],
      translationCountryMetrics: [
        {
          translationId: 'bsb',
          code: 'NP',
          name: 'Nepal',
          listeningMinutes: 2424,
          readingMinutes: 530,
          listenerCount: 137,
          downloadUnits: 4,
        },
        {
          translationId: 'bsb',
          code: 'US',
          name: 'United States',
          listeningMinutes: 983,
          readingMinutes: 414,
          listenerCount: 145,
          downloadUnits: 134,
        },
      ],
    },
  }));
  const { translationBreakdown } = await data.getAnalyticsOverview(30);
  assert.deepEqual(
    translationBreakdown.map(
      ({
        translationId,
        listeningMinutes,
        readingMinutes,
        downloadUnits,
        listenerCount,
        countryTableMetrics,
      }) => ({
        translationId,
        listeningMinutes,
        readingMinutes,
        downloadUnits,
        listenerCount,
        countries: countryTableMetrics.map((row) => row.code),
      })
    ),
    [
      {
        translationId: 'bsb',
        listeningMinutes: 3408,
        readingMinutes: 944,
        downloadUnits: 138,
        listenerCount: 377,
        countries: ['NP', 'US'],
      },
      {
        translationId: 'npiulb',
        listeningMinutes: 20,
        readingMinutes: 0,
        downloadUnits: 2,
        listenerCount: 4,
        countries: [],
      },
    ]
  );
});

test('collection health is passed through for the pipeline status panel', async () => {
  const collectionHealth = {
    eventCount: 10,
    countryEventCount: 8,
    coordinateEventCount: 6,
    latestEventAt: '2026-09-24T09:00:00Z',
    latestReceivedAt: '2026-09-24T09:00:05Z',
    eventCounts: [{ eventName: 'session_started', count: 10, latestEventAt: null }],
  };
  service.respondToRpc('get_admin_analytics_overview', () => ({ data: { collectionHealth } }));
  assert.deepEqual((await data.getAnalyticsOverview(30)).collectionHealth, collectionHealth);
});

test('engagement freshness comes from the newest engagement summary row', async () => {
  service.respondTo('user_engagement_summary', () => ({
    data: { updated_at: '2026-09-24T02:00:00Z' },
  }));
  const overview = await data.getAnalyticsOverview(30);
  assert.equal(overview.engagementScoreComputedAt, '2026-09-24T02:00:00Z');
  const summary = onlyCall('user_engagement_summary');
  assert.deepEqual(stepArgs(summary, 'order'), [['updated_at', { ascending: false }]]);
  assert.deepEqual(stepArgs(summary, 'limit'), [[1]]);
});

test('a failed engagement freshness lookup shows "not computed" instead of breaking analytics', async () => {
  service.respondTo('user_engagement_summary', () => ({
    data: null,
    error: { message: 'permission denied' },
  }));
  service.respondToRpc('get_admin_analytics_overview', () => ({
    data: { listeningTotalMinutes: 5 },
  }));
  const overview = await data.getAnalyticsOverview(30);
  assert.equal(overview.engagementScoreComputedAt, null);
  assert.equal(overview.listeningTotalMinutes, 5);
});

test('a failed analytics RPC is surfaced rather than rendered as an empty dashboard', async () => {
  service.respondToRpc('get_admin_analytics_overview', () => ({
    error: { message: 'canceling statement due to statement timeout' },
  }));
  await assert.rejects(data.getAnalyticsOverview(180), {
    message:
      'Unable to load shared analytics overview: canceling statement due to statement timeout',
  });
});

// ---------------------------------------------------------------------------
// Support users
// ---------------------------------------------------------------------------

test('the support list joins country, reading progress and engagement onto each profile', async () => {
  service.respondTo('profiles', () => ({
    data: [
      { id: 'u1', email: 'a@church.org', display_name: 'Asha', created_at: '2026-01-01' },
      { id: 'u2', email: 'b@church.org', display_name: null, created_at: '2026-02-01' },
    ],
  }));
  service.respondTo('user_preferences', () => ({
    data: [{ user_id: 'u1', country_name: 'Nepal' }],
  }));
  service.respondTo('user_progress', () => ({
    data: [
      {
        user_id: 'u1',
        current_book: 'JHN',
        current_chapter: 3,
        streak_days: 12,
        last_read_date: null,
      },
    ],
  }));
  service.respondTo('user_engagement_summary', () => ({
    data: [{ user_id: 'u2', engagement_score: 55, last_active_date: '2026-09-20' }],
  }));

  assert.deepEqual(await data.listSupportUsers(), [
    {
      countryName: 'Nepal',
      createdAt: '2026-01-01',
      currentBook: 'JHN',
      currentChapter: 3,
      displayName: 'Asha',
      email: 'a@church.org',
      engagementScore: 0,
      id: 'u1',
      lastActiveDate: null,
      streakDays: 12,
    },
    {
      countryName: null,
      createdAt: '2026-02-01',
      currentBook: null,
      currentChapter: null,
      displayName: null,
      email: 'b@church.org',
      engagementScore: 55,
      id: 'u2',
      lastActiveDate: '2026-09-20',
      streakDays: 0,
    },
  ]);
  for (const table of ['user_preferences', 'user_progress', 'user_engagement_summary']) {
    assert.deepEqual(stepArgs(onlyCall(table), 'in'), [['user_id', ['u1', 'u2']]], table);
  }
});

test('a support search filters profiles by email or display name', async () => {
  await data.listSupportUsers('  asha  ');
  assert.deepEqual(stepArgs(onlyCall('profiles'), 'or'), [
    ['email.ilike.%asha%,display_name.ilike.%asha%'],
  ]);
});

test('a support search with no matching profile does not query per-user tables', async () => {
  assert.deepEqual(await data.listSupportUsers('nobody'), []);
  assert.deepEqual(
    service.calls.map((call) => call.table),
    ['profiles']
  );
});

test('a failed profile query is reported instead of an empty user list', async () => {
  service.respondTo('profiles', () => ({ error: { message: 'connection reset' } }));
  await assert.rejects(data.listSupportUsers(), {
    message: 'Unable to load users: connection reset',
  });
});

test('user detail counts sessions with count_user_sessions, not a capped page of raw events', async () => {
  service.respondTo('profiles', () => ({ data: { id: 'u1' } }));
  // A busy account: far more sessions than PostgREST's 1,000-row page, and
  // plenty of non-session events sharing each session id.
  service.respondToRpc('count_user_sessions', () => ({ data: 2481 }));
  service.respondTo('analytics_events', () => ({
    data: Array.from({ length: 1000 }, (_, index) => ({ session_id: `s-${index % 40}` })),
  }));

  const detail = await data.getSupportUserDetail('u1');
  assert.equal(detail?.sessionCount, 2481);
  assert.deepEqual(onlyCall('rpc:count_user_sessions').payload, { p_user_id: 'u1' });
  assert.deepEqual(service.callsFor('analytics_events'), []);
});

test('user detail shows zero sessions when the session count is unavailable', async () => {
  service.respondTo('profiles', () => ({ data: { id: 'u1' } }));
  service.respondToRpc('count_user_sessions', () => ({ data: null }));
  assert.equal((await data.getSupportUserDetail('u1'))?.sessionCount, 0);
});

test('user detail is null for an unknown user', async () => {
  assert.equal(await data.getSupportUserDetail('missing-user'), null);
});

test('user detail gathers the account’s preferences, progress, engagement and counts', async () => {
  const profile = {
    id: 'u1',
    email: 'a@church.org',
    display_name: 'Asha',
    created_at: '2026-01-01',
    updated_at: '2026-09-01',
    admin_role: null,
  };
  const preferences = { user_id: 'u1', language: 'ne', theme: 'dark', country_name: 'Nepal' };
  const progress = { user_id: 'u1', current_book: 'JHN', current_chapter: 3, streak_days: 12 };
  const engagement = { user_id: 'u1', engagement_score: 55, total_sessions: 9 };
  const audits = [{ id: 'audit-1', action: 'support.note', summary: 'Called user' }];
  service.respondTo('profiles', () => ({ data: profile }));
  service.respondTo('user_preferences', () => ({ data: preferences }));
  service.respondTo('user_progress', () => ({ data: progress }));
  service.respondTo('user_engagement_summary', () => ({ data: engagement }));
  service.respondTo('user_reading_plan_progress', () => ({ data: null, count: 2 }));
  service.respondTo('chapter_feedback_submissions', () => ({ data: null, count: 5 }));
  service.respondTo('admin_audit_logs', () => ({ data: audits }));

  const detail = await data.getSupportUserDetail('u1');
  assert.ok(detail);
  assert.deepEqual(detail, {
    engagement,
    feedbackCount: 5,
    planCount: 2,
    preferences,
    profile,
    progress,
    recentAuditLogs: audits,
    sessionCount: 0,
  });
  for (const table of [
    'user_preferences',
    'user_progress',
    'user_engagement_summary',
    'user_reading_plan_progress',
    'chapter_feedback_submissions',
  ]) {
    assert.deepEqual(stepArgs(onlyCall(table), 'eq'), [['user_id', 'u1']], table);
  }
  assert.deepEqual(stepArgs(onlyCall('admin_audit_logs'), 'contains'), [
    ['metadata', { targetUserId: 'u1' }],
  ]);
});

// ---------------------------------------------------------------------------
// Translation catalog
// ---------------------------------------------------------------------------

const catalogRow = {
  translation_id: 'bsb',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  language_name: 'English',
  has_text: true,
  has_audio: true,
  is_available: true,
  distribution_state: 'published',
  admin_notes: null,
  updated_at: '2026-09-01',
  upstream_last_synced_at: '2026-09-23',
};

test('the catalog list pairs each translation with its current published version', async () => {
  service.respondTo('translation_catalog', () => ({
    data: [catalogRow, { ...catalogRow, translation_id: 'web', name: 'World English Bible' }],
  }));
  service.respondTo('translation_versions', () => ({
    data: [{ translation_id: 'bsb', version_number: 4, is_current: true }],
  }));
  const list = await data.listTranslations();
  assert.deepEqual(
    list.map((item) => [item.translationId, item.currentVersion, item.distributionState]),
    [
      ['bsb', 4, 'published'],
      ['web', null, 'published'],
    ]
  );
  assert.deepEqual(stepArgs(onlyCall('translation_versions'), 'eq'), [['is_current', true]]);
});

test('a catalog search matches id, name, abbreviation or language', async () => {
  await data.listTranslations(' nep ');
  assert.deepEqual(stepArgs(onlyCall('translation_catalog'), 'or'), [
    [
      'translation_id.ilike.%nep%,name.ilike.%nep%,abbreviation.ilike.%nep%,language_name.ilike.%nep%',
    ],
  ]);
});

test('catalog query failures are reported, not shown as an empty catalog', async () => {
  service.respondTo('translation_catalog', () => ({ error: { message: 'boom' } }));
  await assert.rejects(data.listTranslations(), {
    message: 'Unable to load translation catalog: boom',
  });
  service.reset();
  service.respondTo('translation_versions', () => ({ error: { message: 'boom' } }));
  await assert.rejects(data.listTranslations(), {
    message: 'Unable to load translation versions: boom',
  });
});

test('translation detail is null for an unknown translation and does not load sync runs', async () => {
  assert.equal(await data.getTranslationDetail('nope'), null);
  assert.deepEqual(service.callsFor('translation_sync_runs'), []);
});

test('translation detail reports the current version, version history and recent runs', async () => {
  const versions = [
    { id: 'v5', translation_id: 'bsb', version_number: 5, is_current: false },
    { id: 'v4', translation_id: 'bsb', version_number: 4, is_current: true },
  ];
  const runs = [{ id: 'run-1', state: 'succeeded', started_at: '2026-09-23' }];
  service.respondTo('translation_catalog', () => ({
    data: { ...catalogRow, upstream_payload: { source: 'upstream' } },
  }));
  service.respondTo('translation_versions', () => ({ data: versions }));
  service.respondTo('translation_sync_runs', () => ({ data: runs }));
  const detail = await data.getTranslationDetail('bsb');
  assert.ok(detail);
  assert.equal(detail.currentVersion, 4);
  assert.deepEqual(detail.versions, versions);
  assert.deepEqual(detail.recentRuns, runs);
  assert.deepEqual(detail.upstreamPayload, { source: 'upstream' });
  assert.deepEqual(stepArgs(onlyCall('translation_versions'), 'order'), [
    ['version_number', { ascending: false }],
  ]);
});

// ---------------------------------------------------------------------------
// Chapter feedback
// ---------------------------------------------------------------------------

test('QA submissions are hidden from feedback review unless explicitly requested', async () => {
  const base = {
    translation_id: 'bsb',
    translation_language: 'English',
    book_id: 'GEN',
    chapter: 1,
    sentiment: 'down',
    created_at: '2026-09-24',
  };
  service.respondTo('chapter_feedback_submissions', () => ({
    data: [
      { ...base, id: 'real', user_id: 'reviewer' },
      { ...base, id: 'example-account', user_id: 'qa' },
      { ...base, id: 'test-church', user_id: null, participant_name: 'Test Church' },
    ],
  }));
  service.respondTo('profiles', () => ({
    data: [
      { id: 'reviewer', display_name: '  Pastor Ram ', email: 'ram@church.org' },
      { id: 'qa', display_name: null, email: 'qa@example.com' },
    ],
  }));

  const visible = await data.listChapterFeedback();
  assert.deepEqual(
    visible.map((item) => [item.id, item.reviewerDisplayName]),
    [['real', 'Pastor Ram']]
  );
  const everything = await data.listChapterFeedback({ hideTestData: false });
  assert.deepEqual(
    everything.map((item) => [item.id, item.reviewerDisplayName]),
    [
      ['real', 'Pastor Ram'],
      ['example-account', 'qa'],
      ['test-church', null],
    ]
  );
});

test('feedback filters narrow the query by language, translation, book, chapter and response type', async () => {
  await data.listChapterFeedback({
    language: 'Nepali',
    translationId: 'npiulb',
    bookId: 'gen',
    chapter: 3,
    responseType: 'audio',
    query: 'verse, wording',
  });
  const call = onlyCall('chapter_feedback_submissions');
  assert.deepEqual(stepArgs(call, 'eq'), [
    ['translation_language', 'Nepali'],
    ['translation_id', 'npiulb'],
    ['book_id', 'GEN'],
    ['chapter', 3],
  ]);
  assert.deepEqual(stepArgs(call, 'not'), [['audio_response_path', 'is', null]]);
  // Commas would split the PostgREST or() filter, so they are neutralised.
  assert.ok(String(stepArgs(call, 'or')[0][0]).includes('comment.ilike.%verse  wording%'));
});

test('the resolution filter is independent of the accuracy filter', async () => {
  // "Accurate" is sentiment 'up'. The council resolves those too (as "no change
  // needed"), so "Accurate" + "Open" means accurate reviews still awaiting
  // review. Live data has all four combinations.
  const rows = [
    { id: 'accurate-open', sentiment: 'up', scripture_council_fixed_at: null },
    { id: 'accurate-reviewed', sentiment: 'up', scripture_council_fixed_at: '2026-09-20' },
    { id: 'needs-work-open', sentiment: 'down', scripture_council_fixed_at: null },
    { id: 'needs-work-fixed', sentiment: 'down', scripture_council_fixed_at: '2026-09-21' },
  ].map((row) => ({
    ...row,
    translation_id: 'bsb',
    translation_language: 'English',
    book_id: 'GEN',
    chapter: 1,
    created_at: '2026-09-24',
    user_id: null,
  }));
  // Apply the eq / is / not filters the loader chained, as PostgREST would.
  service.respondTo('chapter_feedback_submissions', (call) => ({
    data: rows.filter((row) =>
      call.steps.every(({ method, args }) => {
        const value = (row as Record<string, unknown>)[String(args[0])];
        if (method === 'eq') return value === args[1];
        if (method === 'is') return value === args[1];
        if (method === 'not') return value !== args[2];
        return true;
      })
    ),
  }));

  const ids = async (filters: Parameters<typeof data.listChapterFeedback>[0]) =>
    (await data.listChapterFeedback(filters)).map((item) => item.id).sort();

  assert.deepEqual(await ids({ sentiment: 'up', fixStatus: 'open' }), ['accurate-open']);
  assert.deepEqual(await ids({ sentiment: 'up', fixStatus: 'fixed' }), ['accurate-reviewed']);
  assert.deepEqual(await ids({ sentiment: 'down', fixStatus: 'open' }), ['needs-work-open']);
  assert.deepEqual(await ids({ sentiment: 'down', fixStatus: 'fixed' }), ['needs-work-fixed']);
  assert.deepEqual(await ids({ fixStatus: 'open' }), ['accurate-open', 'needs-work-open']);
  assert.deepEqual(await ids({ fixStatus: 'fixed' }), ['accurate-reviewed', 'needs-work-fixed']);
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

function recentSuccessfulSync() {
  service.respondTo('translation_sync_runs', () => ({
    data: [{ id: 'run-1', state: 'succeeded', started_at: new Date().toISOString() }],
  }));
}

test('health is green only when every check actually ran and passed', async () => {
  recentSuccessfulSync();
  service.respondTo('translation_catalog', () => ({
    data: [{ translation_id: 'bsb', distribution_state: 'published', is_available: true }],
  }));
  assert.deepEqual(
    (await data.getHealthIssues()).map((issue) => [issue.severity, issue.title]),
    [['info', 'No active health issues']]
  );
});

test('a catalog check that could not run is reported instead of claiming all checks are green', async () => {
  recentSuccessfulSync();
  service.respondTo('translation_catalog', () => ({
    data: null,
    error: { message: 'permission denied for table translation_catalog' },
  }));
  assert.deepEqual(await data.getHealthIssues(), [
    {
      description:
        'The translation catalog check could not run: permission denied for table translation_catalog',
      href: '/translations',
      severity: 'warning',
      title: 'Health check incomplete',
    },
  ]);
});
