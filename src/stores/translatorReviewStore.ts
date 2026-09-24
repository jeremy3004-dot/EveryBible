import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { zustandStorage } from './mmkvStorage';
import {
  COUNCIL_PASSCODE_SECURE_KEY,
  TRANSLATOR_REVIEW_PASSCODE_SECURE_KEY,
  markTranslatorFeedbackListened,
  normalizeTranslatorReviewPasscode,
  resolveDevelopmentTranslatorReviewPasscode,
  type TranslatorFeedbackReviewMarker,
  type TranslatorFeedbackReviewMarkers,
} from '../services/feedback/translatorFeedbackReviewModel';

export type FeedbackParticipationMode = 'reader' | 'community' | 'scripture_council' | 'translator';

interface TranslatorReviewState {
  // Null only during upgrade: retain the legacy contributor preference until an explicit choice.
  mode: FeedbackParticipationMode | null;
  councilPasscode: string | null;
  enableCommunityFeedback: () => void;
  enableCouncilWithPasscode: (passcode: string) => boolean;
  disableFeedback: () => void;
  enabled: boolean;
  accessPasscode: string | null;
  // Per-device UX state only (audio listened). Resolution lives on the server (D1).
  feedbackMarkers: TranslatorFeedbackReviewMarkers;
  enableWithPasscode: (passcode: string) => boolean;
  disable: () => void;
  markListened: (feedbackId: string) => void;
  // Clears enabled state, passcode, and per-device markers at an auth boundary so
  // translator mode and listened-markers never bleed across account switches (A1).
  resetForSignOut: () => void;
}

// S7: the passcode authorizes the translator feedback queue, so it is a credential, not a
// preference. MMKV is a plain (unencrypted) file in the app container, so the passcode now
// lives in the OS keystore via expo-secure-store — the same place the privacy PIN is kept
// (see services/privacy/privacyService.ts). `enabled` stays in MMKV so translator mode still
// renders synchronously on a cold start; the passcode itself arrives one tick later from the
// async SecureStore read below, and every consumer reads it through a store selector.

// S10: `process.env.EXPO_PUBLIC_*` is inlined at BUILD time by Expo's Babel transform, so a
// bare reference would bake the dev passcode into the production bundle as a string literal.
// Reading it only inside a `__DEV__` branch lets the production minifier drop the whole
// branch — the literal never reaches a release build. (node --test has no __DEV__, hence the
// typeof guard.)
const isDevRuntime = typeof __DEV__ !== 'undefined' && __DEV__;
const developmentTranslatorReviewPasscode = resolveDevelopmentTranslatorReviewPasscode(
  {
    EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE: isDevRuntime
      ? process.env.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE
      : undefined,
  },
  isDevRuntime
);

// Older markers carried resolvedAs/resolvedAt (now server-owned) and readAt (unused);
// on upgrade we keep only listenedAt and let server data drive resolution status.
function stripResolutionFromMarkers(markers: unknown): TranslatorFeedbackReviewMarkers {
  if (!markers || typeof markers !== 'object') {
    return {};
  }

  const next: TranslatorFeedbackReviewMarkers = {};
  for (const [id, marker] of Object.entries(markers as Record<string, unknown>)) {
    if (!marker || typeof marker !== 'object') {
      continue;
    }

    const legacy = marker as Partial<TranslatorFeedbackReviewMarker> & { listenedAt?: unknown };
    next[id] = {
      listenedAt: typeof legacy.listenedAt === 'string' ? legacy.listenedAt : null,
    };
  }

  return next;
}

// Write-through helpers. SecureStore is async and can reject (locked keychain, simulator
// quirks); a failure must never take down a synchronous store action, so these swallow and
// log. Worst case the passcode is not remembered across launches and the translator
// re-enters it — strictly better than persisting it in plaintext.
function persistPasscodeToSecureStore(passcode: string): void {
  void SecureStore.setItemAsync(TRANSLATOR_REVIEW_PASSCODE_SECURE_KEY, passcode).catch(
    (error: unknown) => {
      console.warn('Failed to persist translator review passcode securely:', error);
    }
  );
}

function deletePasscodeFromSecureStore(): void {
  void SecureStore.deleteItemAsync(TRANSLATOR_REVIEW_PASSCODE_SECURE_KEY).catch(
    (error: unknown) => {
      console.warn('Failed to clear translator review passcode:', error);
    }
  );
}

// A fresh install hands merge `undefined`, and a damaged blob can decode to null or a non-object.
// Reading fields off either threw, and zustand then skipped hydration silently. With nothing
// saved, merge keeps the initial state (a dev build's configured passcode starts it enabled).
function isPersistedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPersistedTranslatorReviewState(value: unknown): Partial<TranslatorReviewState> {
  return isPersistedRecord(value) ? (value as Partial<TranslatorReviewState>) : {};
}

export const useTranslatorReviewStore = create<TranslatorReviewState>()(
  persist(
    (set, get) => ({
      mode: developmentTranslatorReviewPasscode ? 'translator' : null,
      councilPasscode: null,
      enableCommunityFeedback: () => {
        if (get().enabled) deletePasscodeFromSecureStore();
        if (get().councilPasscode)
          void SecureStore.deleteItemAsync(COUNCIL_PASSCODE_SECURE_KEY).catch(() => {});
        set({ mode: 'community', enabled: false, accessPasscode: null, councilPasscode: null });
      },
      enableCouncilWithPasscode: (passcode) => {
        const councilPasscode = normalizeTranslatorReviewPasscode(passcode);
        if (!councilPasscode) return false;
        if (get().enabled) deletePasscodeFromSecureStore();
        set({ mode: 'scripture_council', enabled: false, accessPasscode: null, councilPasscode });
        void SecureStore.setItemAsync(COUNCIL_PASSCODE_SECURE_KEY, councilPasscode).catch(() => {});
        return true;
      },
      disableFeedback: () => {
        if (get().enabled) return;
        set({ mode: 'reader', councilPasscode: null });
        void SecureStore.deleteItemAsync(COUNCIL_PASSCODE_SECURE_KEY).catch(() => {});
      },
      enabled: developmentTranslatorReviewPasscode !== null,
      accessPasscode: developmentTranslatorReviewPasscode,
      feedbackMarkers: {},
      enableWithPasscode: (passcode) => {
        const accessPasscode = normalizeTranslatorReviewPasscode(passcode);

        if (accessPasscode) {
          if (get().councilPasscode)
            void SecureStore.deleteItemAsync(COUNCIL_PASSCODE_SECURE_KEY).catch(() => {});
          set({ mode: 'translator', enabled: true, accessPasscode, councilPasscode: null });
          persistPasscodeToSecureStore(accessPasscode);
          return true;
        }

        return false;
      },
      disable: () => {
        set({ mode: 'reader', enabled: false, accessPasscode: null });
        deletePasscodeFromSecureStore();
      },
      resetForSignOut: () => {
        set({
          mode: 'reader',
          enabled: false,
          accessPasscode: null,
          councilPasscode: null,
          feedbackMarkers: {},
        });
        void SecureStore.deleteItemAsync(COUNCIL_PASSCODE_SECURE_KEY).catch(() => {});
        deletePasscodeFromSecureStore();
      },
      markListened: (feedbackId) =>
        set((state) => ({
          feedbackMarkers: markTranslatorFeedbackListened(
            state.feedbackMarkers,
            feedbackId,
            new Date().toISOString()
          ),
        })),
    }),
    {
      name: 'translator-review-storage',
      // v4: accessPasscode left the MMKV partialize set for expo-secure-store (S7). The
      // migrate below moves an already-persisted plaintext passcode into SecureStore and
      // scrubs it from the MMKV snapshot, so upgrading installs neither lose translator
      // mode nor keep the secret on disk in the clear.
      version: 5,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persistedState, version) => {
        const state = asPersistedTranslatorReviewState(persistedState);
        const accessPasscode = normalizeTranslatorReviewPasscode(state.accessPasscode ?? '');
        const feedbackMarkers = stripResolutionFromMarkers(state.feedbackMarkers);

        if (version < 2 && !accessPasscode) {
          return { ...state, enabled: false, accessPasscode: null, feedbackMarkers };
        }

        if (version < 4 && accessPasscode) {
          persistPasscodeToSecureStore(accessPasscode);
        }

        // The passcode is kept in the in-memory state (so the current session keeps
        // working) but partialize no longer writes it back to MMKV.
        return {
          ...state,
          mode: state.enabled ? 'translator' : null,
          councilPasscode: null,
          accessPasscode,
          feedbackMarkers,
        };
      },
      merge: (persisted, current) => {
        if (!isPersistedRecord(persisted)) {
          return current;
        }
        const saved = persisted as Partial<TranslatorReviewState>;
        const mode = saved.mode ?? (saved.enabled ? 'translator' : null);
        return { ...current, ...saved, mode, enabled: mode === 'translator' };
      },
      partialize: (state) => ({
        mode: state.mode,
        enabled: state.enabled,
        feedbackMarkers: state.feedbackMarkers,
      }),
    }
  )
);

// Cold-start hydration for the one field MMKV no longer holds. Runs once at import time and
// only fills the passcode when the persisted `enabled` flag says translator mode was on and
// nothing has set a passcode in the meantime (e.g. the dev passcode, or a migration).
export async function hydrateTranslatorReviewPasscode(): Promise<void> {
  const state = useTranslatorReviewStore.getState();
  // Nothing to restore, and no reason to touch the keystore, unless translator mode was on
  // and the passcode is not already in memory (dev passcode, migration, or a live session).
  if (!state.enabled || state.accessPasscode) return;

  try {
    const stored = await SecureStore.getItemAsync(TRANSLATOR_REVIEW_PASSCODE_SECURE_KEY);
    const accessPasscode = normalizeTranslatorReviewPasscode(stored ?? '');
    if (!accessPasscode) return;
    if (
      !useTranslatorReviewStore.getState().enabled ||
      useTranslatorReviewStore.getState().accessPasscode
    )
      return;
    useTranslatorReviewStore.setState({ accessPasscode });
  } catch (error) {
    console.warn('Failed to load translator review passcode:', error);
  }
}

void hydrateTranslatorReviewPasscode();

export function getFeedbackParticipationMode(
  state: Pick<TranslatorReviewState, 'mode' | 'enabled'>,
  legacyFeedbackEnabled: boolean
): FeedbackParticipationMode {
  return (
    state.mode ?? (state.enabled ? 'translator' : legacyFeedbackEnabled ? 'community' : 'reader')
  );
}

export async function hydrateCouncilPasscode(): Promise<void> {
  if (useTranslatorReviewStore.getState().mode !== 'scripture_council') return;
  try {
    const passcode = await SecureStore.getItemAsync(COUNCIL_PASSCODE_SECURE_KEY);
    const current = useTranslatorReviewStore.getState();
    if (current.mode === 'scripture_council' && !current.councilPasscode) {
      useTranslatorReviewStore.setState({
        councilPasscode: normalizeTranslatorReviewPasscode(passcode ?? ''),
      });
    }
  } catch {
    /* The next council submission asks the user to unlock again. */
  }
}
void hydrateCouncilPasscode();
