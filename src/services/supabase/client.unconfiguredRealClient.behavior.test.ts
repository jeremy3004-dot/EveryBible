import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// The real supabase-js is loaded here on purpose. A release build shipped with
// an empty EXPO_PUBLIC_SUPABASE_URL crashed at launch with "supabaseUrl is
// required": useSync (mounted by AppRuntimeEffects) touched `supabase.auth`,
// the lazy accessor built the client, and createClient('') threw. The app is
// offline-first, so a build without backend config must degrade instead.

mockModule(mock, 'expo-secure-store', {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
});

mockReactNative(mock, { os: 'ios' });

mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: { EXPO_PUBLIC_SUPABASE_URL: '' },
});

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
});

after(() => {
  // startAutoRefresh owns an interval; stop it so the file can exit.
  client.supabase.auth.stopAutoRefresh();
});

test('touching supabase.auth in a build without a Supabase URL does not throw', () => {
  assert.equal(client.isSupabaseConfigured(), false);
  assert.doesNotThrow(() => {
    client.supabase.auth.startAutoRefresh();
    client.supabase.auth.stopAutoRefresh();
  });
});

test('an unconfigured build reports no session rather than failing', async () => {
  const { data, error } = await client.supabase.auth.getSession();

  assert.equal(error, null);
  assert.equal(data.session, null);
});

test('an auth listener can subscribe and unsubscribe in an unconfigured build', () => {
  const {
    data: { subscription },
  } = client.supabase.auth.onAuthStateChange(() => {});

  assert.doesNotThrow(() => subscription.unsubscribe());
});
