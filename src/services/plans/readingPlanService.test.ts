import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/services/plans/readingPlanService.ts'),
  'utf8'
);

test('reading plan service stays local-only', () => {
  assert.ok(source.includes("readingPlansStore"), 'service should route state through the local plans store');
  assert.ok(source.includes("readingPlans.generated"), 'service should use bundled plan definitions');
  assert.ok(!source.includes("../supabase"), 'service should not import Supabase in local mode');
  assert.ok(!source.includes('openAuthFlow'), 'service should not trigger auth-only flows in local mode');
});

