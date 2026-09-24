// Supabase config check (config.toml, not TypeScript): both analytics functions verify auth
// themselves rather than through the runtime JWT gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');

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

// Payload geo handling runs on the real edge functions: supabase/functions/
// track-analytics-events/handler.test.ts ('complete payload geo is stored as sent ...',
// 'a cf-worker payload fix is kept whole ...') and track-anonymous-usage-events/
// collector.test.ts ('payload geo keeps its own country and coordinates ...').
