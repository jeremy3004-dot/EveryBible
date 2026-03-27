export type BibleExperienceEventName =
  | 'book_hub_chapter_opened'
  | 'book_companion_opened'
  | 'library_action'
  | 'library_reopened'
  | 'chapter_feedback_opened'
  | 'chapter_feedback_submitted'
  | 'chapter_feedback_failed';

export interface BibleExperienceEvent {
  name: BibleExperienceEventName;
  bookId: string;
  chapter?: number;
  source: 'book-hub' | 'companion' | 'reader-actions' | 'saved-library' | 'reader-feedback';
  mode?: 'listen' | 'read';
  translationId?: string;
  sentiment?: 'up' | 'down';
  detail?: string;
}

const MAX_TRACKED_EVENTS = 200;
const trackedBibleExperienceEvents: BibleExperienceEvent[] = [];

export function trackBibleExperienceEvent(event: BibleExperienceEvent) {
  if (trackedBibleExperienceEvents.length >= MAX_TRACKED_EVENTS) {
    trackedBibleExperienceEvents.splice(0, trackedBibleExperienceEvents.length - MAX_TRACKED_EVENTS + 1);
  }
  trackedBibleExperienceEvents.push(event);
}

export function getTrackedBibleExperienceEvents() {
  return [...trackedBibleExperienceEvents];
}

export function resetTrackedBibleExperienceEvents() {
  trackedBibleExperienceEvents.length = 0;
}
