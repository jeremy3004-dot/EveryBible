import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { trackAnonymousUsageEvent, flushAnonymousUsageEvents } from '../../../services/analytics';
import { createReadingTimer } from '../../../services/analytics/readingTimer';

export interface UseReaderReadingTimerInput {
  bookId: string;
  chapter: number;
  chapterSessionMode: 'listen' | 'read';
  currentTranslation: string;
}

/** Times focused foreground reading of the chapter, checkpointing every 30 seconds so a background force-quit does not lose the visit. */
export function useReaderReadingTimer({
  bookId,
  chapter,
  chapterSessionMode,
  currentTranslation,
}: UseReaderReadingTimerInput) {
  // Checkpoint focused foreground reading so a background force-quit does not
  // lose the visit. Hidden tabs remain mounted, so mount/unmount is insufficient.
  useFocusEffect(
    useCallback(() => {
      if (chapterSessionMode !== 'read') return;
      const timer = createReadingTimer((durationSeconds) => {
        trackAnonymousUsageEvent('reading_ended', {
          book_id: bookId,
          chapter,
          translation_id: currentTranslation,
          duration_seconds: durationSeconds,
        });
      });
      timer.setActive(AppState.currentState === 'active');
      const interval = setInterval(timer.checkpoint, 30_000);
      const subscription = AppState.addEventListener('change', (nextState) => {
        timer.setActive(nextState === 'active');
        if (nextState !== 'active') void flushAnonymousUsageEvents();
      });
      return () => {
        subscription.remove();
        clearInterval(interval);
        timer.finish();
        void flushAnonymousUsageEvents();
      };
    }, [bookId, chapter, currentTranslation, chapterSessionMode])
  );
}
