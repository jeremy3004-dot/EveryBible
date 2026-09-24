// Non-TypeScript artefact check: reads Supabase migration SQL as text; there is no module to load for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const readRootFile = (relativePathFromRepoRoot: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePathFromRepoRoot), 'utf8');

const HEALTH_SWEEP_MIGRATION =
  'supabase/migrations/20260321060000_health_sweep_rls_policy_optimizations.sql';

function getPolicyStatements(schema: string): string[] {
  return [...schema.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((match) =>
    match[0].replace(/\s+/g, ' ').trim().toLowerCase()
  );
}

test('canonical supabase schema wraps auth.uid() calls inside policies for initplan caching', () => {
  const schema = readRootFile('supabase/schema.sql');
  const policyStatements = getPolicyStatements(schema);

  assert.ok(
    policyStatements.length > 0,
    'Expected schema.sql to declare row-level security policies'
  );

  for (const statement of policyStatements) {
    const withoutWrappedAuthUid = statement.replaceAll('(select auth.uid())', '');
    assert.doesNotMatch(
      withoutWrappedAuthUid,
      /auth\.uid\(\)/,
      `Policy should not call auth.uid() directly: ${statement}`
    );
  }
});

test('health sweep migration exists to add the missing group_sessions creator index and policy rewrites', () => {
  const migrationPath = path.join(REPO_ROOT, HEALTH_SWEEP_MIGRATION);

  assert.ok(
    existsSync(migrationPath),
    `Expected health sweep migration at ${HEALTH_SWEEP_MIGRATION}`
  );

  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_group_sessions_created_by ON public\.group_sessions\(created_by\);/
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Users can view own profile" ON public\.profiles;/
  );
  assert.match(
    migration,
    /CREATE POLICY "Group members can view sessions" ON public\.group_sessions/
  );
});
