import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// Companion to client.behavior.test.ts. HAS_SUPABASE_CONFIG is a module-level
// constant, so the "this build ships without a backend" branch needs its own
// file with an empty runtime config.

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
  publicRuntimeConfig: {},
});

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
});

test('a build with no Supabase URL or key reports itself as unconfigured', () => {
  assert.equal(client.isSupabaseConfigured(), false);
});

test('getCurrentUserId short-circuits to null without ever building a client', async () => {
  assert.equal(await client.getCurrentUserId(), null);
  assert.equal(createClientCalls, 0);
});
