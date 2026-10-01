import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultAuthPreferences } from '../../stores/persistedStateSanitizers';
import { MIGRATIONS_DIR } from '../../testing/migrationSchema';
import {
  buildRemoteProgressPayload,
  mapRemotePreferences,
  mergeChapterProgress,
  mergePreferences,
  mergeReadingSnapshot,
  PREFERENCE_COLUMNS,
  readingMatchesRemote,
  readRemoteFieldStamps,
} from './syncMerge';
import type {
  LocalPreferenceSnapshot,
  LocalReadingSnapshot,
  PreferenceMergeResult,
  ReadingMergeResult,
} from './syncMerge';
import type { UserPreferences } from '../../types';
import type {
  UserPreferences as RemoteUserPreferences,
  UserProgress as RemoteUserProgress,
} from '../supabase/types';

test('mergeChapterProgress keeps the newest timestamp per chapter', () => {
  const merged = mergeChapterProgress(
    {
      GEN_1: 100,
      MAT_1: 300,
    },
    {
      GEN_1: 200,
      JHN_3: 150,
    }
  );

  assert.deepEqual(merged, {
    GEN_1: 200,
    MAT_1: 300,
    JHN_3: 150,
  });
});

// Regressions found by syncMerge.progress.property.test.ts (shrunk counterexamples).

test('mergeChapterProgress skips remote chapter values that are not numbers', () => {
  // A legacy upsert can leave null or a string in chapters_read. Adopting it put a
  // non-number in the next upload, which merge_user_progress refuses (22023).
  const merged = mergeChapterProgress({ GEN_1: 100 }, {
    GEN_1: null,
    EXO_1: '1727000000000',
    MAT_1: null,
  } as unknown as Record<string, number>);

  assert.deepEqual(merged, { GEN_1: 100 });
});

test('two devices that last read on the same day agree on the longer streak', () => {
  // Counterexample: device B read today on a 1-day streak, device A read yesterday
  // and today (2 days). Each kept its own streak on a same-day tie, so every sync
  // re-uploaded it and the server flipped between 1 and 2 forever.
  const row = (streak: number): RemoteUserProgress => ({
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: { GEN_1: 500 },
    streak_days: streak,
    last_read_date: '2026-09-21',
    current_book: 'GEN',
    current_chapter: 1,
    synced_at: '2026-09-21T06:00:00.000Z',
  });
  const device = (streak: number): LocalReadingSnapshot => ({
    chaptersRead: { GEN_1: 500 },
    streakDays: streak,
    lastReadDate: '2026-09-21',
    currentBook: 'GEN',
    currentChapter: 1,
  });

  assert.equal(mergeReadingSnapshot(device(1), row(2)).progress.streakDays, 2);
  assert.equal(mergeReadingSnapshot(device(2), row(1)).progress.streakDays, 2);
  assert.equal(readingMatchesRemote(mergeReadingSnapshot(device(1), row(2)), row(2)), true);
});

test('two positions read at the same instant resolve to the same one on both devices', () => {
  // Counterexample: GEN 1 on one phone and REV 1 on the other, both stamped at the
  // same millisecond. Each device kept its own, so they never agreed.
  const chapters = { GEN_1: 500, REV_1: 500 };
  const remoteAt = (book: string): RemoteUserProgress => ({
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: chapters,
    streak_days: 1,
    last_read_date: '2026-09-21',
    current_book: book,
    current_chapter: 1,
    synced_at: '2026-09-21T06:00:00.000Z',
  });
  const localAt = (book: string): LocalReadingSnapshot => ({
    chaptersRead: chapters,
    streakDays: 1,
    lastReadDate: '2026-09-21',
    currentBook: book,
    currentChapter: 1,
  });

  assert.equal(mergeReadingSnapshot(localAt('GEN'), remoteAt('REV')).readingPosition.bookId, 'REV');
  assert.equal(mergeReadingSnapshot(localAt('REV'), remoteAt('GEN')).readingPosition.bookId, 'REV');
});

test('adopting a remote position identical to the local one is not a change', () => {
  // Counterexample: a fresh device and a fresh server row, both at GEN 1. The
  // merge reported `changed` on every sync because the position came from remote.
  const merged = mergeReadingSnapshot(
    { chaptersRead: {}, streakDays: 0, lastReadDate: null, currentBook: 'GEN', currentChapter: 1 },
    {
      id: 'progress-1',
      user_id: 'user-1',
      chapters_read: {},
      streak_days: 0,
      last_read_date: null,
      current_book: 'GEN',
      current_chapter: 1,
      synced_at: '2026-09-21T06:00:00.000Z',
    }
  );

  assert.equal(merged.changed, false);
});

test('the progress upload leaves out values merge_user_progress would refuse', () => {
  const payload = buildRemoteProgressPayload(
    'user-1',
    {
      progress: {
        chaptersRead: { GEN_1: 100, EXO_1: Number.NaN, ['x'.repeat(65)]: 5, '': 7 },
        streakDays: 1.5,
        lastReadDate: '2026-02-30',
      },
      readingPosition: { bookId: '', chapter: 3 },
      positionSource: 'local',
      changed: true,
    },
    '2026-09-24T00:00:00.000Z'
  );

  assert.deepEqual(payload, {
    user_id: 'user-1',
    chapters_read: { GEN_1: 100 },
    streak_days: null,
    last_read_date: null,
    current_book: null,
    current_chapter: null,
    synced_at: '2026-09-24T00:00:00.000Z',
  });
});

test('mergeReadingSnapshot uses the remote reading position for a fresh local device', () => {
  const local: LocalReadingSnapshot = {
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    currentBook: 'GEN',
    currentChapter: 1,
  };

  const remote: RemoteUserProgress = {
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: {
      JHN_3: 500,
    },
    streak_days: 4,
    last_read_date: '2026-03-09',
    current_book: 'JHN',
    current_chapter: 3,
    synced_at: '2026-03-09T06:00:00.000Z',
  };

  const merged = mergeReadingSnapshot(local, remote);

  assert.deepEqual(merged.progress.chaptersRead, { JHN_3: 500 });
  assert.equal(merged.progress.streakDays, 4);
  assert.equal(merged.progress.lastReadDate, '2026-03-09');
  assert.deepEqual(merged.readingPosition, {
    bookId: 'JHN',
    chapter: 3,
  });
  assert.equal(merged.positionSource, 'remote');
});

test('mergeReadingSnapshot ignores a remote reading position that names no real chapter', () => {
  // A fresh device adopts the remote position outright, so a row naming Jude 2 or an
  // unknown book would open the reader on a chapter with nothing in it.
  const local: LocalReadingSnapshot = {
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    currentBook: 'GEN',
    currentChapter: 1,
  };
  const remoteAt = (currentBook: string, currentChapter: number): RemoteUserProgress => ({
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: {},
    streak_days: 0,
    last_read_date: null,
    current_book: currentBook,
    current_chapter: currentChapter,
    synced_at: '2026-03-09T06:00:00.000Z',
  });

  for (const [book, chapter] of [
    ['JUD', 2],
    ['PSA', 151],
    ['XYZ', 1],
    ['JHN', 0],
  ] as const) {
    const merged = mergeReadingSnapshot(local, remoteAt(book, chapter));
    assert.deepEqual(merged.readingPosition, { bookId: 'GEN', chapter: 1 }, `${book} ${chapter}`);
    assert.equal(merged.positionSource, 'local');
  }
});

test('mergeReadingSnapshot keeps the newer local reading position when it is ahead', () => {
  const local: LocalReadingSnapshot = {
    chaptersRead: {
      JHN_4: 900,
    },
    streakDays: 2,
    lastReadDate: '2026-03-09',
    currentBook: 'JHN',
    currentChapter: 4,
  };

  const remote: RemoteUserProgress = {
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: {
      JHN_3: 500,
    },
    streak_days: 5,
    last_read_date: '2026-03-08',
    current_book: 'JHN',
    current_chapter: 3,
    synced_at: '2026-03-09T05:00:00.000Z',
  };

  const merged = mergeReadingSnapshot(local, remote);

  assert.deepEqual(merged.readingPosition, {
    bookId: 'JHN',
    chapter: 4,
  });
  assert.equal(merged.positionSource, 'local');
  // L13: streak follows the side that owns the most recent lastReadDate rather
  // than ratcheting up via Math.max. Local's lastReadDate (2026-03-09) is newer
  // than remote's (2026-03-08), so local's streak of 2 wins — a stale higher
  // remote counter no longer resurrects a legitimately-lower local streak.
  assert.equal(merged.progress.streakDays, 2);
});

test('mergeReadingSnapshot adopts the remote streak when the remote lastReadDate is newer', () => {
  const local: LocalReadingSnapshot = {
    chaptersRead: { JHN_3: 500 },
    streakDays: 2,
    lastReadDate: '2026-03-08',
    currentBook: 'JHN',
    currentChapter: 3,
  };

  const remote: RemoteUserProgress = {
    id: 'progress-1',
    user_id: 'user-1',
    chapters_read: { JHN_4: 900 },
    streak_days: 5,
    last_read_date: '2026-03-09',
    current_book: 'JHN',
    current_chapter: 4,
    synced_at: '2026-03-09T05:00:00.000Z',
  };

  const merged = mergeReadingSnapshot(local, remote);

  assert.equal(merged.progress.lastReadDate, '2026-03-09');
  assert.equal(merged.progress.streakDays, 5);
});

// ---------------------------------------------------------------------------
// A device whose clock runs ahead
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const CLOCK_NOW = new Date('2026-09-24T12:00:00.000Z');
/** The device's local calendar day, `shift` days from `date` (what progressStore writes). */
const localDay = (date: Date, shift = 0): string => {
  const day = new Date(date);
  day.setDate(day.getDate() + shift);
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  ].join('-');
};
const progressRow = (overrides: Partial<RemoteUserProgress>): RemoteUserProgress => ({
  id: 'progress-1',
  user_id: 'user-1',
  chapters_read: {},
  streak_days: 0,
  last_read_date: null,
  current_book: 'GEN',
  current_chapter: 1,
  synced_at: '2026-09-24T11:00:00.000Z',
  ...overrides,
});
const readerOn = (lastReadDate: string | null, streakDays: number): LocalReadingSnapshot => ({
  chaptersRead: { JHN_3: CLOCK_NOW.getTime() - DAY_MS },
  streakDays,
  lastReadDate,
  currentBook: 'JHN',
  currentChapter: 3,
});

test('a read date from a clock running ahead counts as today, so it cannot end the streak', () => {
  const ahead = progressRow({ last_read_date: localDay(CLOCK_NOW, 30), streak_days: 1 });

  // Read today here: a same-day tie, so the longer run stays.
  const readToday = mergeReadingSnapshot(readerOn(localDay(CLOCK_NOW), 7), ahead, CLOCK_NOW);
  assert.deepEqual(
    [readToday.progress.lastReadDate, readToday.progress.streakDays],
    [localDay(CLOCK_NOW), 7]
  );

  // Read yesterday here: the other device's read is today's, with its count.
  const readYesterday = mergeReadingSnapshot(
    readerOn(localDay(CLOCK_NOW, -1), 7),
    ahead,
    CLOCK_NOW
  );
  assert.deepEqual(
    [readYesterday.progress.lastReadDate, readYesterday.progress.streakDays],
    [localDay(CLOCK_NOW), 1]
  );

  // The row still holds the future date, so the merge does not match it and the
  // next upload lets the server repair it.
  assert.equal(readingMatchesRemote(readToday, ahead), false);
});

test('a read date one day ahead is kept, since another time zone can be there already', () => {
  const tomorrow = localDay(CLOCK_NOW, 1);
  const merged = mergeReadingSnapshot(
    readerOn(localDay(CLOCK_NOW), 7),
    progressRow({ last_read_date: tomorrow, streak_days: 8 }),
    CLOCK_NOW
  );
  assert.deepEqual([merged.progress.lastReadDate, merged.progress.streakDays], [tomorrow, 8]);
});

test('a future read date stored on this device (clock since corrected) comes back to today', () => {
  const merged = mergeReadingSnapshot(readerOn(localDay(CLOCK_NOW, 10), 4), null, CLOCK_NOW);
  assert.deepEqual(
    [merged.progress.lastReadDate, merged.progress.streakDays],
    [localDay(CLOCK_NOW), 4]
  );
  assert.equal(merged.changed, true);
});

test('chapter times more than a day ahead are taken as read now, on either side', () => {
  const now = CLOCK_NOW.getTime();
  const merged = mergeReadingSnapshot(
    {
      ...readerOn(localDay(CLOCK_NOW), 1),
      chaptersRead: { JHN_3: now - DAY_MS, MAT_1: now + 90 * DAY_MS },
    },
    progressRow({
      chapters_read: { GEN_1: now + 30 * DAY_MS, GEN_2: now + DAY_MS - 60_000, JHN_3: now + 5e12 },
    }),
    CLOCK_NOW
  );
  assert.deepEqual(merged.progress.chaptersRead, {
    JHN_3: now,
    MAT_1: now,
    GEN_1: now,
    GEN_2: now + DAY_MS - 60_000,
  });
});

test('the upload never carries a read date past tomorrow or a chapter time past a day ahead', () => {
  const now = CLOCK_NOW.getTime();
  const reading = (lastReadDate: string, chaptersRead: Record<string, number>) => ({
    progress: { chaptersRead, streakDays: 3, lastReadDate },
    readingPosition: { bookId: 'GEN', chapter: 1 },
    positionSource: 'local' as const,
    changed: true,
  });

  const payload = buildRemoteProgressPayload(
    'user-1',
    reading(localDay(CLOCK_NOW, 40), { GEN_1: now + 40 * DAY_MS, GEN_2: now + DAY_MS }),
    CLOCK_NOW.toISOString()
  );
  assert.equal(payload.last_read_date, localDay(CLOCK_NOW));
  assert.deepEqual(payload.chapters_read, { GEN_1: now, GEN_2: now + DAY_MS });

  const tomorrow = buildRemoteProgressPayload(
    'user-1',
    reading(localDay(CLOCK_NOW, 1), {}),
    CLOCK_NOW.toISOString()
  );
  assert.equal(tomorrow.last_read_date, localDay(CLOCK_NOW, 1));
});

test('a position stamp exactly one day ahead is kept, as merge_user_progress keeps it', () => {
  const now = CLOCK_NOW.getTime();
  const stampedAt = (readingPositionUpdatedAt: number): LocalReadingSnapshot => ({
    ...readerOn(localDay(CLOCK_NOW), 1),
    readingPositionUpdatedAt,
  });

  const edge = mergeReadingSnapshot(stampedAt(now + DAY_MS), null, CLOCK_NOW);
  assert.equal(edge.readingPositionUpdatedAt, now + DAY_MS);
  assert.equal(
    buildRemoteProgressPayload('user-1', edge, CLOCK_NOW.toISOString()).position_updated_at,
    now + DAY_MS
  );
  assert.equal(
    mergeReadingSnapshot(stampedAt(now + DAY_MS + 1), null, CLOCK_NOW).readingPositionUpdatedAt,
    now
  );
});

test('a clamped read date keeps the two-digit day early in the month', () => {
  // Local noon on 3 October, whatever zone the test runs in.
  const thirdOfOctober = new Date(2026, 9, 3, 12);
  const merged = mergeReadingSnapshot(
    readerOn('2026-10-02', 2),
    progressRow({ last_read_date: '2026-11-20', streak_days: 1 }),
    thirdOfOctober
  );

  assert.equal(merged.progress.lastReadDate, '2026-10-03');
});

test('with no server row yet, an untouched device has nothing to apply', () => {
  const untouched: LocalReadingSnapshot = {
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    currentBook: 'GEN',
    currentChapter: 1,
  };

  assert.deepEqual(mergeReadingSnapshot(untouched, null, CLOCK_NOW), {
    progress: { chaptersRead: {}, streakDays: 0, lastReadDate: null },
    readingPosition: { bookId: 'GEN', chapter: 1 },
    positionSource: 'local',
    readingPositionUpdatedAt: null,
    changed: false,
  });
});

test('a NULL streak on the server row counts as 0, as merge_user_progress counts it', () => {
  // streak_days is a nullable column. The row read last (today), so its streak is
  // the one taken: 0, never null or a guess.
  const merged = mergeReadingSnapshot(
    readerOn(localDay(CLOCK_NOW, -1), 4),
    progressRow({
      streak_days: null as unknown as number,
      last_read_date: localDay(CLOCK_NOW),
    }),
    CLOCK_NOW
  );

  assert.deepEqual(
    [merged.progress.lastReadDate, merged.progress.streakDays],
    [localDay(CLOCK_NOW), 0]
  );
});

test('a merge that changes only the streak or only the position stamp is reported for applying', () => {
  // syncService writes a merge into the stores only when it reports a change.
  const today = localDay(CLOCK_NOW);
  const device = readerOn(today, 1);
  const longerRun = mergeReadingSnapshot(
    device,
    progressRow({
      chapters_read: device.chaptersRead,
      streak_days: 3,
      last_read_date: today,
      current_book: 'JHN',
      current_chapter: 3,
    }),
    CLOCK_NOW
  );
  assert.deepEqual([longerRun.progress.streakDays, longerRun.changed], [3, true]);

  const readAt = CLOCK_NOW.getTime() - HOUR_MS;
  const stampedOnServer = mergeReadingSnapshot(
    { ...device, chaptersRead: { JHN_3: readAt } },
    progressRow({
      chapters_read: { JHN_3: readAt },
      streak_days: 1,
      last_read_date: today,
      current_book: 'JHN',
      current_chapter: 3,
      position_updated_at: readAt + 1000,
      position_updated_for: 'JHN_3',
    }),
    CLOCK_NOW
  );
  assert.deepEqual(
    [stampedOnServer.readingPositionUpdatedAt, stampedOnServer.changed],
    [readAt + 1000, true]
  );
});

test('mergeReadingSnapshot adopts a remote position on the last chapter of a book', () => {
  const untouched: LocalReadingSnapshot = {
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    currentBook: 'GEN',
    currentChapter: 1,
  };

  for (const [book, chapter] of [
    ['JUD', 1],
    ['PSA', 150],
    ['REV', 22],
  ] as const) {
    const merged = mergeReadingSnapshot(
      untouched,
      progressRow({ current_book: book, current_chapter: chapter }),
      CLOCK_NOW
    );
    assert.deepEqual(merged.readingPosition, { bookId: book, chapter }, `${book} ${chapter}`);
  }
});

test('only an untouched device at Genesis 1 adopts a server position it has no time for', () => {
  const untouched: LocalReadingSnapshot = {
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    currentBook: 'GEN',
    currentChapter: 1,
  };
  // A NULL synced_at (the column is nullable) and an unread, unstamped position
  // leave the server side with no time at all. A device that has done nothing yet
  // still takes the account's place, even one that sorts before GEN_1.
  const untimed = progressRow({
    current_book: 'ACT',
    current_chapter: 2,
    synced_at: null as unknown as string,
  });
  assert.deepEqual(mergeReadingSnapshot(untouched, untimed, CLOCK_NOW).readingPosition, {
    bookId: 'ACT',
    chapter: 2,
  });

  // Genesis 1 read after the row was uploaded (11:00): no longer untouched, and
  // the newer read keeps it.
  const readGenesis = {
    ...untouched,
    chaptersRead: { GEN_1: Date.parse('2026-09-24T11:30:00.000Z') },
  };
  assert.deepEqual(
    mergeReadingSnapshot(
      readGenesis,
      progressRow({ current_book: 'ACT', current_chapter: 2 }),
      CLOCK_NOW
    ).readingPosition,
    { bookId: 'GEN', chapter: 1 }
  );
});

test('an explicit position choice beats a server position nobody chose or read, however early', () => {
  // Upload time is not a position choice: with a stamp on this side the row's
  // synced_at is not compared at all, even for the smallest stamp the server
  // accepts (1 ms). REV_1 sorts after ACT_1, so a tie would have gone to the row.
  for (const stamp of [1, CLOCK_NOW.getTime() - DAY_MS]) {
    const merged = mergeReadingSnapshot(
      {
        ...readerOn(localDay(CLOCK_NOW), 1),
        currentBook: 'ACT',
        currentChapter: 1,
        readingPositionUpdatedAt: stamp,
      },
      progressRow({ current_book: 'REV', current_chapter: 1, synced_at: CLOCK_NOW.toISOString() }),
      CLOCK_NOW
    );
    assert.deepEqual(
      [merged.readingPosition, merged.readingPositionUpdatedAt],
      [{ bookId: 'ACT', chapter: 1 }, stamp],
      `stamp ${stamp}`
    );
  }
});

test('a chosen position the server row also holds keeps the later read a legacy build made there', () => {
  // Chosen here two hours ago; a build without position stamps read it an hour
  // ago. The position stays, stamped with the later read (as the server does).
  const chosenAt = CLOCK_NOW.getTime() - 2 * HOUR_MS;
  const readAt = CLOCK_NOW.getTime() - HOUR_MS;
  const merged = mergeReadingSnapshot(
    {
      ...readerOn(localDay(CLOCK_NOW), 1),
      chaptersRead: { JHN_10: chosenAt },
      currentBook: 'JHN',
      currentChapter: 10,
      readingPositionUpdatedAt: chosenAt,
    },
    progressRow({ current_book: 'JHN', current_chapter: 10, chapters_read: { JHN_10: readAt } }),
    CLOCK_NOW
  );

  assert.deepEqual(
    [merged.readingPosition, merged.readingPositionUpdatedAt],
    [{ bookId: 'JHN', chapter: 10 }, readAt]
  );
});

test("a position that wins over another chapter carries only its own side's stamp", () => {
  const earlier = CLOCK_NOW.getTime() - 2 * HOUR_MS;
  const later = CLOCK_NOW.getTime() - HOUR_MS;
  const device = readerOn(localDay(CLOCK_NOW), 1);

  // A legacy build read John 3 after this device chose John 10: John 3 is taken,
  // unstamped, since nobody chose it explicitly.
  const adopted = mergeReadingSnapshot(
    {
      ...device,
      chaptersRead: { JHN_10: earlier },
      currentBook: 'JHN',
      currentChapter: 10,
      readingPositionUpdatedAt: earlier,
    },
    progressRow({ current_book: 'JHN', current_chapter: 3, chapters_read: { JHN_3: later } }),
    CLOCK_NOW
  );
  assert.deepEqual(
    [adopted.readingPosition, adopted.readingPositionUpdatedAt],
    [{ bookId: 'JHN', chapter: 3 }, null]
  );

  // This device read John 10 (without a stamp) after John 3 was chosen on the
  // server: John 10 is kept, still unstamped.
  const kept = mergeReadingSnapshot(
    {
      ...device,
      chaptersRead: { JHN_10: later },
      currentBook: 'JHN',
      currentChapter: 10,
      readingPositionUpdatedAt: null,
    },
    progressRow({
      current_book: 'JHN',
      current_chapter: 3,
      position_updated_at: earlier,
      position_updated_for: 'JHN_3',
    }),
    CLOCK_NOW
  );
  assert.deepEqual(
    [kept.readingPosition, kept.readingPositionUpdatedAt],
    [{ bookId: 'JHN', chapter: 10 }, null]
  );
});

test('the progress upload keeps values right at the limits merge_user_progress accepts', () => {
  const syncedAt = CLOCK_NOW.toISOString();
  const reading = (
    bookId: string,
    chapter: number,
    streakDays: number,
    chaptersRead: Record<string, number> = {}
  ): ReadingMergeResult => ({
    progress: { chaptersRead, streakDays, lastReadDate: localDay(CLOCK_NOW) },
    readingPosition: { bookId, chapter },
    positionSource: 'local',
    changed: true,
  });
  const upload = (input: ReadingMergeResult) => {
    const payload = buildRemoteProgressPayload('user-1', input, syncedAt);
    return [
      payload.chapters_read,
      payload.streak_days,
      payload.current_book,
      payload.current_chapter,
    ];
  };
  const longestKey = 'k'.repeat(64);

  assert.deepEqual(
    upload(reading('B'.repeat(32), 999_999, 999_999_999, { a: 1, [longestKey]: 2 })),
    [{ a: 1, [longestKey]: 2 }, 999_999_999, 'B'.repeat(32), 999_999]
  );
  assert.deepEqual(upload(reading('B', 1, 0)), [{}, 0, 'B', 1]);
  assert.deepEqual(upload(reading('B'.repeat(33), 1, 1_000_000_000)), [{}, null, null, null]);
  assert.deepEqual(upload(reading('JHN', 1_000_000, 1)), [{}, 1, null, null]);
});

test('mergePreferences prefers the newer remote preferences snapshot', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: {
      ...defaultAuthPreferences,
      theme: 'dark',
      language: 'en',
    },
    updatedAt: '2026-03-09T05:00:00.000Z',
  };

  const remote: RemoteUserPreferences = {
    id: 'prefs-1',
    user_id: 'user-1',
    font_size: 'large',
    theme: 'light',
    appearance_palette: defaultAuthPreferences.appearancePalette,
    language: 'es',
    country_code: 'MX',
    country_name: 'Mexico',
    content_language_code: 'es',
    content_language_name: 'Spanish',
    content_language_native_name: 'Español',
    chapter_feedback_name: 'Miriam',
    chapter_feedback_role: 'Church leader',
    chapter_feedback_id_number: '42',
    onboarding_completed: true,
    chapter_feedback_enabled: true,
    hide_play_button_from_reading_tab: true,
    notifications_enabled: true,
    reminder_time: '08:00',
    synced_at: '2026-03-09T06:00:00.000Z',
  };

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'remote');
  assert.equal(merged.updatedAt, '2026-03-09T06:00:00.000Z');
  assert.equal(merged.preferences.theme, 'light');
  assert.equal(merged.preferences.language, 'es');
  assert.equal(merged.preferences.chapterFeedbackEnabled, true);
  assert.equal(merged.preferences.hidePlayButtonFromReadingTab, true);
  assert.equal(merged.preferences.reminderTime, '08:00');
  assert.equal(merged.changed, true);
});

test('mergePreferences keeps the newer local preferences snapshot', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: {
      ...defaultAuthPreferences,
      fontSize: 'large',
      theme: 'light',
      language: 'fr',
      onboardingCompleted: true,
    },
    updatedAt: '2026-03-09T07:00:00.000Z',
  };

  const remote: RemoteUserPreferences = {
    id: 'prefs-1',
    user_id: 'user-1',
    font_size: 'small',
    theme: 'dark',
    appearance_palette: defaultAuthPreferences.appearancePalette,
    language: 'es',
    country_code: null,
    country_name: null,
    content_language_code: null,
    content_language_name: null,
    content_language_native_name: null,
    chapter_feedback_name: null,
    chapter_feedback_role: null,
    chapter_feedback_id_number: null,
    onboarding_completed: true,
    chapter_feedback_enabled: false,
    hide_play_button_from_reading_tab: false,
    notifications_enabled: false,
    reminder_time: null,
    synced_at: '2026-03-09T06:00:00.000Z',
  };

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'local');
  assert.equal(merged.changed, false, 'nothing on the device changes');
  assert.equal(merged.updatedAt, '2026-03-09T07:00:00.000Z');
  assert.equal(merged.preferences.theme, 'light');
  assert.equal(merged.preferences.language, 'fr');
  assert.equal(merged.preferences.fontSize, 'large');
});

test('mergePreferences does not let a newer incomplete remote snapshot reopen onboarding', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: {
      ...defaultAuthPreferences,
      language: 'es',
      countryCode: 'MX',
      countryName: 'Mexico',
      contentLanguageCode: 'es',
      contentLanguageName: 'Spanish',
      contentLanguageNativeName: 'Español',
      chapterFeedbackName: 'Miriam',
      chapterFeedbackRole: 'Church leader',
      onboardingCompleted: true,
    },
    updatedAt: '2026-03-10T08:00:00.000Z',
  };

  const remote: RemoteUserPreferences = {
    id: 'prefs-2',
    user_id: 'user-1',
    font_size: 'medium',
    theme: 'dark',
    appearance_palette: defaultAuthPreferences.appearancePalette,
    language: 'en',
    country_code: null,
    country_name: null,
    content_language_code: null,
    content_language_name: null,
    content_language_native_name: null,
    chapter_feedback_name: null,
    chapter_feedback_role: null,
    chapter_feedback_id_number: null,
    onboarding_completed: false,
    chapter_feedback_enabled: false,
    hide_play_button_from_reading_tab: false,
    notifications_enabled: false,
    reminder_time: null,
    synced_at: '2026-03-10T09:00:00.000Z',
  };

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'local');
  assert.equal(merged.preferences.onboardingCompleted, true);
  assert.equal(merged.preferences.language, 'es');
  assert.equal(merged.preferences.countryCode, 'MX');
  assert.equal(merged.preferences.contentLanguageCode, 'es');
});

// ---------------------------------------------------------------------------
// Per-field edit stamps (docs/research/sync-offline-review-2026-09-24.md, finding 7).
// The server row carries field_updated_at once migration 20260924023259 is live.
// ---------------------------------------------------------------------------

const stampedRow = (
  overrides: Partial<RemoteUserPreferences>,
  fieldUpdatedAt: Record<string, string>
): RemoteUserPreferences => ({
  id: 'prefs-stamped',
  user_id: 'user-1',
  font_size: 'medium',
  theme: 'light',
  appearance_palette: defaultAuthPreferences.appearancePalette,
  language: 'en',
  country_code: null,
  country_name: null,
  content_language_code: null,
  content_language_name: null,
  content_language_native_name: null,
  chapter_feedback_name: null,
  chapter_feedback_role: null,
  chapter_feedback_id_number: null,
  onboarding_completed: true,
  chapter_feedback_enabled: false,
  hide_play_button_from_reading_tab: false,
  notifications_enabled: false,
  reminder_time: null,
  synced_at: '2026-09-20T12:00:00.000Z',
  field_updated_at: fieldUpdatedAt,
  ...overrides,
});

const onboarded = { ...defaultAuthPreferences, onboardingCompleted: true };

test('the newer edit of a setting wins even when the other phone uploaded later', () => {
  // This phone chose dark at 10:00 and synced at 10:01. The other phone chose
  // light at 09:00 while offline and only uploaded at 12:00.
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, theme: 'dark' },
    updatedAt: '2026-09-20T10:00:00.000Z',
    fieldStamps: { theme: '2026-09-20T10:00:00.000Z' },
  };
  const remote = stampedRow(
    { theme: 'light', synced_at: '2026-09-20T12:00:00.000Z' },
    { theme: '2026-09-20T09:00:00.000Z' }
  );

  const merged = mergePreferences(local, remote);

  assert.equal(merged.preferences.theme, 'dark');
  assert.equal(merged.fieldStamps?.theme, '2026-09-20T10:00:00.000Z');
  assert.notEqual(merged.source, 'remote', 'the newer local edit must be uploaded');
});

test('an older edit uploaded later loses to the newer edit already on the server', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, fontSize: 'small' },
    updatedAt: '2026-09-20T13:00:00.000Z',
    fieldStamps: { fontSize: '2026-09-20T08:00:00.000Z' },
  };
  const remote = stampedRow(
    { font_size: 'large', synced_at: '2026-09-20T09:30:00.000Z' },
    { font_size: '2026-09-20T09:00:00.000Z' }
  );

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'remote');
  assert.equal(merged.preferences.fontSize, 'large');
  assert.equal(merged.fieldStamps?.fontSize, '2026-09-20T09:00:00.000Z');
});

test('each setting is decided by its own stamps, so both phones keep their newest edits', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, fontSize: 'large', theme: 'light' },
    updatedAt: '2026-09-20T11:00:00.000Z',
    fieldStamps: { fontSize: '2026-09-20T11:00:00.000Z', theme: '2026-09-20T07:00:00.000Z' },
  };
  const remote = stampedRow(
    { font_size: 'small', theme: 'dark' },
    { font_size: '2026-09-20T10:00:00.000Z', theme: '2026-09-20T10:30:00.000Z' }
  );

  const merged = mergePreferences(local, remote);

  assert.equal(merged.source, 'merged');
  assert.equal(merged.preferences.fontSize, 'large');
  assert.equal(merged.preferences.theme, 'dark');
  assert.deepEqual(merged.fieldStamps, {
    fontSize: '2026-09-20T11:00:00.000Z',
    theme: '2026-09-20T10:30:00.000Z',
  });
});

test('equal stamps with different values resolve to the server, as the server does', () => {
  const stamp = '2026-09-20T10:00:00.000Z';
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, fontSize: 'small' },
    updatedAt: stamp,
    fieldStamps: { fontSize: stamp },
  };

  const merged = mergePreferences(local, stampedRow({ font_size: 'large' }, { font_size: stamp }));

  assert.equal(merged.preferences.fontSize, 'large');
});

test('stamps are compared as instants, not as strings in different ISO shapes', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, fontSize: 'small' },
    updatedAt: '2026-09-20T10:00:00.000Z',
    // 10:00Z is later than 11:30+02:00 (09:30Z), though it sorts first as text.
    fieldStamps: { fontSize: '2026-09-20T10:00:00.000Z' },
  };

  const merged = mergePreferences(
    local,
    stampedRow({ font_size: 'large' }, { font_size: '2026-09-20T11:30:00+02:00' })
  );

  assert.equal(merged.preferences.fontSize, 'small');
});

test('a server row without the stamp column is merged the legacy way and reports no stamps', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, theme: 'dark' },
    updatedAt: '2026-09-20T10:00:00.000Z',
    fieldStamps: { theme: '2026-09-20T10:00:00.000Z' },
  };
  const legacyRow = stampedRow({ theme: 'light', synced_at: '2026-09-20T12:00:00.000Z' }, {});
  delete legacyRow.field_updated_at;

  const merged = mergePreferences(local, legacyRow);

  // Before the migration only the whole-row upload time exists, so remote wins.
  assert.equal(merged.preferences.theme, 'light');
  assert.equal(merged.fieldStamps, null);
});

// ---------------------------------------------------------------------------
// First sign-in (finding 8). Every new account's row is created by the signup
// trigger with DB defaults (theme 'dark'); those values carry no stamps.
// ---------------------------------------------------------------------------

const signupRow = (): RemoteUserPreferences =>
  stampedRow(
    {
      theme: 'dark',
      onboarding_completed: false,
      appearance_palette: 'el-blue',
      synced_at: '2026-09-21T09:00:00.000Z',
    },
    {}
  );

test('a first sign-in never lets the signup row defaults replace the device settings', () => {
  // Signed in from inside onboarding: nothing has been chosen on the device yet.
  const local: LocalPreferenceSnapshot = {
    preferences: { ...defaultAuthPreferences, theme: 'light' },
    updatedAt: null,
    fieldStamps: {},
  };

  const merged = mergePreferences(local, signupRow());

  assert.equal(merged.preferences.theme, 'light');
  // Nothing is uploaded yet: neither side has chosen anything, and an upload
  // whose stamps match the row's is read by the stamp trigger as an installed
  // build's write, which would record these defaults as chosen now (see the
  // property-test regression below). The first real choice uploads them.
  assert.equal(merged.source, 'remote');
  assert.equal(merged.changed, false);
});

test('a first sign-in keeps what the device chose and takes what the account chose', () => {
  // A fresh phone finished onboarding (language picked there) and never touched
  // the font; the account chose a large font on another phone last week.
  const local: LocalPreferenceSnapshot = {
    preferences: { ...defaultAuthPreferences, language: 'es', onboardingCompleted: true },
    updatedAt: '2026-09-21T08:00:00.000Z',
    fieldStamps: {
      language: '2026-09-21T08:00:00.000Z',
      onboardingCompleted: '2026-09-21T08:00:00.000Z',
    },
  };
  const account = stampedRow(
    { font_size: 'large', theme: 'dark', language: 'en', synced_at: '2026-09-14T00:00:00.000Z' },
    {
      font_size: '2026-09-14T00:00:00.000Z',
      theme: '2026-09-14T00:00:00.000Z',
      language: '2026-09-14T00:00:00.000Z',
    }
  );

  const merged = mergePreferences(local, account);

  assert.equal(merged.preferences.fontSize, 'large');
  assert.equal(merged.preferences.theme, 'dark');
  assert.equal(merged.preferences.language, 'es');
  assert.equal(merged.preferences.onboardingCompleted, true);
});

// Regressions found by syncMerge.preferences.property.test.ts.

test('a reminder time read back from the TIME column keeps the HH:MM the app uses', () => {
  // Postgres returns "07:30:00" for the "07:30" the app wrote. The seconds made
  // the two sides differ on every sync, and the persisted-state sanitizer (HH:MM
  // only) dropped the adopted reminder at the next launch.
  const row = stampedRow(
    { reminder_time: '07:30:00' },
    { reminder_time: '2026-09-20T09:00:00.000Z' }
  );

  assert.equal(mapRemotePreferences(row).reminderTime, '07:30');
  assert.equal(
    mapRemotePreferences({ ...row, reminder_time: '07:30:00.123' }).reminderTime,
    '07:30'
  );
  assert.equal(mapRemotePreferences({ ...row, reminder_time: 'soon' }).reminderTime, null);
});

test('a default nobody chose is not uploaded when it would look like an installed build write', () => {
  // Counterexample: a device that had chosen nothing synced before the phone
  // where the reader had picked the dark theme. Its upload carried the row's
  // stamps unchanged ({}), which the stamp trigger reads as an installed build's
  // write, so the device's default theme was recorded as chosen just now and then
  // beat the real choice. The default now stays on the device.
  const merged = mergePreferences(
    { preferences: defaultAuthPreferences, updatedAt: null, fieldStamps: {} },
    stampedRow({ theme: 'dark', onboarding_completed: false }, {})
  );

  assert.equal(merged.source, 'remote', 'nothing to upload');
  assert.equal(merged.preferences.theme, defaultAuthPreferences.theme);
  assert.equal(merged.changed, false);
});

test('finished onboarding is re-asserted over a newer "not finished" from an installed build', () => {
  // Counterexample: a 1.0.9 phone upserted onboarding_completed false, stamped
  // by the server just now. Keeping true with the older local stamp was refused
  // by the trigger, and adopting the read-back reopened onboarding here.
  const merged = mergePreferences(
    {
      preferences: onboarded,
      updatedAt: '2026-09-20T08:00:00.000Z',
      fieldStamps: { onboardingCompleted: '2026-09-20T08:00:00.000Z' },
    },
    stampedRow(
      { onboarding_completed: false },
      { onboarding_completed: '2026-09-20T10:00:00.000Z' }
    )
  );

  assert.equal(merged.preferences.onboardingCompleted, true);
  assert.equal(merged.fieldStamps?.onboardingCompleted, '2026-09-20T10:00:00.001Z');
  assert.notEqual(merged.source, 'remote');
});

test('finished onboarding is re-asserted only over a "not finished" stamped at or after its own', () => {
  const keptOver = (localStamp: string) =>
    mergePreferences(
      {
        preferences: onboarded,
        updatedAt: localStamp,
        fieldStamps: { onboardingCompleted: localStamp },
      },
      stampedRow(
        { onboarding_completed: false },
        { onboarding_completed: '2026-09-20T10:00:00.000Z' }
      )
    ).fieldStamps?.onboardingCompleted;

  // Newer than the server's stamp already: uploaded as it is.
  assert.equal(keptOver('2026-09-20T11:00:00.000Z'), '2026-09-20T11:00:00.000Z');
  // The same instant would be refused (the server keeps a stamp that is not newer).
  assert.equal(keptOver('2026-09-20T10:00:00.000Z'), '2026-09-20T10:00:00.001Z');
});

test('onboarding finished on another phone is adopted with the server stamp, never an invented one', () => {
  const notYet: LocalPreferenceSnapshot = {
    preferences: defaultAuthPreferences,
    updatedAt: null,
    fieldStamps: {},
  };

  const stamped = mergePreferences(
    notYet,
    stampedRow({}, { onboarding_completed: '2026-09-20T10:00:00.000Z' })
  );
  assert.equal(stamped.preferences.onboardingCompleted, true);
  assert.deepEqual(stamped.fieldStamps, { onboardingCompleted: '2026-09-20T10:00:00.000Z' });
  assert.equal(stamped.source, 'remote', 'the server already holds all of it');

  const unstamped = mergePreferences(notYet, stampedRow({}, {}));
  assert.equal(unstamped.preferences.onboardingCompleted, true);
  assert.deepEqual(unstamped.fieldStamps, {});
});

test('agreed settings keep the newer stamp, and a newer stamp here is uploaded without touching the device', () => {
  const at10 = '2026-09-20T10:00:00.000Z';
  const at09 = '2026-09-20T09:00:00.000Z';
  const local: LocalPreferenceSnapshot = {
    preferences: onboarded,
    updatedAt: at10,
    fieldStamps: { fontSize: at10, onboardingCompleted: at10 },
  };

  assert.deepEqual(
    mergePreferences(local, stampedRow({}, { font_size: at09, onboarding_completed: at09 })),
    {
      preferences: onboarded,
      updatedAt: at10,
      source: 'local',
      changed: false,
      remotePreferences: onboarded,
      fieldStamps: { fontSize: at10, onboardingCompleted: at10 },
      remoteFieldStamps: { fontSize: at09, onboardingCompleted: at09 },
    }
  );
});

test('agreed settings take the server stamp when it is newer or the same instant, so nothing is re-uploaded', () => {
  const serverStamps = {
    fontSize: '2026-09-20T09:00:00.000Z',
    theme: '2026-09-20T09:15:00.000Z',
    language: '2026-09-20T09:00:00.000Z',
  };
  const local: LocalPreferenceSnapshot = {
    preferences: onboarded,
    updatedAt: '2026-09-20T08:00:00.000Z',
    // Older; missing; and the same instant as the server's in another ISO shape.
    fieldStamps: { fontSize: '2026-09-20T08:00:00.000Z', language: '2026-09-20T09:00:00Z' },
  };

  assert.deepEqual(
    mergePreferences(
      local,
      stampedRow(
        { synced_at: '2026-09-20T09:30:00.000Z' },
        {
          font_size: serverStamps.fontSize,
          theme: serverStamps.theme,
          language: serverStamps.language,
        }
      )
    ),
    {
      preferences: onboarded,
      updatedAt: '2026-09-20T09:30:00.000Z',
      source: 'remote',
      changed: false,
      remotePreferences: onboarded,
      fieldStamps: serverStamps,
      remoteFieldStamps: serverStamps,
    }
  );
});

test('a merge that only takes a server stamp for an agreed setting is still stored on the device', () => {
  // The font edit here is newer and must be uploaded; the theme agrees but the
  // server's stamp for it is newer, which the device must keep: 'merged'.
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, fontSize: 'large' },
    updatedAt: '2026-09-20T11:00:00.000Z',
    fieldStamps: { fontSize: '2026-09-20T11:00:00.000Z', theme: '2026-09-20T08:00:00.000Z' },
  };

  const merged = mergePreferences(
    local,
    stampedRow({}, { font_size: '2026-09-20T10:00:00.000Z', theme: '2026-09-20T09:00:00.000Z' })
  );

  assert.equal(merged.source, 'merged');
  assert.equal(merged.changed, false);
  assert.deepEqual(merged.preferences, local.preferences);
  assert.deepEqual(merged.fieldStamps, {
    fontSize: '2026-09-20T11:00:00.000Z',
    theme: '2026-09-20T09:00:00.000Z',
  });
});

test('a device without stored stamps merges against a stamped row by the row stamps', () => {
  // fieldStamps is optional on the snapshot.
  const merged = mergePreferences(
    { preferences: { ...onboarded, fontSize: 'small' }, updatedAt: '2026-09-20T08:00:00.000Z' },
    stampedRow({ font_size: 'large' }, { font_size: '2026-09-20T09:00:00.000Z' })
  );

  assert.equal(merged.preferences.fontSize, 'large');
  assert.deepEqual(merged.fieldStamps, { fontSize: '2026-09-20T09:00:00.000Z' });
});

test('only timestamp strings in field_updated_at count as stamps, and an empty column holds none', () => {
  const stamp = '2026-09-20T10:00:00.000Z';
  const malformed = { font_size: 2026, theme: true, language: 'soon', reminder_time: stamp };

  assert.deepEqual(
    readRemoteFieldStamps(stampedRow({}, malformed as unknown as Record<string, string>)),
    { reminderTime: stamp }
  );
  assert.deepEqual(readRemoteFieldStamps(stampedRow({ field_updated_at: null }, {})), {});
});

test('with no server row the device settings stand and its stamps are offered for upload', () => {
  const preferences: UserPreferences = { ...onboarded, fontSize: 'large' };
  const updatedAt = '2026-09-20T10:00:00.000Z';
  const expected = {
    preferences,
    updatedAt,
    source: 'local',
    changed: false,
    remotePreferences: null,
    remoteFieldStamps: null,
  };

  assert.deepEqual(mergePreferences({ preferences, updatedAt }, null), {
    ...expected,
    fieldStamps: {},
  });
  assert.deepEqual(
    mergePreferences({ preferences, updatedAt, fieldStamps: { fontSize: updatedAt } }, null),
    { ...expected, fieldStamps: { fontSize: updatedAt } }
  );
});

// ---------------------------------------------------------------------------
// Before the stamp column: whole-row stamps, or a three-way merge against the
// values the server held at this device's last sync (its base).
// ---------------------------------------------------------------------------

const legacyRow = (overrides: Partial<RemoteUserPreferences>): RemoteUserPreferences => {
  const row = stampedRow(overrides, {});
  delete row.field_updated_at;
  return row;
};

test('a legacy row stamped at the same instant as the device does not replace its settings', () => {
  const at = '2026-09-20T10:00:00.000Z';
  const merged = mergePreferences(
    { preferences: { ...onboarded, fontSize: 'large' }, updatedAt: at },
    legacyRow({ font_size: 'small', synced_at: at })
  );

  assert.deepEqual([merged.source, merged.preferences.fontSize], ['local', 'large']);
});

test('with a sync base, a setting changed only on this device survives a newer legacy row', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: { ...onboarded, fontSize: 'large' },
    updatedAt: '2026-09-20T09:00:00.000Z',
    base: onboarded,
  };

  assert.deepEqual(mergePreferences(local, legacyRow({ synced_at: '2026-09-20T10:00:00.000Z' })), {
    preferences: local.preferences,
    updatedAt: '2026-09-20T09:00:00.000Z',
    source: 'local',
    changed: false,
    remotePreferences: onboarded,
    fieldStamps: null,
    remoteFieldStamps: null,
  });
});

test('with a sync base, a setting changed only on the server is adopted even from an older row', () => {
  const local: LocalPreferenceSnapshot = {
    preferences: onboarded,
    updatedAt: '2026-09-20T11:00:00.000Z',
    base: onboarded,
  };
  const serverDark: UserPreferences = { ...onboarded, theme: 'dark' };

  assert.deepEqual(
    mergePreferences(local, legacyRow({ theme: 'dark', synced_at: '2026-09-20T10:00:00.000Z' })),
    {
      preferences: serverDark,
      updatedAt: '2026-09-20T10:00:00.000Z',
      source: 'remote',
      changed: true,
      remotePreferences: serverDark,
      fieldStamps: null,
      remoteFieldStamps: null,
    }
  );
});

test('with a sync base, edits from both sides are combined and a clash goes to the newer row', () => {
  // Font changed here, theme on the server, language on both (fr here, es there).
  const remote = legacyRow({
    theme: 'dark',
    language: 'es',
    synced_at: '2026-09-20T10:00:00.000Z',
  });
  const local = (updatedAt: string): LocalPreferenceSnapshot => ({
    preferences: { ...onboarded, fontSize: 'large', language: 'fr' },
    updatedAt,
    base: onboarded,
  });
  const combined = (
    updatedAt: string,
    language: UserPreferences['language']
  ): PreferenceMergeResult => ({
    preferences: { ...onboarded, fontSize: 'large', theme: 'dark', language },
    updatedAt,
    source: 'merged',
    changed: true,
    remotePreferences: { ...onboarded, theme: 'dark', language: 'es' },
    fieldStamps: null,
    remoteFieldStamps: null,
  });

  assert.deepEqual(
    mergePreferences(local('2026-09-20T09:00:00.000Z'), remote),
    combined('2026-09-20T09:00:00.000Z', 'es')
  );
  assert.deepEqual(
    mergePreferences(local('2026-09-20T11:00:00.000Z'), remote),
    combined('2026-09-20T11:00:00.000Z', 'fr')
  );
});

// Schema contract, not behaviour: the trigger's column list and the client's
// column map are two copies of one list, and a drift silently stops stamping.
test('the stamp columns the client knows match the ones the server trigger tracks', () => {
  const migration = readFileSync(
    path.join(MIGRATIONS_DIR, '20260924023259_user_preferences_field_edit_stamps.sql'),
    'utf8'
  );
  const tracked = /tracked CONSTANT text\[\] := ARRAY\[([^\]]+)\]/.exec(migration)?.[1] ?? '';
  const serverColumns = [...tracked.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();

  assert.deepEqual(serverColumns, [...Object.values(PREFERENCE_COLUMNS)].sort());
});

test('mixed same-position stamp adoption preserves the winning legacy read recency for later merges', () => {
  const base = Date.parse('2026-09-28T00:00:00Z');
  const now = new Date(base + 1000);
  const local: LocalReadingSnapshot = {
    currentBook: 'JHN',
    currentChapter: 10,
    chaptersRead: { JHN_10: base + 200 },
    streakDays: 1,
    lastReadDate: '2026-09-28',
    readingPositionUpdatedAt: null,
  };
  const remote: RemoteUserProgress = {
    id: 'row',
    user_id: 'user-1',
    current_book: 'JHN',
    current_chapter: 10,
    chapters_read: { JHN_10: base + 100 },
    streak_days: 1,
    last_read_date: '2026-09-28',
    position_updated_at: base + 100,
    position_updated_for: 'JHN_10',
    synced_at: new Date(base + 900).toISOString(),
  };
  const first = mergeReadingSnapshot(local, remote, now);
  assert.equal(first.readingPositionUpdatedAt, base + 200);
  const second = mergeReadingSnapshot(
    { ...local, ...first.progress, readingPositionUpdatedAt: first.readingPositionUpdatedAt },
    {
      ...remote,
      current_chapter: 3,
      chapters_read: { JHN_3: base + 150 },
      position_updated_at: base + 150,
      position_updated_for: 'JHN_3',
    },
    now
  );
  assert.equal(second.readingPosition.chapter, 10);
});

test('explicit unread position stamps govern both local and remote choices, including Genesis 1', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const at = now.getTime();
  const local: LocalReadingSnapshot = {
    currentBook: 'GEN',
    currentChapter: 1,
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    readingPositionUpdatedAt: at,
  };
  const remote: RemoteUserProgress = {
    id: 'row',
    user_id: 'user-1',
    current_book: 'JHN',
    current_chapter: 3,
    chapters_read: {},
    streak_days: 0,
    last_read_date: null,
    synced_at: now.toISOString(),
    position_updated_at: at - 100,
    position_updated_for: 'JHN_3',
  };
  assert.deepEqual(mergeReadingSnapshot(local, remote, now).readingPosition, {
    bookId: 'GEN',
    chapter: 1,
  });
  const latest = mergeReadingSnapshot(local, { ...remote, position_updated_at: at + 100 }, now);
  assert.deepEqual(latest.readingPosition, { bookId: 'JHN', chapter: 3 });
  assert.equal(latest.readingPositionUpdatedAt, at + 100);
  assert.equal(
    mergeReadingSnapshot({ ...local, readingPositionUpdatedAt: null }, remote, now).positionSource,
    'remote'
  );
});

test('explicit position timestamp ties converge and future or invalid stamps are bounded safely', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const at = now.getTime();
  const local: LocalReadingSnapshot = {
    currentBook: 'GEN',
    currentChapter: 1,
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    readingPositionUpdatedAt: at,
  };
  const remote: RemoteUserProgress = {
    id: 'row',
    user_id: 'user-1',
    current_book: 'REV',
    current_chapter: 1,
    chapters_read: {},
    streak_days: 0,
    last_read_date: null,
    synced_at: now.toISOString(),
    position_updated_at: at,
    position_updated_for: 'REV_1',
  };
  assert.equal(mergeReadingSnapshot(local, remote, now).readingPosition.bookId, 'REV');
  assert.equal(
    mergeReadingSnapshot({ ...local, currentBook: 'REV' }, { ...remote, current_book: 'GEN' }, now)
      .readingPosition.bookId,
    'REV'
  );
  const future = mergeReadingSnapshot(
    { ...local, readingPositionUpdatedAt: at + 400 * 86400000 },
    null,
    now
  );
  assert.equal(future.readingPositionUpdatedAt, at);
  assert.equal(
    buildRemoteProgressPayload('user-1', future, now.toISOString()).position_updated_at,
    at
  );
  for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const merged = mergeReadingSnapshot({ ...local, readingPositionUpdatedAt: invalid }, null, now);
    assert.equal(merged.readingPositionUpdatedAt, null);
    assert.equal(
      'position_updated_at' in buildRemoteProgressPayload('user-1', merged, now.toISOString()),
      false
    );
  }
});

test('remote position stamps require a matching tuple anchor and uploads bind both fields', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const at = now.getTime();
  const local: LocalReadingSnapshot = {
    currentBook: 'JHN',
    currentChapter: 10,
    chaptersRead: {},
    streakDays: 0,
    lastReadDate: null,
    readingPositionUpdatedAt: at - 100,
  };
  const remote: RemoteUserProgress = {
    id: 'row',
    user_id: 'user-1',
    current_book: 'JHN',
    current_chapter: 3,
    chapters_read: {},
    streak_days: 0,
    last_read_date: null,
    synced_at: now.toISOString(),
    position_updated_at: at,
  };
  for (const anchor of [undefined, null, 'JHN_10', 'JHN_03']) {
    const merged = mergeReadingSnapshot(local, { ...remote, position_updated_for: anchor }, now);
    assert.equal(merged.readingPosition.chapter, 10);
  }
  const remoteWinner = mergeReadingSnapshot(
    local,
    { ...remote, position_updated_for: 'JHN_3' },
    now
  );
  assert.equal(remoteWinner.readingPosition.chapter, 3);
  assert.equal(
    readingMatchesRemote(remoteWinner, { ...remote, position_updated_for: 'JHN_3' }),
    true
  );
  assert.equal(readingMatchesRemote(remoteWinner, remote), false);
  assert.equal(
    readingMatchesRemote(remoteWinner, { ...remote, position_updated_for: 'JHN_10' }),
    false
  );
  assert.equal(
    buildRemoteProgressPayload('user-1', remoteWinner, now.toISOString()).position_updated_for,
    'JHN_3'
  );
});
