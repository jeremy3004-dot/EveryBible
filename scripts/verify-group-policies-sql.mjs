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
  '20260924035926_groups_leader_read_and_leave_guard.sql',
  '20260924035932_move_group_helpers_to_private_schema.sql',
  '20260924042319_group_create_rpc_join_throttle_and_push_claims.sql',
];

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, created_at timestamptz default now());
create table public.profiles (id uuid primary key references auth.users (id) on delete cascade);
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete cascade,
  language text
);
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

/**
 * Runs one request as `uid` (or anon when null) in its own committed transaction. `headers`
 * become the `request.headers` setting, the way PostgREST exposes the HTTP request headers.
 */
const as = (uid, sql, params = [], headers = {}) =>
  db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return tx.query(sql, params);
  });
/** Runs one statement as the service role (what an edge function's service client is). */
const asService = (sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
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
// They live in the non-exposed `private` schema (advisor
// authenticated_security_definer_function_executable), so PostgREST has no /rpc route to them
// and client roles cannot name them; the policies reference them by OID and keep working.
await assert.rejects(as(D, `select is_group_member($1, $2)`, [G1, B]), /does not exist/);
await assert.rejects(as(D, `select is_group_leader($1, $2)`, [G1, B]), /does not exist/);
await assert.rejects(as(B, `select is_group_member($1)`, [G1]), /does not exist/);
await assert.rejects(as(B, `select public.is_group_leader($1)`, [G1]), /does not exist/);
await assert.rejects(as(B, `select private.is_group_member($1)`, [G1]), /permission denied/);
await assert.rejects(as(null, `select private.is_group_member($1)`, [G1]), /permission denied/);
/** Calls a helper as the owner with `uid` as the JWT subject, the way a policy evaluates it. */
const helperAs = async (uid, fn) =>
  (
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      return tx.query(`select private.${fn}($1) v`, [G1]);
    })
  ).rows[0].v;
assert.equal(await helperAs(D, 'is_group_member'), false);
assert.equal(await helperAs(B, 'is_group_member'), true);
assert.equal(await helperAs(B, 'is_group_leader'), true);
assert.equal(await helperAs(A, 'is_group_leader'), false);
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

// --- G9: create_group() makes the group and the leader's membership in one transaction ------
const JOIN_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
await assert.rejects(as(null, `select * from create_group('Anon group')`), /permission denied/);
const circle = (await as(D, `select * from create_group('  Study circle  ')`)).rows[0];
assert.equal(circle.name, 'Study circle');
assert.equal(circle.leader_id, D);
assert.equal(circle.current_course_id, 'entry-course');
assert.equal(circle.current_lesson_id, 'entry-1');
assert.match(circle.join_code, JOIN_CODE, 'the server draws the code from the client alphabet');
assert.deepEqual(
  (await db.query(`select user_id, role from group_members where group_id = $1`, [circle.id])).rows,
  [{ user_id: D, role: 'leader' }]
);
assert.equal(
  (await as(D, `select count(*)::int n from group_members where group_id = $1`, [circle.id]))
    .rows[0].n,
  1,
  'the leader sees their own membership straight away'
);
const gospel = (
  await as(A, `select * from create_group('Gospel group', 'gospel-course', 'gospel-2')`)
).rows[0];
assert.equal(gospel.current_course_id, 'gospel-course');
assert.equal(gospel.current_lesson_id, 'gospel-2');
// A rejected request leaves nothing behind: never a group without its leader's membership.
const groupsBefore = (await one(`select count(*)::int n from groups`)).n;
await assert.rejects(as(B, `select * from create_group('ab')`), /groups_name_check/);
await assert.rejects(
  as(B, `select * from create_group('Long ids', repeat('c', 65), 'l')`),
  /too long/
);
assert.equal((await one(`select count(*)::int n from groups`)).n, groupsBefore);
assert.equal((await one(`select count(*)::int n from group_members where user_id = $1`, [B])).n, 0);
// Codes come from gen_random_uuid()'s strong randomness, not Math.random on a device.
const codes = new Set();
for (let draw = 0; draw < 200; draw += 1) {
  codes.add((await one(`select private.new_group_join_code() c`)).c);
}
assert.ok(codes.size > 195, 'codes do not repeat in practice');
for (const code of codes) assert.match(code, JOIN_CODE);
await assert.rejects(as(B, `select private.new_group_join_code()`), /permission denied/);
// A code collision is retried with a fresh code; five in a row give up without partial rows.
const realCodeFn = (
  await one(`select pg_get_functiondef('private.new_group_join_code()'::regprocedure) def`)
).def;
await db.exec(`
create sequence private.test_code_seq;
create or replace function private.new_group_join_code() returns text language sql volatile
  set search_path = '' as $$
  select case when nextval('private.test_code_seq') = 1 then '${circle.join_code}' else 'BBBBBB' end
$$;`);
const retried = (await as(B, `select * from create_group('Retry group')`)).rows[0];
assert.equal(retried.join_code, 'BBBBBB');
await db.exec(`
create or replace function private.new_group_join_code() returns text language sql volatile
  set search_path = '' as $$ select 'BBBBBB'::text $$;`);
await assert.rejects(
  as(C, `select * from create_group('Unlucky group')`),
  /Unable to reserve a unique join code/
);
assert.equal((await one(`select count(*)::int n from groups where leader_id = $1`, [C])).n, 1);
await db.exec(realCodeFn);
await db.exec(`drop sequence private.test_code_seq`);
// The two-request path at the top of this file still works for clients without the RPC.
console.log('PASS: create_group() is atomic, server-coded, retries collisions, and validates');

// --- G6: join-code guesses are also limited per client IP and globally -----------------------
const users = [];
for (let index = 0; index < 8; index += 1) {
  const id = `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, '0')}`;
  users.push(id);
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  await db.query(`insert into public.profiles (id) values ($1)`, [id]);
}
const [U0, U1, U2, U3, U4, U5, U6, U7] = users;
const shared = { 'cf-connecting-ip': '203.0.113.7' };
await db.exec(`delete from private.group_join_attempts`);
const miss = async (uid, headers, attempt) =>
  assert.equal(
    (await as(uid, `select join_group_by_code($1) id`, [`QZQZ${attempt}`], headers)).rows[0].id,
    null
  );
// Three accounts behind one address use up that address's 30 misses an hour...
for (const uid of [U0, U1, U2]) {
  for (let attempt = 0; attempt < 10; attempt += 1) await miss(uid, shared, attempt);
}
// ...so a fourth account there is refused even with a valid code (no oracle), while the same
// account from another address, or a request whose address PostgREST cannot see, still joins.
await assert.rejects(
  as(U3, `select join_group_by_code($1)`, [circle.join_code], shared),
  /Too many join attempts/
);
await assert.rejects(
  as(U3, `select join_group_by_code($1)`, [circle.join_code], {
    'cf-connecting-ip': '203.0.113.7',
    'x-forwarded-for': '198.51.100.9',
  }),
  /Too many join attempts/,
  'x-forwarded-for is client-controlled and never used'
);
assert.equal(
  (
    await as(U3, `select join_group_by_code($1) id`, [circle.join_code], {
      'x-forwarded-for': '203.0.113.7',
    })
  ).rows[0].id,
  circle.id,
  'x-forwarded-for alone is not a client key'
);
assert.equal(
  (
    await as(U4, `select join_group_by_code($1) id`, [circle.join_code], {
      'cf-connecting-ip': '203.0.113.8',
    })
  ).rows[0].id,
  circle.id
);
// x-real-ip is used when cf-connecting-ip is missing; a malformed address is ignored.
await assert.rejects(
  as(U5, `select join_group_by_code($1)`, [circle.join_code], { 'x-real-ip': '203.0.113.7' }),
  /Too many join attempts/
);
assert.equal(
  (
    await as(U5, `select join_group_by_code($1) id`, [circle.join_code], {
      'cf-connecting-ip': 'not an address',
    })
  ).rows[0].id,
  circle.id
);
// Only a hash of the address is kept, never the address itself.
const keys = (await db.query(`select distinct client_key from private.group_join_attempts`)).rows;
assert.deepEqual(
  keys.map(({ client_key: key }) => /^[0-9a-f]{64}$/.test(key)),
  [true]
);
// Global budget: once 300 misses land in an hour (many accounts, many addresses), accounts
// younger than a day cannot try codes at all; established accounts are unaffected.
await db.exec(`delete from private.group_join_attempts`);
await db.query(
  `insert into private.group_join_attempts (user_id, client_key)
   select $1, md5(n::text) from generate_series(1, 300) n`,
  [U0]
);
await assert.rejects(
  as(U6, `select join_group_by_code($1)`, [circle.join_code]),
  /Too many join attempts/
);
await db.query(`update auth.users set created_at = now() - interval '30 days' where id = $1`, [U7]);
assert.equal(
  (await as(U7, `select join_group_by_code($1) id`, [circle.join_code])).rows[0].id,
  circle.id
);
// Misses older than the window are pruned by the next miss, so the log stays small.
await db.exec(`update private.group_join_attempts set attempted_at = now() - interval '2 hours'`);
await miss(U6, {}, 'Y');
assert.equal((await one(`select count(*)::int n from private.group_join_attempts`)).n, 1);
console.log(
  'PASS: join_group_by_code also limits misses per client IP, and globally for new accounts'
);

// --- G5: group pushes are claimed per recorded session, server-side ---------------------------
// send-group-notification (service role) claims one push for one fresh session its caller
// recorded; the text is composed on the server from the group name and each recipient's language.
await db.exec(`delete from private.group_join_attempts`);
await db.query(`insert into user_preferences (user_id, language) values ($1, 'ne'), ($2, 'es')`, [
  U4,
  D,
]);
const claim = async (sessionToClaim, groupToClaim, sender) =>
  (
    await asService(`select claim_group_session_notification($1, $2, $3) r`, [
      sessionToClaim,
      groupToClaim,
      sender,
    ])
  ).rows[0].r;
const recordSession = async (uid, groupId, lessonId) =>
  (
    await as(
      uid,
      `insert into group_sessions (group_id, course_id, lesson_id, created_by)
       values ($1, 'entry-course', $2, $3) returning id`,
      [groupId, lessonId, uid]
    )
  ).rows[0].id;
// circle: D leads; U3, U4, U5 and U7 joined above.
const first = await recordSession(U4, circle.id, 'entry-1');
await assert.rejects(
  as(U4, `select claim_group_session_notification($1, $2, $3)`, [first, circle.id, U4]),
  /permission denied/,
  'clients cannot claim pushes themselves'
);
await assert.rejects(
  as(null, `select claim_group_session_notification($1, $2, $3)`, [first, circle.id, U4]),
  /permission denied/
);
const granted = await claim(first, circle.id, U4);
assert.equal(granted.status, 'ok');
assert.equal(granted.group_id, circle.id);
assert.equal(granted.group_name, 'Study circle');
assert.deepEqual(
  granted.recipients,
  [
    { user_id: D, language: 'es' },
    { user_id: U3, language: null },
    { user_id: U5, language: null },
    { user_id: U7, language: null },
  ],
  'every other member, with their interface language; never the sender'
);
assert.equal((await claim(first, circle.id, U4)).status, 'duplicate', 'one push per session');
// A second member recording the same meeting does not push again (G11).
assert.equal(
  (await claim(await recordSession(D, circle.id, 'entry-1'), circle.id, D)).status,
  'duplicate'
);
// Wrong sender, wrong group, or an unknown session: nothing to claim.
const second = await recordSession(U4, circle.id, 'entry-2');
assert.equal((await claim(second, circle.id, D)).status, 'not_found');
assert.equal((await claim(second, gospel.id, U4)).status, 'not_found');
assert.equal((await claim(G2, circle.id, U4)).status, 'not_found');
// An old session cannot be replayed into a push.
await db.query(
  `update group_sessions set created_at = now() - interval '20 minutes' where id = $1`,
  [second]
);
assert.equal((await claim(second, circle.id, U4)).status, 'stale');
// Someone who left (or was removed) cannot push to the group any more.
const leaving = await recordSession(U5, circle.id, 'entry-3');
await as(U5, `select leave_group($1)`, [circle.id]);
assert.equal((await claim(leaving, circle.id, U5)).status, 'forbidden');
// Per sender: at most 5 pushes an hour (U4 already has one).
for (const lesson of ['entry-4', 'entry-5', 'entry-6', 'entry-7']) {
  assert.equal(
    (await claim(await recordSession(U4, circle.id, lesson), circle.id, U4)).status,
    'ok'
  );
}
assert.equal(
  (await claim(await recordSession(U4, circle.id, 'entry-8'), circle.id, U4)).status,
  'rate_limited'
);
// Per group: at most 10 pushes a day, whoever sends them.
await db.query(
  `insert into private.group_session_notifications
     (session_id, group_id, course_id, lesson_id, sender_id)
   select gen_random_uuid(), $1, 'seed', 'seed-' || n, $2 from generate_series(1, 5) n`,
  [circle.id, U7]
);
assert.equal(
  (await claim(await recordSession(U3, circle.id, 'entry-9'), circle.id, U3)).status,
  'rate_limited'
);
// The claim log is not reachable from client roles.
await assert.rejects(
  as(U4, `select count(*) from private.group_session_notifications`),
  /permission denied/
);
console.log('PASS: pushes are claimed once per fresh session, by a current member, within limits');
