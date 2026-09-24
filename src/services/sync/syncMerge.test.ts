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
} from './syncMerge';
import type { LocalPreferenceSnapshot, LocalReadingSnapshot } from './syncMerge';
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
