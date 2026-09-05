-- RLS protects profile rows, not privileged columns. Keep ordinary profile
-- signup/sync working while reserving admin_role assignments for service_role.
-- Table-level privileges override column revocations, so remove both grants.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (admin_role), UPDATE (admin_role)
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT INSERT (id, email, display_name, avatar_url, created_at, updated_at),
      UPDATE (id, email, display_name, avatar_url, created_at, updated_at)
  ON TABLE public.profiles TO authenticated;

-- Explicitly retain the trusted server's role-management capability.
GRANT INSERT, UPDATE ON TABLE public.profiles TO service_role;
