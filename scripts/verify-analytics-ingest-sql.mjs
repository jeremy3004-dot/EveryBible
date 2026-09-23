// An isolated in-memory Postgres check for the M1 analytics ingestion migrations
// (20260923233256_analytics_ingest_throttle, 20260923233653_close_analytics_direct_insert).
// It never connects to Supabase. Install @electric-sql/pglite in a temporary folder and set
// PGLITE_MODULE to its entrypoint, then: node scripts/verify-analytics-ingest-sql.mjs
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const migration = (name) =>
  fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const db = new PGlite();

// Production shape of analytics_events before M1 (policies, grants, batch_track_events).
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key);
create table public.analytics_events (id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null, event_name text,
  event_properties jsonb default '{}'::jsonb, session_id text, device_platform text, app_version text,
  created_at timestamptz default now(), geo_country_code text, geo_region_code text,
  geo_region_name text, geo_city text, geo_latitude double precision, geo_longitude double precision,
  geo_timezone text, geo_accuracy_km integer, geo_source text, received_at timestamptz);
alter table public.analytics_events enable row level security;
grant all on public.analytics_events to anon, authenticated, service_role;
create policy events_insert_own on public.analytics_events for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy events_select_own on public.analytics_events for select to authenticated
  using (user_id = (select auth.uid()));
create function public.batch_track_events(events jsonb) returns void language plpgsql
  security definer set search_path to 'public' as $$
  begin
    insert into public.analytics_events (user_id, event_name, created_at)
    select (select auth.uid()), e->>'event_name', (e->>'created_at')::timestamptz
    from jsonb_array_elements(events) e;
  end $$;
grant execute on function public.batch_track_events(jsonb) to authenticated, service_role;
insert into public.profiles values ('${USER}');
insert into public.analytics_events (user_id, event_name, created_at)
  values ('${USER}', 'old', now() - interval '400 days');
`);

async function as(role, sql) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${USER}', false);`);
  try {
    await db.exec(sql);
    return 'ok';
  } catch (error) {
    return error.message;
  } finally {
    await db.exec('reset role');
  }
}
const backdatedInsert = `insert into public.analytics_events (user_id, event_name, created_at)
  values ('${USER}', 'x', now() - interval '5 years')`;
const backdatedRpc = `select public.batch_track_events('[{"event_name":"y","created_at":"2000-01-01"}]')`;

// The bypass is real before the migration.
assert.equal(await as('authenticated', backdatedInsert), 'ok');
assert.equal(await as('authenticated', backdatedRpc), 'ok');

await db.exec(await migration('20260923233256_analytics_ingest_throttle.sql'));
await db.exec(await migration('20260923233653_close_analytics_direct_insert.sql'));

// ── direct-insert bypass closed ────────────────────────────────────────────
assert.match(await as('authenticated', backdatedInsert), /permission denied/);
assert.match(await as('authenticated', backdatedRpc), /permission denied/);
assert.match(await as('authenticated', 'truncate public.analytics_events'), /permission denied/);
assert.equal(await as('authenticated', 'select count(*) from public.analytics_events'), 'ok');

// ── service-role path still works; size backstops hold ────────────────────
const insert = (props, name = 'reading_ended') =>
  as(
    'service_role',
    `insert into public.analytics_events (event_name, event_properties) values ('${name}', '${props}')`
  );
assert.equal(await insert('{"duration_seconds":30}'), 'ok');
// Worst case the edge functions accept: ~4 KB of tiny numeric members (~6x as jsonb).
assert.equal(await insert(JSON.stringify({ a: Array(2040).fill(1) })), 'ok');
assert.match(await insert(JSON.stringify({ blob: 'x'.repeat(70000) })), /properties_bounded/);
assert.match(await insert('[1]'), /properties_bounded/);
assert.match(await insert('{}', 'x'.repeat(129)), /text_bounded/);
// Account deletion still nulls user_id on rows far older than the 30-day ingest window.
await db.exec('delete from public.profiles');
const orphaned = await db.query(
  `select count(*)::int c from public.analytics_events where event_name = 'old' and user_id is null`
);
assert.equal(orphaned.rows[0].c, 1);

// ── ingest budget ──────────────────────────────────────────────────────────
const budget = async (key, events, bytes, maxRequests = 3, maxGeo = 2) =>
  (
    await db.query(
      `select * from public.consume_analytics_ingest_budget($1, $2, $3, 600, $4, 100, 10000, 43200, $5)`,
      [key, events, bytes, maxRequests, maxGeo]
    )
  ).rows[0];
assert.deepEqual(await budget('a', 10, 100), {
  allowed: true,
  retry_after_seconds: 0,
  cached_geo: null,
  claim_geo_lookup: true,
});
assert.equal((await budget('a', 10, 100)).claim_geo_lookup, false, 'one lookup claim per key');
assert.equal((await budget('a', 10, 100)).allowed, true);
const over = await budget('a', 10, 100);
assert.equal(over.allowed, false, 'request budget exhausted');
assert.ok(over.retry_after_seconds > 0 && over.retry_after_seconds <= 600);
assert.equal((await budget('b', 101, 1)).allowed, false, 'event budget exhausted');
await db.exec(`update public.analytics_ingest_throttle
  set geo = '{"countryCode":"NP"}', geo_cached_at = now(),
      window_started_at = now() - interval '11 minutes' where client_key = 'a'`);
const reset = await budget('a', 1, 1);
assert.equal(reset.allowed, true, 'window resets');
assert.deepEqual(reset.cached_geo, { countryCode: 'NP' });
assert.equal((await budget('c', 1, 1)).claim_geo_lookup, true);
assert.equal((await budget('d', 1, 1)).claim_geo_lookup, false, 'global lookup ceiling');
assert.match(
  await as(
    'authenticated',
    `select * from public.consume_analytics_ingest_budget('k',1,1,600,1,1,1,1,1)`
  ),
  /permission denied/
);
assert.match(
  await as('anon', 'select * from public.analytics_ingest_throttle'),
  /permission denied/
);

console.log(
  'PASS: direct insert/RPC/truncate closed, service-role ingest intact, size backstops, ON DELETE SET NULL on old rows, ingest budget + geo claim + global ceiling, service-role-only limiter'
);
