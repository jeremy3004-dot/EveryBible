/**
 * Authorization lifecycle of the admin data layer (lib/admin-data.ts), loaded
 * through the real module loader. admin-data authorizes once per server render
 * with React's request-scoped `cache`; this file replaces `react` with a model
 * of that contract (shared inside one request, never across requests or outside
 * a render) so the sharing rules can be observed. Per-loader data shaping lives
 * in admin-data.behavior.test.ts.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { createSupabaseFake, mockModule, mockNextCache } from './testing/adminTestHarness';

type Identity = 'super_admin' | 'unauthenticated' | 'ordinary_user';

const service = createSupabaseFake();
const authFailure = new Error('Admin identity required');
const events: string[] = [];
let identity: Identity = 'unauthenticated';
let requestCache: Map<() => unknown, unknown> | null = null;

mockModule(mock, 'react', {
  cache(callback: () => unknown) {
    return () => {
      if (!requestCache) return callback();
      if (!requestCache.has(callback)) requestCache.set(callback, callback());
      return requestCache.get(callback);
    };
  },
});
mockModule(mock, '@/lib/admin-auth', {
  requireAdminIdentity: async () => {
    events.push(`auth:${identity}`);
    if (identity !== 'super_admin') throw authFailure;
    return { id: 'admin-user', role: 'super_admin' };
  },
});
mockModule(mock, '@/lib/supabase/service', {
  createAdminServiceClient: () => {
    events.push('service');
    return service.client;
  },
});

mockNextCache(mock);

const data = await import('./admin-data');
const { adminNavigation } = await import('./admin-navigation');

type Loader = (argument?: unknown) => Promise<unknown>;
const api = data as unknown as Record<string, Loader>;
const loaderNames = [
  'getAnalyticsOverview',
  'getChapterFeedbackReviewModel',
  'getDashboardSummary',
  'getHealthIssues',
  'getRecentAuditLogs',
  'getSupportUserDetail',
  'getTranslationDetail',
  'listChapterFeedback',
  'listSupportUsers',
  'listSyncRuns',
  'listTranslations',
] as const;

beforeEach(() => {
  service.reset();
  events.length = 0;
  identity = 'unauthenticated';
  requestCache = null;
});

/** Runs `callback` as one server render request for `role`. */
async function request<T>(role: Identity, callback: () => Promise<T>): Promise<T> {
  identity = role;
  requestCache = new Map();
  try {
    return await callback();
  } finally {
    requestCache = null;
  }
}

function invoke(name: string) {
  return api[name](
    name === 'getTranslationDetail' ? 'eng' : name === 'getSupportUserDetail' ? 'user-1' : undefined
  );
}

function backendAccess() {
  return [
    ...service.calls.map((call) => call.table),
    ...service.storageCalls.map((call) => `storage:${call.bucket}`),
  ];
}

test('the authorization lifecycle covers every async data export', () => {
  const asyncExports = Object.entries(data)
    .filter(
      ([, value]) => typeof value === 'function' && value.constructor.name === 'AsyncFunction'
    )
    .map(([name]) => name)
    .sort();
  assert.deepEqual(asyncExports, [...loaderNames]);
});

for (const role of ['unauthenticated', 'ordinary_user'] as const) {
  test(`an ${role} request reaches no loader's service client, query, RPC or storage`, async () => {
    for (const name of loaderNames) {
      await assert.rejects(
        request(role, () => invoke(name)),
        (error) => error === authFailure,
        name
      );
    }
    assert.ok(events.every((event) => event === `auth:${role}`));
    assert.deepEqual(backendAccess(), []);
  });
}

test('every loader returns its empty-data contract to an authorized admin', async () => {
  const results = Object.fromEntries(
    await Promise.all(
      loaderNames.map(async (name) => [
        name,
        JSON.parse(JSON.stringify(await request('super_admin', () => invoke(name)))),
      ])
    )
  );
  assert.deepEqual(results.getDashboardSummary, {
    adminPathCount: adminNavigation.length,
    failedSyncCount: 0,
    feedbackCount: 0,
    supportUserCount: 0,
    translationCount: 0,
  });
  assert.equal(results.getTranslationDetail, null);
  assert.equal(results.getSupportUserDetail, null);
  assert.deepEqual(results.getChapterFeedbackReviewModel, {
    coverage: [],
    feedback: [],
    filters: { books: [], languages: [], translations: [] },
    translationCoverage: [],
    totalAvailable: 0,
  });
  assert.deepEqual(
    results.getHealthIssues.map((issue: { title: string }) => issue.title),
    ['Upstream metadata sync not running']
  );
  assert.equal(results.getAnalyticsOverview.listeningTotalMinutes, 0);
  assert.deepEqual(results.getAnalyticsOverview.translationBreakdown, []);
  for (const name of [
    'getRecentAuditLogs',
    'listChapterFeedback',
    'listSupportUsers',
    'listSyncRuns',
    'listTranslations',
  ]) {
    assert.deepEqual(results[name], [], name);
  }
});

test('concurrent readers in one render share a single authorization and service client', async () => {
  await request('super_admin', () => Promise.all(loaderNames.map((name) => invoke(name))));
  assert.deepEqual(
    events.filter((event) => !event.startsWith('from:')),
    ['auth:super_admin', 'service']
  );
});

test('a new render request is authorized again, so one admin render never vouches for the next', async () => {
  await request('super_admin', () => data.getRecentAuditLogs());
  events.length = 0;
  service.reset();
  await assert.rejects(
    request('unauthenticated', () => data.getRecentAuditLogs()),
    (error) => error === authFailure
  );
  assert.deepEqual(events, ['auth:unauthenticated']);
  assert.deepEqual(backendAccess(), []);
});

test('calls outside a server render, such as operator tools, verify the caller every time', async () => {
  identity = 'super_admin';
  await data.getRecentAuditLogs();
  await data.getRecentAuditLogs();
  identity = 'ordinary_user';
  await assert.rejects(data.getRecentAuditLogs(), (error) => error === authFailure);
  assert.deepEqual(events, [
    'auth:super_admin',
    'service',
    'auth:super_admin',
    'service',
    'auth:ordinary_user',
  ]);
});

test('feedback audio is signed for one hour, and only after the admin is verified', async () => {
  service.respondTo('chapter_feedback_submissions', () => ({
    data: [
      {
        id: 'feedback-1',
        user_id: 'reviewer-1',
        translation_id: 'eng',
        translation_language: 'English',
        book_id: 'GEN',
        chapter: 1,
        sentiment: 'up',
        created_at: '2026-09-05',
        audio_response_bucket: 'feedback-audio',
        audio_response_path: 'reviewer-1/response.m4a',
        audio_response_duration_ms: 1000,
        audio_response_mime_type: 'audio/mp4',
      },
    ],
  }));
  service.respondTo('profiles', () => ({
    data: [{ id: 'reviewer-1', display_name: 'Reviewer', email: 'reviewer@church.org' }],
  }));

  await assert.rejects(
    request('ordinary_user', () => data.listChapterFeedback()),
    (error) => error === authFailure
  );
  assert.deepEqual(service.storageCalls, []);

  const [item] = await request('super_admin', () => data.listChapterFeedback());
  assert.equal(
    item.audioResponse?.signedUrl,
    `${service.storage.publicUrlBase}/feedback-audio/reviewer-1/response.m4a?signed`
  );
  assert.deepEqual(service.storageCalls, [
    {
      bucket: 'feedback-audio',
      method: 'createSignedUrl',
      args: ['reviewer-1/response.m4a', 3600],
    },
  ]);
});
