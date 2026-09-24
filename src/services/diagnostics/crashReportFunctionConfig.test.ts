// Supabase config check (config.toml, not TypeScript): the crash-report collector is public
// because the app sends the project's public key instead of a user token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('report-app-errors disables the runtime JWT gate explicitly', () => {
  const config = readFileSync(path.join(REPO_ROOT, 'supabase/config.toml'), 'utf8');
  assert.match(config, /\[functions\.report-app-errors\]\s*\nverify_jwt\s*=\s*false/);
});
