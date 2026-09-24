import { supabase, isSupabaseConfigured } from '../supabase';
import type { User } from '../../types';
import type { Session } from '@supabase/supabase-js';

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
}

// auth-js names the error class explicitly, so the name survives minification.
const isRetryableAuthFetchError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === 'AuthRetryableFetchError';

export const getCurrentSession = async (): Promise<RestoredAuthSession> => {
  if (!isSupabaseConfigured()) {
    return { session: null, user: null };
  }

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (session?.user) {
      return { session, user: mapSupabaseUser(session.user) };
    }

    if (isRetryableAuthFetchError(error)) {
      return { session: null, user: null, restoreFailed: true };
    }

    return { session: null, user: null };
  } catch (error) {
    console.error('Failed to restore auth session:', error);
    return { session: null, user: null, restoreFailed: true };
  }
};
