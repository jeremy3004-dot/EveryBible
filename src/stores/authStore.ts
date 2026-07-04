import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getCurrentSession, signOut as authSignOut } from '../services/auth';
import type { User, UserPreferences } from '../types';
import type { Session, Subscription } from '@supabase/supabase-js';
import { resolveInitializedAuthState, resolveUserStateUpdate } from './authSessionState';
import { defaultAuthPreferences, sanitizePersistedAuthState } from './persistedStateSanitizers';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  preferences: UserPreferences;
  preferencesUpdatedAt: string | null;
  // uid of the account whose per-user data currently lives in the local stores.
  // Used to detect an account switch on sign-in so account B never inherits
  // account A's local reading data (H2).
  lastSyncedUserId: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  applySyncedPreferences: (preferences: UserPreferences, updatedAt: string | null) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  // Reconcile the auth boundary before the first post-sign-in sync: if the newly
  // authenticated uid differs from the last-synced uid, reset all per-user
  // stores so the previous account's local data is never merged into this one.
  reconcileUserBoundary: (userId: string) => void;
}

let authSubscription: Subscription | null = null;

// Minimal structural view of a store that exposes resetForSignOut. Used so this
// module does not depend on the full (and still-evolving) types of the sibling
// stores; the method is optional-chained at the call site.
interface ResettableStore {
  getState: () => { resetForSignOut?: () => void };
}

// Reset every per-user store back to its initial state at an auth boundary
// (sign-out, or sign-in as a different account). Optional-chained so it is safe
// regardless of module load order across the sibling stores. `require` avoids a
// static import cycle (sync/services import authStore).
const resetPerUserStores = (): void => {
  const stores: ResettableStore[] = [
    require('./progressStore').useProgressStore,
    require('./bibleStore').useBibleStore,
    // Exported as `readingPlansStore` (not the use-prefixed name).
    require('./readingPlansStore').readingPlansStore,
    require('./fourFieldsStore').useFourFieldsStore,
  ];

  for (const store of stores) {
    store.getState().resetForSignOut?.();
  }
};

// Convert Supabase user to app User type
const mapSupabaseUser = (supabaseUser: {
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

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] auth:pre-create', Date.now());
}
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      preferences: defaultAuthPreferences,
      preferencesUpdatedAt: null,
      lastSyncedUserId: null,

      setUser: (user) => {
        set((state) =>
          resolveUserStateUpdate({
            session: state.session,
            user,
          })
        );
        // Reconcile the auth boundary synchronously at the identity change so a
        // switched account never briefly sees the previous account's local data
        // before the deferred sync effect runs (H2). reconcileUserBoundary is a
        // no-op unless the incoming non-null uid differs from lastSyncedUserId,
        // so first sign-in, token refresh, and returning-same-user launches do
        // not wipe.
        if (user?.uid) {
          get().reconcileUserBoundary(user.uid);
        }
      },

      setSession: (session) => {
        const user = session?.user ? mapSupabaseUser(session.user) : null;
        set({
          session,
          user,
          isAuthenticated: session !== null,
        });
        // Same synchronous auth-boundary reconcile as setUser: a session swap
        // to a different account resets per-user stores immediately; same-uid
        // token refreshes and returning-same-user launches are a no-op (H2).
        if (user?.uid) {
          get().reconcileUserBoundary(user.uid);
        }
      },

      setLoading: (isLoading) => set({ isLoading }),

      setPreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
          preferencesUpdatedAt: new Date().toISOString(),
        })),

      applySyncedPreferences: (preferences, updatedAt) =>
        set((state) => {
          const preferencesChanged =
            state.preferences.fontSize !== preferences.fontSize ||
            state.preferences.theme !== preferences.theme ||
            state.preferences.appearancePalette !== preferences.appearancePalette ||
            state.preferences.language !== preferences.language ||
            state.preferences.countryCode !== preferences.countryCode ||
            state.preferences.countryName !== preferences.countryName ||
            state.preferences.contentLanguageCode !== preferences.contentLanguageCode ||
            state.preferences.contentLanguageName !== preferences.contentLanguageName ||
            state.preferences.contentLanguageNativeName !== preferences.contentLanguageNativeName ||
            state.preferences.chapterFeedbackName !== preferences.chapterFeedbackName ||
            state.preferences.chapterFeedbackRole !== preferences.chapterFeedbackRole ||
            state.preferences.onboardingCompleted !== preferences.onboardingCompleted ||
            state.preferences.chapterFeedbackEnabled !== preferences.chapterFeedbackEnabled ||
            state.preferences.hidePlayButtonFromReadingTab !==
              preferences.hidePlayButtonFromReadingTab ||
            state.preferences.notificationsEnabled !== preferences.notificationsEnabled ||
            state.preferences.reminderTime !== preferences.reminderTime;

          if (!preferencesChanged && state.preferencesUpdatedAt === updatedAt) {
            return state;
          }

          return {
            preferences,
            preferencesUpdatedAt: updatedAt,
          };
        }),

      signOut: async () => {
        const previousUserId = get().user?.uid ?? null;

        // Deactivate the push token BEFORE tearing down the session, while it
        // still exists so the RLS-protected user_devices update is allowed (M9).
        if (previousUserId) {
          try {
            const { deactivatePushToken } = await import('../services/notifications');
            await deactivatePushToken(previousUserId);
          } catch {
            // Best-effort: never block sign-out on token cleanup.
          }
        }

        await authSignOut();

        // Clear all per-user local stores so the next account on this device
        // never inherits or merges this account's reading data (H2).
        resetPerUserStores();

        set({
          user: null,
          session: null,
          isAuthenticated: false,
          preferencesUpdatedAt: null,
          lastSyncedUserId: null,
        });
      },

      reconcileUserBoundary: (userId) => {
        const { lastSyncedUserId } = get();
        if (lastSyncedUserId && lastSyncedUserId !== userId) {
          // Account switched on this device without a sign-out in between:
          // wipe the previous account's per-user local data before the first
          // sync so it is never merged into the new account (H2).
          resetPerUserStores();
        }
        if (lastSyncedUserId !== userId) {
          set({ lastSyncedUserId: userId });
        }
      },

      initialize: async () => {
        if (get().isInitialized) return;

        set({ isLoading: true });

        try {
          const hasSupabaseConfig = isSupabaseConfigured();
          const restoredState = hasSupabaseConfig
            ? resolveInitializedAuthState(await getCurrentSession())
            : resolveInitializedAuthState({ session: null, user: null });

          set(restoredState);

          if (hasSupabaseConfig) {
            // Get current session
            if (!authSubscription) {
              const { data } = supabase.auth.onAuthStateChange((_event, session) => {
                if (session?.user) {
                  set({
                    session,
                    user: mapSupabaseUser(session.user),
                    isAuthenticated: true,
                  });
                } else {
                  set({
                    session: null,
                    user: null,
                    isAuthenticated: false,
                  });
                }
              });
              authSubscription = data.subscription;
            }
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
        } finally {
          set({ isLoading: false, isInitialized: true });
        }
      },
    }),
    {
      name: 'auth-storage',
      version: 3,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as AuthState;
        }

        const typedState = persistedState as AuthState;
        if (version < 2) {
          return {
            ...typedState,
            preferences: {
              ...defaultAuthPreferences,
              ...typedState.preferences,
              // Existing installs should not be blocked by the new onboarding gate.
              onboardingCompleted: typedState.preferences?.onboardingCompleted ?? true,
            },
            preferencesUpdatedAt: null,
          };
        }

        if (version < 3) {
          return {
            ...typedState,
            preferences: {
              ...defaultAuthPreferences,
              ...typedState.preferences,
            },
            preferencesUpdatedAt: null,
          };
        }

        return {
          ...typedState,
          preferences: {
            ...defaultAuthPreferences,
            ...typedState.preferences,
          },
        };
      },
      partialize: (state) => ({
        preferences: state.preferences,
        preferencesUpdatedAt: state.preferencesUpdatedAt,
        lastSyncedUserId: state.lastSyncedUserId,
      }),
      merge: (persistedState, currentState) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[EB-T] auth:merge-start', Date.now());
        }
        const sanitized = sanitizePersistedAuthState(persistedState);
        const persistedLastSyncedUserId =
          persistedState &&
          typeof persistedState === 'object' &&
          typeof (persistedState as { lastSyncedUserId?: unknown }).lastSyncedUserId === 'string'
            ? (persistedState as { lastSyncedUserId: string }).lastSyncedUserId
            : null;

        const merged = {
          ...currentState,
          user: sanitized.user,
          isAuthenticated: sanitized.isAuthenticated,
          preferences: sanitized.preferences,
          preferencesUpdatedAt: sanitized.preferencesUpdatedAt,
          lastSyncedUserId: persistedLastSyncedUserId,
        };
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[EB-T] auth:merge-done', Date.now());
        }
        return merged;
      },
    }
  )
);
