// An isolated in-memory Postgres check for the app-error-report migration
// (supabase/migrations/20260924043614_app_error_reports.sql). It never connects to Supabase.
//
// Install @electric-sql/pglite in a temporary folder and set PGLITE_MODULE to its entrypoint:
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/verify-app-error-reports-sql.mjs
//
// It applies the throttle migration the budget RPC builds on, then the new migration, and
// checks: API roles cannot read or write reports, the per-source and global budgets, the
// admin summary shape, and the 90-day purge.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const MIGRATIONS = [
  '20260923233256_analytics_ingest_throttle.sql',
  '20260924043614_app_error_reports.sql',
];

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default privileges: every new table is fully granted to the API roles, so the
-- migration's own REVOKE is what has to keep them out.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
for (const name of MIGRATIONS) {
  await db.exec(
    await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
  );
}

const as = async (role, sql, params) => {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
};

const insertReport = (id, overrides = {}) => {
  const row = {
    occurred_at: new Date().toISOString(),
    kind: 'boundary',
    is_fatal: false,
    fingerprint: 'fp-a',
    error_name: 'TypeError',
    message: 'x is undefined',
    stack_frames: ['VerseList (main.jsbundle:1:10)'],
    screen: 'BibleReader',
    app_version: '1.0.9',
    platform: 'ios',
    install_id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3',
    ...overrides,
  };
  return as(
    'service_role',
    `insert into public.app_error_reports
      (id, occurred_at, kind, is_fatal, fingerprint, error_name, message, stack_frames, screen,
       app_version, platform, install_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      row.occurred_at,
      row.kind,
      row.is_fatal,
      row.fingerprint,
      row.error_name,
      row.message,
      row.stack_frames,
      row.screen,
      row.app_version,
      row.platform,
      row.install_id,
    ]
  );
};

// 1. Only the service role can touch reports or call the RPCs.
await insertReport('00000000-0000-4000-8000-000000000001');
for (const role of ['anon', 'authenticated']) {
  await assert.rejects(as(role, 'select * from public.app_error_reports'), /permission denied/);
  await assert.rejects(
    as(role, `select public.get_admin_app_error_summary(now() - interval '7 days')`),
    /permission denied/
  );
  await assert.rejects(
    as(role, `select * from public.consume_app_error_ingest_budget('k', 1, 1, 600, 1, 1, 1, 1)`),
    /permission denied/
  );
}

// 2. Oversized values are refused by the table itself.
await assert.rejects(
  insertReport('00000000-0000-4000-8000-000000000002', { message: 'x'.repeat(501) }),
  /check constraint/
);
await assert.rejects(
  insertReport('00000000-0000-4000-8000-000000000003', { platform: 'windows' }),
  /check constraint/
);

// 3. Per-source budget: 3 requests allowed, the 4th refused with a retry hint.
const budget = (key, reports, maxGlobal = 1000) =>
  as(
    'service_role',
    `select * from public.consume_app_error_ingest_budget($1, $2, 100, 600, 3, 50, 100000, $3)`,
    [key, reports, maxGlobal]
  ).then((result) => result.rows[0]);
for (let i = 0; i < 3; i++) assert.equal((await budget('source-a', 1)).allowed, true);
const refused = await budget('source-a', 1);
assert.equal(refused.allowed, false);
assert.ok(refused.retry_after_seconds > 0);

// 4. Global budget: counted only for admitted requests, and it caps rotating sources.
assert.equal((await budget('source-b', 5, 10)).allowed, true); // global now 3 + 5 = 8
assert.equal((await budget('source-c', 5, 10)).allowed, false); // 13 > 10

// 5. Admin summary.
await insertReport('00000000-0000-4000-8000-000000000004', {
  is_fatal: true,
  kind: 'fatal',
  app_version: '1.0.8',
});
await insertReport('00000000-0000-4000-8000-000000000005', {
  fingerprint: 'fp-b',
  platform: 'android',
  install_id: null,
});
const summary = (
  await as(
    'service_role',
    `select public.get_admin_app_error_summary(now() - interval '7 days') as s`
  )
).rows[0].s;
assert.deepEqual(summary.totals, { reports: 3, fatal: 1, installs: 1, fingerprints: 2 });
assert.deepEqual(summary.byVersion, { '1.0.8': 1, '1.0.9': 2 });
assert.deepEqual(summary.byPlatform, { ios: 2, android: 1 });
assert.equal(summary.fingerprints[0].fingerprint, 'fp-a');
assert.equal(summary.fingerprints[0].reportCount, 2);
assert.equal(summary.fingerprints[0].fatalCount, 1);
assert.deepEqual(summary.fingerprints[0].byVersion, { '1.0.8': 1, '1.0.9': 1 });
assert.deepEqual(summary.fingerprints[0].stackFrames, ['VerseList (main.jsbundle:1:10)']);
const empty = (
  await as(
    'service_role',
    `select public.get_admin_app_error_summary(now() + interval '1 day') as s`
  )
).rows[0].s;
assert.deepEqual(empty.fingerprints, []);
assert.equal(empty.totals.reports, 0);

// 6. Retention: rows older than 90 days go, newer rows stay.
await insertReport('00000000-0000-4000-8000-000000000006', {
  occurred_at: new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString(),
});
const purged = (await as('service_role', 'select public.purge_old_app_error_reports() as n'))
  .rows[0].n;
assert.equal(purged, 1);
const remaining = (
  await as('service_role', 'select count(*)::int as n from public.app_error_reports')
).rows[0].n;
assert.equal(remaining, 3);

console.log('app_error_reports migration: all checks passed');
