import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('track-anonymous-usage-events is the unified auth-OPTIONAL ingestion endpoint', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-anonymous-usage-events/index.ts'),
    'utf8'
  );

  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/, 'collector must use the service role key');
  assert.match(source, /from\(['"]analytics_events['"]\)/, 'collector should insert into analytics_events');

  // Auth is OPTIONAL: a valid user token attributes user_id, everything else is null.
  assert.match(source, /resolveUserId/, 'collector should resolve an optional user id');
  assert.match(source, /looksLikeUserToken/, 'collector should cheaply pre-filter non-user tokens');
  assert.match(source, /auth\.getUser/, 'collector should verify a present user token');
  assert.match(source, /user_id:.*attribution_user_id.*userId/, 'rows must carry the optionally-resolved user id');

  // Backward compatibility: it must NEVER reject a request for missing/invalid auth,
  // so app builds <=1.0.4 (anon-only traffic) keep working.
  assert.ok(
    !/Missing auth token/.test(source),
    'collector must not reject unauthenticated requests'
  );
  assert.match(
    source,
    /if \(!token \|\| !looksLikeUserToken\(token\)\) return null;/,
    'absent/invalid tokens must resolve user_id to null (never throw/reject)'
  );
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
