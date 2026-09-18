import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

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
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
  },
});

let client: typeof import('./client');

before(async () => {
  Object.assign(globalThis, { __DEV__: true });
  client = await import('./client');
});

test('development builds can use an isolated loopback backend', () => {
  assert.equal(client.isSupabaseConfigured(), true);
  assert.equal(createClientCalls, 0);
});
