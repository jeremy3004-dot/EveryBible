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
