import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import {
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
  normalizeTranslatorReviewPasscode,
  reopenTranslatorFeedback,
  resolveDevelopmentTranslatorReviewPasscode,
  resolveTranslatorFeedback,
  type TranslatorFeedbackResolution,
  type TranslatorFeedbackReviewMarkers,
} from '../services/feedback/translatorFeedbackReviewModel';

interface TranslatorReviewState {
  enabled: boolean;
  accessPasscode: string | null;
  feedbackMarkers: TranslatorFeedbackReviewMarkers;
  enableWithPasscode: (passcode: string) => boolean;
  disable: () => void;
  markRead: (feedbackId: string) => void;
  markListened: (feedbackId: string) => void;
  resolveFeedback: (feedbackId: string, resolution: TranslatorFeedbackResolution) => void;
  reopenFeedback: (feedbackId: string) => void;
}

const developmentTranslatorReviewPasscode = resolveDevelopmentTranslatorReviewPasscode(
  {
    EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE:
      process.env.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE,
  },
  typeof __DEV__ !== 'undefined' && __DEV__
);

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
      resolveFeedback: (feedbackId, resolution) =>
        set((state) => ({
          feedbackMarkers: resolveTranslatorFeedback(
            state.feedbackMarkers,
            feedbackId,
            resolution,
            new Date().toISOString()
          ),
        })),
      reopenFeedback: (feedbackId) =>
        set((state) => ({
          feedbackMarkers: reopenTranslatorFeedback(state.feedbackMarkers, feedbackId),
        })),
    }),
    {
      name: 'translator-review-storage',
      version: 2,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<TranslatorReviewState>;
        const accessPasscode = normalizeTranslatorReviewPasscode(state.accessPasscode ?? '');

        if (version < 2 && !accessPasscode) {
          return { ...state, enabled: false, accessPasscode: null };
        }

        return { ...state, accessPasscode };
      },
      partialize: (state) => ({
        enabled: state.enabled,
        accessPasscode: state.accessPasscode,
        feedbackMarkers: state.feedbackMarkers,
      }),
    }
  )
);
