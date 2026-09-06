import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as analyticsWindow from './analytics-window';
import * as navigation from './admin-navigation';
import * as reporting from './analytics-reporting';

type Row = Record<string, unknown>;
type Identity = 'super_admin' | 'unauthenticated' | 'ordinary_user';
type Loader = (argument?: unknown) => Promise<unknown>;
const loaderNames = [
  'getDashboardSummary',
  'getRecentAuditLogs',
  'listTranslations',
  'getTranslationDetail',
  'listSyncRuns',
  'listChapterFeedback',
  'getChapterFeedbackReviewModel',
  'getHealthIssues',
  'listSupportUsers',
  'getSupportUserDetail',
  'getAnalyticsOverview',
] as const;

function loadDataModule(tables: Record<string, Row[]> = {}, analytics: Row = {}) {
  let identity: Identity = 'unauthenticated';
  let requestCache: Map<() => unknown, unknown> | null = null;
  const events: string[] = [];
  const authFailure = new Error('Admin identity required');
  const service = {
    from(table: string) {
      events.push(`from:${table}`);
      const filters: Array<(row: Row) => boolean> = [];
      let head = false;
      const result = () => {
        const data = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return { data: head ? null : data, error: null, count: data.length };
      };
      const query = {
        select(_selection: string, options?: { head?: boolean }) {
          head = !!options?.head;
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        or() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        is(column: string, value: unknown) {
          return query.eq(column, value);
        },
        not(column: string, _operator: string, value: unknown) {
          filters.push((row) => row[column] !== value);
          return query;
        },
        contains() {
          return query;
        },
        async maybeSingle() {
          return { ...result(), data: result().data?.[0] ?? null };
        },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return query;
    },
    async rpc(name: string) {
      events.push(`rpc:${name}`);
      return { data: analytics, error: null };
    },
    storage: {
      from(bucket: string) {
        events.push(`storage:${bucket}`);
        return {
          async createSignedUrl(path: string, ttl: number) {
            assert.equal(ttl, 3600);
            return {
              data: { signedUrl: `https://storage.example/${bucket}/${path}?signed` },
              error: null,
            };
          },
        };
      },
    },
  };
  const dependencies: Record<string, unknown> = {
    react: {
      // Model React's per-render request cache, never a process-global memoization.
      cache(callback: () => unknown) {
        return () => {
          if (!requestCache) return callback();
          if (!requestCache.has(callback)) requestCache.set(callback, callback());
          return requestCache.get(callback);
        };
      },
    },
    '@/lib/admin-auth': {
      async requireAdminIdentity() {
        events.push(`auth:${identity}`);
        if (identity !== 'super_admin') throw authFailure;
        return { id: 'admin-user', role: 'super_admin' };
      },
    },
    '@/lib/supabase/service': {
      createAdminServiceClient() {
        events.push('service');
        return service;
      },
    },
    '@/lib/analytics-window': analyticsWindow,
    '@/lib/admin-navigation': navigation,
    '@/lib/analytics-reporting': reporting,
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL('./admin-data.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }
  );
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return {
    api: exports as Record<string, Loader>,
    events,
    authFailure,
    async request<T>(role: Identity, callback: () => Promise<T>) {
      identity = role;
      requestCache = new Map();
      try {
        return await callback();
      } finally {
        requestCache = null;
      }
    },
    async outsideRender<T>(role: Identity, callback: () => Promise<T>) {
      identity = role;
      return callback();
    },
  };
}

function invoke(api: Record<string, Loader>, name: string) {
  return api[name](
    name === 'getTranslationDetail' ? 'eng' : name === 'getSupportUserDetail' ? 'user-1' : undefined
  );
}

function plain(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

test('authorization coverage includes every async data export', () => {
  const runtime = loadDataModule();
  const asyncExports = Object.entries(runtime.api)
    .filter(
      ([, value]) => typeof value === 'function' && value.constructor.name === 'AsyncFunction'
    )
    .map(([name]) => name)
    .sort();
  assert.deepEqual(asyncExports, [...loaderNames].sort());
});

for (const name of loaderNames) {
  for (const identity of ['unauthenticated', 'ordinary_user'] as const) {
    test(`${name} rejects ${identity} before service, query, RPC, or storage access`, async () => {
      const runtime = loadDataModule();
      await assert.rejects(
        runtime.request(identity, () => invoke(runtime.api, name)),
        (error) => error === runtime.authFailure
      );
      assert.deepEqual(runtime.events, [`auth:${identity}`]);
    });
  }
  test(`${name} still returns its empty-data contract for an authorized admin`, async () => {
    const runtime = loadDataModule();
    const result = plain(await runtime.request('super_admin', () => invoke(runtime.api, name)));
    assert.equal(runtime.events[0], 'auth:super_admin');
    assert.equal(runtime.events[1], 'service');
    assert.equal(runtime.events.filter((event) => event === 'service').length, 1);
    if (name === 'getDashboardSummary') {
      assert.deepEqual(result, {
        adminPathCount: navigation.adminNavigation.length,
        failedSyncCount: 0,
        feedbackCount: 0,
        supportUserCount: 0,
        translationCount: 0,
      });
    } else if (name === 'getTranslationDetail' || name === 'getSupportUserDetail') {
      assert.equal(result, null);
    } else if (name === 'getChapterFeedbackReviewModel') {
      assert.deepEqual(result, {
        coverage: [],
        feedback: [],
        filters: { books: [], languages: [], translations: [] },
        translationCoverage: [],
        totalAvailable: 0,
      });
    } else if (name === 'getHealthIssues') {
      assert.deepEqual(
        result.map((issue: { title: string }) => issue.title),
        ['Upstream metadata sync not running']
      );
    } else if (name === 'getAnalyticsOverview') {
      assert.equal(result.listeningTotalMinutes, 0);
      assert.equal(result.engagementScoreComputedAt, null);
      assert.deepEqual(result.translationBreakdown, []);
      assert.ok(runtime.events.includes('rpc:get_admin_analytics_overview'));
    } else {
      assert.deepEqual(result, []);
    }
  });
}

test('concurrent and nested data readers share authorization only within one render request', async () => {
  const runtime = loadDataModule();
  await runtime.request('super_admin', () =>
    Promise.all(loaderNames.map((name) => invoke(runtime.api, name)))
  );
  assert.equal(runtime.events.filter((event) => event.startsWith('auth:')).length, 1);
  assert.equal(runtime.events.filter((event) => event === 'service').length, 1);
  runtime.events.length = 0;
  await assert.rejects(
    runtime.request('unauthenticated', () => runtime.api.getRecentAuditLogs()),
    (error) => error === runtime.authFailure
  );
  assert.deepEqual(runtime.events, ['auth:unauthenticated']);
  runtime.events.length = 0;
  await runtime.request('super_admin', () => runtime.api.getRecentAuditLogs());
  assert.deepEqual(runtime.events, ['auth:super_admin', 'service', 'from:admin_audit_logs']);
});

test('operator calls outside a server render still verify each request', async () => {
  const runtime = loadDataModule();
  await runtime.outsideRender('super_admin', () => runtime.api.getRecentAuditLogs());
  runtime.events.length = 0;
  await assert.rejects(
    runtime.outsideRender('ordinary_user', () => runtime.api.getRecentAuditLogs()),
    (error) => error === runtime.authFailure
  );
  assert.deepEqual(runtime.events, ['auth:ordinary_user']);
});

test('authorized audit and analytics readers retain backend values', async () => {
  const audit = { id: 'audit-1', summary: 'Catalog updated', metadata: { targetUserId: 'user-1' } };
  const runtime = loadDataModule(
    {
      admin_audit_logs: [audit],
      user_engagement_summary: [{ updated_at: '2026-09-05T00:00:00Z' }],
    },
    {
      listeningTotalMinutes: 25,
      userCountWithListening: 3,
      dailyListeningMinutes: [{ day: '2026-09-05', value: 25 }],
    }
  );
  await runtime.request('super_admin', async () => {
    assert.deepEqual(plain(await runtime.api.getRecentAuditLogs()), [audit]);
    const overview = plain(await runtime.api.getAnalyticsOverview(30));
    assert.equal(overview.listeningTotalMinutes, 25);
    assert.equal(overview.userCountWithListening, 3);
    assert.equal(overview.engagementScoreComputedAt, '2026-09-05T00:00:00Z');
    assert.deepEqual(overview.dailyListeningMinutes, [{ day: '2026-09-05', minutes: 25 }]);
  });
});

test('authorized feedback preserves reviewer mappings and signs audio only after identity verification', async () => {
  const runtime = loadDataModule({
    chapter_feedback_submissions: [
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
    profiles: [{ id: 'reviewer-1', display_name: 'Reviewer', email: 'reviewer@church.org' }],
  });
  const result = plain(
    await runtime.request('super_admin', () => runtime.api.listChapterFeedback())
  );
  assert.equal(result[0].reviewerDisplayName, 'Reviewer');
  assert.equal(
    result[0].audioResponse.signedUrl,
    'https://storage.example/feedback-audio/reviewer-1/response.m4a?signed'
  );
  assert.equal(runtime.events[0], 'auth:super_admin');
  assert.equal(runtime.events.filter((event) => event === 'service').length, 1);
  assert.ok(runtime.events.includes('storage:feedback-audio'));
});
