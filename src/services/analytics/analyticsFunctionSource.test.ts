import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');
const AUTH_FUNCTION_PATH = path.join(
  REPO_ROOT,
  'supabase/functions/track-analytics-events/index.ts'
);
const ANON_FUNCTION_PATH = path.join(
  REPO_ROOT,
  'supabase/functions/track-anonymous-usage-events/index.ts'
);

test('analytics functions pin their JWT runtime behavior explicitly', () => {
  const configSource = readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    configSource,
    /\[functions\.track-analytics-events\][\s\S]*verify_jwt\s*=\s*false/,
    'track-analytics-events should disable the legacy runtime gate and verify auth inside the function'
  );
  assert.match(
    configSource,
    /\[functions\.track-anonymous-usage-events\][\s\S]*verify_jwt\s*=\s*false/,
    'track-anonymous-usage-events should disable the runtime JWT gate for public event writes'
  );
});

test('track-analytics-events accepts explicit geo values from the client payload', () => {
  const source = readFileSync(AUTH_FUNCTION_PATH, 'utf8');

  assert.match(source, /resolveEventGeo/, 'track-analytics-events should inspect event-level geo');
  assert.match(source, /event\.geo_country_code/, 'client country should be accepted when provided');
  assert.match(source, /event\.geo_latitude/, 'client latitude should be accepted when provided');
  assert.match(source, /event\.geo_longitude/, 'client longitude should be accepted when provided');
  assert.match(source, /mergeGeo/, 'payload geo should merge with request-derived geo');
});

test('track-anonymous-usage-events accepts explicit geo values from the client payload', () => {
  const source = readFileSync(ANON_FUNCTION_PATH, 'utf8');

  assert.match(source, /resolveEventGeo/, 'track-anonymous-usage-events should inspect event-level geo');
  assert.match(source, /raw\.geo_country_code/, 'anonymous payload parsing should preserve country code');
  assert.match(source, /raw\.geo_latitude/, 'anonymous payload parsing should preserve latitude');
  assert.match(source, /raw\.geo_longitude/, 'anonymous payload parsing should preserve longitude');
  assert.match(source, /mergeGeo/, 'anonymous payload geo should merge with request-derived geo');
});
