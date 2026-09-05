import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import type { DashboardSummary, HealthIssue } from './admin-data';

// Exercise the real data layer with only the database boundary replaced.
function loadOperations({ staleSync = false, hiddenTranslation = false } = {}) {
  const tables: string[] = [];
  const counts: Record<string, number> = {
    translation_catalog: 12,
    translation_sync_runs: 2,
    profiles: 7,
    chapter_feedback_submissions: 3,
  };
  const dependencies: Record<string, unknown> = {
    react: {
      cache<T extends (...args: never[]) => unknown>(callback: T): T {
        return callback;
      },
    },
    '@/lib/analytics-window': {},
    '@/lib/admin-navigation': { adminNavigation: [] },
    '@/lib/analytics-reporting': {},
    '@/lib/admin-auth': {
      requireAdminIdentity: async () => ({ id: 'admin-user', role: 'super_admin' }),
    },
    '@/lib/supabase/service': {
      createAdminServiceClient: () => ({
        from(table: string) {
          tables.push(table);
          const data =
            table === 'translation_sync_runs'
              ? [
                  {
                    state: 'succeeded',
                    started_at: new Date(Date.now() - (staleSync ? 172_800_000 : 0)).toISOString(),
                  },
                ]
              : table === 'translation_catalog'
                ? [{ distribution_state: 'published', is_available: !hiddenTranslation }]
                : [];
          const query = {
            data,
            count: counts[table] ?? 0,
            error: null,
            select: () => query,
            eq: () => query,
            order: () => query,
            limit: () => query,
          };
          return query;
        },
      }),
    },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL('./admin-data.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  );
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    tables,
    ...(exports as {
      getDashboardSummary: () => Promise<DashboardSummary>;
      getHealthIssues: () => Promise<HealthIssue[]>;
    }),
  };
}

test('an empty editorial library does not report an unhealthy mobile experience', async () => {
  const operations = loadOperations();
  const issues = await operations.getHealthIssues();

  assert.equal(issues.length, 1);
  assert.equal(issues[0].title, 'No active health issues');
  assert.ok(!operations.tables.includes('verse_of_day_entries'));
  assert.ok(!operations.tables.includes('content_images'));
});

test('health still reports stale syncs and hidden published translations', async () => {
  const operations = loadOperations({ staleSync: true, hiddenTranslation: true });
  const issues = await operations.getHealthIssues();

  assert.equal(issues.length, 2);
  assert.ok(issues.some((issue) => issue.title === 'Translation sync is stale'));
  assert.ok(issues.some((issue) => issue.title === 'Published translations are hidden'));
  assert.ok(issues.every((issue) => issue.href === '/translations'));
});

test('the operational overview loads counts without querying editorial content', async () => {
  const operations = loadOperations();
  const summary = await operations.getDashboardSummary();

  assert.equal(summary.translationCount, 12);
  assert.equal(summary.failedSyncCount, 2);
  assert.equal(summary.supportUserCount, 7);
  assert.equal(summary.feedbackCount, 3);
  assert.ok(!operations.tables.includes('verse_of_day_entries'));
  assert.ok(!operations.tables.includes('content_images'));
});
