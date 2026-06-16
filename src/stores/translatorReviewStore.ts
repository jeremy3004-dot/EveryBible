import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import {
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
  normalizeTranslatorReviewPasscode,
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
}

export const useTranslatorReviewStore = create<TranslatorReviewState>()(
  persist(
    (set) => ({
      enabled: false,
      accessPasscode: null,
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
