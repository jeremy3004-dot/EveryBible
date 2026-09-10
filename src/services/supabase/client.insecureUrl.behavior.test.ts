import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// Companion to client.behavior.test.ts. `HAS_SUPABASE_CONFIG` is a module-level
// constant computed from a hand-rolled scheme check (the WHATWG `new URL()`
// polyfill is deliberately avoided on the cold-start path), so the "the build
// was pointed at a plaintext endpoint" branch needs its own file.

let createClientCalls = 0;
const supabaseJsExports = {
  createClient: () => {
    createClientCalls += 1;
    return { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } };
  },
  SupabaseClient: class {},
};
// Dual package: mock the ESM specifier and the resolved CJS entry that tsx's
// CommonJS output actually requires.
mockModule(mock, '@supabase/supabase-js', supabaseJsExports);
mockModule(
  mock,
  createRequire(import.meta.url).resolve('@supabase/supabase-js'),
  supabaseJsExports
);

mockModule(mock, 'expo-secure-store', {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
});

mockReactNative(mock, { os: 'ios' });

mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: 'http://project.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
  },
});

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
});

test('a plaintext http Supabase URL is refused even when a key is present', () => {
  assert.equal(client.isSupabaseConfigured(), false);
});

test('getCurrentUserId short-circuits to null rather than talking to a plaintext endpoint', async () => {
  assert.equal(await client.getCurrentUserId(), null);
  assert.equal(createClientCalls, 0);
});
