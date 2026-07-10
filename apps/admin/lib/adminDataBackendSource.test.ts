import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin analytics overview uses the shared Supabase analytics RPC for location metrics', async () => {
  const source = await readFile(
    path.join(repoRoot, 'apps/admin/lib/admin-data.ts'),
    'utf8'
  );

  assert.match(source, /service\.rpc\('get_admin_analytics_overview'/);
  assert.match(source, /locationMetrics/);
  assert.match(source, /activeLocationCount/);
  assert.match(source, /translationListeningMinutes/);
  // Country totals are a first-class part of the dashboard (P3 S16), so the
  // overview intentionally carries countryMetrics.
  assert.match(source, /countryMetrics/);
  // Engagement "computed at" comes from a separate user_engagement_summary query
  // (the RPC doesn't expose it) — P3 S16.
  assert.match(source, /user_engagement_summary/);
  assert.match(source, /engagementScoreComputedAt/);
  // The time-range window is parameterized + whitelisted (P3 S14).
  assert.match(source, /normalizeAnalyticsWindow/);
});
