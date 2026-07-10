import type { AnonymousUsageEventName } from './anonymousUsageAnalytics';

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
  source:
    | 'book-hub'
    | 'companion'
    | 'reader-actions'
    | 'saved-library'
    | 'reader-feedback'
    | 'listener-feedback';
  mode?: 'listen' | 'read';
  translationId?: string;
  sentiment?: 'up' | 'down';
  detail?: string;
}

// Only these carry product value worth an analytics row, so they are FORWARDED
// to the unified ingestion pipeline (P1 S8). The rest — companion opens, library
// re-opens, and chapter feedback (which has its own dedicated submit pipeline) —
// are intentionally dropped. The old buffer-only machinery that queued every
// event in memory and NEVER sent anything is gone.
const FORWARDED_EVENTS: ReadonlySet<BibleExperienceEventName> = new Set([
  'library_action',
  'book_hub_chapter_opened',
]);

const MAX_TRACKED_EVENTS = 200;

// Test-only mirror of what we actually forwarded, so unit tests can assert the
// routing decision without importing the react-native-backed pipeline.
const forwardedEvents: BibleExperienceEvent[] = [];

function toUsageProperties(event: BibleExperienceEvent): Record<string, unknown> {
  return {
    book_id: event.bookId,
    chapter: event.chapter,
    source: event.source,
    mode: event.mode,
    translation_id: event.translationId,
    detail: event.detail,
  };
}

export function trackBibleExperienceEvent(event: BibleExperienceEvent) {
  if (!FORWARDED_EVENTS.has(event.name)) {
    return;
  }

  if (forwardedEvents.length >= MAX_TRACKED_EVENTS) {
    forwardedEvents.splice(0, forwardedEvents.length - MAX_TRACKED_EVENTS + 1);
  }
  forwardedEvents.push(event);

  // Lazy import keeps this module free of the react-native-backed pipeline in
  // its static graph so it stays directly unit-testable; a no-op if the import
  // fails (e.g. node tests).
  void import('./anonymousUsageAnalytics')
    .then(({ trackAnonymousUsageEvent }) => {
      trackAnonymousUsageEvent(event.name as AnonymousUsageEventName, toUsageProperties(event));
    })
    .catch(() => {});
}

export function getTrackedBibleExperienceEvents() {
  return [...forwardedEvents];
}

export function resetTrackedBibleExperienceEvents() {
  forwardedEvents.length = 0;
}
