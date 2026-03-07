import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getCurrentSession, signOut as authSignOut } from '../services/auth';
import type { User, UserPreferences } from '../types';
import type { Session, Subscription } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  preferences: UserPreferences;

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

const defaultPreferences: UserPreferences = {
  fontSize: 'medium',
  theme: 'dark',
  language: 'en',
  countryCode: null,
  countryName: null,
  contentLanguageCode: null,
  contentLanguageName: null,
  contentLanguageNativeName: null,
  onboardingCompleted: false,
  notificationsEnabled: false,
  reminderTime: null,
};

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
      preferences: defaultPreferences,

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
        })),

      signOut: async () => {
        await authSignOut();
        set({
          user: null,
          session: null,
          isAuthenticated: false,
        });
      },

      initialize: async () => {
        if (get().isInitialized) return;

        set({ isLoading: true });

        try {
          if (isSupabaseConfigured()) {
            // Get current session
            const { session, user } = await getCurrentSession();

            if (session && user) {
              set({
                session,
                user,
                isAuthenticated: true,
              });
            }

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
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as AuthState;
        }

        const typedState = persistedState as AuthState;
        if (version < 2) {
          return {
            ...typedState,
            preferences: {
              ...defaultPreferences,
              ...typedState.preferences,
              // Existing installs should not be blocked by the new onboarding gate.
              onboardingCompleted: typedState.preferences?.onboardingCompleted ?? true,
            },
          };
        }

        return {
          ...typedState,
          preferences: {
            ...defaultPreferences,
            ...typedState.preferences,
          },
        };
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        preferences: state.preferences,
      }),
    }
  )
);
