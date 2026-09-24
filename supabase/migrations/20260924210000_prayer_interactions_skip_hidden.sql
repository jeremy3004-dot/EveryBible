-- Refuse reactions to hidden prayer requests in the policy itself (security review 2026-09-24,
-- pass 2, finding P2-14). NOT APPLIED to the live project yet.
--
-- interaction_insert_member only asked "is the reacting user a member of the request's group?".
-- Today that already refuses hidden requests for everyone but their author: the EXISTS reads
-- prayer_requests under the caller's RLS, and prayer_select_member hides a request that is
-- hidden (reports/moderation), written by someone the caller blocked, or reported by the caller.
-- Verified read-only on 2026-09-24: RLS is on for prayer_requests and `authenticated` does not
-- bypass it (0 prayer requests exist live). The protection therefore rests on the SELECT policy
-- staying strict; any future SELECT policy that shows hidden rows (a leader moderation view, for
-- example) would silently reopen reactions. This states the rule where it is enforced. The one
-- behaviour change: an author can no longer react to their own hidden request.
--
-- Everything else is the live policy, unchanged (pg_policies, 2026-09-24): same name, command,
-- role and check. ALTER POLICY keeps it in place, so there is no window without a policy.
--
-- Verify: PGLITE_MODULE=<pglite>/dist/index.js node scripts/verify-prayer-wall-sql.mjs
--
-- Rollback (the live definition before this migration):
--   alter policy "interaction_insert_member" on public.prayer_interactions
--     to authenticated
--     with check (
--       user_id = (select auth.uid())
--       and exists (
--         select 1
--         from public.prayer_requests pr
--         join public.group_members gm on gm.group_id = pr.group_id
--         where pr.id = prayer_interactions.request_id
--           and gm.user_id = (select auth.uid())
--       )
--     );

alter policy "interaction_insert_member" on public.prayer_interactions
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.prayer_requests pr
      join public.group_members gm on gm.group_id = pr.group_id
      where pr.id = prayer_interactions.request_id
        and gm.user_id = (select auth.uid())
        and pr.hidden_at is null
    )
  );
