import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real server modules, replacing only their external boundaries.
function loadModule<T>(relativePath: string, dependencies: Record<string, unknown>, env = {}) {
  const filename = new URL(relativePath, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    process: { env },
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

for (const secret of [undefined, '', '   ']) {
  test(`cron fails closed when CRON_SECRET is ${JSON.stringify(secret)}`, async () => {
    let calls = 0;
    const { GET } = loadModule<{ GET: (request: Request) => Promise<Response> }>(
      '../app/api/cron/upstream-sync/route.ts',
      {
        'next/server': { NextResponse: Response },
        '@/lib/upstream-sync': {
          runUpstreamTranslationSync: async () => {
            calls += 1;
          },
        },
      },
      { CRON_SECRET: secret }
    );
    for (const authorization of [undefined, 'Bearer undefined', 'Bearer wrong']) {
      const response = await GET(
        new Request('https://admin.example/api/cron/upstream-sync', {
          headers: authorization ? { authorization } : {},
        })
      );
      assert.equal(response.status, 503);
    }
    assert.equal(calls, 0);
  });
}

test('cron denies missing or wrong bearer tokens and accepts the configured token', async () => {
  const actors: unknown[] = [];
  const { GET } = loadModule<{ GET: (request: Request) => Promise<Response> }>(
    '../app/api/cron/upstream-sync/route.ts',
    {
      'next/server': { NextResponse: Response },
      '@/lib/upstream-sync': {
        runUpstreamTranslationSync: async (actor: unknown) => {
          actors.push(actor);
          return { synced: 2 };
        },
      },
    },
    { CRON_SECRET: 'configured-secret' }
  );
  for (const authorization of [undefined, 'Bearer wrong', 'configured-secret']) {
    const response = await GET(
      new Request('https://admin.example/api/cron/upstream-sync', {
        headers: authorization ? { authorization } : {},
      })
    );
    assert.equal(response.status, 401);
  }
  assert.equal(actors.length, 0);
  const response = await GET(
    new Request('https://admin.example/api/cron/upstream-sync', {
      headers: { authorization: 'Bearer configured-secret' },
    })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).result, { synced: 2 });
  assert.deepEqual(actors, [null]);
});

test('engagement refresh rejects unauthenticated and non-admin calls before backend access', async () => {
  for (const reason of ['auth', 'forbidden']) {
    let serviceCalls = 0;
    const rejection = new Error(reason);
    const { refreshEngagementStats } = loadModule<{ refreshEngagementStats: () => Promise<void> }>(
      '../app/(dashboard)/analytics/actions.ts',
      {
        '@/lib/admin-auth': {
          requireAdminIdentity: async () => {
            throw rejection;
          },
        },
        '@/lib/supabase/service': {
          createAdminServiceClient: () => {
            serviceCalls += 1;
            return { functions: { invoke: async () => ({ error: null }) } };
          },
        },
      }
    );
    await assert.rejects(refreshEngagementStats, (error) => error === rejection);
    assert.equal(serviceCalls, 0);
  }
});

test('engagement refresh authenticates before invoking the backend and propagates failures', async () => {
  for (const backendError of [null, { message: 'backend unavailable' }]) {
    const calls: unknown[] = [];
    const { refreshEngagementStats } = loadModule<{ refreshEngagementStats: () => Promise<void> }>(
      '../app/(dashboard)/analytics/actions.ts',
      {
        '@/lib/admin-auth': {
          requireAdminIdentity: async () => {
            calls.push('authorized');
          },
        },
        '@/lib/supabase/service': {
          createAdminServiceClient: () => {
            calls.push('service');
            return {
              functions: {
                invoke: async (name: string, options: unknown) => {
                  calls.push({ name, options: JSON.parse(JSON.stringify(options)) });
                  return { error: backendError };
                },
              },
            };
          },
        },
      }
    );
    if (backendError) await assert.rejects(refreshEngagementStats, /backend unavailable/);
    else await refreshEngagementStats();
    assert.deepEqual(calls, [
      'authorized',
      'service',
      {
        name: 'aggregate-engagement',
        options: { body: {}, method: 'POST' },
      },
    ]);
  }
});

type Executors = Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
const sensitive = {
  push_token: 'PUSH_SECRET',
  user_id: 'PRIVATE_ID',
  email: 'PRIVATE_EMAIL',
  future_sensitive_field: { secret: 'FUTURE_SECRET' },
};

test('support tool returns only allowlisted context, never raw identity, device, or audit data', async () => {
  const matched = {
    ...sensitive,
    id: 'PRIVATE_ID',
    displayName: 'PRIVATE_NAME',
    countryName: 'Nepal',
    createdAt: '2026-01-01',
    currentBook: 'GEN',
    currentChapter: 2,
    deviceCount: 1,
    engagementScore: 8,
    lastActiveDate: '2026-09-01',
    streakDays: 3,
  };
  const detail = {
    ...sensitive,
    profile: { ...sensitive, display_name: 'PRIVATE_NAME' },
    devices: [
      { ...sensitive, id: 'DEVICE_ID', platform: 'ios', app_version: '1.0.7', is_active: true },
    ],
    preferences: {
      ...sensitive,
      language: 'en',
      theme: 'dark',
      content_language_name: 'Nepali',
      synced_at: '2026-09-01',
    },
    progress: {
      ...sensitive,
      current_book: 'GEN',
      current_chapter: 2,
      last_read_date: '2026-09-01',
      streak_days: 3,
    },
    engagement: {
      ...sensitive,
      engagement_score: 8,
      last_active_date: '2026-09-01',
      total_chapters_read: 9,
      total_listening_minutes: 20,
      total_sessions: 4,
    },
    recentAuditLogs: [{ ...sensitive, metadata: sensitive }],
    feedbackCount: 2,
    planCount: 1,
    sessionCount: 4,
  };
  const ids: string[] = [];
  const { OPERATOR_TOOL_EXECUTORS: tools } = loadModule<{ OPERATOR_TOOL_EXECUTORS: Executors }>(
    './operator-tools.ts',
    {
      './admin-data': {
        listSupportUsers: async () => [matched],
        getSupportUserDetail: async (id: string) => {
          ids.push(id);
          return detail;
        },
      },
    }
  );
  const result = JSON.parse(
    JSON.stringify(await tools.get_support_user({ query: 'PRIVATE_EMAIL' }))
  );
  assert.deepEqual(result, {
    match: {
      createdAt: '2026-01-01',
      currentBook: 'GEN',
      currentChapter: 2,
      deviceCount: 1,
      engagementScore: 8,
      lastActiveDate: '2026-09-01',
      streakDays: 3,
    },
    detail: {
      devices: [{ platform: 'ios', appVersion: '1.0.7', active: true }],
      preferences: {
        language: 'en',
        theme: 'dark',
        contentLanguage: 'Nepali',
        syncedAt: '2026-09-01',
      },
      progress: {
        currentBook: 'GEN',
        currentChapter: 2,
        lastReadDate: '2026-09-01',
        streakDays: 3,
      },
      engagement: {
        score: 8,
        lastActiveDate: '2026-09-01',
        chaptersRead: 9,
        listeningMinutes: 20,
        sessions: 4,
      },
      feedbackCount: 2,
      planCount: 1,
      sessionCount: 4,
    },
  });
  assert.deepEqual(ids, ['PRIVATE_ID']);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|PRIVATE|DEVICE_ID|push_token|user_id|email/);
});

test('support tool preserves missing details and nullable support context', async () => {
  for (const detail of [
    null,
    {
      devices: [],
      preferences: null,
      progress: null,
      engagement: null,
      feedbackCount: 0,
      planCount: 0,
      sessionCount: 0,
    },
  ]) {
    const { OPERATOR_TOOL_EXECUTORS: tools } = loadModule<{ OPERATOR_TOOL_EXECUTORS: Executors }>(
      './operator-tools.ts',
      {
        './admin-data': {
          listSupportUsers: async () => [{ id: 'PRIVATE_ID' }],
          getSupportUserDetail: async () => detail,
        },
      }
    );
    const result = JSON.parse(JSON.stringify(await tools.get_support_user({ query: 'person' })));
    assert.deepEqual(result.detail, detail);
  }
});

test('other tools never forward unknown sensitive fields or raw upstream payloads', async () => {
  const row = {
    ...sensitive,
    id: 'PRIVATE_ID',
    upstreamPayload: sensitive,
    versions: [{ ...sensitive }],
    recentRuns: [{ ...sensitive }],
    state: 'succeeded',
  };
  const { OPERATOR_TOOL_EXECUTORS: tools } = loadModule<{ OPERATOR_TOOL_EXECUTORS: Executors }>(
    './operator-tools.ts',
    {
      './admin-data': {
        getDashboardSummary: async () => row,
        getHealthIssues: async () => [],
        getTranslationDetail: async () => row,
        listSyncRuns: async () => [row],
      },
    }
  );
  for (const name of ['get_health_snapshot', 'get_translation_detail', 'list_sync_runs']) {
    const result = await tools[name]({ translationId: 'bsb' });
    assert.doesNotMatch(
      JSON.stringify(result),
      /SECRET|PRIVATE|push_token|user_id|email|upstreamPayload/
    );
  }
});
