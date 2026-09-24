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
// wall hardening and moderation migrations (docs/research/prayer-wall-moderation-2026-09-24.md),
// and drives every request as `authenticated` with a JWT subject, the way PostgREST does. Admin
// writes run as `service_role`.
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
const HARDENING = [
  '20260924042617_harden_prayer_wall.sql',
  '20260924045749_prayer_wall_moderation.sql',
];

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
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
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
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
/** Runs one statement as the service role, the way the admin app (PostgREST) does. */
const asService = (sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
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

// --- Moderation: report ------------------------------------------------------------------------
// App Store Guideline 1.2: members can report a request, block its author, and the server
// filters abusive text. Reports live in a service-only table and go through an RPC.
const F = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; // member of G1
const H = '99999999-9999-4999-8999-999999999999'; // member of G1
const I = '88888888-8888-4888-8888-888888888888'; // member of G1
const J = '77777777-7777-4777-8777-777777777777'; // no groups
for (const table of ['auth.users', 'public.profiles']) {
  await db.exec(`insert into ${table} values ('${F}'),('${H}'),('${I}'),('${J}');`);
}
for (const uid of [F, H, I]) await as(uid, `select join_group_by_code('ABC234')`);
const sees = async (uid, id) =>
  (await as(uid, `select count(*)::int n from prayer_requests where id = $1`, [id])).rows[0].n;
const report = (uid, id, reason = 'abuse', note = null) =>
  as(uid, `select report_prayer_request($1, $2, $3)`, [id, reason, note]);

await assert.rejects(as(C, `select * from prayer_request_reports`), /permission denied/);
await assert.rejects(
  as(
    C,
    `insert into prayer_request_reports (request_id, reporter_id, reason) values ($1, $2, 'spam')`,
    [first.id, C]
  ),
  /permission denied/
);
await assert.rejects(report(null, first.id), /permission denied/);

const target = await post(C, G1, 'a request the group finds abusive');
await report(F, target.id, 'abuse', '  rude to the group  ');
assert.equal(await sees(F, target.id), 0, 'a reported request disappears for the reporter');
assert.equal(await sees(H, target.id), 1, 'one report does not hide it for anyone else');
await report(F, target.id, 'spam'); // a second report by the same member is ignored
assert.deepEqual(
  (
    await db.query(
      `select reporter_id, reason, note, status, request_author_id, group_id, content_snapshot
         from prayer_request_reports where request_id = $1`,
      [target.id]
    )
  ).rows,
  [
    {
      reporter_id: F,
      reason: 'abuse',
      note: 'rude to the group',
      status: 'open',
      request_author_id: C,
      group_id: G1,
      content_snapshot: 'a request the group finds abusive',
    },
  ]
);
await assert.rejects(report(C, target.id), /cannot_report_own_prayer_request/);
await assert.rejects(report(J, target.id), /prayer_request_not_found/);
await assert.rejects(report(H, target.id, 'boring'), /check constraint/);
await assert.rejects(report(H, target.id, 'other', 'x'.repeat(501)), /check constraint/);
await report(H, target.id, 'spam');
assert.equal(await sees(I, target.id), 1, 'two reports do not hide it yet');
await report(I, target.id, 'harm');
assert.equal(await sees(B, target.id), 0, 'three reports hide it from the group, leader included');
assert.equal(await sees(C, target.id), 1, 'the author still sees their own request');
assert.equal(
  (await one(`select hidden_reason from prayer_requests where id = $1`, [target.id])).hidden_reason,
  'reports'
);
await assert.rejects(
  as(B, `insert into prayer_interactions (request_id, user_id, type) values ($1, $2, 'prayed')`, [
    target.id,
    B,
  ]),
  /row-level security/,
  'nobody can interact with a hidden request'
);
// Authors cannot un-hide their request or post one pre-hidden.
await as(C, `update prayer_requests set hidden_at = null, hidden_reason = null where id = $1`, [
  target.id,
]);
assert.equal(
  (await one(`select hidden_reason from prayer_requests where id = $1`, [target.id])).hidden_reason,
  'reports'
);
const notPreHidden = await post(C, G1, 'hide me?', {
  hidden_at: '2020-01-01',
  hidden_reason: 'admin',
});
assert.equal(notPreHidden.hidden_at, null);
assert.equal(notPreHidden.hidden_reason, null);
// The admin (service role) restores it: the group sees it again, the reporters still do not.
await asService(`update prayer_requests set hidden_at = null, hidden_reason = null where id = $1`, [
  target.id,
]);
assert.equal(await sees(B, target.id), 1);
assert.equal(await sees(F, target.id), 0);
console.log('PASS: reports hide a request from the reporter, and from everyone after 3');

// Reporting is rate limited: 10 an hour per reporter. F has filed 1 report so far.
const batch = await db.transaction(async (tx) => {
  await tx.exec(`set local session_replication_role = replica`);
  return (
    await tx.query(
      `insert into prayer_requests (group_id, user_id, content)
       select $1, $2, 'batch ' || n from generate_series(1, 10) n returning id`,
      [G1, B]
    )
  ).rows.map((row) => row.id);
});
for (const id of batch.slice(0, 9)) await report(F, id, 'spam');
await assert.rejects(report(F, batch[9], 'spam'), /prayer_report_rate_limited/);
await report(H, batch[9], 'spam');
console.log('PASS: a member may file 10 reports an hour');

// --- Moderation: block -------------------------------------------------------------------------
const fromH = await post(H, G1, 'from H');
await as(F, `insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [F, H]);
assert.equal(await sees(F, fromH.id), 0, "a blocked member's requests disappear for the blocker");
assert.equal(await sees(I, fromH.id), 1, 'and only for the blocker');
assert.equal((await as(F, `select count(*)::int n from user_blocks`)).rows[0].n, 1);
assert.equal((await as(H, `select count(*)::int n from user_blocks`)).rows[0].n, 0);
await assert.rejects(
  as(C, `insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [F, C]),
  /row-level security/
);
await assert.rejects(
  as(F, `insert into user_blocks (blocker_id, blocked_id) values ($1, $1)`, [F]),
  /check constraint/
);
await assert.rejects(as(null, `select count(*) from user_blocks`), /permission denied/);
await as(F, `delete from user_blocks where blocked_id = $1`, [H]);
assert.equal(await sees(F, fromH.id), 1, 'unblocking shows them again');
console.log('PASS: members block and unblock authors for themselves only');

// --- Moderation: content filter ----------------------------------------------------------------
// Neutral stand-in terms; the real list is data in prayer_content_filter_terms.
assert.ok(
  (await one(`select count(*)::int n from prayer_content_filter_terms`)).n > 0,
  'the migration seeds a starter list'
);
await asService(
  `insert into prayer_content_filter_terms (term, match_mode, language)
   values ('Zorblax', 'word', 'en'), ('drop dead now', 'word', 'en'), ('坏词', 'substring', 'zh')`
);
await assert.rejects(as(C, `select * from prayer_content_filter_terms`), /permission denied/);
await assert.rejects(post(C, G1, 'you are a ZORBLAX!'), /prayer_request_blocked_content/);
await assert.rejects(post(C, G1, 'please... drop   dead\nnow'), /prayer_request_blocked_content/);
await assert.rejects(post(C, G1, '你是坏词吗'), /prayer_request_blocked_content/);
await assert.rejects(post(C, G1, '你是坏 词吗'), /prayer_request_blocked_content/);
await post(C, G1, 'zorblaxian words are fine as part of a longer word');
await assert.rejects(
  as(C, `update prayer_requests set content = 'zorblax' where id = $1`, [notPreHidden.id]),
  /prayer_request_blocked_content/
);
await as(C, `update prayer_requests set is_answered = true where id = $1`, [notPreHidden.id]);
console.log('PASS: the server rejects requests that contain a filtered term');

// --- Moderation: ban ---------------------------------------------------------------------------
await asService(`insert into prayer_wall_bans (user_id, reason) values ($1, 'abuse')`, [H]);
await assert.rejects(as(H, `select * from prayer_wall_bans`), /permission denied/);
await assert.rejects(post(H, G1, 'still here'), /prayer_wall_banned/);
await assert.rejects(
  as(H, `update prayer_requests set content = 'edited after ban' where id = $1`, [fromH.id]),
  /prayer_wall_banned/
);
assert.equal(
  (await as(H, `delete from prayer_requests where id = $1 returning id`, [fromH.id])).rows.length,
  1,
  'a banned author can still delete their own requests'
);
await post(I, G1, 'others still post');
await asService(`delete from prayer_wall_bans where user_id = $1`, [H]);
await post(H, G1, 'after unban');
console.log('PASS: a banned author cannot post or edit on the wall');

// The admin app's other writes, as the service role: a ban hides the author's requests, and
// deleting a request takes its reports with it.
await asService(
  `update prayer_requests set hidden_at = now(), hidden_reason = 'admin'
    where user_id = $1 and hidden_at is null`,
  [H]
);
assert.equal(
  (await as(I, `select count(*)::int n from prayer_requests where user_id = $1`, [H])).rows[0].n,
  0
);
assert.equal(
  (await asService(`delete from prayer_requests where id = $1 returning content`, [batch[9]]))
    .rows[0].content,
  'batch 10'
);
assert.equal(
  await count(`select count(*)::int n from prayer_request_reports where request_id = $1`, [
    batch[9],
  ]),
  0
);
console.log('PASS: the service role hides, restores and deletes for the admin Reports page');

// Account deletion removes the member's reports and blocks with them.
await as(I, `insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [I, C]);
await deleteAccount(I);
assert.equal(
  await count(`select count(*)::int n from prayer_request_reports where reporter_id = $1`, [I]),
  0
);
assert.equal(await count(`select count(*)::int n from user_blocks where blocker_id = $1`, [I]), 0);
console.log("PASS: deleting an account removes that member's reports and blocks");
