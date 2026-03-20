export type BibleExperienceEventName =
  | 'book_hub_chapter_opened'
  | 'book_companion_opened'
  | 'library_action'
  | 'library_reopened';

export interface BibleExperienceEvent {
  name: BibleExperienceEventName;
  bookId: string;
  chapter?: number;
  source: 'book-hub' | 'companion' | 'reader-actions' | 'saved-library';
  mode?: 'listen' | 'read';
  detail?: string;
}

const trackedBibleExperienceEvents: BibleExperienceEvent[] = [];

export function trackBibleExperienceEvent(event: BibleExperienceEvent) {
  trackedBibleExperienceEvents.push(event);
}

export function getTrackedBibleExperienceEvents() {
  return [...trackedBibleExperienceEvents];
}

export function resetTrackedBibleExperienceEvents() {
  trackedBibleExperienceEvents.length = 0;
}
