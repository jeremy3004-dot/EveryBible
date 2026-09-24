import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { TranslationCatalogEntry } from './types';
import {
  mockModule,
  mockReactNative,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';

// A keychain that refuses every call: an iOS build without code signing
// (ERR_KEY_CHAIN on each expo-secure-store call), or a real device reading
// before first unlock. supabase-js reads its session through the auth storage
// adapter before every request, anonymous ones included, so a throwing read
// used to fail every catalog request ("Can't reach the Bible library") and
// reject auth-js's un-awaited INITIAL_SESSION emit. This runs the real client
// module and the real supabase-js over that keychain.

const PROJECT_REF = 'abcdefghijklmnop';
const PUBLIC_KEY = 'sb_publishable_test';

const keychain = mockSecureStore(mock);
const keychainFailure = Object.assign(new Error('Keychain unavailable'), {
  code: 'ERR_KEY_CHAIN',
});
keychain.state.failure = keychainFailure;

mockReactNative(mock, { os: 'ios' });
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY,
  },
});

const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

const reported: { source: string; error: unknown }[] = [];
let reportWaiters: (() => void)[] = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reported.push({ source, error });
    const waiters = reportWaiters;
    reportWaiters = [];
    waiters.forEach((resolve) => resolve());
  },
});

const catalogEntry: TranslationCatalogEntry = {
  id: 'row-asv',
  translation_id: 'asv',
  name: 'American Standard Version',
  abbreviation: 'ASV',
  language_code: 'en',
  language_name: 'English',
  license_type: 'public-domain',
  license_url: null,
  source_url: null,
  has_audio: false,
  has_text: true,
  is_bundled: false,
  is_available: true,
  sort_order: 1,
  catalog: {
    version: '2026.01.01',
    updatedAt: '2026-01-01T00:00:00.000Z',
    text: {
      format: 'sqlite',
      version: '2026.01.01',
      downloadUrl: 'https://media.everybible.app/text/asv.db',
      sha256: 'a'.repeat(64),
    },
  },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const requests: { url: string; authorization: string | null }[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  requests.push({ url, authorization: new Headers(init?.headers).get('Authorization') });
  const body = url.includes('/rest/v1/translation_catalog') ? [catalogEntry] : [];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const unhandledRejections: unknown[] = [];
const onUnhandledRejection = (reason: unknown) => {
  unhandledRejections.push(reason);
};
process.on('unhandledRejection', onUnhandledRejection);

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
});

after(() => {
  client.supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
  process.off('unhandledRejection', onUnhandledRejection);
});

test('the Bible library loads with the public key while the keychain cannot be read', async () => {
  const { listAvailableTranslations } = await import('../translations/translationService');

  const result = await listAvailableTranslations();

  assert.equal(result.error, undefined);
  assert.equal(result.success, true);
  assert.deepEqual(
    result.data?.map((entry) => entry.translation_id),
    ['asv']
  );
  const catalogRequest = requests.find((request) =>
    request.url.includes('/rest/v1/translation_catalog')
  );
  assert.equal(catalogRequest?.authorization, `Bearer ${PUBLIC_KEY}`);
});

test('an auth listener hears INITIAL_SESSION with no session instead of an unhandled rejection', async () => {
  const unhandledBefore = unhandledRejections.length;
  const outcome = await new Promise<string>((resolve) => {
    const onRejection = () => resolve('unhandled rejection');
    process.once('unhandledRejection', onRejection);
    client.supabase.auth.onAuthStateChange((event, session) => {
      process.off('unhandledRejection', onRejection);
      resolve(`${event}:${session === null ? 'no session' : 'session'}`);
    });
  });

  assert.equal(outcome, 'INITIAL_SESSION:no session');
  assert.deepEqual(unhandledRejections.slice(unhandledBefore), []);
});

test('an unreadable keychain at launch leaves the session unchecked rather than signed out', async () => {
  const { getCurrentSession } = await import('../auth/authSession');

  const restored = await getCurrentSession();

  assert.deepEqual(restored, { session: null, user: null, restoreFailed: true });
});

test(
  'keychain failures are reported once per launch as auth.keychain',
  { timeout: 5_000 },
  async () => {
    if (!reported.some((entry) => entry.source === 'auth.keychain')) {
      await new Promise<void>((resolve) => reportWaiters.push(resolve));
    }
    // More reads and a write while the keychain still refuses.
    await client.supabase.auth.getSession();
    await client.supabase.auth.signOut({ scope: 'local' });

    assert.deepEqual(reported, [{ source: 'auth.keychain', error: keychainFailure }]);
    assert.deepEqual(unhandledRejections, []);
  }
);
