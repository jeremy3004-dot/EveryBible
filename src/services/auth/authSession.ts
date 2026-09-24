import { supabase, isSupabaseConfigured } from '../supabase';
import type { User } from '../../types';
import type { Session } from '@supabase/supabase-js';
import { isKeychainError } from '../privacy/keychainError';
import { isAuthSessionStorageUnreadable } from '../supabase/authSessionStorage';

// Session restore runs during critical startup (authStore.initialize), before
// Home paints. It needs only the Supabase client, so it lives apart from
// authService, whose sign-in flows import the Google and Apple native SDKs.

// Convert Supabase user to app User type
export const mapSupabaseUser = (supabaseUser: {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string; display_name?: string };
  created_at?: string;
}): User => ({
  uid: supabaseUser.id,
  email: supabaseUser.email ?? null,
  displayName:
    supabaseUser.user_metadata?.display_name || supabaseUser.user_metadata?.full_name || null,
  photoURL: supabaseUser.user_metadata?.avatar_url ?? null,
  createdAt: supabaseUser.created_at ? new Date(supabaseUser.created_at).getTime() : Date.now(),
  lastActive: Date.now(),
});

// Restore the persisted session at launch.
export interface RestoredAuthSession {
  session: Session | null;
  user: User | null;
  /**
   * True when the session could not be checked (offline token refresh, unreadable
   * secure storage). The reader may still be signed in: auth-js keeps a session
   * whose refresh failed for a retryable reason. Callers must not treat this as
   * a sign-out, or an offline cold start erases the account's unsynced data.
   */
  restoreFailed?: true;
  /**
   * True when `session` is the stored session whose access token expired and
   * could not be refreshed yet (offline launch). It identifies the reader, but
   * its token must not be used: auth-js refreshes it when the network returns
   * (TOKEN_REFRESHED), or signs out if the server rejects it (SIGNED_OUT).
   */
  awaitingTokenRefresh?: true;
}

// auth-js names the error class explicitly, so the name survives minification.
const isRetryableAuthFetchError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === 'AuthRetryableFetchError';

// auth-js treats a token as expired this long before expires_at (EXPIRY_MARGIN_MS).
const TOKEN_EXPIRY_MARGIN_MS = 90_000;

// Cheap offline check (session restore at launch, sign-out): one NetInfo read,
// no network. Loaded lazily so NetInfo stays off the import graph of everything
// that imports this module. An unreadable state counts as online.
export const isDeviceOffline = async (): Promise<boolean> => {
  try {
    const NetInfo = require('@react-native-community/netinfo')
      .default as typeof import('@react-native-community/netinfo').default;
    const { isConnected, isInternetReachable } = await NetInfo.fetch();
    return isConnected === false || isInternetReachable === false;
  } catch {
    return false;
  }
};

const isStoredSession = (value: unknown): value is Session => {
  const candidate = value as Partial<Session> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.access_token === 'string' &&
    typeof candidate.refresh_token === 'string' &&
    candidate.refresh_token.length > 0 &&
    typeof candidate.expires_at === 'number' &&
    typeof candidate.user?.id === 'string'
  );
};

/**
 * The session auth-js persisted, read without refreshing it and without waiting for
 * auth-js's session lock. Reading through the client's own storage and key keeps this
 * in step with auth-js. Null when there is none or it cannot be read.
 */
export const readStoredSession = async (): Promise<Session | null> => {
  try {
    const { storage, storageKey } = supabase.auth as unknown as {
      storage?: { getItem: (key: string) => Promise<string | null> | string | null };
      storageKey?: unknown;
    };
    if (!storage || typeof storageKey !== 'string') {
      return null;
    }
    const raw = await storage.getItem(storageKey);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    return isStoredSession(stored) ? stored : null;
  } catch {
    return null;
  }
};

/** Whether auth-js would refresh this session's access token before using it. */
export const isAccessTokenExpired = (session: Pick<Session, 'expires_at'>): boolean =>
  (session.expires_at ?? 0) * 1000 - Date.now() < TOKEN_EXPIRY_MARGIN_MS;

/** The stored session when its access token has expired; null otherwise. */
const readExpiredStoredSession = async (): Promise<Session | null> => {
  const stored = await readStoredSession();
  return stored && isAccessTokenExpired(stored) ? stored : null;
};

// The crash queue is loaded only when there is a failure to report, and reporting never
// throws into startup.
const reportRestoreFailure = (error: unknown): void => {
  void import('../diagnostics/crashReportQueue')
    .then(({ reportHandledError }) =>
      reportHandledError(isKeychainError(error) ? 'auth.keychain' : 'auth.sessionRestore', error)
    )
    .catch(() => undefined);
};

const awaitingRefresh = (session: Session): RestoredAuthSession => ({
  session,
  user: mapSupabaseUser(session.user),
  awaitingTokenRefresh: true,
});

export const getCurrentSession = async (): Promise<RestoredAuthSession> => {
  if (!isSupabaseConfigured()) {
    return { session: null, user: null };
  }

  try {
    // getSession() refreshes an expired token first, and offline auth-js retries
    // that refresh for about 50 s. Offline, restore the stored session at once
    // instead; the refresh carries on in the background.
    if (await isDeviceOffline()) {
      const stored = await readExpiredStoredSession();
      if (stored) {
        return awaitingRefresh(stored);
      }
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (session?.user) {
      return { session, user: mapSupabaseUser(session.user) };
    }

    if (isRetryableAuthFetchError(error)) {
      // The network failed although NetInfo reported one: auth-js kept the session.
      const stored = await readExpiredStoredSession();
      return stored ? awaitingRefresh(stored) : { session: null, user: null, restoreFailed: true };
    }

    // The keychain adapter answers a failed read with "no session" so anonymous
    // requests still work; that answer is not a sign-out.
    if (isAuthSessionStorageUnreadable()) {
      return { session: null, user: null, restoreFailed: true };
    }

    return { session: null, user: null };
  } catch (error) {
    // Not a sign-out: the app starts as a guest for now and auth-js keeps whatever it holds.
    console.error('Failed to restore auth session:', error);
    reportRestoreFailure(error);
    return { session: null, user: null, restoreFailed: true };
  }
};
