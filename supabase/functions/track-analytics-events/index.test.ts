import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('track-analytics-events edge function reads client IP from forwarded headers', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-analytics-events/index.ts'),
    'utf8'
  );

  assert.match(source, /x-forwarded-for/i);
  assert.match(source, /x-real-ip/i);
  assert.match(source, /ipinfo\.io|ipapi\.co|ipwho\.is/i);
});

test('track-analytics-events prefers explicit payload geo when the client provides it', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-analytics-events/index.ts'),
    'utf8'
  );

  assert.match(source, /event\.geo_country_code/, 'payload country should be read');
  assert.match(source, /event\.geo_latitude/, 'payload latitude should be read');
  assert.match(source, /event\.geo_longitude/, 'payload longitude should be read');
  assert.match(source, /mergeGeo/, 'payload geo should merge with request geo');
});

test('track-analytics-events edge function prefers explicit geo from the event payload', async () => {
  const source = await readFile(
    path.join(repoRoot, 'supabase/functions/track-analytics-events/index.ts'),
    'utf8'
  );

  assert.match(source, /geo_country_code\?\: string \| null/);
  assert.match(source, /geo_latitude\?\: number \| null/);
  assert.match(source, /geo_longitude\?\: number \| null/);
  assert.match(source, /resolveEventGeo/);
  assert.match(source, /mergeGeo/);
});
