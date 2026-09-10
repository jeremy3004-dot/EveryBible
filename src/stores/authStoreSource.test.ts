/**
 * Import-graph guard by design: authStore is on App.tsx's static boot graph, so this
 * file asserts on the source text of the imports rather than on behaviour. Every
 * behaviour of the store itself is covered through the real module in authStore.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'authStore.ts'),
  'utf8'
);

test('auth store keeps supabase-js and the native sign-in SDKs off the cold-start path', () => {
  assert.equal(
    source.includes("import { supabase, isSupabaseConfigured } from '../services/supabase';"),
    false,
    'authStore is on App.tsx static boot graph — a static supabase import evaluates ~520KB of supabase-js on every cold start'
  );
  assert.equal(
    source.includes(
      "import { getCurrentSession, signOut as authSignOut } from '../services/auth';"
    ),
    false,
    'a static services/auth import pulls google-signin and expo-apple-authentication into cold start'
  );

  assert.match(
    source,
    /const getSupabaseModule = \(\): typeof import\('\.\.\/services\/supabase'\) =>\s*require\('\.\.\/services\/supabase'\);/,
    'the supabase module should be required lazily at the call site, keeping only the erased import type static'
  );
  assert.match(
    source,
    /const getAuthModule = \(\): typeof import\('\.\.\/services\/auth'\) => require\('\.\.\/services\/auth'\);/,
    'the auth service should be required lazily at the call site'
  );
});
