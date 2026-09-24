// Supabase config and migration checks (config.toml and SQL, not TypeScript). The
// submit-chapter-feedback function's behaviour runs on the real function in
// supabase/functions/submit-chapter-feedback/index.test.ts and errors.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');

test('submit-chapter-feedback opts out of the legacy edge JWT gate', () => {
  const config = readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    config,
    /\[functions\.submit-chapter-feedback\][\s\S]*verify_jwt\s*=\s*false/,
    'Expected submit-chapter-feedback to opt out of the legacy verify_jwt runtime gate'
  );
});

test('the anonymous rate-limit column is added nullable with a matching index', () => {
  const migration = readFileSync(
    path.join(
      REPO_ROOT,
      'supabase/migrations/20260910094000_add_client_ip_hash_to_chapter_feedback.sql'
    ),
    'utf8'
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS client_ip_hash TEXT NULL/);
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_chapter_feedback_client_ip_hash_created_at/
  );
});
