import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'scripts', 'upload-bsb-audio-fast.py'),
  'utf8'
);

const quickReference = readFileSync(path.join(process.cwd(), 'QUICK_REFERENCE.md'), 'utf8');

test('upload-bsb-audio-fast reads Supabase credentials from the environment', () => {
  assert.match(source, /require_env\("SUPABASE_URL"\)/);
  assert.match(source, /require_env\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(source, /^SUPABASE_URL\s*=\s*["'][^"']+["']/m);
  assert.doesNotMatch(source, /^SERVICE_KEY\s*=\s*["'][^"']+["']/m);
});

test('quick reference does not contain a live Gemini key', () => {
  assert.match(quickReference, /\$\{GEMINI_API_KEY\}/);
  assert.doesNotMatch(quickReference, /AIza[0-9A-Za-z_-]{20,}/);
});
