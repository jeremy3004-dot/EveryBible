import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import { describeSyncStatus } from './syncStatus';

interface RecordedTranslation {
  key: string;
  options?: Record<string, unknown>;
}

/**
 * Recording stand-in for i18next's `t`. Returns `key(json-of-options)` so a test
 * can assert both which key was chosen and what was interpolated into it, and
 * keeps the call log so we can prove no extra lookups happen.
 */
function createRecordingT() {
  const calls: RecordedTranslation[] = [];
  const t = ((key: string, options?: Record<string, unknown>) => {
    calls.push({ key, options });
    return options ? `${key}(${JSON.stringify(options)})` : key;
  }) as unknown as TFunction;
  return { t, calls };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const isoAgo = (elapsedMs: number): string => new Date(NOW - elapsedMs).toISOString();

test('a signed-out reader is invited to sign in and shows no success dot', () => {
  const { t, calls } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: false,
    lastSyncedAt: '2026-09-10T11:59:00.000Z',
    t,
    now: NOW,
  });

  assert.deepEqual(status, {
    label: 'more.sync.signInToSync',
    sourceLabel: 'more.sync.source',
    isSynced: false,
  });
  assert.deepEqual(
    calls.map((call) => call.key),
    ['more.sync.signInToSync', 'more.sync.source']
  );
});

test('a signed-out reader is invited to sign in even when nothing has ever synced', () => {
  const { t } = createRecordingT();

  const status = describeSyncStatus({ isAuthenticated: false, lastSyncedAt: null, t, now: NOW });

  assert.equal(status.label, 'more.sync.signInToSync');
  assert.equal(status.isSynced, false);
});

test('a signed-in reader who has never synced reads as synced without a relative time', () => {
  const { t, calls } = createRecordingT();

  const status = describeSyncStatus({ isAuthenticated: true, lastSyncedAt: null, t, now: NOW });

  assert.deepEqual(status, {
    label: 'more.sync.synced',
    sourceLabel: 'more.sync.source',
    isSynced: true,
  });
  assert.deepEqual(
    calls.map((call) => call.key),
    ['more.sync.synced', 'more.sync.source']
  );
});

test('an unparseable last-sync timestamp falls back to the timeless synced wording', () => {
  const { t } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: 'not-a-timestamp',
    t,
    now: NOW,
  });

  assert.deepEqual(status, {
    label: 'more.sync.synced',
    sourceLabel: 'more.sync.source',
    isSynced: true,
  });
});

test('a sync less than a minute old reads as just now', () => {
  const { t, calls } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(MINUTE_MS - 1),
    t,
    now: NOW,
  });

  assert.deepEqual(status, {
    label: 'more.sync.syncedAgo({"relative":"more.sync.relativeNow"})',
    sourceLabel: 'more.sync.sourceSynced({"relative":"more.sync.relativeNow"})',
    isSynced: true,
  });
  assert.deepEqual(
    calls.map((call) => call.key),
    ['more.sync.relativeNow', 'more.sync.syncedAgo', 'more.sync.sourceSynced']
  );
});

test('a sync exactly one minute old switches to the minutes wording', () => {
  const { t, calls } = createRecordingT();

  describeSyncStatus({ isAuthenticated: true, lastSyncedAt: isoAgo(MINUTE_MS), t, now: NOW });

  assert.deepEqual(calls[0], { key: 'more.sync.relativeMinutes', options: { minutes: 1 } });
});

test('minutes are floored rather than rounded', () => {
  const { t, calls } = createRecordingT();

  describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(59 * MINUTE_MS + 59_999),
    t,
    now: NOW,
  });

  assert.deepEqual(calls[0], { key: 'more.sync.relativeMinutes', options: { minutes: 59 } });
});

test('a sync an hour old switches to the hours wording', () => {
  const { t, calls } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(3 * HOUR_MS + 30 * MINUTE_MS),
    t,
    now: NOW,
  });

  assert.deepEqual(calls[0], { key: 'more.sync.relativeHours', options: { hours: 3 } });
  assert.equal(status.isSynced, true);
});

test('a sync a day or more old switches to the days wording', () => {
  const { t, calls } = createRecordingT();

  describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(9 * DAY_MS + 5 * HOUR_MS),
    t,
    now: NOW,
  });

  assert.deepEqual(calls[0], { key: 'more.sync.relativeDays', options: { days: 9 } });
});

test('a last-sync stamp from the future is clamped to just now rather than going negative', () => {
  const { t, calls } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(-2 * DAY_MS),
    t,
    now: NOW,
  });

  assert.deepEqual(calls[0], { key: 'more.sync.relativeNow', options: undefined });
  assert.equal(status.isSynced, true);
});

test('the eyebrow and footer describe the same relative moment', () => {
  const { t } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(2 * HOUR_MS),
    t,
    now: NOW,
  });

  const relative = 'more.sync.relativeHours({"hours":2})';
  assert.deepEqual(status, {
    label: `more.sync.syncedAgo(${JSON.stringify({ relative })})`,
    sourceLabel: `more.sync.sourceSynced(${JSON.stringify({ relative })})`,
    isSynced: true,
  });
});

test('now defaults to the wall clock when the caller does not pass one', (t2) => {
  // Pinned rather than read from the real clock: with a live Date.now() the only
  // assertion this test could make is "less than a minute has elapsed", which
  // holds for a stub too. Freezing the clock lets it assert the exact bucket.
  t2.mock.timers.enable({ apis: ['Date'], now: NOW });
  const { t, calls } = createRecordingT();

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: isoAgo(3 * HOUR_MS),
    t,
  });

  assert.deepEqual(calls[0], { key: 'more.sync.relativeHours', options: { hours: 3 } });
  assert.equal(status.isSynced, true);
});
