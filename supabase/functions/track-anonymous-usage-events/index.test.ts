import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('track-anonymous-usage-events inserts anonymous analytics rows without auth', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-anonymous-usage-events/index.ts'),
    'utf8'
  );

  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/, 'collector must use the service role key');
  assert.match(source, /from\(['"]analytics_events['"]\)/, 'collector should insert into analytics_events');
  assert.match(source, /user_id:\s*null/, 'anonymous rows must store user_id as null');

  assert.ok(!/auth\.getUser/.test(source), 'collector should not require auth');
  assert.ok(!/Missing auth token/.test(source), 'collector should not reject unauthenticated requests');
});

test('track-anonymous-usage-events can merge payload geo with request geo', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-anonymous-usage-events/index.ts'),
    'utf8'
  );

  assert.match(source, /resolveRequestGeo/, 'collector should still inspect request geo when available');
  assert.match(source, /resolveEventGeo/, 'collector should inspect payload geo from the client');
  assert.match(source, /raw\.geo_country_code/, 'payload country should survive request parsing');
  assert.match(source, /raw\.geo_latitude/, 'payload latitude should survive request parsing');
  assert.match(source, /raw\.geo_longitude/, 'payload longitude should survive request parsing');
  assert.match(source, /mergeGeo/, 'collector should merge request and payload geo');
});
