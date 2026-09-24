/**
 * The AI operator's read-only tools (lib/operator-tools.ts) loaded through the
 * real module loader, with the admin data layer replaced. The tools hand their
 * results to a third-party model, so they must forward an allowlisted summary
 * and never identifiers, contact details, push registrations or raw payloads.
 */
import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

import { mockModule } from './testing/adminTestHarness';

type Handler = (...args: unknown[]) => Promise<unknown>;
const handlers: Record<string, Handler> = {};
const received: Array<[string, unknown[]]> = [];

function dataFunction(name: string): Handler {
  return async (...args: unknown[]) => {
    received.push([name, args]);
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected admin-data call: ${name}`);
    return handler(...args);
  };
}

mockModule(mock, '@/lib/admin-data', {
  getAnalyticsOverview: dataFunction('getAnalyticsOverview'),
  getDashboardSummary: dataFunction('getDashboardSummary'),
  getHealthIssues: dataFunction('getHealthIssues'),
  getRecentAuditLogs: dataFunction('getRecentAuditLogs'),
  getSupportUserDetail: dataFunction('getSupportUserDetail'),
  getTranslationDetail: dataFunction('getTranslationDetail'),
  listChapterFeedback: dataFunction('listChapterFeedback'),
  listSupportUsers: dataFunction('listSupportUsers'),
  listSyncRuns: dataFunction('listSyncRuns'),
  listTranslations: dataFunction('listTranslations'),
  normalizeAnalyticsWindow: (value: unknown) => Number(value) || 180,
});

const { OPERATOR_TOOL_EXECUTORS: tools } = await import('./operator-tools');

beforeEach(() => {
  for (const name of Object.keys(handlers)) delete handlers[name];
  received.length = 0;
});

const sensitive = {
  push_token: 'PUSH_SECRET',
  user_id: 'PRIVATE_ID',
  email: 'PRIVATE_EMAIL',
  future_sensitive_field: { secret: 'FUTURE_SECRET' },
};

function serialized(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

test('the support tool returns account context without identities, contact details or push registrations', async () => {
  handlers.listSupportUsers = async () => [
    {
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
    },
  ];
  handlers.getSupportUserDetail = async () => ({
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
  });

  const result = serialized(await tools.get_support_user({ query: 'PRIVATE_EMAIL' }));
  assert.deepEqual(result, {
    match: {
      createdAt: '2026-01-01',
      currentBook: 'GEN',
      currentChapter: 2,
      engagementScore: 8,
      lastActiveDate: '2026-09-01',
      streakDays: 3,
    },
    detail: {
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
  // The detail lookup still uses the matched account id internally.
  assert.deepEqual(
    received.find(([name]) => name === 'getSupportUserDetail'),
    ['getSupportUserDetail', ['PRIVATE_ID']]
  );
  assert.doesNotMatch(JSON.stringify(result), /SECRET|PRIVATE|DEVICE_ID|push_token|user_id|email/);
});

for (const [label, detail] of [
  ['a missing account detail', null],
  [
    'an account with no preferences, progress or engagement',
    {
      preferences: null,
      progress: null,
      engagement: null,
      feedbackCount: 0,
      planCount: 0,
      sessionCount: 0,
    },
  ],
] as const) {
  test(`the support tool passes through ${label} unchanged`, async () => {
    handlers.listSupportUsers = async () => [{ id: 'PRIVATE_ID' }];
    handlers.getSupportUserDetail = async () => detail;
    const result = serialized(await tools.get_support_user({ query: 'person' }));
    assert.deepEqual(result.detail, detail);
  });
}

test('health, translation and sync tools never forward unknown fields or raw upstream payloads', async () => {
  const row = {
    ...sensitive,
    id: 'PRIVATE_ID',
    upstreamPayload: sensitive,
    versions: [{ ...sensitive }],
    recentRuns: [{ ...sensitive }],
    state: 'succeeded',
  };
  handlers.getDashboardSummary = async () => row;
  handlers.getHealthIssues = async () => [];
  handlers.getTranslationDetail = async () => row;
  handlers.listSyncRuns = async () => [row];
  for (const name of ['get_health_snapshot', 'get_translation_detail', 'list_sync_runs']) {
    const result = await tools[name]({ translationId: 'bsb' });
    assert.doesNotMatch(
      JSON.stringify(result),
      /SECRET|PRIVATE|push_token|user_id|email|upstreamPayload/,
      name
    );
  }
});
