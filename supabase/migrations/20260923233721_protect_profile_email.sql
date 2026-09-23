-- Security hardening (audit 2026-09-24, finding L8).
--
-- authenticated had column INSERT/UPDATE on profiles.email and profiles.created_at, so a user
-- could set their profile email to any address. apps/admin reads that column for the admin
-- identity (admin-auth.ts) and for support-user search (admin-data.ts listSupportUsers), so a
-- spoofed value could impersonate another user in the admin tools.
--
-- Why a trigger rather than revoking UPDATE (email): the mobile sync upsert in shipped app
-- builds sends `email` (src/services/sync/syncService.ts ensureCloudProfile). Revoking the
-- column privilege would make that upsert fail with 42501 and break profile/progress sync for
-- every installed build. Instead a BEFORE trigger always takes the value from auth.users, so
-- old clients keep working and whatever they send is ignored. A second trigger keeps the
-- profile in step when the Auth address changes.
--
-- No client sends created_at, so its column grants are simply revoked.
--
-- Production had 0 mismatched profile emails on 2026-09-24; the backfill is for safety.
--
-- Regression check: supabase/tests/profile_email_integrity.sql

begin;

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := (select u.email from auth.users u where u.id = new.id);
  return new;
end;
$$;

revoke all on function public.sync_profile_email_from_auth() from public, anon, authenticated;

drop trigger if exists sync_profile_email_from_auth on public.profiles;
create trigger sync_profile_email_from_auth
  before insert or update on public.profiles
  for each row execute function public.sync_profile_email_from_auth();

create or replace function public.propagate_auth_email_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The profiles BEFORE trigger re-reads auth.users, which already holds the new address.
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke all on function public.propagate_auth_email_to_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.propagate_auth_email_to_profile();

revoke insert (created_at), update (created_at) on table public.profiles from public, anon, authenticated;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

commit;
