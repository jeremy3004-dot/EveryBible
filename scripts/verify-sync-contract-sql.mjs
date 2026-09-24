// An isolated in-memory Postgres check for the server-backed sync migrations
// (docs/research/sync-offline-review-2026-09-24.md, "Server-backed follow-ups").
// It never connects to Supabase.
//
// Install @electric-sql/pglite in a temporary folder and set PGLITE_MODULE to its entrypoint:
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/verify-sync-contract-sql.mjs
//
// It builds the production shape of the tables (read from the live schema on
// 2026-09-24), writes some rows the way the INSTALLED app builds do, applies the
// new migrations, and then drives every request as `authenticated` with a JWT
// subject, the way PostgREST does. Each write is sent both the way the installed
// builds send it (no new columns) and the way the new client does.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const MIGRATIONS = [
  '20260924023259_user_preferences_field_edit_stamps.sql',
  '20260924023303_backfill_user_preferences_field_stamps.sql',
  '20260924023340_reading_plan_unenroll_tombstones.sql',
  '20260924023342_reading_plan_session_columns.sql',
  '20260924035821_merge_reading_plan_progress_rpc.sql',
];

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default privileges: every new table is fully granted to the API
-- roles, so RLS (and any explicit REVOKE in a migration) is what restricts them.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select
  using ((select auth.uid()) = id);

-- Production user_reading_plan_progress before the migrations (2026-09-24).
create table public.reading_plans (id uuid primary key default gen_random_uuid(), slug text);
create table public.user_reading_plan_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.reading_plans(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_entries jsonb default '{}'::jsonb,
  current_day integer default 1,
  is_completed boolean default false,
  completed_at timestamptz,
  synced_at timestamptz default now(),
  plan_slug text,
  constraint user_reading_plan_progress_plan_ref_required
    check (plan_id is not null or plan_slug is not null),
  unique (user_id, plan_id),
  unique (user_id, plan_slug)
);
alter table public.user_reading_plan_progress enable row level security;
create policy plan_progress_select_own on public.user_reading_plan_progress for select
  to authenticated using (user_id = (select auth.uid()));
create policy plan_progress_insert_own on public.user_reading_plan_progress for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy plan_progress_update_own on public.user_reading_plan_progress for update
  to authenticated using (user_id = (select auth.uid()));
create policy plan_progress_delete_own on public.user_reading_plan_progress for delete
  to authenticated using (user_id = (select auth.uid()));

-- Production user_preferences before the migrations (information_schema, 2026-09-24).
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  font_size text default 'medium',
  theme text default 'dark' check (theme in ('dark','light','low-light','parchment','midnight')),
  language text default 'en',
  notifications_enabled boolean default false,
  reminder_time time,
  synced_at timestamptz default now(),
  country_code text, country_name text,
  content_language_code text, content_language_name text, content_language_native_name text,
  onboarding_completed boolean default false,
  chapter_feedback_enabled boolean not null default false,
  chapter_feedback_name text, chapter_feedback_role text, chapter_feedback_id_number text,
  appearance_palette text not null default 'el-blue',
  hide_play_button_from_reading_tab boolean not null default false
);
alter table public.user_preferences enable row level security;
create policy "Users can view own preferences" on public.user_preferences for select
  using ((select auth.uid()) = user_id);
create policy "Users can update own preferences" on public.user_preferences for update
  using ((select auth.uid()) = user_id);
create policy "Users can insert own preferences" on public.user_preferences for insert
  with check ((select auth.uid()) = user_id);

-- handle_new_user's share of signup: the row every new account starts with, in
-- one transaction, so synced_at = profiles.created_at.
create function public.sign_up(uid uuid) returns void
  language sql security definer set search_path = '' as $$
  insert into public.profiles (id) values (uid);
  insert into public.user_preferences (user_id, language) values (uid, 'en');
$$;
`);

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEGACY_UNTOUCHED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LEGACY_WRITTEN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STAMP_SHAPE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const TRACKED = [
  'font_size',
  'theme',
  'appearance_palette',
  'language',
  'country_code',
  'country_name',
  'content_language_code',
  'content_language_name',
  'content_language_native_name',
  'chapter_feedback_name',
  'chapter_feedback_role',
  'onboarding_completed',
  'chapter_feedback_enabled',
  'hide_play_button_from_reading_tab',
  'notifications_enabled',
  'reminder_time',
];

/** Runs one request as `uid` in its own committed transaction. */
const as = (uid, sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return tx.query(sql, params);
  });
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const prefsOf = (uid) =>
  one(
    `select theme, font_size, language, onboarding_completed, synced_at, field_updated_at
       from public.user_preferences where user_id = $1`,
    [uid]
  );
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const signUp = (uid) => db.query(`select public.sign_up($1)`, [uid]);

// The exact statement PostgREST runs for the installed builds' preference upsert
// (src/services/sync/syncService.ts @ a608f1d7, shipped in 1.0.8): every
// preference column plus synced_at, on conflict (user_id), no field_updated_at.
const OLD_CLIENT_PREFS_UPSERT = `
  insert into public.user_preferences (user_id, font_size, theme, appearance_palette, language,
    country_code, country_name, content_language_code, content_language_name,
    content_language_native_name, chapter_feedback_name, chapter_feedback_role,
    onboarding_completed, chapter_feedback_enabled, hide_play_button_from_reading_tab,
    notifications_enabled, reminder_time, synced_at)
  values ($1, $2, $3, 'el-blue', 'en', null, null, null, null, null, null, null, true, false,
    false, false, null, $4::timestamptz)
  on conflict (user_id) do update set font_size = excluded.font_size, theme = excluded.theme,
    appearance_palette = excluded.appearance_palette, language = excluded.language,
    country_code = excluded.country_code, country_name = excluded.country_name,
    content_language_code = excluded.content_language_code,
    content_language_name = excluded.content_language_name,
    content_language_native_name = excluded.content_language_native_name,
    chapter_feedback_name = excluded.chapter_feedback_name,
    chapter_feedback_role = excluded.chapter_feedback_role,
    onboarding_completed = excluded.onboarding_completed,
    chapter_feedback_enabled = excluded.chapter_feedback_enabled,
    hide_play_button_from_reading_tab = excluded.hide_play_button_from_reading_tab,
    notifications_enabled = excluded.notifications_enabled,
    reminder_time = excluded.reminder_time, synced_at = excluded.synced_at
  returning *`;

// The new client's preference upsert: the same shape plus field_updated_at.
const NEW_CLIENT_PREFS_UPSERT = `
  insert into public.user_preferences (user_id, font_size, theme, onboarding_completed,
    synced_at, field_updated_at)
  values ($1, $2, $3, true, now(), $4::jsonb)
  on conflict (user_id) do update set font_size = excluded.font_size, theme = excluded.theme,
    onboarding_completed = excluded.onboarding_completed, synced_at = excluded.synced_at,
    field_updated_at = excluded.field_updated_at
  returning *`;

// --- Rows that exist before the migrations --------------------------------------------------
await signUp(LEGACY_UNTOUCHED);
await signUp(LEGACY_WRITTEN);
const legacyUpload = '2026-09-10T08:15:30.123Z';
await as(LEGACY_WRITTEN, OLD_CLIENT_PREFS_UPSERT, [LEGACY_WRITTEN, 'large', 'light', legacyUpload]);

for (const name of MIGRATIONS) {
  const sql = await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(sql);
}

// ---------------------------------------------------------------------------
// Backfill (20260924023303): defaults stay unstamped, client-written rows get
// their upload time on every column.
// ---------------------------------------------------------------------------

assert.deepEqual(
  (await prefsOf(LEGACY_UNTOUCHED)).field_updated_at,
  {},
  'a signup row nobody has written keeps no stamps: its values are DB defaults'
);
const backfilled = (await prefsOf(LEGACY_WRITTEN)).field_updated_at;
assert.deepEqual(Object.keys(backfilled).sort(), [...TRACKED].sort());
assert.ok(Object.values(backfilled).every((stamp) => stamp === legacyUpload));

// Re-running the backfill changes nothing, and never overrides a trigger stamp.
await as(LEGACY_WRITTEN, `update public.user_preferences set theme = 'dark' where user_id = $1`, [
  LEGACY_WRITTEN,
]);
const afterEdit = (await prefsOf(LEGACY_WRITTEN)).field_updated_at;
assert.notEqual(afterEdit.theme, legacyUpload);
await db.exec(
  await fs.readFile(new URL(`../supabase/migrations/${MIGRATIONS[1]}`, import.meta.url), 'utf8')
);
assert.deepEqual((await prefsOf(LEGACY_WRITTEN)).field_updated_at, afterEdit);

// ---------------------------------------------------------------------------
// user_preferences.field_updated_at (20260924023259)
// ---------------------------------------------------------------------------

await signUp(A);
await signUp(B);

let row = await prefsOf(A);
assert.deepEqual(row.field_updated_at, {}, 'a new signup row carries no stamps');

// An installed build writes: accepted, and every changed value is stamped by the server.
await as(A, OLD_CLIENT_PREFS_UPSERT, [A, 'large', 'light', iso(0)]);
row = await prefsOf(A);
assert.equal(row.theme, 'light');
assert.equal(row.font_size, 'large');
assert.match(row.field_updated_at.theme, STAMP_SHAPE);
assert.ok(row.field_updated_at.font_size, 'old-client font change is stamped');
assert.ok(row.field_updated_at.onboarding_completed, 'old-client onboarding change is stamped');
assert.equal(row.field_updated_at.language, undefined, 'an unchanged default stays unstamped');
const oldClientStamp = row.field_updated_at.theme;

// The new client with a newer edit of one setting wins that setting only.
await as(A, NEW_CLIENT_PREFS_UPSERT, [
  A,
  'large',
  'dark',
  JSON.stringify({ ...row.field_updated_at, theme: iso(60 * 60 * 1000) }),
]);
row = await prefsOf(A);
assert.equal(row.theme, 'dark', 'a newer stamped edit is accepted');
assert.ok(row.field_updated_at.theme >= oldClientStamp);
assert.ok(
  Date.parse(row.field_updated_at.theme) <= Date.now(),
  'a stamp an hour in the future is clamped to the server clock'
);

// A new client whose edit is OLDER than the stored one is refused for that field
// only; the rest of its write (font_size with a newer stamp) lands.
const stored = row.field_updated_at;
await as(A, NEW_CLIENT_PREFS_UPSERT, [
  A,
  'small',
  'light',
  JSON.stringify({ ...stored, theme: '2020-01-01T00:00:00.000Z', font_size: iso(0) }),
]);
row = await prefsOf(A);
assert.equal(row.theme, 'dark', 'an older edit never overwrites a newer one');
assert.equal(row.field_updated_at.theme, stored.theme, 'the stored stamp stays');
assert.equal(row.font_size, 'small', 'the newer field in the same write is accepted');

// An equal stamp with a different value is refused too (clients resolve ties to the server).
await as(A, NEW_CLIENT_PREFS_UPSERT, [
  A,
  'medium',
  'light',
  JSON.stringify({ ...row.field_updated_at, font_size: iso(0) }),
]);
row = await prefsOf(A);
assert.equal(row.theme, 'dark', 'an equal stamp does not displace the stored value');
assert.equal(row.font_size, 'medium');

// A stamp object identical to the stored one is indistinguishable from a legacy
// writer, so that write is accepted and restamped, as the installed builds are.
await as(A, NEW_CLIENT_PREFS_UPSERT, [A, 'medium', 'light', JSON.stringify(row.field_updated_at)]);
row = await prefsOf(A);
assert.equal(row.theme, 'light');

// Malformed and unknown stamp keys are dropped, never stored or thrown on.
await as(A, NEW_CLIENT_PREFS_UPSERT, [
  A,
  'small',
  'light',
  JSON.stringify({ theme: 'not a date', bogus_column: iso(0) }),
]);
row = await prefsOf(A);
assert.equal(row.field_updated_at.bogus_column, undefined);
assert.ok(row.field_updated_at.theme, 'the stored theme stamp survives a malformed one');

// A non-object field_updated_at is treated as no stamps rather than failing the write.
await as(
  A,
  `update public.user_preferences set field_updated_at = '[]'::jsonb, theme = 'dark'
     where user_id = $1`,
  [A]
);
row = await prefsOf(A);
assert.equal(Array.isArray(row.field_updated_at), false);
assert.equal(typeof row.field_updated_at, 'object');

// RLS still applies: B can neither see nor overwrite A's row.
const peek = await as(B, `select * from public.user_preferences where user_id = $1`, [A]);
assert.equal(peek.rows.length, 0);
const hijack = await as(
  B,
  `update public.user_preferences set theme = 'light' where user_id = $1`,
  [A]
);
assert.equal(hijack.affectedRows, 0);

// An installed build's INSERT (an account with no row yet) still succeeds.
await db.query(`insert into public.profiles (id) values ($1)`, [C]);
await as(C, OLD_CLIENT_PREFS_UPSERT, [C, 'small', 'light', iso(0)]);
assert.equal((await prefsOf(C)).theme, 'light');

// ---------------------------------------------------------------------------
// Atomic user_progress merge (20260924041000)
// ---------------------------------------------------------------------------

// Production user_progress (information_schema, 2026-09-24): no triggers, own-row RLS.
await db.exec(`
create table public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  chapters_read jsonb default '{}'::jsonb,
  streak_days integer default 0,
  last_read_date date,
  current_book text default 'GEN',
  current_chapter integer default 1,
  synced_at timestamptz default now()
);
alter table public.user_progress enable row level security;
create policy "Users can view own progress" on public.user_progress for select
  using ((select auth.uid()) = user_id);
create policy "Users can update own progress" on public.user_progress for update
  using ((select auth.uid()) = user_id);
create policy "Users can insert own progress" on public.user_progress for insert
  with check ((select auth.uid()) = user_id);
`);
await db.exec(
  await fs.readFile(
    new URL('../supabase/migrations/20260924041000_merge_user_progress_rpc.sql', import.meta.url),
    'utf8'
  )
);
// Both merge functions as replaced by 20260924051658 (payload owner check); every
// merge check below runs against this version.
await db.exec(
  await fs.readFile(
    new URL(
      '../supabase/migrations/20260924051658_merge_rpcs_reject_foreign_owner.sql',
      import.meta.url
    ),
    'utf8'
  )
);

// The installed builds' progress upsert (syncService.ts @ a608f1d7): the whole row, on
// conflict (user_id), replacing chapters_read.
const OLD_CLIENT_PROGRESS_UPSERT = `
  insert into public.user_progress (user_id, chapters_read, streak_days, last_read_date,
    current_book, current_chapter, synced_at)
  values ($1, $2::jsonb, $3, $4::date, $5, $6, now())
  on conflict (user_id) do update set chapters_read = excluded.chapters_read,
    streak_days = excluded.streak_days, last_read_date = excluded.last_read_date,
    current_book = excluded.current_book, current_chapter = excluded.current_chapter,
    synced_at = excluded.synced_at
  returning *`;
const MERGE_PROGRESS = `select * from public.merge_user_progress($1::jsonb)`;
const mergeProgress = (uid, payload) => as(uid, MERGE_PROGRESS, [JSON.stringify(payload)]);
const progressOf = (uid) => one(`select * from public.user_progress where user_id = $1`, [uid]);
const dateOf = (row) => row.last_read_date.toISOString().slice(0, 10);
const positionOf = (row) => [row.current_book, row.current_chapter];
const READER = '11111111-1111-4111-8111-111111111111';
const OTHER_READER = '22222222-2222-4222-8222-222222222222';
for (const uid of [READER, OTHER_READER]) {
  await signUp(uid);
  // handle_new_user's default progress row.
  await db.query(`insert into public.user_progress (user_id) values ($1)`, [uid]);
}
// What the new client sends (syncProgressForIdentityImpl): the merged row.
const upload = (overrides = {}) => ({
  user_id: READER,
  chapters_read: {},
  streak_days: 1,
  last_read_date: '2026-09-20',
  current_book: 'GEN',
  current_chapter: 1,
  synced_at: iso(0),
  ...overrides,
});
const oldUpsert = (uid, payload) =>
  as(uid, OLD_CLIENT_PROGRESS_UPSERT, [
    uid,
    JSON.stringify(payload.chapters_read),
    payload.streak_days,
    payload.last_read_date,
    payload.current_book,
    payload.current_chapter,
  ]);

// The race with the plain upsert: both phones read {GEN_1}; phone 1 writes {GEN_1, GEN_2},
// then phone 2 writes {GEN_1, MAT_1} and GEN_2 is gone. This is the bug being fixed.
await oldUpsert(READER, upload({ chapters_read: { GEN_1: 1000 } }));
await oldUpsert(READER, upload({ chapters_read: { GEN_1: 1000, GEN_2: 2000 } }));
await oldUpsert(READER, upload({ chapters_read: { GEN_1: 1000, MAT_1: 3000 } }));
assert.deepEqual(Object.keys((await progressOf(READER)).chapters_read).sort(), ['GEN_1', 'MAT_1']);

// The same two stale writes through the RPC keep both phones' chapters.
await oldUpsert(READER, upload({ chapters_read: { GEN_1: 1000 } }));
let progress = await mergeProgress(READER, upload({ chapters_read: { GEN_1: 1000, GEN_2: 2000 } }));
assert.equal(progress.rows.length, 1, 'the RPC returns the stored row');
progress = await mergeProgress(READER, upload({ chapters_read: { GEN_1: 1000, MAT_1: 3000 } }));
assert.deepEqual(progress.rows[0].chapters_read, { GEN_1: 1000, GEN_2: 2000, MAT_1: 3000 });
assert.deepEqual(await progressOf(READER), progress.rows[0]);

// A chapter in both keeps the later read, whichever side has it (mergeChapterProgress).
progress = await mergeProgress(READER, upload({ chapters_read: { GEN_1: 500, GEN_2: 2500 } }));
assert.equal(progress.rows[0].chapters_read.GEN_1, 1000, 'an older upload never rolls a read back');
assert.equal(progress.rows[0].chapters_read.GEN_2, 2500, 'a newer read is taken');
// Epoch milliseconds survive the round trip exactly.
progress = await mergeProgress(READER, upload({ chapters_read: { JHN_3: 1758700000123 } }));
assert.equal(progress.rows[0].chapters_read.JHN_3, 1758700000123);

// Streak: the side with the later last_read_date owns it; a tie keeps the upload's.
await db.query(
  `update public.user_progress set last_read_date = '2026-09-20', streak_days = 5
     where user_id = $1`,
  [READER]
);
progress = await mergeProgress(READER, upload({ last_read_date: '2026-09-19', streak_days: 9 }));
assert.equal(progress.rows[0].streak_days, 5, 'a phone behind on dates has no say on the streak');
assert.equal(dateOf(progress.rows[0]), '2026-09-20');
progress = await mergeProgress(READER, upload({ last_read_date: '2026-09-21', streak_days: 6 }));
assert.equal(progress.rows[0].streak_days, 6);
assert.equal(dateOf(progress.rows[0]), '2026-09-21');
progress = await mergeProgress(READER, upload({ last_read_date: '2026-09-21', streak_days: 0 }));
assert.equal(progress.rows[0].streak_days, 0, 'same date: the upload (a reset) wins');
progress = await mergeProgress(READER, upload({ last_read_date: null, streak_days: 3 }));
assert.equal(progress.rows[0].streak_days, 0, 'an upload with no date keeps the stored streak');

// Position: whichever position was read more recently (resolveReadingPosition).
progress = await mergeProgress(
  READER,
  upload({ chapters_read: { ROM_8: 9000 }, current_book: 'ROM', current_chapter: 8 })
);
assert.deepEqual(positionOf(progress.rows[0]), ['ROM', 8], 'a later-read position moves it');
progress = await mergeProgress(
  READER,
  upload({ chapters_read: { GEN_2: 2500 }, current_book: 'GEN', current_chapter: 2 })
);
assert.deepEqual(
  positionOf(progress.rows[0]),
  ['ROM', 8],
  'a phone on an older chapter does not pull the position back'
);
progress = await mergeProgress(READER, upload({ chapters_read: {} }));
assert.deepEqual(positionOf(progress.rows[0]), ['ROM', 8], 'a blank GEN 1 device keeps it');
progress = await mergeProgress(
  READER,
  upload({ chapters_read: {}, current_book: null, current_chapter: null })
);
assert.deepEqual(positionOf(progress.rows[0]), ['ROM', 8], 'an upload without a position too');
// An unread stored position falls back to its sync time, as on the client.
await db.query(
  `update public.user_progress set current_book = 'PSA', current_chapter = 23,
     synced_at = '2026-09-01T00:00:00Z' where user_id = $1`,
  [READER]
);
progress = await mergeProgress(
  READER,
  upload({ chapters_read: { MRK_1: Date.parse('2026-09-02T00:00:00Z') }, current_book: 'MRK' })
);
assert.equal(progress.rows[0].current_book, 'MRK');
assert.ok(new Date(progress.rows[0].synced_at).getTime() >= Date.now() - 60_000, 'server time');

// A legacy null chapters_read merges; non-numeric stored values are dropped.
await db.query(`update public.user_progress set chapters_read = null where user_id = $1`, [
  OTHER_READER,
]);
progress = await mergeProgress(
  OTHER_READER,
  upload({ user_id: OTHER_READER, chapters_read: { GEN_1: 10 } })
);
assert.deepEqual(progress.rows[0].chapters_read, { GEN_1: 10 });
await db.query(
  `update public.user_progress set chapters_read = '{"GEN_1": "x", "GEN_3": 30}'
     where user_id = $1`,
  [OTHER_READER]
);
progress = await mergeProgress(OTHER_READER, upload({ user_id: OTHER_READER, chapters_read: {} }));
assert.deepEqual(progress.rows[0].chapters_read, { GEN_3: 30 });

// The owner is always the caller. A payload that names another account (the session
// switched accounts while the push was in flight) is refused with 42501, and neither
// account's row is touched; a payload without user_id (older clients) is accepted.
const otherBefore = await progressOf(OTHER_READER);
const readerBefore = await progressOf(READER);
await assert.rejects(
  mergeProgress(READER, upload({ user_id: OTHER_READER, chapters_read: { X_1: 1 } })),
  { code: '42501' },
  'a payload for another account is refused'
);
await assert.rejects(
  mergeProgress(READER, upload({ user_id: 'not-a-uuid', chapters_read: { X_1: 1 } })),
  { code: '42501' },
  'a payload whose owner is not the caller in any form is refused'
);
assert.deepEqual(await progressOf(OTHER_READER), otherBefore);
assert.deepEqual(await progressOf(READER), readerBefore);
progress = await mergeProgress(
  READER,
  upload({ user_id: READER.toUpperCase(), chapters_read: { X_2: 2 } })
);
assert.equal(progress.rows[0].chapters_read.X_2, 2, "the caller's own id is accepted in any case");
const { user_id: _omitted, ...withoutOwner } = upload({ chapters_read: { X_3: 3 } });
progress = await mergeProgress(READER, withoutOwner);
assert.equal(progress.rows[0].user_id, READER, 'a payload without user_id is still accepted');
assert.equal(progress.rows[0].chapters_read.X_3, 3);
progress = await mergeProgress(READER, upload({ user_id: null, chapters_read: { X_4: 4 } }));
assert.equal(progress.rows[0].chapters_read.X_4, 4, 'a null user_id counts as absent');

// An account with no row yet (the signup insert missed) gets one from the upload.
const NO_ROW = '33333333-3333-4333-8333-333333333333';
await signUp(NO_ROW);
progress = await mergeProgress(
  NO_ROW,
  upload({ user_id: NO_ROW, chapters_read: { GEN_1: 7 }, streak_days: 2 })
);
assert.equal(progress.rows[0].user_id, NO_ROW);
assert.deepEqual(progress.rows[0].chapters_read, { GEN_1: 7 });
assert.equal(progress.rows[0].streak_days, 2);

// Installed builds keep writing with the plain upsert after the RPC exists.
assert.equal((await oldUpsert(READER, upload({ chapters_read: { GEN_1: 1 } }))).rows.length, 1);

// Validation and access.
const tooManyChapters = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`K_${i}`, 1]));
for (const [payload, reason] of [
  [[upload()], 'not an object'],
  [upload({ chapters_read: ['GEN_1'] }), 'array chapters_read'],
  [upload({ chapters_read: { GEN_1: '2026-09-01' } }), 'string timestamp'],
  [upload({ chapters_read: { ['x'.repeat(65)]: 1 } }), 'overlong key'],
  [upload({ chapters_read: tooManyChapters }), 'too many chapters'],
  [upload({ streak_days: -1 }), 'negative streak'],
  [upload({ streak_days: 1.5 }), 'fractional streak'],
  [upload({ streak_days: '3' }), 'string streak'],
  [upload({ last_read_date: '20/09/2026' }), 'bad date shape'],
  [upload({ current_book: '' }), 'blank book'],
  [upload({ current_chapter: '8' }), 'string chapter'],
]) {
  await assert.rejects(mergeProgress(READER, payload), { code: '22023' }, reason);
}
await assert.rejects(mergeProgress(null, upload()), /permission denied/, 'anon cannot call it');
const progressFn = await one(
  `select prosecdef, proconfig from pg_proc where proname = 'merge_user_progress'`
);
assert.equal(progressFn.prosecdef, false, 'runs as the caller, under RLS');
assert.deepEqual(progressFn.proconfig, ['search_path=""']);

// ---------------------------------------------------------------------------
// Reading-plan unenrol tombstones (20260924023340)
// ---------------------------------------------------------------------------

const PLAN = 'psalms-30-days';
const hoursAgo = (hours) => iso(-hours * 60 * 60 * 1000);

// The installed builds' plan upsert (buildRemoteReadingPlanProgressPayload @ a608f1d7):
// no session columns, on conflict (user_id, plan_slug), returning the row.
const OLD_CLIENT_PLAN_UPSERT = `
  insert into public.user_reading_plan_progress (user_id, plan_id, plan_slug, started_at,
    completed_entries, current_day, is_completed, completed_at, synced_at)
  values ($1, null, $2, $3::timestamptz, $4::jsonb, $5, false, null, now())
  on conflict (user_id, plan_slug) do update set plan_id = excluded.plan_id,
    started_at = excluded.started_at, completed_entries = excluded.completed_entries,
    current_day = excluded.current_day, is_completed = excluded.is_completed,
    completed_at = excluded.completed_at, synced_at = excluded.synced_at
  returning *`;
// The installed builds' unenrol.
const OLD_CLIENT_UNENROL = `delete from public.user_reading_plan_progress
  where user_id = $1 and plan_slug = $2`;
// The new client's unenrol: upsert the tombstone with the time the reader left.
const NEW_CLIENT_UNENROL = `
  insert into public.user_reading_plan_unenrollments (user_id, plan_slug, unenrolled_at)
  values ($1, $2, $3::timestamptz)
  on conflict (user_id, plan_slug) do update set unenrolled_at = excluded.unenrolled_at
  returning *`;
const planRow = (uid, slug = PLAN) =>
  one(`select * from public.user_reading_plan_progress where user_id = $1 and plan_slug = $2`, [
    uid,
    slug,
  ]);
const tombstone = (uid, slug = PLAN) =>
  one(
    `select unenrolled_at from public.user_reading_plan_unenrollments
      where user_id = $1 and plan_slug = $2`,
    [uid, slug]
  );

// Phone B (installed build) and phone A share one enrolment that started two days ago.
const enrolledAt = hoursAgo(48);
let upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, PLAN, enrolledAt, '{"1": "x"}', 2]);
assert.equal(upserted.rows.length, 1, 'an installed build can still enrol');

// Phone A (new client) leaves the plan an hour ago; the tombstone ends the enrolment.
const leftAt = hoursAgo(1);
await as(A, NEW_CLIENT_UNENROL, [A, PLAN, leftAt]);
assert.equal(await planRow(A), undefined, 'writing the tombstone deletes the ended enrolment');
assert.equal(new Date((await tombstone(A)).unenrolled_at).toISOString(), leftAt);

// Phone B still has the plan and pushes it the old way: skipped, no row comes back.
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, PLAN, enrolledAt, '{"1": "x", "2": "y"}', 3]);
assert.equal(upserted.rows.length, 0, 'a stale enrolment is not resurrected');
assert.equal(await planRow(A), undefined);

// A retried leave recorded earlier never moves the tombstone back.
await as(A, NEW_CLIENT_UNENROL, [A, PLAN, hoursAgo(5)]);
assert.equal(new Date((await tombstone(A)).unenrolled_at).toISOString(), leftAt);

// Re-joining after the leave is a new enrolment and is accepted, by any build.
const rejoinedAt = iso(-60 * 1000);
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, PLAN, rejoinedAt, '{}', 1]);
assert.equal(upserted.rows.length, 1, 'a re-enrolment after the leave is kept');
// A stale push of the OLD enrolment cannot overwrite the new one either.
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, PLAN, enrolledAt, '{"1": "x"}', 2]);
assert.equal(upserted.rows.length, 0);
assert.equal(new Date((await planRow(A)).started_at).toISOString(), rejoinedAt);

// An installed build's unenrol (a direct DELETE) is recorded as a tombstone too.
const beforeDelete = Date.now();
await as(A, OLD_CLIENT_UNENROL, [A, PLAN]);
assert.equal(await planRow(A), undefined);
assert.ok(new Date((await tombstone(A)).unenrolled_at).getTime() >= beforeDelete - 1000);
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, PLAN, rejoinedAt, '{}', 1]);
assert.equal(upserted.rows.length, 0, 'the old build cannot undo its own leave from elsewhere');

// Clock skew: a started_at and an unenrolled_at in the future are clamped to now.
const OTHER = 'proverbs-31-days';
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, OTHER, iso(2 * 60 * 60 * 1000), '{}', 1]);
assert.ok(new Date(upserted.rows[0].started_at).getTime() <= Date.now());
await as(A, NEW_CLIENT_UNENROL, [A, OTHER, iso(2 * 60 * 60 * 1000)]);
assert.ok(new Date((await tombstone(A, OTHER)).unenrolled_at).getTime() <= Date.now());
assert.equal(await planRow(A, OTHER), undefined);

// A tombstone for one plan leaves the others alone.
const THIRD = 'acts-28-days';
await as(A, OLD_CLIENT_PLAN_UPSERT, [A, THIRD, enrolledAt, '{}', 1]);
assert.ok(await planRow(A, THIRD));

// RLS and grants: nobody reads or writes another account's tombstones; anon has no access.
assert.equal(
  (await as(B, `select * from public.user_reading_plan_unenrollments where user_id = $1`, [A])).rows
    .length,
  0
);
await assert.rejects(as(B, NEW_CLIENT_UNENROL, [A, THIRD, iso(0)]), /row-level security/);
assert.ok(await planRow(A, THIRD), "B cannot end A's enrolment");
await assert.rejects(
  as(null, `select * from public.user_reading_plan_unenrollments`),
  /permission denied/
);
await assert.rejects(
  as(A, `delete from public.user_reading_plan_unenrollments where user_id = $1`, [A]),
  /permission denied/,
  'a client cannot erase its tombstones and resurrect plans'
);

// Deleting an account cascades through progress and tombstones without error.
await as(B, OLD_CLIENT_PLAN_UPSERT, [B, PLAN, enrolledAt, '{}', 1]);
await db.query(`delete from public.profiles where id = $1`, [B]);
assert.equal(
  (
    await one(
      `select count(*)::int as n from public.user_reading_plan_unenrollments where user_id = $1`,
      [B]
    )
  ).n,
  0,
  'an account deletion is not recorded as leaving its plans'
);

// ---------------------------------------------------------------------------
// Plan session-tick columns (20260924023342)
// ---------------------------------------------------------------------------

const SESSION_PLAN = 'kathisma-weekly';
// The new client's plan upsert: the installed shape plus the two session columns.
const NEW_CLIENT_PLAN_UPSERT = `
  insert into public.user_reading_plan_progress (user_id, plan_id, plan_slug, started_at,
    completed_entries, current_day, is_completed, completed_at, synced_at,
    completed_sessions, current_session)
  values ($1, null, $2, $3::timestamptz, '{}'::jsonb, 2, false, null, now(), $4::jsonb, $5)
  on conflict (user_id, plan_slug) do update set plan_id = excluded.plan_id,
    started_at = excluded.started_at, completed_entries = excluded.completed_entries,
    current_day = excluded.current_day, is_completed = excluded.is_completed,
    completed_at = excluded.completed_at, synced_at = excluded.synced_at,
    completed_sessions = excluded.completed_sessions, current_session = excluded.current_session
  returning *`;

// An installed build's insert gets the defaults.
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, SESSION_PLAN, enrolledAt, '{}', 1]);
assert.deepEqual(upserted.rows[0].completed_sessions, {});
assert.equal(upserted.rows[0].current_session, null);

// The new client records a tick and the next-session pointer.
const ticks = { '2026-09-22:morning': '2026-09-22T06:00:00.000Z' };
upserted = await as(A, NEW_CLIENT_PLAN_UPSERT, [
  A,
  SESSION_PLAN,
  enrolledAt,
  JSON.stringify(ticks),
  'evening',
]);
assert.deepEqual(upserted.rows[0].completed_sessions, ticks);

// An installed build then pushes the same plan: the ticks survive its write.
upserted = await as(A, OLD_CLIENT_PLAN_UPSERT, [A, SESSION_PLAN, enrolledAt, '{"1": "x"}', 3]);
assert.deepEqual(upserted.rows[0].completed_sessions, ticks, 'an old build never wipes ticks');
assert.equal(upserted.rows[0].current_session, 'evening');
assert.equal(upserted.rows[0].current_day, 3);

// Only real session keys are admitted as the pointer.
await assert.rejects(
  as(A, NEW_CLIENT_PLAN_UPSERT, [A, SESSION_PLAN, enrolledAt, '{}', 'midnight']),
  /current_session_check/
);

// ---------------------------------------------------------------------------
// Atomic plan-progress merge (20260924035821)
// ---------------------------------------------------------------------------

const MERGE = `select * from public.merge_reading_plan_progress($1::jsonb)`;
const merge = (uid, rows) => as(uid, MERGE, [JSON.stringify(rows)]);
const RACE_PLAN = 'gospels-40-days';
const D = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
await signUp(D);
const day = (n) => `2026-09-${String(10 + n).padStart(2, '0')}T08:00:00.000Z`;
const entries = (...days) => Object.fromEntries(days.map((n) => [String(n), day(n)]));
const clientRow = (overrides = {}) => ({
  user_id: D,
  plan_id: null,
  plan_slug: RACE_PLAN,
  started_at: enrolledAt,
  completed_entries: {},
  completed_sessions: {},
  current_day: 1,
  current_session: null,
  is_completed: false,
  completed_at: null,
  synced_at: iso(0),
  ...overrides,
});

// The race with the plain upsert: both phones read {1,2}; phone 1 writes {1,2,3},
// then phone 2 writes {1,2,4} and day 3 is gone. This is the bug being fixed.
await as(D, OLD_CLIENT_PLAN_UPSERT, [D, RACE_PLAN, enrolledAt, JSON.stringify(entries(1, 2)), 3]);
await as(D, OLD_CLIENT_PLAN_UPSERT, [
  D,
  RACE_PLAN,
  enrolledAt,
  JSON.stringify(entries(1, 2, 3)),
  4,
]);
await as(D, OLD_CLIENT_PLAN_UPSERT, [
  D,
  RACE_PLAN,
  enrolledAt,
  JSON.stringify(entries(1, 2, 4)),
  5,
]);
assert.deepEqual(Object.keys((await planRow(D, RACE_PLAN)).completed_entries).sort(), [
  '1',
  '2',
  '4',
]);

// The same two stale writes through the RPC keep both phones' days.
await as(D, OLD_CLIENT_PLAN_UPSERT, [D, RACE_PLAN, enrolledAt, JSON.stringify(entries(1, 2)), 3]);
let merged = await merge(D, [clientRow({ completed_entries: entries(1, 2, 3), current_day: 4 })]);
assert.equal(merged.rows.length, 1, 'the RPC returns the stored row');
merged = await merge(D, [clientRow({ completed_entries: entries(1, 2, 4), current_day: 5 })]);
assert.deepEqual(Object.keys(merged.rows[0].completed_entries).sort(), ['1', '2', '3', '4']);
assert.equal(merged.rows[0].current_day, 5);
// A phone that is behind never moves the plan back.
merged = await merge(D, [clientRow({ completed_entries: entries(1), current_day: 2 })]);
assert.deepEqual(Object.keys(merged.rows[0].completed_entries).sort(), ['1', '2', '3', '4']);
assert.equal(merged.rows[0].current_day, 5);
// The stored enrolment start is kept; the upload time is the server's.
assert.equal(new Date(merged.rows[0].started_at).toISOString(), new Date(enrolledAt).toISOString());

// Session ticks union too; the next-session pointer comes from the side further along.
const tick = (key) => ({ [key]: '2026-09-20T06:00:00.000Z' });
merged = await merge(D, [
  clientRow({ completed_sessions: tick('5:morning'), current_day: 5, current_session: 'evening' }),
]);
merged = await merge(D, [
  clientRow({ completed_sessions: tick('5:evening'), current_day: 4, current_session: 'morning' }),
]);
assert.deepEqual(Object.keys(merged.rows[0].completed_sessions).sort(), ['5:evening', '5:morning']);
assert.equal(merged.rows[0].current_session, 'evening', 'a phone on an earlier day keeps no say');
merged = await merge(D, [clientRow({ current_day: 5, current_session: null })]);
assert.equal(
  merged.rows[0].current_session,
  'evening',
  'same day: a missing pointer keeps the stored one'
);

// Finishing on either phone finishes the plan; a later stale write cannot undo it.
merged = await merge(D, [
  clientRow({ is_completed: true, completed_at: day(19), current_day: 41 }),
]);
merged = await merge(D, [clientRow({ is_completed: false, completed_at: null, current_day: 5 })]);
assert.equal(merged.rows[0].is_completed, true);
assert.equal(new Date(merged.rows[0].completed_at).toISOString(), day(19));

// A first push inserts (several plans at once), and a legacy null completed_entries merges.
await db.query(
  `insert into public.user_reading_plan_progress (user_id, plan_slug, started_at, completed_entries)
   values ($1, 'legacy-null', $2, null)`,
  [D, enrolledAt]
);
merged = await merge(D, [
  clientRow({ plan_slug: 'fresh-plan', completed_entries: entries(1) }),
  clientRow({ plan_slug: 'legacy-null', completed_entries: entries(2) }),
]);
assert.deepEqual(merged.rows.map((row) => row.plan_slug).sort(), ['fresh-plan', 'legacy-null']);
assert.deepEqual(
  Object.keys(merged.rows.find((row) => row.plan_slug === 'legacy-null').completed_entries),
  ['2']
);

// The owner is always the caller. A row that names another account is refused with
// 42501 and the whole call writes nothing; rows without user_id are accepted.
const beforeOther = await planRow(A, SESSION_PLAN);
const beforeOwn = await planRow(D, RACE_PLAN);
for (const rows of [
  [clientRow({ user_id: A, plan_slug: SESSION_PLAN, completed_entries: entries(9) })],
  [
    clientRow({ completed_entries: entries(9) }),
    clientRow({ user_id: A, plan_slug: 'another-plan', completed_entries: entries(9) }),
  ],
]) {
  await assert.rejects(merge(D, rows), { code: '42501' }, 'a row for another account is refused');
}
assert.deepEqual((await planRow(A, SESSION_PLAN)).completed_entries, beforeOther.completed_entries);
assert.deepEqual(await planRow(D, RACE_PLAN), beforeOwn, 'nothing in a refused call is written');
assert.equal(await planRow(D, 'another-plan'), undefined);
const { user_id: _noOwner, ...ownerless } = clientRow({ completed_entries: entries(10) });
merged = await merge(D, [ownerless, clientRow({ plan_slug: 'null-owner', user_id: null })]);
assert.deepEqual(
  merged.rows.map((row) => row.user_id),
  [D, D],
  'rows without user_id are accepted'
);

// An ended enrolment is skipped by the tombstone trigger, exactly as for the upsert.
await as(D, NEW_CLIENT_UNENROL, [D, 'left-plan', hoursAgo(1)]);
merged = await merge(D, [clientRow({ plan_slug: 'left-plan', started_at: hoursAgo(2) })]);
assert.equal(merged.rows.length, 0, 'a push of a left enrolment is skipped, not resurrected');
assert.equal(await planRow(D, 'left-plan'), undefined);

// A stale phone still holding the enrolment the reader left must not merge into the
// plan they re-joined since. The merge keeps the stored (re-joined) started_at on a
// conflict, but the BEFORE INSERT tombstone trigger sees the proposed row, with the
// stale started_at, before the conflict is resolved, and skips it (the rule the
// client applies with isEnrolmentEndedBy).
const REJOIN_PLAN = 'rejoined-plan';
const firstEnrolment = hoursAgo(10);
merged = await merge(D, [
  clientRow({ plan_slug: REJOIN_PLAN, started_at: firstEnrolment, completed_entries: entries(1) }),
]);
assert.equal(merged.rows.length, 1);
await as(D, NEW_CLIENT_UNENROL, [D, REJOIN_PLAN, hoursAgo(5)]);
assert.equal(await planRow(D, REJOIN_PLAN), undefined, 'leaving ends the first enrolment');
const secondEnrolment = hoursAgo(2);
merged = await merge(D, [
  clientRow({ plan_slug: REJOIN_PLAN, started_at: secondEnrolment, completed_entries: entries(7) }),
]);
assert.equal(merged.rows.length, 1, 're-joining after the leave is accepted');
merged = await merge(D, [
  clientRow({
    plan_slug: REJOIN_PLAN,
    started_at: firstEnrolment,
    completed_entries: entries(1, 2, 3),
    current_day: 4,
    is_completed: true,
    completed_at: day(3),
  }),
  clientRow({ plan_slug: 'still-live', completed_entries: entries(1) }),
]);
assert.deepEqual(
  merged.rows.map((row) => row.plan_slug),
  ['still-live'],
  'the stale pre-leave row is skipped; the rest of the batch lands'
);
const rejoined = await planRow(D, REJOIN_PLAN);
assert.deepEqual(Object.keys(rejoined.completed_entries), ['7']);
assert.equal(rejoined.current_day, 1);
assert.equal(rejoined.is_completed, false);
assert.equal(new Date(rejoined.started_at).toISOString(), new Date(secondEnrolment).toISOString());
// A push of the re-joined enrolment itself still merges.
merged = await merge(D, [
  clientRow({ plan_slug: REJOIN_PLAN, started_at: secondEnrolment, completed_entries: entries(8) }),
]);
assert.deepEqual(Object.keys(merged.rows[0].completed_entries).sort(), ['7', '8']);

// Installed builds keep writing with the plain upsert after the RPC exists.
upserted = await as(D, OLD_CLIENT_PLAN_UPSERT, [D, 'fresh-plan', enrolledAt, '{}', 1]);
assert.equal(upserted.rows.length, 1);

// Validation and access.
for (const [rows, reason] of [
  [{ plan_slug: RACE_PLAN }, 'not an array'],
  [[clientRow({ plan_slug: '  ' })], 'blank slug'],
  [[{ completed_entries: {} }], 'missing slug'],
  [[clientRow({ completed_entries: ['1'] })], 'array completed_entries'],
  [[clientRow({ completed_sessions: 'x' })], 'string completed_sessions'],
  [[clientRow(), clientRow()], 'duplicate slug'],
  [Array.from({ length: 101 }, (_, i) => clientRow({ plan_slug: `p${i}` })), 'too many rows'],
]) {
  await assert.rejects(as(D, MERGE, [JSON.stringify(rows)]), { code: '22023' }, reason);
}
await assert.rejects(
  merge(D, [clientRow({ current_session: 'midnight' })]),
  /current_session_check/
);
await assert.rejects(merge(null, [clientRow()]), /permission denied/, 'anon cannot call it');
const fnSecurity = await one(
  `select prosecdef, proconfig from pg_proc where proname = 'merge_reading_plan_progress'`
);
assert.equal(fnSecurity.prosecdef, false, 'runs as the caller, under RLS');
assert.deepEqual(fnSecurity.proconfig, ['search_path=""']);

console.log('verify-sync-contract-sql: all checks passed');
