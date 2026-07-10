import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import {
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
  normalizeTranslatorReviewPasscode,
  resolveDevelopmentTranslatorReviewPasscode,
  type TranslatorFeedbackReviewMarker,
  type TranslatorFeedbackReviewMarkers,
} from '../services/feedback/translatorFeedbackReviewModel';

interface TranslatorReviewState {
  enabled: boolean;
  accessPasscode: string | null;
  // Per-device UX state only (read / listened). Resolution lives on the server (D1).
  feedbackMarkers: TranslatorFeedbackReviewMarkers;
  enableWithPasscode: (passcode: string) => boolean;
  disable: () => void;
  markRead: (feedbackId: string) => void;
  markListened: (feedbackId: string) => void;
}

const developmentTranslatorReviewPasscode = resolveDevelopmentTranslatorReviewPasscode(
  {
    EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE:
      process.env.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE,
  },
  typeof __DEV__ !== 'undefined' && __DEV__
);

// v2 markers carried resolvedAs/resolvedAt; resolution is now server-owned, so on
// upgrade we keep only the read/listened fields and let the server data drive status.
function stripResolutionFromMarkers(markers: unknown): TranslatorFeedbackReviewMarkers {
  if (!markers || typeof markers !== 'object') {
    return {};
  }

  const next: TranslatorFeedbackReviewMarkers = {};
  for (const [id, marker] of Object.entries(markers as Record<string, unknown>)) {
    if (!marker || typeof marker !== 'object') {
      continue;
    }

    const legacy = marker as Partial<TranslatorFeedbackReviewMarker>;
    next[id] = {
      readAt: legacy.readAt ?? null,
      listenedAt: legacy.listenedAt ?? null,
    };
  }

  return next;
}

export const useTranslatorReviewStore = create<TranslatorReviewState>()(
  persist(
    (set) => ({
      enabled: developmentTranslatorReviewPasscode !== null,
      accessPasscode: developmentTranslatorReviewPasscode,
      feedbackMarkers: {},
      enableWithPasscode: (passcode) => {
        const accessPasscode = normalizeTranslatorReviewPasscode(passcode);

        if (accessPasscode) {
          set({ enabled: true, accessPasscode });
          return true;
        }

        return false;
      },
      disable: () => set({ enabled: false, accessPasscode: null }),
      markRead: (feedbackId) =>
        set((state) => ({
          feedbackMarkers: markTranslatorFeedbackRead(
            state.feedbackMarkers,
            feedbackId,
            new Date().toISOString()
          ),
        })),
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
      version: 3,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<TranslatorReviewState>;
        const accessPasscode = normalizeTranslatorReviewPasscode(state.accessPasscode ?? '');
        const feedbackMarkers = stripResolutionFromMarkers(state.feedbackMarkers);

        if (version < 2 && !accessPasscode) {
          return { ...state, enabled: false, accessPasscode: null, feedbackMarkers };
        }

        return { ...state, accessPasscode, feedbackMarkers };
      },
      partialize: (state) => ({
        enabled: state.enabled,
        accessPasscode: state.accessPasscode,
        feedbackMarkers: state.feedbackMarkers,
      }),
    }
  )
);
