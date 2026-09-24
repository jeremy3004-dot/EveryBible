import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { mockModule, mockSecureStore, sourcePath } from '../../testing/mockModules';

const secureStore = mockSecureStore(mock, {
  'sb-projref-auth-token': 'session',
  'sb-projref-auth-token-code-verifier': 'verifier',
  'everybible.translatorReview.passcode': '123456',
  'everybible.feedback.councilPasscode': '654321',
  'everybible.privacy.settings': 'kept for clearPrivacySettings',
  'unrelated-key': 'kept',
});
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: { EXPO_PUBLIC_SUPABASE_URL: 'https://projref.supabase.co' },
});

let credentials: typeof import('./reinstalledCredentials');

before(async () => {
  credentials = await import('./reinstalledCredentials');
});

const supabaseJsStorageKey = (url: string): unknown =>
  Reflect.get(
    createClient(url, 'public-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth,
    'storageKey'
  );

for (const url of [
  'https://abcdefghijklmnop.supabase.co',
  'https://AbCdEf.Supabase.co/',
  'https://api.example.com:8443/base',
  'http://localhost:54321',
  'http://127.0.0.1:54321',
  'https://user:secret@proj.supabase.co',
]) {
  test(`the derived session key matches supabase-js for ${url}`, () => {
    assert.equal(credentials.getSupabaseAuthStorageKeys(url)[0], supabaseJsStorageKey(url));
  });
}

test('the session key comes with the PKCE verifier and user keys auth-js writes beside it', () => {
  assert.deepEqual(credentials.getSupabaseAuthStorageKeys(' https://projref.supabase.co '), [
    'sb-projref-auth-token',
    'sb-projref-auth-token-code-verifier',
    'sb-projref-auth-token-user',
  ]);
});

for (const url of [undefined, '', 'not a url', 'https://']) {
  test(`no session keys are derived from ${JSON.stringify(url)}`, () => {
    assert.deepEqual(credentials.getSupabaseAuthStorageKeys(url), []);
  });
}

test('clearing reinstall residue deletes the session and both passcodes and nothing else', async () => {
  await credentials.clearReinstalledCredentials();

  assert.deepEqual(Object.fromEntries(secureStore.store), {
    'everybible.privacy.settings': 'kept for clearPrivacySettings',
    'unrelated-key': 'kept',
  });
  assert.ok(secureStore.calls.every((call) => call.op === 'delete'));
});
