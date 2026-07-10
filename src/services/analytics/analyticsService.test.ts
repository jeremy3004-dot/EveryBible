/**
 * Unit tests for the analytics engagement tracking layer.
 *
 * analyticsService.ts imports Platform from react-native which prevents direct
 * module import in pure Node test runs. Tests here verify:
 *   - bibleExperienceAnalytics: full direct testing (no RN deps)
 *   - analyticsService: source-shape assertions that the critical queue and
 *     session behaviours are structurally present (mirrors bibleDatabaseSource
 *     test approach used elsewhere in this repo)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  trackBibleExperienceEvent,
  getTrackedBibleExperienceEvents,
  resetTrackedBibleExperienceEvents,
} from './bibleExperienceAnalytics';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

// ── analyticsService structural assertions ────────────────────────────────────

test('analyticsService exposes trackEvent and flushEvents as named exports', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.match(source, /export function trackEvent\s*\(/, 'trackEvent must be an exported function');
  assert.match(source, /export async function flushEvents\s*\(/, 'flushEvents must be an exported async function');
});

test('analyticsService exposes session lifecycle functions as named exports', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.match(source, /export function startSession\s*\(/, 'startSession must be exported');
  assert.match(source, /export function endSession\s*\(/, 'endSession must be exported');
  assert.match(source, /export function getCurrentSessionId\s*\(/, 'getCurrentSessionId must be exported');
});

test('analyticsService exposes getPendingEventCount for diagnostics', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.match(source, /export function getPendingEventCount\s*\(/, 'getPendingEventCount must be exported');
});

test('analyticsService delegates queue + flush to the unified usage queue', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.match(source, /from ['"]\.\/usageQueue['"]/, 'analyticsService must delegate to the unified queue');
  assert.match(
    source,
    /enqueueUsageEvent\(eventName, properties, currentSessionId\)/,
    'trackEvent must enqueue onto the shared queue tagged with the auth session id'
  );
  assert.match(source, /return flushUsageQueue\(\)/, 'flushEvents must delegate to the shared flush');
  assert.match(
    source,
    /getPendingUsageEventCount\(\)/,
    'getPendingEventCount must report the shared queue depth'
  );
});

test('analyticsService startSession assigns currentSessionId and enqueues session_started', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.match(
    source,
    /currentSessionId\s*=\s*generateUUID/,
    'startSession must assign a fresh UUID to currentSessionId'
  );
  assert.match(
    source,
    /trackEvent\(\s*['"]session_started['"]/,
    'startSession must enqueue a session_started event'
  );
});

test('analyticsService endSession emits session_ended and clears currentSessionId', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.match(
    source,
    /trackEvent\(\s*['"]session_ended['"]/,
    'endSession must enqueue a session_ended event'
  );
  assert.match(
    source,
    /currentSessionId\s*=\s*null/,
    'endSession must clear currentSessionId to null'
  );
});

test('analyticsService facade holds no event-delivery internals (moved to usageQueue)', () => {
  const source = readRelativeSource('./analyticsService.ts');
  assert.ok(
    !/functions\.invoke/.test(source),
    'edge-function delivery must live in the unified queue, not the facade'
  );
  assert.ok(
    !/batch_track_events/.test(source),
    'the batch_track_events RPC fallback must be gone (server geo enrichment is authoritative)'
  );
});

// ── bibleExperienceAnalytics: direct unit tests ───────────────────────────────

const MAX_TRACKED_EVENTS = 200;

test('trackBibleExperienceEvent records a single event in order', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'JOH',
    chapter: 3,
    source: 'book-hub',
    mode: 'read',
  });

  const events = getTrackedBibleExperienceEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0]?.name, 'book_hub_chapter_opened');
  assert.equal(events[0]?.bookId, 'JOH');
  assert.equal(events[0]?.chapter, 3);
  assert.equal(events[0]?.source, 'book-hub');
  assert.equal(events[0]?.mode, 'read');
  resetTrackedBibleExperienceEvents();
});

test('trackBibleExperienceEvent records events in insertion order', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({ name: 'library_action', bookId: 'GEN', source: 'saved-library' });
  trackBibleExperienceEvent({ name: 'book_hub_chapter_opened', bookId: 'REV', source: 'book-hub' });

  const events = getTrackedBibleExperienceEvents();
  assert.equal(events[0]?.name, 'library_action');
  assert.equal(events[1]?.name, 'book_hub_chapter_opened');
  resetTrackedBibleExperienceEvents();
});

test('trackBibleExperienceEvent DROPS non-forwarded events (companion/reopen/feedback)', () => {
  resetTrackedBibleExperienceEvents();
  trackBibleExperienceEvent({ name: 'book_companion_opened', bookId: 'PSA', source: 'companion' });
  trackBibleExperienceEvent({ name: 'library_reopened', bookId: 'REV', source: 'saved-library' });
  trackBibleExperienceEvent({ name: 'chapter_feedback_opened', bookId: 'JHN', source: 'reader-feedback' });
  assert.equal(getTrackedBibleExperienceEvents().length, 0, 'only library_action + book_hub_chapter_opened forward');
  resetTrackedBibleExperienceEvents();
});

test('trackBibleExperienceEvent caps the local history at MAX_TRACKED_EVENTS', () => {
  resetTrackedBibleExperienceEvents();

  for (let i = 0; i < MAX_TRACKED_EVENTS + 10; i++) {
    trackBibleExperienceEvent({
      name: 'book_hub_chapter_opened',
      bookId: 'MAT',
      chapter: (i % 28) + 1,
      source: 'book-hub',
    });
  }

  const events = getTrackedBibleExperienceEvents();
  assert.ok(
    events.length <= MAX_TRACKED_EVENTS,
    `Expected ≤ ${MAX_TRACKED_EVENTS} events, got ${events.length}`
  );
  resetTrackedBibleExperienceEvents();
});

test('trackBibleExperienceEvent retains the most recent events when the cap is reached', () => {
  resetTrackedBibleExperienceEvents();

  for (let i = 0; i < MAX_TRACKED_EVENTS; i++) {
    trackBibleExperienceEvent({
      name: 'library_action',
      bookId: 'GEN',
      source: 'saved-library',
      detail: `fill-${i}`,
    });
  }

  // Sentinel — should survive the cap trim
  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'REV',
    source: 'book-hub',
    detail: 'sentinel',
  });

  const events = getTrackedBibleExperienceEvents();
  const last = events[events.length - 1];
  assert.equal(last?.detail, 'sentinel', 'The most recent event must survive after cap');
  resetTrackedBibleExperienceEvents();
});

test('resetTrackedBibleExperienceEvents empties the history completely', () => {
  trackBibleExperienceEvent({ name: 'book_companion_opened', bookId: 'PSA', source: 'companion' });
  resetTrackedBibleExperienceEvents();
  assert.equal(getTrackedBibleExperienceEvents().length, 0);
});

test('getTrackedBibleExperienceEvents returns a snapshot copy, not the live array', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({ name: 'book_hub_chapter_opened', bookId: 'ROM', chapter: 8, source: 'book-hub' });

  const snapshot = getTrackedBibleExperienceEvents();
  // Mutating the snapshot must not affect the internal store
  snapshot.splice(0, snapshot.length);
  assert.equal(getTrackedBibleExperienceEvents().length, 1);
  resetTrackedBibleExperienceEvents();
});

test('trackBibleExperienceEvent preserves all optional fields', () => {
  resetTrackedBibleExperienceEvents();

  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'HEB',
    chapter: 11,
    source: 'book-hub',
    mode: 'listen',
    detail: 'faith-chapter',
  });

  const [event] = getTrackedBibleExperienceEvents();
  assert.equal(event?.mode, 'listen');
  assert.equal(event?.detail, 'faith-chapter');
  resetTrackedBibleExperienceEvents();
});

test('trackBibleExperienceEvent works without optional fields', () => {
  resetTrackedBibleExperienceEvents();

  // mode, chapter, and detail are all optional
  trackBibleExperienceEvent({ name: 'book_hub_chapter_opened', bookId: 'PSA', source: 'book-hub' });

  const [event] = getTrackedBibleExperienceEvents();
  assert.equal(event?.name, 'book_hub_chapter_opened');
  assert.equal(event?.chapter, undefined);
  assert.equal(event?.mode, undefined);
  assert.equal(event?.detail, undefined);
  resetTrackedBibleExperienceEvents();
});
