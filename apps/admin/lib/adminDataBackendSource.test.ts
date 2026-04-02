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
  assert.doesNotMatch(source, /countryMetrics/);
});
