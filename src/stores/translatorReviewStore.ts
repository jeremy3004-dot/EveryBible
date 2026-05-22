import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
import {
  canEnableTranslatorReviewMode,
  markTranslatorFeedbackListened,
  markTranslatorFeedbackRead,
  type TranslatorFeedbackReviewMarkers,
} from '../services/feedback/translatorFeedbackReviewModel';

interface TranslatorReviewState {
  enabled: boolean;
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
      feedbackMarkers: {},
      enableWithPasscode: (passcode) => {
        const enabled = canEnableTranslatorReviewMode(passcode);

        if (enabled) {
          set({ enabled: true });
        }

        return enabled;
      },
      disable: () => set({ enabled: false }),
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
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        feedbackMarkers: state.feedbackMarkers,
      }),
    }
  )
);
