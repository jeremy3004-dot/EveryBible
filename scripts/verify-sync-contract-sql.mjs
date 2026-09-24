// An isolated in-memory Postgres check for the server-backed sync migrations
// (docs/research/sync-offline-review-2026-09-24.md, findings 7, 8, 9 and the plan
// session columns). It never connects to Supabase.
//
// Install @electric-sql/pglite in a temporary folder and set PGLITE_MODULE to its entrypoint:
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/verify-sync-contract-sql.mjs
//
// It builds the production shape of the tables (read from the live schema on
// 2026-09-24), applies the new migrations, and drives every request as
// `authenticated` with a JWT subject, the way PostgREST does. Each write is sent
// both the way the INSTALLED app builds send it (no new columns) and the way the
// new client does.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const MIGRATIONS = ['20260924120000_user_preferences_field_edit_stamps.sql'];

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  created_at timestamptz default now()
);

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

-- handle_new_user's share of signup: the row every new account starts with.
create function public.create_default_preferences(uid uuid) returns void
  language sql security definer set search_path = '' as $$
  insert into public.profiles (id) values (uid);
  insert into public.user_preferences (user_id, language) values (uid, 'en');
$$;
`);
for (const name of MIGRATIONS) {
  const sql = await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(sql);
}
// Supabase's default table grants: RLS is the only thing standing between clients and rows.
await db.exec(
  `grant select, insert, update, delete on all tables in schema public to anon, authenticated;`
);

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    `select theme, font_size, language, onboarding_completed, reminder_time::text,
              field_updated_at from public.user_preferences where user_id = $1`,
    [uid]
  );
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

// ---------------------------------------------------------------------------
// user_preferences.field_updated_at (20260924120000)
// ---------------------------------------------------------------------------

// The exact statement PostgREST runs for the installed builds' upsert
// (src/services/sync/syncService.ts @ a608f1d7, shipped in 1.0.8): every
// preference column plus synced_at, on conflict (user_id), no field_updated_at.
const OLD_CLIENT_UPSERT = `
  insert into public.user_preferences (user_id, font_size, theme, appearance_palette, language,
    country_code, country_name, content_language_code, content_language_name,
    content_language_native_name, chapter_feedback_name, chapter_feedback_role,
    onboarding_completed, chapter_feedback_enabled, hide_play_button_from_reading_tab,
    notifications_enabled, reminder_time, synced_at)
  values ($1, $2, $3, 'el-blue', 'en', null, null, null, null, null, null, null, true, false,
    false, false, null, now())
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

// The new client's upsert: the same columns plus field_updated_at.
const NEW_CLIENT_UPSERT = `
  insert into public.user_preferences (user_id, font_size, theme, onboarding_completed,
    synced_at, field_updated_at)
  values ($1, $2, $3, true, now(), $4::jsonb)
  on conflict (user_id) do update set font_size = excluded.font_size, theme = excluded.theme,
    onboarding_completed = excluded.onboarding_completed, synced_at = excluded.synced_at,
    field_updated_at = excluded.field_updated_at
  returning *`;

await db.query(`select public.create_default_preferences($1)`, [A]);
await db.query(`select public.create_default_preferences($1)`, [B]);

let row = await prefsOf(A);
assert.deepEqual(
  row.field_updated_at,
  {},
  'a signup row carries no stamps: its values are defaults'
);

// An installed build writes: accepted, and every changed value is stamped by the server.
await as(A, OLD_CLIENT_UPSERT, [A, 'large', 'light']);
row = await prefsOf(A);
assert.equal(row.theme, 'light');
assert.equal(row.font_size, 'large');
assert.match(row.field_updated_at.theme, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
assert.ok(row.field_updated_at.font_size, 'old-client font change is stamped');
assert.ok(row.field_updated_at.onboarding_completed, 'old-client onboarding change is stamped');
assert.equal(row.field_updated_at.language, undefined, 'an unchanged default stays unstamped');
const oldClientStamp = row.field_updated_at.theme;

// The new client with a newer edit of one setting wins that setting only.
await as(A, NEW_CLIENT_UPSERT, [
  A,
  'large',
  'dark',
  JSON.stringify({ ...row.field_updated_at, theme: iso(1_000) }),
]);
row = await prefsOf(A);
assert.equal(row.theme, 'dark', 'a newer stamped edit is accepted');
assert.ok(row.field_updated_at.theme >= oldClientStamp);
assert.ok(
  Date.parse(row.field_updated_at.theme) <= Date.now() + 1_000,
  'a future stamp is clamped to the server clock'
);

// A new client whose edit is OLDER than the stored one is refused for that field
// only; the rest of its write (font_size with a newer stamp) lands.
const stored = row.field_updated_at;
await as(A, NEW_CLIENT_UPSERT, [
  A,
  'small',
  'light',
  JSON.stringify({ ...stored, theme: '2020-01-01T00:00:00.000Z', font_size: iso(0) }),
]);
row = await prefsOf(A);
assert.equal(row.theme, 'dark', 'an older edit never overwrites a newer one');
assert.equal(row.field_updated_at.theme, stored.theme, 'the stored stamp stays');
assert.equal(row.font_size, 'small', 'the newer field in the same write is accepted');

// A tie with a different value is refused too (clients resolve ties to the server).
await as(A, NEW_CLIENT_UPSERT, [
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
await as(A, NEW_CLIENT_UPSERT, [A, 'medium', 'light', JSON.stringify(row.field_updated_at)]);
row = await prefsOf(A);
assert.equal(row.theme, 'light');

// Malformed and unknown stamp keys are dropped, never stored or thrown on.
await as(A, NEW_CLIENT_UPSERT, [
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
assert.equal(jsonType(row.field_updated_at), 'object');

// RLS still applies: B can neither see nor overwrite A's stamps.
const peek = await as(B, `select * from public.user_preferences where user_id = $1`, [A]);
assert.equal(peek.rows.length, 0);
const hijack = await as(
  B,
  `update public.user_preferences set theme = 'light' where user_id = $1`,
  [A]
);
assert.equal(hijack.affectedRows, 0);

// An installed build's INSERT (an account with no row yet) still succeeds.
await db.query(`insert into public.profiles (id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc')`);
await as('cccccccc-cccc-4ccc-8ccc-cccccccccccc', OLD_CLIENT_UPSERT, [
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'small',
  'light',
]);
assert.equal((await prefsOf('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).theme, 'light');

function jsonType(value) {
  return Array.isArray(value) ? 'array' : typeof value;
}

console.log('verify-sync-contract-sql: all checks passed');
