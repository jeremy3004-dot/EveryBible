import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';

interface GatherState {
  // Completion tracking: parentId (foundation-1, topic-courage) -> lessonId[]
  completedLessons: Record<string, string[]>;

  // Dismissed UI states
  infoBannerDismissed: boolean;

  // Actions
  markLessonComplete: (parentId: string, lessonId: string) => void;
  unmarkLessonComplete: (parentId: string, lessonId: string) => void;
  isLessonComplete: (parentId: string, lessonId: string) => boolean;
  getCompletedCount: (parentId: string) => number;
  dismissInfoBanner: () => void;
}

export const useGatherStore = create<GatherState>()(
  persist(
    (set, get) => ({
      // Initial state
      completedLessons: {},
      infoBannerDismissed: false,

      // Mark a lesson complete — idempotent (ignores if already marked)
      markLessonComplete: (parentId, lessonId) => {
        set((state) => {
          const existing = state.completedLessons[parentId] || [];
          if (existing.includes(lessonId)) {
            return state; // Already complete, no-op
          }
          return {
            completedLessons: {
              ...state.completedLessons,
              [parentId]: [...existing, lessonId],
            },
          };
        });
      },

      // Remove a lesson completion mark
      unmarkLessonComplete: (parentId, lessonId) => {
        set((state) => {
          const existing = state.completedLessons[parentId] || [];
          return {
            completedLessons: {
              ...state.completedLessons,
              [parentId]: existing.filter((id) => id !== lessonId),
            },
          };
        });
      },

      // Check if a specific lesson is complete
      isLessonComplete: (parentId, lessonId) => {
        const { completedLessons } = get();
        return completedLessons[parentId]?.includes(lessonId) || false;
      },

      // Get count of completed lessons for a given parent (foundation or topic)
      getCompletedCount: (parentId) => {
        const { completedLessons } = get();
        return completedLessons[parentId]?.length || 0;
      },

      // Dismiss the Gather screen info banner permanently
      dismissInfoBanner: () => {
        set({ infoBannerDismissed: true });
      },
    }),
    {
      name: 'gather-storage',
      storage: createJSONStorage(() => zustandStorage),
      // Only persist completion data and UI state, not action functions
      partialize: (state) => ({
        completedLessons: state.completedLessons,
        infoBannerDismissed: state.infoBannerDismissed,
      }),
    }
  )
);
