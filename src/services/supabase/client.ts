import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';
import { createAuthSessionStorage, type AuthSessionStorage } from './authSessionStorage';
import { createLazyClientAccessor } from './lazyClient';
import { createRequestTimeoutFetch } from './requestTimeoutFetch';
import { installSecureRandomValues } from './secureRandomValues';

const SUPABASE_URL = publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_PUBLIC_KEY =
  publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

// Avoid the WHATWG `new URL()` polyfill here — it is pure JS on Hermes (no JIT)
// and this runs at module-eval on every cold start. A scheme check is all we need.
const hasValidSupabaseUrl = (value: string): boolean =>
  /^https:\/\//i.test(value.trim()) ||
  (typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(value.trim()));

const HAS_SUPABASE_CONFIG = hasValidSupabaseUrl(SUPABASE_URL) && Boolean(SUPABASE_PUBLIC_KEY);

// A build without usable backend config still gets a working client object:
// createClient('') throws "supabaseUrl is required", and callers such as
// useSync touch `supabase.auth` on mount, so a missing URL used to crash the
// app at launch. The `.invalid` TLD is reserved never to resolve (RFC 2606),
// so every request from this client fails as an ordinary `{ error }` result,
// auth reports no session, and the offline-first app keeps working with sync
// and analytics off. Callers should still gate network work on
// isSupabaseConfigured().
const UNCONFIGURED_SUPABASE_URL = 'https://unconfigured.supabase.invalid';
const UNCONFIGURED_SUPABASE_PUBLIC_KEY = 'unconfigured';
const CLIENT_SUPABASE_URL = HAS_SUPABASE_CONFIG ? SUPABASE_URL : UNCONFIGURED_SUPABASE_URL;
const CLIENT_SUPABASE_PUBLIC_KEY = HAS_SUPABASE_CONFIG
  ? SUPABASE_PUBLIC_KEY
  : UNCONFIGURED_SUPABASE_PUBLIC_KEY;

// Supabase auth storage: localStorage on web, the OS keychain elsewhere. The keychain
// adapter never throws (see authSessionStorage.ts); its first failure is reported
// through the crash queue, loaded only when there is one.
const reportKeychainFailure = (error: unknown): void => {
  void import('../diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError('auth.keychain', error))
    .catch(() => undefined);
};

const keychainAuthStorage = createAuthSessionStorage(SecureStore, reportKeychainFailure);

const ExpoSecureStoreAdapter: AuthSessionStorage =
  Platform.OS === 'web'
    ? {
        getItem: async (key) => localStorage.getItem(key),
        setItem: async (key, value) => localStorage.setItem(key, value),
        removeItem: async (key) => localStorage.removeItem(key),
      }
    : keychainAuthStorage;

const getSupabaseClient = createLazyClientAccessor({
  createClient: () => {
    // Before the client exists, so the PKCE code verifier comes from the
    // platform CSPRNG rather than Math.random() — see secureRandomValues.ts.
    // expo-crypto is required only on runtimes that lack WebCrypto (Hermes).
    installSecureRandomValues(
      globalThis,
      () => require('expo-crypto').getRandomValues as typeof import('expo-crypto').getRandomValues
    );

    return createClient(CLIENT_SUPABASE_URL, CLIENT_SUPABASE_PUBLIC_KEY, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Email links (password reset) open a custom URL scheme that any
        // installed app can also register. With PKCE the link carries only a
        // one-time code, redeemable solely with the code verifier that
        // resetPasswordForEmail stored in this install's SecureStore, instead
        // of a live access and refresh token. Native Google/Apple sign-in uses
        // signInWithIdToken and email sign-in uses signInWithPassword; neither
        // is affected by the flow type.
        flowType: 'pkce',
      },
      global: {
        // Read global fetch per call so RN's (and any test's) fetch is used.
        fetch: createRequestTimeoutFetch((input, init) => globalThis.fetch(input, init)),
      },
    });
  },
});

// Keep the runtime client generic until types can be generated from the live project.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseClient();
    const value = Reflect.get(client as object, property);

    if (typeof value === 'function') {
      return value.bind(client);
    }

    return value;
  },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return HAS_SUPABASE_CONFIG;
};

// The project's public (anon/publishable) key. Callers that must not send the
// signed-in user's token (anonymous crash reports) pass it as Authorization so
// supabase-js does not attach the session JWT.
export const getSupabasePublicKey = (): string => CLIENT_SUPABASE_PUBLIC_KEY;

// Get current user ID helper
export const getCurrentUserId = async (): Promise<string | null> => {
  if (!HAS_SUPABASE_CONFIG) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};
