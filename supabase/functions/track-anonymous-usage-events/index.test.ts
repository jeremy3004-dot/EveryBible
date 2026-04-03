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

test('track-anonymous-usage-events does not perform IP geo enrichment', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-anonymous-usage-events/index.ts'),
    'utf8'
  );

  assert.ok(!/x-forwarded-for/i.test(source), 'collector should not read forwarded IP headers');
  assert.ok(!/x-real-ip/i.test(source), 'collector should not read real IP headers');
  assert.ok(!/ipinfo\.io|ipapi\.co|ipwho\.is/i.test(source), 'collector should not call IP lookup services');
});
