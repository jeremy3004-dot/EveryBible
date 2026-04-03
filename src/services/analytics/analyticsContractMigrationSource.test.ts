import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260403132529_reconcile_analytics_geo_contracts.sql'
);

test('analytics contract migration reconciles geo schema and batch ingestion fields', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS geo_country_code TEXT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.batch_track_events\(events JSONB\)/);
  assert.match(sql, /NULLIF\(BTRIM\(e->>'queued_at'\), ''\)::timestamptz/);
  assert.match(sql, /NULLIF\(BTRIM\(UPPER\(e->>'geo_country_code'\)\), ''\)/);
});

test('analytics contract migration derives country rollups from columns, event_properties, and preferences', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /NULLIF\(BTRIM\(UPPER\(event\.geo_country_code\)\), ''\)/);
  assert.match(sql, /event\.event_properties->>'geo_country_code'/);
  assert.match(sql, /pref\.country_code/);
  assert.match(sql, /'locationMetrics'/);
  assert.match(sql, /'countryMetrics'/);
});
