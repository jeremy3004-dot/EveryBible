import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { bibleBooks } from '../../constants/books';
import {
  buildRemoteProgressPayload,
  mergeChapterProgress,
  mergeReadingSnapshot,
  readingMatchesRemote,
  type LocalReadingSnapshot,
} from './syncMerge';
import type { UserProgress as RemoteUserProgress } from '../supabase/types';

// ---------------------------------------------------------------------------
// Randomised checks of reading-progress sync: the client merge
// (mergeReadingSnapshot), the payload it uploads, and the server's atomic merge
// merge_user_progress (migrations 20260924041000 / 20260924051658), modelled
// here in TypeScript.
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=5000 node --test --import tsx \
//     src/services/sync/syncMerge.progress.property.test.ts
// A failure prints its seed and shrunk counterexample; pin it as a named test.
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 200),
};

const USER_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_MS = Date.parse('2026-09-18T00:00:00.000Z');

// ---------------------------------------------------------------------------
// The SQL contract, in TypeScript.
// ---------------------------------------------------------------------------

interface SqlRefusal {
  code: '22023' | '22008' | '42501';
  reason: string;
}

const jsonTypeof = (value: unknown): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'object'
        ? 'object'
        : typeof value;

// jsonb ->> of a JSON number: JavaScript integers below 1e21 print as digits.
const numberText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const isRealIsoDate = (text: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/**
 * The checks merge_user_progress makes before touching the row, applied to the
 * payload as PostgREST receives it (JSON: NaN and Infinity arrive as null,
 * undefined keys vanish). Returns null when the call would be accepted.
 */
function validateMergeUserProgressPayload(
  payload: unknown,
  callerId: string = USER_ID
): SqlRefusal | null {
  const p = JSON.parse(JSON.stringify(payload)) as unknown;
  if (jsonTypeof(p) !== 'object') return { code: '22023', reason: 'p_progress not an object' };
  const row = p as Record<string, unknown>;

  if (
    row.user_id !== undefined &&
    row.user_id !== null &&
    String(row.user_id).toLowerCase() !== callerId
  ) {
    return { code: '42501', reason: 'user_id names another account' };
  }

  const chapters = row.chapters_read;
  if (chapters !== undefined && !['object', 'null'].includes(jsonTypeof(chapters))) {
    return { code: '22023', reason: 'chapters_read not an object' };
  }
  const entries = Object.entries((chapters ?? {}) as Record<string, unknown>);
  if (entries.length > 5000) return { code: '22023', reason: 'more than 5000 chapters' };
  for (const [key, value] of entries) {
    const length = [...key].length;
    if (typeof value !== 'number' || length < 1 || length > 64) {
      return { code: '22023', reason: `chapters_read entry ${JSON.stringify(key)}` };
    }
  }

  const streak = row.streak_days;
  if (streak !== undefined && !['number', 'null'].includes(jsonTypeof(streak))) {
    return { code: '22023', reason: 'streak_days type' };
  }
  const streakText = numberText(streak);
  if (streakText !== null && !/^[0-9]{1,9}$/.test(streakText)) {
    return { code: '22023', reason: 'streak_days not a non-negative integer' };
  }

  const lastRead = row.last_read_date;
  if (lastRead !== undefined && !['string', 'null'].includes(jsonTypeof(lastRead))) {
    return { code: '22023', reason: 'last_read_date type' };
  }
  if (typeof lastRead === 'string') {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(lastRead)) {
      return { code: '22023', reason: 'last_read_date not YYYY-MM-DD' };
    }
    if (!isRealIsoDate(lastRead)) {
      // Passes the regex, then the ::date cast raises.
      return { code: '22008', reason: 'last_read_date is not a calendar date' };
    }
  }

  const book = row.current_book;
  if (book !== undefined && !['string', 'null'].includes(jsonTypeof(book))) {
    return { code: '22023', reason: 'current_book type' };
  }
  if (typeof book === 'string' && ([...book].length < 1 || [...book].length > 32)) {
    return { code: '22023', reason: 'current_book length' };
  }

  const chapter = row.current_chapter;
  if (chapter !== undefined && !['number', 'null'].includes(jsonTypeof(chapter))) {
    return { code: '22023', reason: 'current_chapter type' };
  }
  const chapterText = numberText(chapter);
  if (chapterText !== null && !/^[0-9]{1,6}$/.test(chapterText)) {
    return { code: '22023', reason: 'current_chapter not a non-negative integer' };
  }

  return null;
}

interface ServerProgressRow {
  chapters_read: Record<string, unknown> | null;
  streak_days: number | null;
  last_read_date: string | null;
  current_book: string | null;
  current_chapter: number | null;
  synced_at: string;
}

/**
 * merge_user_progress's merge step (after validation) with the uploaded payload
 * as "in" and the locked row as "stored". `nowIso` stands in for now().
 */
function serverMergeUserProgress(
  stored: ServerProgressRow | null,
  payload: Record<string, unknown>,
  nowIso: string
): ServerProgressRow {
  const p = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const inChapters = (p.chapters_read ?? {}) as Record<string, number>;
  const inStreak = (p.streak_days ?? null) as number | null;
  const inLast = (p.last_read_date ?? null) as string | null;
  const inBook = (p.current_book ?? null) as string | null;
  const inChapter = (p.current_chapter ?? null) as number | null;

  if (!stored) {
    return {
      chapters_read: inChapters,
      streak_days: inStreak ?? 0,
      last_read_date: inLast,
      current_book: inBook ?? 'GEN',
      current_chapter: inChapter ?? 1,
      synced_at: nowIso,
    };
  }

  const chapters: Record<string, number> = {};
  const storedChapters =
    jsonTypeof(stored.chapters_read) === 'object'
      ? (stored.chapters_read as Record<string, unknown>)
      : {};
  for (const source of [storedChapters, inChapters]) {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value !== 'number') continue;
      chapters[key] = key in chapters ? Math.max(chapters[key], value) : value;
    }
  }

  // GREATEST ignores NULLs; dates in one format compare as strings.
  const last =
    stored.last_read_date === null
      ? inLast
      : inLast === null
        ? stored.last_read_date
        : stored.last_read_date > inLast
          ? stored.last_read_date
          : inLast;
  const streak =
    last === stored.last_read_date && last !== inLast
      ? (stored.streak_days ?? 0)
      : (inStreak ?? stored.streak_days ?? 0);

  let book = stored.current_book;
  let chapter = stored.current_chapter;
  if (inBook !== null && inChapter !== null) {
    if ((stored.current_book ?? '') === '' || (stored.current_chapter ?? 0) === 0) {
      book = inBook;
      chapter = inChapter;
    } else {
      const storedRead = chapters[`${stored.current_book}_${stored.current_chapter}`];
      const storedTs =
        storedRead !== undefined && storedRead !== 0 ? storedRead : Date.parse(stored.synced_at);
      const inTs = chapters[`${inBook}_${inChapter}`] ?? 0;
      const freshUpload =
        inBook === 'GEN' && inChapter === 1 && Object.keys(inChapters).length === 0;
      if (!(freshUpload || storedTs > inTs)) {
        book = inBook;
        chapter = inChapter;
      }
    }
  }

  return {
    chapters_read: chapters,
    streak_days: streak,
    last_read_date: last,
    current_book: book,
    current_chapter: chapter,
    synced_at: nowIso,
  };
}

const asRemoteRow = (row: ServerProgressRow): RemoteUserProgress =>
  ({
    id: 'progress-row',
    user_id: USER_ID,
    ...row,
  }) as unknown as RemoteUserProgress;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// A handful of books and chapters so two devices overlap often.
const OVERLAP_BOOKS = ['GEN', 'PSA', 'MAT', 'JHN', 'REV'] as const;
const chapterKeyArb = fc
  .tuple(fc.constantFrom(...OVERLAP_BOOKS), fc.integer({ min: 1, max: 4 }))
  .map(([book, chapter]) => `${book}_${chapter}`);
// Coarse timestamps: equal values across devices are common.
const readAtArb = fc.integer({ min: 1, max: 30 }).map((n) => BASE_MS + n * 60_000);
const chaptersArb = fc.dictionary(chapterKeyArb, readAtArb, { maxKeys: 10, noNullPrototype: true });
const dateArb = fc
  .integer({ min: 0, max: 5 })
  .map((offset) => new Date(BASE_MS + offset * DAY_MS).toISOString().slice(0, 10));
const positionArb = fc.tuple(fc.constantFrom(...OVERLAP_BOOKS), fc.integer({ min: 1, max: 4 }));

const localSnapshotArb: fc.Arbitrary<LocalReadingSnapshot> = fc
  .record({
    chaptersRead: chaptersArb,
    streakDays: fc.integer({ min: 0, max: 9 }),
    lastReadDate: fc.option(dateArb, { nil: null }),
    position: positionArb,
  })
  .map(({ position, ...rest }) => ({
    ...rest,
    currentBook: position[0],
    currentChapter: position[1],
  }));

const serverRowArb: fc.Arbitrary<ServerProgressRow> = fc.record({
  chapters_read: chaptersArb,
  streak_days: fc.integer({ min: 0, max: 9 }),
  last_read_date: fc.option(dateArb, { nil: null }),
  current_book: fc.constantFrom(...OVERLAP_BOOKS),
  current_chapter: fc.integer({ min: 1, max: 4 }),
  synced_at: readAtArb.map((ms) => new Date(ms).toISOString()),
});

// Values an older build, a corrupted row or a hand-edited row could hold.
const hostileNumberArb = fc.oneof(
  readAtArb,
  fc.constantFrom<unknown>(0, -1, 1.5, Number.NaN, Infinity, -Infinity, null, '1727000000000', 1e22)
);
const hostileKeyArb = fc.oneof(
  chapterKeyArb,
  fc.constantFrom('', 'ZZZ_1', 'GEN_0', 'GEN_x', 'x'.repeat(65), '創世記_1')
);
const hostileChaptersArb = fc.dictionary(hostileKeyArb, hostileNumberArb, {
  maxKeys: 8,
  noNullPrototype: true,
}) as fc.Arbitrary<Record<string, number>>;
const hostileDateArb = fc.oneof(
  dateArb,
  fc.constantFrom<unknown>(null, '', '2026-02-30', '2026-9-5', 'Wed Sep 24 2026', '0000-01-01', 7)
);

const hostileLocalArb = fc.record({
  chaptersRead: hostileChaptersArb,
  streakDays: fc.oneof(fc.integer({ min: 0, max: 400 }), fc.constantFrom(-1, 1.5, NaN, 1e12)),
  lastReadDate: hostileDateArb,
  currentBook: fc.oneof(fc.constantFrom(...OVERLAP_BOOKS), fc.constantFrom('', 'X'.repeat(40))),
  currentChapter: fc.oneof(fc.integer({ min: 1, max: 4 }), fc.constantFrom(0, -3, 2.5, NaN)),
}) as unknown as fc.Arbitrary<LocalReadingSnapshot>;

// A row as the table can hold it: legacy builds wrote it with a plain upsert.
const hostileRemoteArb = fc.option(
  fc.record({
    id: fc.constant('progress-row'),
    user_id: fc.constant(USER_ID),
    chapters_read: fc.oneof(hostileChaptersArb, fc.constant(null)),
    streak_days: fc.oneof(fc.integer({ min: 0, max: 400 }), fc.constant(null)),
    last_read_date: fc.option(dateArb, { nil: null }),
    current_book: fc.oneof(fc.constantFrom(...OVERLAP_BOOKS), fc.constantFrom('', 'ZZZ')),
    current_chapter: fc.oneof(fc.integer({ min: 0, max: 200 }), fc.constant(null)),
    synced_at: fc.constantFrom('2026-09-20T10:00:00.000Z', ''),
  }),
  { nil: null }
) as unknown as fc.Arbitrary<RemoteUserProgress | null>;

const maxByKey = (maps: Record<string, number>[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      out[key] = Math.max(out[key] ?? -Infinity, value);
    }
  }
  return out;
};

const sortedEntries = (map: Record<string, unknown>) =>
  Object.entries(map).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

// ---------------------------------------------------------------------------
// Chapter-map merge laws
// ---------------------------------------------------------------------------

test('mergeChapterProgress is a union keeping the latest read per chapter', () => {
  fc.assert(
    fc.property(chaptersArb, chaptersArb, (left, right) => {
      assert.deepEqual(
        sortedEntries(mergeChapterProgress(left, right)),
        sortedEntries(maxByKey([left, right]))
      );
    }),
    FC_PARAMS
  );
});

test('mergeChapterProgress is commutative, associative and idempotent', () => {
  fc.assert(
    fc.property(chaptersArb, chaptersArb, chaptersArb, (a, b, c) => {
      const ab = mergeChapterProgress(a, b);
      assert.deepEqual(sortedEntries(ab), sortedEntries(mergeChapterProgress(b, a)));
      assert.deepEqual(
        sortedEntries(mergeChapterProgress(ab, c)),
        sortedEntries(mergeChapterProgress(a, mergeChapterProgress(b, c)))
      );
      assert.deepEqual(sortedEntries(mergeChapterProgress(ab, b)), sortedEntries(ab));
      assert.deepEqual(sortedEntries(mergeChapterProgress(ab, ab)), sortedEntries(ab));
    }),
    FC_PARAMS
  );
});

test('mergeChapterProgress keeps every local chapter and adopts only numeric remote reads', () => {
  fc.assert(
    fc.property(chaptersArb, hostileChaptersArb, (local, remote) => {
      const merged = mergeChapterProgress(local, remote);
      for (const [key, readAt] of Object.entries(local)) {
        assert.ok(merged[key] >= readAt, `lost or regressed local ${key}`);
      }
      for (const [key, value] of Object.entries(merged)) {
        assert.equal(typeof value, 'number', `${key} holds ${String(value)}`);
        assert.ok(Number.isFinite(value), `${key} holds ${String(value)}`);
      }
    }),
    FC_PARAMS
  );
});

// ---------------------------------------------------------------------------
// Client merge agrees with the server merge
// ---------------------------------------------------------------------------

test('the client merge and merge_user_progress agree on chapters, last read date and streak', () => {
  fc.assert(
    fc.property(localSnapshotArb, serverRowArb, (local, stored) => {
      const client = mergeReadingSnapshot(local, asRemoteRow(stored));
      const payload = buildRemoteProgressPayload(USER_ID, client, '2026-09-24T00:00:00.000Z');
      const server = serverMergeUserProgress(stored, payload, '2026-09-24T00:00:00.000Z');

      assert.deepEqual(
        sortedEntries(server.chapters_read ?? {}),
        sortedEntries(client.progress.chaptersRead)
      );
      assert.equal(server.last_read_date, client.progress.lastReadDate);
      assert.equal(server.streak_days, client.progress.streakDays);
    }),
    FC_PARAMS
  );
});

// ---------------------------------------------------------------------------
// Two devices, one server
// ---------------------------------------------------------------------------

type Device = LocalReadingSnapshot;

type ProgressOp =
  | { kind: 'read'; device: 0 | 1; key: string; minutes: number; day: number }
  | { kind: 'sync'; device: 0 | 1 };

const progressOpArb: fc.Arbitrary<ProgressOp> = fc.oneof(
  fc.record({
    kind: fc.constant('read' as const),
    device: fc.constantFrom(0 as const, 1 as const),
    key: chapterKeyArb,
    minutes: fc.integer({ min: 0, max: 5 }),
    day: fc.integer({ min: 0, max: 3 }),
  }),
  fc.record({ kind: fc.constant('sync' as const), device: fc.constantFrom(0 as const, 1 as const) })
);

const freshDevice = (): Device => ({
  chaptersRead: {},
  streakDays: 0,
  lastReadDate: null,
  currentBook: 'GEN',
  currentChapter: 1,
});

/** What the reader does locally: progressStore.markChapterRead + updateStreak + the reader position. */
const readLocally = (device: Device, key: string, readAt: number, date: string): Device => {
  const [book, chapter] = [
    key.slice(0, key.lastIndexOf('_')),
    Number(key.slice(key.lastIndexOf('_') + 1)),
  ];
  const previous = device.lastReadDate;
  const yesterday = new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  const streakDays =
    previous === date ? device.streakDays : previous === yesterday ? device.streakDays + 1 : 1;
  return {
    chaptersRead: { ...device.chaptersRead, [key]: readAt },
    streakDays,
    lastReadDate: previous !== null && previous > date ? previous : date,
    currentBook: book,
    currentChapter: chapter,
  };
};

/** One syncProgress pass: merge the server row in, push if different, adopt what was stored. */
const syncDevice = (
  device: Device,
  server: ServerProgressRow | null,
  nowIso: string
): { device: Device; server: ServerProgressRow | null } => {
  const apply = (snapshot: Device, remote: RemoteUserProgress | null) => {
    const merged = mergeReadingSnapshot(snapshot, remote);
    return {
      merged,
      device: merged.changed
        ? {
            ...merged.progress,
            currentBook: merged.readingPosition.bookId,
            currentChapter: merged.readingPosition.chapter,
          }
        : snapshot,
    };
  };
  const remote = server ? asRemoteRow(server) : null;
  const first = apply(device, remote);
  if (readingMatchesRemote(first.merged, remote)) {
    return { device: first.device, server };
  }
  const payload = buildRemoteProgressPayload(USER_ID, first.merged, nowIso);
  assert.equal(validateMergeUserProgressPayload(payload), null);
  const stored = serverMergeUserProgress(server, payload, nowIso);
  return { device: apply(first.device, asRemoteRow(stored)).device, server: stored };
};

const runProgressScenario = (ops: ProgressOp[]) => {
  let devices: [Device, Device] = [freshDevice(), freshDevice()];
  let server: ServerProgressRow | null = null;
  let clock = BASE_MS;
  const allReads: Record<string, number>[] = [];
  const tick = () => new Date((clock += 1000)).toISOString();

  const sync = (index: 0 | 1) => {
    const result = syncDevice(devices[index], server, tick());
    devices = index === 0 ? [result.device, devices[1]] : [devices[0], result.device];
    server = result.server;
  };

  for (const op of ops) {
    if (op.kind === 'read') {
      const readAt = BASE_MS + op.day * DAY_MS + op.minutes * 60_000;
      const date = new Date(BASE_MS + op.day * DAY_MS).toISOString().slice(0, 10);
      allReads.push({ [op.key]: readAt });
      const next = readLocally(devices[op.device], op.key, readAt, date);
      devices = op.device === 0 ? [next, devices[1]] : [devices[0], next];
    } else {
      sync(op.device);
    }
  }
  // Settle: every device syncs twice, in turn.
  sync(0);
  sync(1);
  sync(0);
  sync(1);
  return { devices, server: server as ServerProgressRow | null, allReads, sync };
};

test('two devices converge: every chapter read anywhere reaches both devices and the server', () => {
  fc.assert(
    fc.property(fc.array(progressOpArb, { maxLength: 24 }), (ops) => {
      const { devices, server, allReads } = runProgressScenario(ops);
      assert.ok(server);
      const everyRead = maxByKey(allReads);
      for (const snapshot of [
        devices[0].chaptersRead,
        devices[1].chaptersRead,
        server.chapters_read ?? {},
      ]) {
        // A device keeps the time it last read a chapter; the union keeps every chapter.
        assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(everyRead).sort());
      }
      assert.deepEqual(
        sortedEntries(devices[0].chaptersRead),
        sortedEntries(devices[1].chaptersRead)
      );
      assert.deepEqual(
        sortedEntries(devices[0].chaptersRead),
        sortedEntries(server.chapters_read ?? {})
      );
    }),
    FC_PARAMS
  );
});

test('two devices converge on the last read date, the streak and the reading position', () => {
  fc.assert(
    fc.property(fc.array(progressOpArb, { maxLength: 24 }), (ops) => {
      const { devices, server } = runProgressScenario(ops);
      assert.ok(server);
      const summary = (device: Device) => [
        device.lastReadDate,
        device.streakDays,
        device.currentBook,
        device.currentChapter,
      ];
      assert.deepEqual(summary(devices[0]), summary(devices[1]));
      assert.deepEqual(summary(devices[0]), [
        server.last_read_date,
        server.streak_days,
        server.current_book,
        server.current_chapter,
      ]);
    }),
    FC_PARAMS
  );
});

test('once settled, another sync changes nothing and uploads nothing', () => {
  fc.assert(
    fc.property(fc.array(progressOpArb, { maxLength: 24 }), (ops) => {
      const { devices, server } = runProgressScenario(ops);
      for (const device of devices) {
        const merged = mergeReadingSnapshot(device, server ? asRemoteRow(server) : null);
        assert.equal(merged.changed, false);
        assert.equal(readingMatchesRemote(merged, server ? asRemoteRow(server) : null), true);
      }
    }),
    FC_PARAMS
  );
});

// ---------------------------------------------------------------------------
// Payloads the RPC accepts
// ---------------------------------------------------------------------------

test('every upload payload passes merge_user_progress validation, whatever the inputs hold', () => {
  fc.assert(
    fc.property(hostileLocalArb, hostileRemoteArb, (local, remote) => {
      const merged = mergeReadingSnapshot(local, remote);
      const payload = buildRemoteProgressPayload(USER_ID, merged, '2026-09-24T00:00:00.000Z');
      assert.equal(validateMergeUserProgressPayload(payload), null);
    }),
    FC_PARAMS
  );
});

test('a merge never drops a well-formed local chapter, whatever the remote row holds', () => {
  fc.assert(
    fc.property(localSnapshotArb, hostileRemoteArb, (local, remote) => {
      const merged = mergeReadingSnapshot(local, remote);
      const payload = buildRemoteProgressPayload(USER_ID, merged, '2026-09-24T00:00:00.000Z');
      for (const [key, readAt] of Object.entries(local.chaptersRead)) {
        assert.ok(merged.progress.chaptersRead[key] >= readAt, key);
        assert.ok((payload.chapters_read as Record<string, number>)[key] >= readAt, key);
      }
    }),
    FC_PARAMS
  );
});

test('a whole Bible read on each of two devices merges into one valid 1,189-chapter payload', () => {
  const everyChapter = bibleBooks.flatMap((book) =>
    Array.from({ length: book.chapters }, (_, index) => `${book.id}_${index + 1}`)
  );
  assert.equal(everyChapter.length, 1189);
  const onDevice = Object.fromEntries(everyChapter.map((key, index) => [key, BASE_MS + index]));
  const onServer = Object.fromEntries(
    everyChapter.map((key, index) => [key, BASE_MS + 2000 - index])
  );

  const merged = mergeReadingSnapshot(
    {
      chaptersRead: onDevice,
      streakDays: 3,
      lastReadDate: '2026-09-23',
      currentBook: 'REV',
      currentChapter: 22,
    },
    asRemoteRow({
      chapters_read: onServer,
      streak_days: 40,
      last_read_date: '2026-09-24',
      current_book: 'GEN',
      current_chapter: 1,
      synced_at: '2026-09-24T00:00:00.000Z',
    })
  );
  const payload = buildRemoteProgressPayload(USER_ID, merged, '2026-09-24T00:00:00.000Z');

  assert.equal(validateMergeUserProgressPayload(payload), null);
  assert.equal(Object.keys(payload.chapters_read as object).length, 1189);
  assert.equal(merged.progress.streakDays, 40);
  for (const [index, key] of everyChapter.entries()) {
    assert.equal(
      merged.progress.chaptersRead[key],
      Math.max(BASE_MS + index, BASE_MS + 2000 - index)
    );
  }
});

test('the SQL validator model refuses what the migration refuses', () => {
  // Pins the TypeScript model of the SQL checks, so a payload the model accepts
  // is one the live function accepts.
  const valid = {
    user_id: USER_ID,
    chapters_read: { GEN_1: BASE_MS },
    streak_days: 3,
    last_read_date: '2026-09-24',
    current_book: 'GEN',
    current_chapter: 1,
  };
  assert.equal(validateMergeUserProgressPayload(valid), null);
  assert.equal(validateMergeUserProgressPayload({}), null);
  const refusals: [Record<string, unknown>, string][] = [
    [{ user_id: 'someone-else' }, '42501'],
    [{ chapters_read: [] }, '22023'],
    [{ chapters_read: { GEN_1: Number.NaN } }, '22023'],
    [{ chapters_read: { GEN_1: '1' } }, '22023'],
    [{ chapters_read: { '': 1 } }, '22023'],
    [{ chapters_read: { ['x'.repeat(65)]: 1 } }, '22023'],
    [{ streak_days: -1 }, '22023'],
    [{ streak_days: 1.5 }, '22023'],
    [{ streak_days: 1e10 }, '22023'],
    [{ last_read_date: '2026-9-5' }, '22023'],
    [{ last_read_date: '2026-02-30' }, '22008'],
    [{ current_book: '' }, '22023'],
    [{ current_chapter: 1234567 }, '22023'],
  ];
  for (const [patch, code] of refusals) {
    assert.equal(
      validateMergeUserProgressPayload({ ...valid, ...patch })?.code,
      code,
      JSON.stringify(patch)
    );
  }
});
