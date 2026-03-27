import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getCurrentSession, signOut as authSignOut } from '../services/auth';
import type { User, UserPreferences } from '../types';
import type { Session, Subscription } from '@supabase/supabase-js';
import { resolveInitializedAuthState } from './authSessionState';
import { defaultAuthPreferences, sanitizePersistedAuthState } from './persistedStateSanitizers';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  preferences: UserPreferences;
  preferencesUpdatedAt: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  applySyncedPreferences: (preferences: UserPreferences, updatedAt: string | null) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

let authSubscription: Subscription | null = null;

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

      setUser: (user) =>
        set({
          user,
          isAuthenticated: user !== null,
        }),

      setSession: (session) =>
        set({
          session,
          user: session?.user ? mapSupabaseUser(session.user) : null,
          isAuthenticated: session !== null,
        }),

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
            state.preferences.language !== preferences.language ||
            state.preferences.countryCode !== preferences.countryCode ||
            state.preferences.countryName !== preferences.countryName ||
            state.preferences.contentLanguageCode !== preferences.contentLanguageCode ||
            state.preferences.contentLanguageName !== preferences.contentLanguageName ||
            state.preferences.contentLanguageNativeName !== preferences.contentLanguageNativeName ||
            state.preferences.onboardingCompleted !== preferences.onboardingCompleted ||
            state.preferences.chapterFeedbackEnabled !== preferences.chapterFeedbackEnabled ||
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
        await authSignOut();
        set({
          user: null,
          session: null,
          isAuthenticated: false,
          preferencesUpdatedAt: null,
        });
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
      }),
      merge: (persistedState, currentState) => {
        const sanitized = sanitizePersistedAuthState(persistedState);

        return {
          ...currentState,
          user: sanitized.user,
          isAuthenticated: sanitized.isAuthenticated,
          preferences: sanitized.preferences,
          preferencesUpdatedAt: sanitized.preferencesUpdatedAt,
        };
      },
    }
  )
);
