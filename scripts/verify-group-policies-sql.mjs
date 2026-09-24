// An isolated in-memory Postgres test of the groups RLS policies, triggers, and RPCs.
// It never connects to Supabase.
//
// Install @electric-sql/pglite in a temporary folder and set PGLITE_MODULE to its entrypoint:
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//     node scripts/verify-group-policies-sql.mjs
//
// It replays the repo migrations that define the group tables, policies, and helpers (the
// same state production has; see audit docs/research/supabase-security-audit-2026-09-24.md,
// M4 / L1 / L5), then the hardening migration, and drives every request as `authenticated`
// with a JWT subject, the way PostgREST does.
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
  '20260924150000_groups_leader_read_and_leave_guard.sql',
];

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
for (const name of MIGRATIONS) {
  const sql = await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(sql);
}
// Supabase's default table grants: RLS is the only thing standing between clients and rows.
await db.exec(`
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`);

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // leader of G1
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // member of G1
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // leader of G2, outsider to G1
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // no groups
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
for (const table of ['auth.users', 'public.profiles']) {
  await db.exec(`insert into ${table} values ('${A}'),('${B}'),('${C}'),('${D}');`);
}

/** Runs one request as `uid` (or anon when null) in its own committed transaction. */
const as = (uid, sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return tx.query(sql, params);
  });
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
/** A write is blocked when it errors on RLS/the scope triggers or silently matches no rows. */
const assertBlocked = async (request) => {
  const outcome = await request.then(
    (result) => result.affectedRows,
    (error) => {
      assert.match(String(error), /cannot be changed|row-level security|permission denied/);
      return 0;
    }
  );
  assert.equal(outcome, 0);
};

// --- Client flows that must keep working (src/services/groups/groupService.ts) -------------
// createSyncedGroup: insert groups row, then the leader's own membership row.
// The client reads the new row back (`.insert().select('*')`, which PostgREST runs as
// INSERT ... RETURNING), so the groups SELECT policy must admit the leader before their
// membership row exists.
for (const [uid, gid, code] of [
  [A, G1, 'ABC234'],
  [C, G2, 'XYZ789'],
]) {
  const created = await as(
    uid,
    `insert into groups (id, name, leader_id, join_code) values ($1, 'Group', $2, $3) returning id`,
    [gid, uid, code]
  );
  assert.equal(created.rows[0].id, gid, 'the creating leader can read the new group back');
  await as(uid, `insert into group_members (group_id, user_id, role) values ($1, $2, 'leader')`, [
    gid,
    uid,
  ]);
}
// joinSyncedGroup: the join-code RPC is the only way in.
assert.equal((await as(B, `select join_group_by_code(' abc234 ') id`)).rows[0].id, G1);
assert.equal((await as(B, `select join_group_by_code('ABC234') id`)).rows[0].id, G1, 'rejoin');
// updateSyncedGroupLesson
assert.equal(
  (await as(A, `update groups set current_lesson_id = 'entry-2' where id = $1`, [G1])).affectedRows,
  1
);
// Prayer wall: create, edit, mark answered.
const prayerId = (
  await as(
    B,
    `insert into prayer_requests (group_id, user_id, content) values ($1, $2, 'p') returning id`,
    [G1, B]
  )
).rows[0].id;
assert.equal(
  (await as(B, `update prayer_requests set content = 'edited' where id = $1`, [prayerId]))
    .affectedRows,
  1
);
assert.equal(
  (
    await as(
      B,
      `update prayer_requests set is_answered = true, answered_at = now() where id = $1`,
      [prayerId]
    )
  ).affectedRows,
  1
);
// recordSyncedGroupSession + editing its notes.
const sessionId = (
  await as(
    B,
    `insert into group_sessions (group_id, course_id, lesson_id, created_by) values ($1, 'c', 'l', $2) returning id`,
    [G1, B]
  )
).rows[0].id;
assert.equal(
  (await as(B, `update group_sessions set notes = '{"a":"b"}' where id = $1`, [sessionId]))
    .affectedRows,
  1
);
console.log(
  'PASS: create, join, lesson update, prayer edit/answer, session record/edit still work'
);

// --- M4: rows cannot be moved into another group ---------------------------------------------
// B is not in G2; before the fix an author could re-home a prayer or session there. A filtered
// UPDATE (PATCH ?id=eq.x) was already caught because Postgres also applies the SELECT policy to
// the new row when the statement reads columns, but an unfiltered PATCH with
// Prefer: return=minimal reads nothing, so only the UPDATE policy applied.
await assert.rejects(as(B, `update prayer_requests set group_id = $1`, [G2]), /cannot be changed/);
await assert.rejects(as(B, `update prayer_requests set user_id = $1`, [A]), /cannot be changed/);
await assert.rejects(as(B, `update group_sessions set group_id = $1`, [G2]), /cannot be changed/);
await assert.rejects(as(B, `update group_sessions set created_by = $1`, [A]), /cannot be changed/);
await assert.rejects(
  as(B, `update prayer_requests set group_id = $1 where id = $2`, [G2, prayerId]),
  /cannot be changed|row-level security/
);
// Even the service role / SECURITY DEFINER code cannot re-home rows.
await assert.rejects(
  db.query(`update prayer_requests set group_id = $1 where id = $2`, [G2, prayerId]),
  /cannot be changed/
);
assert.equal(
  (await one(`select group_id from prayer_requests where id = $1`, [prayerId])).group_id,
  G1
);
assert.equal(
  (await one(`select group_id from group_sessions where id = $1`, [sessionId])).group_id,
  G1
);
console.log('PASS: prayer requests and sessions cannot change group_id or author');

// --- M4: leaders cannot enroll arbitrary users or rewrite membership rows --------------------
await assertBlocked(
  as(A, `update group_members set user_id = $1 where group_id = $2 and user_id = $3`, [D, G1, B])
);
await assertBlocked(as(A, `update group_members set user_id = $1`, [D]));
assert.equal(
  (
    await as(A, `update group_members set role = 'leader' where group_id = $1 and user_id = $2`, [
      G1,
      B,
    ])
  ).affectedRows,
  0,
  'no direct membership UPDATE path for clients'
);
await assert.rejects(
  as(A, `insert into group_members (group_id, user_id) values ($1, $2)`, [G1, D]),
  /row-level security/
);
await assert.rejects(
  db.query(`update group_members set group_id = $1 where group_id = $2 and user_id = $3`, [
    G2,
    G1,
    B,
  ]),
  /cannot be changed/
);
assert.equal((await one(`select count(*)::int n from group_members where user_id = $1`, [D])).n, 0);
console.log('PASS: leaders cannot add or swap in non-consenting users');

// --- M4: leadership can only pass to an existing member --------------------------------------
await assert.rejects(
  as(A, `update groups set leader_id = $1 where id = $2`, [D, G1]),
  /must already be a member/
);
await assert.rejects(
  as(A, `update groups set leader_id = $1 where id = $2`, [C, G1]),
  /must already be a member/
);
await assert.rejects(
  as(A, `update groups set id = gen_random_uuid() where id = $1`, [G1]),
  /cannot be changed/
);
assert.equal((await as(B, `update groups set name = 'mine' where id = $1`, [G1])).affectedRows, 0);
assert.equal(
  (await as(A, `update groups set leader_id = $1 where id = $2`, [B, G1])).affectedRows,
  1,
  'transfer to a member'
);
assert.deepEqual(
  (
    await db.query(`select user_id, role from group_members where group_id = $1 order by user_id`, [
      G1,
    ])
  ).rows,
  [
    { user_id: A, role: 'member' },
    { user_id: B, role: 'leader' },
  ],
  'membership roles follow groups.leader_id'
);
// The old leader lost write access; the new leader has it.
assert.equal((await as(A, `update groups set name = 'x' where id = $1`, [G1])).affectedRows, 0);
assert.equal(
  (await as(B, `update groups set name = 'Renamed' where id = $1`, [G1])).affectedRows,
  1
);
console.log('PASS: leadership transfers only to existing members and keeps roles in sync');

// --- L1: membership helpers only answer for the caller ---------------------------------------
await assert.rejects(as(D, `select is_group_member($1, $2)`, [G1, B]), /does not exist/);
await assert.rejects(as(D, `select is_group_leader($1, $2)`, [G1, B]), /does not exist/);
assert.equal((await as(D, `select is_group_member($1) v`, [G1])).rows[0].v, false);
assert.equal((await as(B, `select is_group_member($1) v`, [G1])).rows[0].v, true);
assert.equal((await as(B, `select is_group_leader($1) v`, [G1])).rows[0].v, true);
assert.equal((await as(A, `select is_group_leader($1) v`, [G1])).rows[0].v, false);
await assert.rejects(as(null, `select is_group_member($1)`, [G1]), /permission denied/);
// Policies built on the helpers still scope reads to members.
assert.equal((await as(D, `select count(*)::int n from groups`)).rows[0].n, 0);
assert.equal((await as(D, `select count(*)::int n from group_members`)).rows[0].n, 0);
assert.equal((await as(A, `select count(*)::int n from group_members`)).rows[0].n, 2);
assert.equal((await as(C, `select count(*)::int n from group_sessions`)).rows[0].n, 0);
console.log('PASS: helpers check only the caller; member-scoped reads unchanged');

// --- M4: former members lose edit rights on what they posted ---------------------------------
await as(A, `select leave_group($1)`, [G1]);
await as(C, `select join_group_by_code('ABC234')`);
await as(B, `select leave_group($1)`, [G1]); // B leads; leadership passes to the next member
assert.equal((await one(`select leader_id from groups where id = $1`, [G1])).leader_id, C);
assert.equal(
  (await as(B, `update prayer_requests set content = 'after leaving' where id = $1`, [prayerId]))
    .affectedRows,
  0
);
assert.equal(
  (await as(B, `update group_sessions set notes = '{}' where id = $1`, [sessionId])).affectedRows,
  0
);
console.log('PASS: leave_group still promotes a member; ex-members cannot edit old rows');

// --- L5: join codes cannot be brute-forced ---------------------------------------------------
await assert.rejects(as(null, `select join_group_by_code('XYZ789')`), /permission denied/);
for (let attempt = 0; attempt < 10; attempt += 1) {
  const code = `QQQQ${String(attempt).padStart(2, '0')}`;
  assert.equal((await as(D, `select join_group_by_code($1) id`, [code])).rows[0].id, null);
}
// Once locked out, even the right code is refused, so the RPC stops being an oracle.
await assert.rejects(as(D, `select join_group_by_code('XYZ789')`), /Too many join attempts/);
assert.equal((await one(`select count(*)::int n from group_members where user_id = $1`, [D])).n, 0);
// Other users are unaffected, and attempts outside the window stop counting.
assert.equal((await as(A, `select join_group_by_code('XYZ789') id`)).rows[0].id, G2);
await db.exec(`update private.group_join_attempts set attempted_at = now() - interval '2 hours'`);
assert.equal((await as(D, `select join_group_by_code('XYZ789') id`)).rows[0].id, G2);
// The attempt log is not reachable from client roles.
await assert.rejects(
  as(D, `select count(*) from private.group_join_attempts`),
  /permission denied/
);
console.log('PASS: join_group_by_code locks out after 10 misses per hour and hides the log');

// --- Leaders leave only through leave_group() ------------------------------------------------
// G2: C leads; A and D joined by code above. A leader deleting their own membership row
// directly skipped leave_group()'s hand-over: groups.leader_id kept pointing at them, so they
// kept every leader right (update, delete, member removal) and could re-add themselves.
assert.equal(
  (await as(C, `delete from group_members where group_id = $1 and user_id = $2`, [G2, C]))
    .affectedRows,
  0,
  'a leader cannot drop their own membership row directly'
);
assert.equal((await one(`select leader_id from groups where id = $1`, [G2])).leader_id, C);
assert.equal(
  (await as(C, `delete from group_members where group_id = $1 and user_id = $2`, [G2, D]))
    .affectedRows,
  1,
  'a leader can still remove another member'
);
assert.equal(
  (await as(A, `delete from group_members where group_id = $1 and user_id = $2`, [G2, A]))
    .affectedRows,
  1,
  'a member can still remove their own membership'
);
await as(C, `select leave_group($1)`, [G2]); // the last member leaving deletes the group
assert.equal((await one(`select count(*)::int n from groups where id = $1`, [G2])).n, 0);
console.log('PASS: leaders cannot bypass leave_group(); member removal and leaving still work');
