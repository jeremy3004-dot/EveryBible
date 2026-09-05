// An isolated in-memory Postgres test. It never connects to Supabase.
// Install @electric-sql/pglite in a temporary folder and set PGLITE_MODULE to its entrypoint.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role;
create table analytics_events (id uuid default gen_random_uuid() primary key,user_id uuid,event_name text,event_properties jsonb default '{}',session_id text,device_platform text,app_version text,created_at timestamptz,geo_country_code text,geo_latitude double precision,geo_longitude double precision,geo_source text);
create table user_engagement_summary(engagement_score numeric);
create table analytics_monthly_rollup(day date,country_code text,translation_id text,event_family text,minutes numeric,units integer,event_count integer,refreshed_at timestamptz);
create function safe_numeric(text) returns numeric language plpgsql as $$ begin return $1::numeric; exception when others then return null; end $$;`);
await db.exec(
  await fs.readFile(
    new URL('../supabase/migrations/20260905060000_repair_usage_reporting.sql', import.meta.url),
    'utf8'
  )
);
await db.exec(`insert into analytics_events(event_name,event_properties,session_id,created_at,geo_country_code,geo_latitude,geo_longitude) values
('reading_ended','{"duration_seconds":600,"translation_id":"read-only"}','reader',now(),'NP',28.21,83.99),
('reading_ended','{"duration_seconds":300,"translation_id":"offline"}','reader2',now(),null,null,null),
('session_started','{}','reader',now(),'NP',28.21,83.99),
('audio_playback_progress','{"listened_ms":60000,"translation_id":"bsb"}','listener',now(),'NP',28.209,83.989),
('audio_playback_progress','{"listened_ms":60000,"translation_id":"bsb"}','listener2',now(),'NP',28.219,83.989),
('audio_playback_progress','{"listened_ms":60000,"translation_id":"bsb"}','listener',now(),'NP',28.229,83.999),
('audio_completed','{"duration_ms":600000,"translation_id":"bsb"}','zero-only',now(),'NP',28.209,83.989),
('audio_download_completed','{"download_units":3,"translation_id":"offline"}','downloader',now(),null,null,null);`);
const j = (
  await db.query(
    `select get_admin_analytics_overview(date_trunc('day',now())-interval '6 days',7) overview`
  )
).rows[0].overview;
assert.equal(j.dailyListeningMinutes.at(-1).day, new Date().toISOString().slice(0, 10));
assert.equal(
  j.dailyListeningMinutes.reduce((s, p) => s + p.value, 0),
  j.listeningTotalMinutes
);
assert.equal(j.userCountWithListening, 2);
assert.equal(j.totalTrackedSessions, 1);
assert.equal(j.activeLocationCount, 1);
assert.equal(j.locationMetrics[0].listenerCount, 2);
assert.equal(j.locationMetrics[0].readingMinutes, 10);
assert.equal(j.translationTotals.find((t) => t.translationId === 'offline').readingMinutes, 5);
assert.equal(j.translationTotals.find((t) => t.translationId === 'offline').downloadUnits, 3);
assert.equal(j.collectionHealth.eventCount, 8);
assert.equal(j.collectionHealth.coordinateEventCount, 6);
console.log(
  'PASS: UTC today, totals, distinct listeners, reading-only map, unlocated translation usage, app sessions, health coverage'
);
await db.exec(`
create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table user_progress(user_id uuid primary key, chapters_read jsonb default '{}', streak_days integer,last_read_date date);
create table user_reading_plan_progress(user_id uuid,is_completed boolean);
create table prayer_requests(user_id uuid);
create table user_annotations(user_id uuid,deleted_at timestamptz);
drop table user_engagement_summary;
create table user_engagement_summary(user_id uuid primary key,total_chapters_read integer,total_listening_minutes integer,total_reading_minutes integer,total_sessions integer,avg_session_minutes numeric,current_streak_days integer,longest_streak_days integer,last_active_date date,engagement_score integer,plans_completed integer,prayers_submitted integer,annotations_created integer,updated_at timestamptz);
create function public.jsonb_object_keys_count(jsonb) returns integer language sql as $$ select count(*)::integer from jsonb_object_keys($1) $$;
update analytics_events set user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where session_id in ('listener','reader');
`);
await db.exec(
  await fs.readFile(
    new URL('../supabase/migrations/20260905061000_align_engagement_usage.sql', import.meta.url),
    'utf8'
  )
);
await db.query('select refresh_engagement_summaries()');
const summary = (await db.query('select * from user_engagement_summary')).rows[0];
assert.equal(summary.total_listening_minutes, 2);
assert.equal(summary.total_reading_minutes, 10);
assert.equal(summary.total_sessions, 1);
assert.equal(summary.current_streak_days, 0);
assert.equal(summary.engagement_score, 0);
await db.exec('set role authenticated');
await assert.rejects(db.query('select refresh_engagement_summaries()'), /permission denied/);
await assert.rejects(
  db.query("select refresh_user_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')"),
  /permission denied/
);
await db.exec('reset role');
console.log(
  'PASS: audio-only users, tick-based engagement, distinct sessions, null-safe scores, service-only authorization'
);
const normalized = (
  await db.query(`select
  analytics_listened_ms('{"listened_ms":60000,"playback_rate":2}') legacy,
  analytics_listened_ms('{"listened_ms":30000,"playback_rate":2,"analytics_schema_version":2}') current`)
).rows[0];
assert.equal(Number(normalized.legacy), 30000);
assert.equal(Number(normalized.current), 30000);
await db.query('select refresh_analytics_monthly_rollup()');
const rollup = (
  await db.query(
    "select sum(minutes) minutes from analytics_monthly_rollup where event_family='listening'"
  )
).rows[0];
assert.equal(Number(rollup.minutes), 3);
console.log(
  'PASS: legacy speed normalization and new elapsed-time events agree with retained rollups'
);
await db.close();
