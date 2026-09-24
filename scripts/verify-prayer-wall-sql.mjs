// An isolated in-memory Postgres test of the prayer wall tables, policies, and triggers
// (prayer_requests, prayer_interactions) and of what account deletion does to them.
// It never connects to Supabase.
//
// Install @electric-sql/pglite in a temporary folder and set PGLITE_MODULE to its entrypoint:
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/verify-prayer-wall-sql.mjs
//
// It replays the repo migrations that define the group and prayer tables (the same state
// production has; see docs/research/prayer-wall-health-check-2026-09-24.md), then the prayer
// wall hardening migration, and drives every request as `authenticated` with a JWT subject,
// the way PostgREST does.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const MIGRATIONS = [
  '20260306000000_group_sync_foundation.sql',
  '20260310000000_fix_function_search_path.sql',
  '20260322140500_create_prayer_community.sql',
  '20260704120000_fix_group_members_rls_recursion.sql',
  '20260711100100_revoke_group_membership_helpers_from_public.sql',
  '20260910093000_restrict_group_members_direct_insert.sql',
  '20260923233220_pin_group_scope_and_harden_group_helpers.sql',
  // Group migrations applied live on 2026-09-24 that may land on main separately. Replayed
  // when present so this check runs against the same state either way.
  { name: '20260924035926_groups_leader_read_and_leave_guard.sql', optional: true },
  { name: '20260924035932_move_group_helpers_to_private_schema.sql', optional: true },
];
// Applied after Supabase's default grants, as it would be on the live project.
const HARDENING = ['20260924160000_harden_prayer_wall.sql'];

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key);
create table public.profiles (id uuid primary key references auth.users (id) on delete cascade);
`);
const replay = async (entries) => {
  for (const entry of entries) {
    const { name, optional } = typeof entry === 'string' ? { name: entry, optional: false } : entry;
    const url = new URL(`../supabase/migrations/${name}`, import.meta.url);
    const sql = await fs.readFile(url, 'utf8').catch((error) => {
      if (optional && error.code === 'ENOENT') return null;
      throw error;
    });
    if (sql !== null) await db.exec(sql);
  }
};
await replay(MIGRATIONS);
// Supabase's default table grants: RLS is the only thing standing between clients and rows.
await db.exec(`
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
`);
await replay(HARDENING);

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // leader of G1
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // member of G1
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // member of G1, joined after B
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // no groups
const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; // sole leader of G2
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
for (const table of ['auth.users', 'public.profiles']) {
  await db.exec(`insert into ${table} values ('${A}'),('${B}'),('${C}'),('${D}'),('${E}');`);
}

/** Runs one request as `uid` (or anon when null) in its own committed transaction. */
const as = (uid, sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return tx.query(sql, params);
  });
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const count = async (sql, params = []) => (await one(sql, params)).n;
/** Inserts a prayer request the way createPrayerRequest does (INSERT ... RETURNING *). */
const post = (uid, gid, content, extra = {}) => {
  const columns = ['group_id', 'user_id', 'content', ...Object.keys(extra)];
  const values = [gid, uid, content, ...Object.values(extra)];
  const placeholders = values.map((_, index) => `$${index + 1}`);
  return as(
    uid,
    `insert into prayer_requests (${columns}) values (${placeholders}) returning *`,
    values
  ).then((result) => result.rows[0]);
};

// --- Setup through the group client flows ----------------------------------------------------
for (const [uid, gid, code] of [
  [A, G1, 'ABC234'],
  [E, G2, 'XYZ789'],
]) {
  await as(
    uid,
    `insert into groups (id, name, leader_id, join_code) values ($1, 'Group', $2, $3)`,
    [gid, uid, code]
  );
  await as(uid, `insert into group_members (group_id, user_id, role) values ($1, $2, 'leader')`, [
    gid,
    uid,
  ]);
}
await as(B, `select join_group_by_code('ABC234')`);
await db.query(`update group_members set joined_at = now() - interval '1 day' where user_id = $1`, [
  B,
]);
await as(C, `select join_group_by_code('ABC234')`);

// --- Who can read which requests ---------------------------------------------------------------
const first = await post(B, G1, 'Pray for my neighbour');
assert.equal((await as(A, `select count(*)::int n from prayer_requests`)).rows[0].n, 1);
assert.equal((await as(C, `select count(*)::int n from prayer_requests`)).rows[0].n, 1);
assert.equal((await as(D, `select count(*)::int n from prayer_requests`)).rows[0].n, 0);
assert.equal((await as(E, `select count(*)::int n from prayer_requests`)).rows[0].n, 0);
await assert.rejects(post(D, G1, 'outsider'), /row-level security/);
// anon has no policy on either table, so it holds no privileges on them at all.
await assert.rejects(as(null, `select count(*) from prayer_requests`), /permission denied/);
await assert.rejects(as(null, `select count(*) from prayer_interactions`), /permission denied/);
await assert.rejects(post(null, G1, 'anon'), /permission denied/);
// TRUNCATE ignores RLS, so no client role holds it.
await assert.rejects(as(B, `truncate prayer_requests`), /permission denied/);
console.log('PASS: only members of the group read or post its requests');

// --- Server-owned timestamps -------------------------------------------------------------------
// created_at orders the wall (newest first). A client that could set it would pin its request
// to the top forever or bury it; answered_at must mean "when it was marked answered".
const forged = await post(B, G1, 'pinned?', { created_at: '2099-01-01' });
assert.ok(new Date(forged.created_at) <= new Date(), 'insert ignores a client created_at');
await as(B, `update prayer_requests set created_at = '2099-01-01' where id = $1`, [first.id]);
assert.equal(
  (
    await one(`select created_at = $2 same from prayer_requests where id = $1`, [
      first.id,
      first.created_at,
    ])
  ).same,
  true,
  'update cannot move created_at'
);
const preAnswered = await post(B, G1, 'already?', { answered_at: '2000-01-01' });
assert.equal(preAnswered.answered_at, null, 'an unanswered request has no answered_at');
await as(
  B,
  `update prayer_requests set is_answered = true, answered_at = '2000-01-01' where id = $1`,
  [first.id]
);
const answered = await one(`select is_answered, answered_at from prayer_requests where id = $1`, [
  first.id,
]);
assert.equal(answered.is_answered, true);
assert.ok(new Date(answered.answered_at) > new Date('2020-01-01'), 'answered_at is server time');
await as(B, `update prayer_requests set content = 'edited', answered_at = null where id = $1`, [
  first.id,
]);
assert.equal(
  (
    await one(`select answered_at = $2 same from prayer_requests where id = $1`, [
      first.id,
      answered.answered_at,
    ])
  ).same,
  true,
  'editing an answered request keeps its answered_at'
);
await as(B, `update prayer_requests set is_answered = null where id = $1`, [first.id]);
assert.deepEqual(
  await one(`select is_answered, answered_at from prayer_requests where id = $1`, [first.id]),
  { is_answered: false, answered_at: null },
  'clearing the answered flag clears answered_at and never stores null'
);
console.log('PASS: created_at and answered_at are set by the server');

// --- Content limits ----------------------------------------------------------------------------
await assert.rejects(post(B, G1, ' \n\t '), /check constraint/);
await assert.rejects(post(B, G1, ''), /check constraint/);
await assert.rejects(post(B, G1, 'x'.repeat(501)), /check constraint/);
assert.equal((await post(B, G1, 'x'.repeat(500))).content.length, 500);
console.log('PASS: blank and over-long requests are rejected');

// --- Posting rate limit ------------------------------------------------------------------------
// B has posted 4 accepted requests so far in this hour; the hourly budget is 10.
for (let index = 0; index < 6; index += 1) await post(B, G1, `burst ${index}`);
await assert.rejects(post(B, G1, 'one too many'), /prayer_request_rate_limited/);
// Other members are unaffected, and the limit is per author across all their groups.
await post(C, G1, 'from C');
// Requests older than the hour stop counting toward the hourly budget...
const age = (uid, interval) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local session_replication_role = replica`);
    await tx.query(
      `update prayer_requests set created_at = created_at - $2::interval where user_id = $1`,
      [uid, interval]
    );
  });
await age(B, '2 hours');
await post(B, G1, 'after an hour');
// ...but at most 30 in a day.
for (let index = 0; index < 9; index += 1) await post(B, G1, `second hour ${index}`);
await age(B, '2 hours');
for (let index = 0; index < 10; index += 1) await post(B, G1, `third hour ${index}`);
assert.equal(
  await count(`select count(*)::int n from prayer_requests where user_id = $1`, [B]),
  30
);
await age(B, '2 hours');
await assert.rejects(post(B, G1, 'thirty-first today'), /prayer_request_rate_limited/);
await age(B, '1 day');
await post(B, G1, 'next day');
console.log('PASS: an author may post 10 requests an hour and 30 a day');

// --- Interactions ------------------------------------------------------------------------------
await as(
  C,
  `insert into prayer_interactions (request_id, user_id, type) values ($1, $2, 'prayed')`,
  [first.id, C]
);
await as(
  C,
  `insert into prayer_interactions (request_id, user_id, type) values ($1, $2, 'prayed')
   on conflict (request_id, user_id, type) do nothing`,
  [first.id, C]
);
await assert.rejects(
  as(D, `insert into prayer_interactions (request_id, user_id, type) values ($1, $2, 'prayed')`, [
    first.id,
    D,
  ]),
  /row-level security/
);
await assert.rejects(
  as(C, `insert into prayer_interactions (request_id, user_id, type) values ($1, $2, 'prayed')`, [
    first.id,
    B,
  ]),
  /row-level security/
);
assert.equal(
  await count(`select count(*)::int n from prayer_interactions where request_id = $1`, [first.id]),
  1
);
// The viewer can read back which requests they have already prayed for.
assert.deepEqual(
  (
    await as(C, `select request_id, type from prayer_interactions where user_id = $1`, [C])
  ).rows.map((row) => row.type),
  ['prayed']
);
console.log('PASS: members pray once per request; outsiders and impersonation are refused');

// --- Deleting and moderation -------------------------------------------------------------------
const fromC = await post(C, G1, 'C request to remove');
assert.equal(
  (await as(B, `delete from prayer_requests where id = $1 returning id`, [fromC.id])).rows.length,
  0,
  'members cannot delete each other'
);
assert.equal(
  (await as(D, `delete from prayer_requests where id = $1 returning id`, [fromC.id])).rows.length,
  0,
  'outsiders cannot delete'
);
assert.equal(
  (await as(A, `delete from prayer_requests where id = $1 returning id`, [fromC.id])).rows.length,
  1,
  'the leader can remove any request in their group (DELETE ... RETURNING)'
);
const ownDelete = await post(C, G1, 'C deletes own');
assert.equal(
  (await as(C, `delete from prayer_requests where id = $1 returning id`, [ownDelete.id])).rows
    .length,
  1
);
console.log('PASS: authors delete their own requests, leaders moderate their group');

// --- Account deletion --------------------------------------------------------------------------
// delete_my_account() (and the dashboard / admin API) delete the auth.users row, which cascades
// to profiles. groups.leader_id references profiles ON DELETE CASCADE, so deleting the leader's
// account used to delete the whole group and every member's prayer requests with it.
const deleteAccount = (uid) => db.query(`delete from auth.users where id = $1`, [uid]);
const fromA = await post(A, G1, 'leader request');
await as(
  A,
  `insert into prayer_interactions (request_id, user_id, type) values ($1, $2, 'encouraged')`,
  [first.id, A]
);
const beforeB = await count(`select count(*)::int n from prayer_requests where user_id = $1`, [B]);
await deleteAccount(A);
assert.equal(
  await count(`select count(*)::int n from groups where id = $1`, [G1]),
  1,
  'group kept'
);
// B joined before C, so B takes over, with the leader role.
assert.equal((await one(`select leader_id from groups where id = $1`, [G1])).leader_id, B);
assert.deepEqual(
  (await db.query(`select user_id, role from group_members where group_id = $1 order by 1`, [G1]))
    .rows,
  [
    { user_id: B, role: 'leader' },
    { user_id: C, role: 'member' },
  ]
);
assert.equal(
  await count(`select count(*)::int n from prayer_requests where user_id = $1`, [B]),
  beforeB,
  "other members' requests survive the leader deleting their account"
);
assert.equal(
  await count(`select count(*)::int n from prayer_requests where id = $1`, [fromA.id]),
  0,
  "the deleted account's own requests go with it"
);
assert.equal(
  await count(`select count(*)::int n from prayer_interactions where user_id = $1`, [A]),
  0,
  "the deleted account's interactions go with it"
);
// The new leader can moderate straight away.
const fromC2 = await post(C, G1, 'after handover');
assert.equal(
  (await as(B, `delete from prayer_requests where id = $1 returning id`, [fromC2.id])).rows.length,
  1
);
// A sole member's group has nobody to hand over to and goes with the account.
await deleteAccount(E);
assert.equal(await count(`select count(*)::int n from groups where id = $1`, [G2]), 0);
// Accounts without groups delete as before.
await deleteAccount(D);
assert.equal(await count(`select count(*)::int n from profiles where id = $1`, [D]), 0);
console.log("PASS: deleting a leader's account hands the group over instead of erasing it");
