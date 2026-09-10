import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// Companion to client.behavior.test.ts and client.unconfigured.behavior.test.ts.
// HAS_SUPABASE_CONFIG is a module-level constant, so the half-configured build —
// a valid https URL shipped without either key — needs its own file. Without
// this scenario, dropping `&& Boolean(SUPABASE_PUBLIC_KEY)` from the gate passes
// the whole suite, and every caller would then build a client with an empty key
// instead of taking the offline path.

let createClientCalls = 0;
const supabaseJsExports = {
  createClient: () => {
    createClientCalls += 1;
    return { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } };
  },
  SupabaseClient: class {},
};
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
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    // Neither EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY nor the legacy anon key.
  },
});

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
});

test('a build whose Supabase URL is set but whose key is missing reports itself as unconfigured', () => {
  assert.equal(client.isSupabaseConfigured(), false);
});

test('getCurrentUserId short-circuits to null rather than building a keyless client', async () => {
  assert.equal(await client.getCurrentUserId(), null);
  assert.equal(createClientCalls, 0);
});
