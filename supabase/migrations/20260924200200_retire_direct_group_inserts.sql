-- Retire direct INSERTs into public.groups (security review 2026-09-24, pass 2, finding S1).
-- NOT YET APPLIED.
--
-- 20260924042319 added public.create_group() so a group, its leader's membership and a
-- server-drawn join code are created in one transaction (health check G9/G6: codes used to come
-- from Math.random on the device). The old path stayed open: the "Leaders can create groups"
-- policy still lets any signed-in user POST /rest/v1/groups with a client-chosen id, join_code,
-- created_at and archived_at, and skip the leader membership row. create_group() is live, and
-- the app only falls back to the direct insert when PostgREST reports the RPC missing
-- (PGRST202), so nothing that works today depends on the policy. The groups feature is also
-- still unlaunched (0 rows in groups on 2026-09-24).
--
-- After this, create_group() (SECURITY DEFINER) is the only way to create a group. Leaders keep
-- UPDATE/DELETE on their own groups.
--
-- Verify: PGLITE_MODULE=<pglite>/dist/index.js node scripts/verify-group-policies-sql.mjs
--
-- Rollback:
--   grant insert on table public.groups to anon, authenticated;
--   create policy "Leaders can create groups" on public.groups
--     for insert to public with check (leader_id = (select auth.uid()));

drop policy if exists "Leaders can create groups" on public.groups;
revoke insert on table public.groups from anon, authenticated;
