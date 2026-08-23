import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getCurrentSession, signOut as authSignOut } from '../services/auth';
import type { User, UserPreferences } from '../types';
import type { Session, Subscription } from '@supabase/supabase-js';
import {
  applyAuthBoundaryEffects,
  resolveInitializedAuthState,
  resolveUserStateUpdate,
  shouldResetPerUserStateAtAuthBoundary,
} from './authSessionState';
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
  // Monotonic auth boundary generation. A uid can be reused after sign-out and
  // sign-in, so uid equality alone must not keep an old continuation alive.
  authGeneration: number;

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
  reconcileUserBoundary: (userId: string, previousUserId?: string | null) => void;
}

let authSubscription: Subscription | null = null;

// Minimal structural view of a store that exposes resetForSignOut. Used so this
// module does not depend on the full (and still-evolving) types of the sibling
// stores; the method is optional-chained at the call site.
interface ResettableStore {
  getState: () => { resetForSignOut?: () => void };
}

// Guest plan unenroll tombstones are local-only and must never be interpreted
// as deletes for the first authenticated account. Consume only those markers
// while preserving the guest's normal reading progress and preferences.
const clearGuestPlanTombstones = (): void => {
  require('./readingPlansStore').readingPlansStore.getState().clearPendingUnenrolls?.();
};

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
    // Translator mode and per-device listened-markers must not bleed across
    // account switches (A1). The passcode is a shared secret but enabled state
    // and markers are per-session and should be cleared here.
    require('./translatorReviewStore').useTranslatorReviewStore,
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
      authGeneration: 0,

      setUser: (user) => {
        const previousUserId = get().user?.uid ?? null;
        const nextUserId = user?.uid ?? null;
        set((state) => {
          const update = resolveUserStateUpdate({
            session: state.session,
            user,
          });
          return {
            ...update,
            authGeneration: state.authGeneration + (previousUserId === nextUserId ? 0 : 1),
          };
        });
        // Reconcile the auth boundary synchronously at the identity change so a
        // switched account never sees previous-account data; first sign-in
        // preserves normal guest progress while consuming guest tombstones.
        if (nextUserId) {
          get().reconcileUserBoundary(nextUserId, previousUserId);
        } else if (
          shouldResetPerUserStateAtAuthBoundary({
            previousUserId,
            nextUserId,
            lastSyncedUserId: get().lastSyncedUserId,
          })
        ) {
          applyAuthBoundaryEffects(
            {
              previousUserId,
              nextUserId,
              lastSyncedUserId: get().lastSyncedUserId,
            },
            {
              resetPerUserState: resetPerUserStores,
              resetPreferences: () =>
                set({
                  preferences: defaultAuthPreferences,
                  preferencesUpdatedAt: null,
                  lastSyncedUserId: null,
                }),
              clearGuestTombstones: clearGuestPlanTombstones,
            }
          );
        }
      },

      setSession: (session) => {
        const user = session?.user ? mapSupabaseUser(session.user) : null;
        const previousUserId = get().user?.uid ?? null;
        const nextUserId = user?.uid ?? null;
        set((state) => ({
          session,
          user,
          isAuthenticated: session !== null,
          authGeneration: state.authGeneration + (previousUserId === nextUserId ? 0 : 1),
        }));
        // Same synchronous auth-boundary reconcile as setUser: a session swap
        // resets previous-account stores; first sign-in preserves guest data
        // while consuming guest tombstones (H2).
        if (nextUserId) {
          get().reconcileUserBoundary(nextUserId, previousUserId);
        } else if (
          shouldResetPerUserStateAtAuthBoundary({
            previousUserId,
            nextUserId,
            lastSyncedUserId: get().lastSyncedUserId,
          })
        ) {
          applyAuthBoundaryEffects(
            {
              previousUserId,
              nextUserId,
              lastSyncedUserId: get().lastSyncedUserId,
            },
            {
              resetPerUserState: resetPerUserStores,
              resetPreferences: () =>
                set({
                  preferences: defaultAuthPreferences,
                  preferencesUpdatedAt: null,
                  lastSyncedUserId: null,
                }),
              clearGuestTombstones: clearGuestPlanTombstones,
            }
          );
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
          preferences: defaultAuthPreferences,
          preferencesUpdatedAt: null,
          lastSyncedUserId: null,
          authGeneration: get().authGeneration + (previousUserId ? 1 : 0),
        });
      },

      reconcileUserBoundary: (userId, previousUserId = get().user?.uid ?? null) => {
        const { lastSyncedUserId } = get();
        applyAuthBoundaryEffects(
          {
            previousUserId,
            nextUserId: userId,
            lastSyncedUserId,
          },
          {
            resetPerUserState: resetPerUserStores,
            resetPreferences: () =>
              set({ preferences: defaultAuthPreferences, preferencesUpdatedAt: null }),
            clearGuestTombstones: clearGuestPlanTombstones,
          }
        );
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

          // Route restored sessions through the same synchronous boundary as
          // interactive auth. This clears stale persisted A state before the
          // initialized UI can render as B (or as signed-out guest).
          get().setSession(restoredState.session);

          if (hasSupabaseConfig) {
            // Get current session
            if (!authSubscription) {
              const { data } = supabase.auth.onAuthStateChange((_event, session) => {
                if (session?.user) {
                  // Route auth callbacks through the same boundary-aware action
                  // as interactive sign-in so an account swap resets local
                  // per-user stores before any sync continuation can run.
                  get().setSession(session);
                } else {
                  get().setSession(null);
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
