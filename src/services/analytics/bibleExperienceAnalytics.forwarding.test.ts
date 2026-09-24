import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';

type UsageCall = { name: string; properties: Record<string, unknown> };

const usageCalls: UsageCall[] = [];
let failNextUsageCall = false;
let signalUsageCall: (() => void) | null = null;

mockModule(mock, sourcePath('services/analytics/anonymousUsageAnalytics.ts'), {
  trackAnonymousUsageEvent: (name: string, properties: Record<string, unknown>) => {
    const signal = signalUsageCall;
    signalUsageCall = null;
    signal?.();
    if (failNextUsageCall) {
      failNextUsageCall = false;
      throw new Error('usage pipeline unavailable');
    }
    usageCalls.push({ name, properties });
  },
});

function nextUsageCall(): Promise<void> {
  return new Promise((resolve) => {
    signalUsageCall = resolve;
  });
}

test('a forwarded event reaches the usage pipeline with snake_case properties', async () => {
  const { trackBibleExperienceEvent, resetTrackedBibleExperienceEvents } =
    await import('./bibleExperienceAnalytics');
  resetTrackedBibleExperienceEvents();
  usageCalls.length = 0;

  const delivered = nextUsageCall();
  trackBibleExperienceEvent({
    name: 'book_hub_chapter_opened',
    bookId: 'JHN',
    chapter: 3,
    source: 'book-hub',
    mode: 'listen',
    translationId: 'bsb',
    detail: 'from-hub',
  });
  await delivered;

  assert.deepEqual(usageCalls, [
    {
      name: 'book_hub_chapter_opened',
      properties: {
        book_id: 'JHN',
        chapter: 3,
        source: 'book-hub',
        mode: 'listen',
        translation_id: 'bsb',
        detail: 'from-hub',
      },
    },
  ]);
});

test('a dropped event never reaches the usage pipeline', async () => {
  const { trackBibleExperienceEvent } = await import('./bibleExperienceAnalytics');
  usageCalls.length = 0;

  trackBibleExperienceEvent({
    name: 'chapter_feedback_failed',
    bookId: 'JHN',
    source: 'reader-feedback',
    sentiment: 'down',
  });
  // A forwarded sentinel proves the lazy import has had time to deliver.
  const delivered = nextUsageCall();
  trackBibleExperienceEvent({ name: 'library_action', bookId: 'GEN', source: 'saved-library' });
  await delivered;

  assert.deepEqual(
    usageCalls.map((call) => call.name),
    ['library_action']
  );
});

test('a failing usage pipeline is swallowed and later events still forward', async () => {
  const {
    trackBibleExperienceEvent,
    getTrackedBibleExperienceEvents,
    resetTrackedBibleExperienceEvents,
  } = await import('./bibleExperienceAnalytics');
  resetTrackedBibleExperienceEvents();
  usageCalls.length = 0;

  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    failNextUsageCall = true;
    const failed = nextUsageCall();
    trackBibleExperienceEvent({ name: 'library_action', bookId: 'PSA', source: 'saved-library' });
    await failed;

    const delivered = nextUsageCall();
    trackBibleExperienceEvent({ name: 'library_action', bookId: 'ROM', source: 'saved-library' });
    await delivered;
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }

  assert.deepEqual(unhandled, []);
  assert.deepEqual(
    usageCalls.map((call) => call.properties.book_id),
    ['ROM']
  );
  assert.equal(getTrackedBibleExperienceEvents().length, 2);
});
