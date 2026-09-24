import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import type { PreferenceFieldStamps, User, UserPreferences } from '../types';
import type { Session, Subscription } from '@supabase/supabase-js';
import {
  applyAuthBoundaryEffects,
  resolveInitializedAuthState,
  resolveUserStateUpdate,
  shouldResetPerUserStateAtAuthBoundary,
} from './authSessionState';
import { defaultAuthPreferences, sanitizePersistedAuthState } from './persistedStateSanitizers';
import { switchPrivateDataOwner } from './privateDataScope';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  preferences: UserPreferences;
  preferencesUpdatedAt: string | null;
  // The preference values the server held at this device's last reconcile with
  // it. The sync merges per field against this base, so an edit on another
  // device to a different field is not reverted. Null until the first sync.
  preferencesSyncBase: UserPreferences | null;
  // When each preference was last chosen: stamped here on a local edit, or
  // adopted from the server with its value. The sync merges per field on these,
  // so the newest edit wins rather than the newest upload.
  preferenceFieldStamps: PreferenceFieldStamps;
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
  // `base` defaults to `preferences`: pass the server's values instead when the
  // applied preferences still have local edits waiting to upload.
  // `fieldStamps` replaces the per-field stamps when given.
  applySyncedPreferences: (
    preferences: UserPreferences,
    updatedAt: string | null,
    base?: UserPreferences,
    fieldStamps?: PreferenceFieldStamps
  ) => void;
  markPreferencesSynced: (base: UserPreferences) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  // Reconcile the auth boundary before the first post-sign-in sync: if the newly
  // authenticated uid differs from the last-synced uid, reset all per-user
  // stores so the previous account's local data is never merged into this one.
  reconcileUserBoundary: (userId: string, previousUserId?: string | null) => void;
}

let authSubscription: Subscription | null = null;

// @supabase/supabase-js (~520KB) and the native sign-in SDKs (google-signin,
// expo-apple-authentication) are only ever touched inside async actions, but a
// static import would evaluate all of them on every cold start — authStore is
// on App.tsx's static boot graph. Load them lazily at the call site, the same
// way the cross-store resets below do. `import type` stays static (erased).
const getSupabaseModule = (): typeof import('../services/supabase') =>
  require('../services/supabase');

const getAuthModule = (): typeof import('../services/auth') => require('../services/auth');
// Session restore runs before Home; the auth barrel would also load the Google
// and Apple sign-in SDKs, which only the sign-in screens need.
const getAuthSessionModule = (): typeof import('../services/auth/authSession') =>
  require('../services/auth/authSession');

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
    // Four Fields is local-only, so it is account-scoped below rather than reset.
    // Translator mode and per-device listened-markers must not bleed across
    // account switches (A1). The passcode is a shared secret but enabled state
    // and markers are per-session and should be cleared here.
    require('./translatorReviewStore').useTranslatorReviewStore,
  ];

  for (const store of stores) {
    store.getState().resetForSignOut?.();
  }
};

// Private data that never leaves the device (highlights, notes, bookmarks, the
// library, Gather and Four Fields) is not reset at a boundary: that would
// delete the only copy. It is scoped per account instead (privateDataScope):
// another account sees none of it and it returns when its owner signs in.
// The stores are loaded only before a guest's data is adopted by a first
// sign-in, so a store no screen has opened yet is adopted too.
const loadPrivateDataStores = (): void => {
  require('./annotationStore');
  require('./libraryStore');
  require('./gatherStore');
  require('./fourFieldsStore');
};

const showPrivateDataOf = (userId: string | null): void =>
  switchPrivateDataOwner(userId, { loadStores: loadPrivateDataStores });

const preferencesDiffer = (left: UserPreferences, right: UserPreferences): boolean =>
  left.fontSize !== right.fontSize ||
  left.theme !== right.theme ||
  left.appearancePalette !== right.appearancePalette ||
  left.language !== right.language ||
  left.countryCode !== right.countryCode ||
  left.countryName !== right.countryName ||
  left.contentLanguageCode !== right.contentLanguageCode ||
  left.contentLanguageName !== right.contentLanguageName ||
  left.contentLanguageNativeName !== right.contentLanguageNativeName ||
  left.chapterFeedbackName !== right.chapterFeedbackName ||
  left.chapterFeedbackRole !== right.chapterFeedbackRole ||
  left.onboardingCompleted !== right.onboardingCompleted ||
  left.chapterFeedbackEnabled !== right.chapterFeedbackEnabled ||
  left.hidePlayButtonFromReadingTab !== right.hidePlayButtonFromReadingTab ||
  left.notificationsEnabled !== right.notificationsEnabled ||
  left.reminderTime !== right.reminderTime;

const fieldStampsEqual = (left: PreferenceFieldStamps, right: PreferenceFieldStamps): boolean => {
  const leftKeys = Object.keys(left) as (keyof UserPreferences)[];
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((field) => left[field] === right[field])
  );
};

// The persisted-state upgrades from versions 0-2, unchanged since they shipped.
const migrateLegacyPreferences = (typedState: AuthState, version: number): AuthState => {
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
};

/**
 * Per-field stamps for an install from before they existed (persist version 4).
 * Its only clock is the whole-row preferencesUpdatedAt, so each field that
 * clock plausibly covers gets it:
 * - with a sync base, only the fields changed since the last sync;
 * - a device that has synced an account keeps whole-row semantics (every field),
 *   exactly how it merged before;
 * - a guest device only the fields it moved off the app defaults, so its
 *   untouched defaults never overwrite an account's choices on first sign-in.
 */
const seedLegacyPreferenceStamps = (state: AuthState): PreferenceFieldStamps => {
  const updatedAt = state.preferencesUpdatedAt;
  if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) {
    return {};
  }
  const preferences = state.preferences;
  const base = state.preferencesSyncBase;
  const fields = (Object.keys(defaultAuthPreferences) as (keyof UserPreferences)[]).filter(
    (field) =>
      base
        ? preferences[field] !== base[field]
        : state.lastSyncedUserId
          ? true
          : preferences[field] !== defaultAuthPreferences[field]
  );
  return Object.fromEntries(fields.map((field) => [field, updatedAt]));
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
      preferencesSyncBase: null,
      preferenceFieldStamps: {},
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
                  preferencesSyncBase: null,
                  preferenceFieldStamps: {},
                  lastSyncedUserId: null,
                }),
              clearGuestTombstones: clearGuestPlanTombstones,
            }
          );
        }
        // Any definitive sign-out hides the account's private data. (An offline
        // launch that could not refresh never reaches here with a null session.)
        if (!nextUserId) {
          showPrivateDataOf(null);
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
                  preferencesSyncBase: null,
                  preferenceFieldStamps: {},
                  lastSyncedUserId: null,
                }),
              clearGuestTombstones: clearGuestPlanTombstones,
            }
          );
        }
        // Any definitive sign-out hides the account's private data. (An offline
        // launch that could not refresh never reaches here with a null session.)
        if (!nextUserId) {
          showPrivateDataOf(null);
        }
      },

      setLoading: (isLoading) => set({ isLoading }),

      setPreferences: (prefs) =>
        set((state) => {
          const now = new Date().toISOString();
          const preferences = { ...state.preferences, ...prefs };
          // Stamp only what actually changed: re-saving a value (onboarding
          // writes several at once) is not a new choice, and a stamp is what lets
          // this value beat another device's.
          const stamped = (Object.keys(prefs) as (keyof UserPreferences)[]).filter(
            (field) => preferences[field] !== state.preferences[field]
          );
          return {
            preferences,
            preferencesUpdatedAt: now,
            preferenceFieldStamps:
              stamped.length === 0
                ? state.preferenceFieldStamps
                : {
                    ...state.preferenceFieldStamps,
                    ...Object.fromEntries(stamped.map((field) => [field, now])),
                  },
          };
        }),

      applySyncedPreferences: (preferences, updatedAt, base = preferences, fieldStamps) =>
        set((state) => {
          const preferencesChanged = preferencesDiffer(state.preferences, preferences);
          // Without server stamps (the column is not live yet), a stamp only
          // survives on a value the sync left alone: it described this device's
          // choice, not the value that replaced it.
          const nextStamps =
            fieldStamps ??
            Object.fromEntries(
              Object.entries(state.preferenceFieldStamps).filter(
                ([field]) =>
                  preferences[field as keyof UserPreferences] ===
                  state.preferences[field as keyof UserPreferences]
              )
            );
          const stampUpdate = !fieldStampsEqual(state.preferenceFieldStamps, nextStamps)
            ? { preferenceFieldStamps: nextStamps }
            : {};

          if (!preferencesChanged && state.preferencesUpdatedAt === updatedAt) {
            const baseUpdate =
              state.preferencesSyncBase && !preferencesDiffer(state.preferencesSyncBase, base)
                ? {}
                : { preferencesSyncBase: base };
            return Object.keys(baseUpdate).length + Object.keys(stampUpdate).length === 0
              ? state
              : { ...baseUpdate, ...stampUpdate };
          }

          return {
            preferences,
            preferencesUpdatedAt: updatedAt,
            preferencesSyncBase: base,
            ...stampUpdate,
          };
        }),

      markPreferencesSynced: (base) => set({ preferencesSyncBase: base }),

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

        await getAuthModule().signOut();

        // Clear all per-user local stores so the next account on this device
        // never inherits or merges this account's reading data (H2).
        resetPerUserStores();
        showPrivateDataOf(null);

        set({
          user: null,
          session: null,
          isAuthenticated: false,
          preferences: defaultAuthPreferences,
          preferencesUpdatedAt: null,
          preferencesSyncBase: null,
          preferenceFieldStamps: {},
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
              set({
                preferences: defaultAuthPreferences,
                preferencesUpdatedAt: null,
                preferencesSyncBase: null,
                preferenceFieldStamps: {},
              }),
            clearGuestTombstones: clearGuestPlanTombstones,
          }
        );
        showPrivateDataOf(userId);
        if (lastSyncedUserId !== userId) {
          set({ lastSyncedUserId: userId });
        }
      },

      initialize: async () => {
        if (get().isInitialized) return;

        set({ isLoading: true });

        try {
          const { isSupabaseConfigured } = getSupabaseModule();
          const hasSupabaseConfig = isSupabaseConfigured();
          const restored = hasSupabaseConfig
            ? await getAuthSessionModule().getCurrentSession()
            : { session: null, user: null };
          const restoredState = resolveInitializedAuthState(restored);

          // Route restored sessions through the same synchronous boundary as
          // interactive auth. This clears stale persisted A state before the
          // initialized UI can render as B (or as signed-out guest).
          // A restore that could not be checked (offline token refresh, locked
          // keychain) is not a sign-out: auth-js still holds the session and
          // will refresh it when the network returns. Treating it as one would
          // erase the account's unsynced reading data on every offline launch.
          if (restoredState.session || !('restoreFailed' in restored && restored.restoreFailed)) {
            get().setSession(restoredState.session);
          }

          if (hasSupabaseConfig) {
            // Get current session
            if (!authSubscription) {
              const { supabase } = getSupabaseModule();
              const { data } = supabase.auth.onAuthStateChange((event, session) => {
                if (session?.user) {
                  // Route auth callbacks through the same boundary-aware action
                  // as interactive sign-in so an account swap resets local
                  // per-user stores before any sync continuation can run.
                  get().setSession(session);
                } else if (event === 'INITIAL_SESSION') {
                  // initialize() has already applied the restored session. A
                  // null here repeats a restore that could not be checked
                  // (offline refresh), which must not reset the account.
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
      version: 4,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as AuthState;
        }

        const typedState = persistedState as AuthState;
        const migrated = migrateLegacyPreferences(typedState, version);
        return version < 4
          ? { ...migrated, preferenceFieldStamps: seedLegacyPreferenceStamps(migrated) }
          : migrated;
      },
      partialize: (state) => ({
        preferences: state.preferences,
        preferencesUpdatedAt: state.preferencesUpdatedAt,
        preferencesSyncBase: state.preferencesSyncBase,
        preferenceFieldStamps: state.preferenceFieldStamps,
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
          preferencesSyncBase: sanitized.preferencesSyncBase,
          preferenceFieldStamps: sanitized.preferenceFieldStamps,
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
