-- Security fix (audit 2026-09-24, finding H1): group storage policies resolved `name`
-- to public.groups.name instead of storage.objects.name.
--
-- 20260322140100_create_storage_buckets.sql wrote `storage.foldername(name)` inside
-- subqueries over public.groups. Because groups has its own `name` column, Postgres bound
-- the unqualified reference to groups.name (live pg_policies shows
-- `storage.foldername(groups.name)`). The EXISTS therefore never looked at the object
-- path: any signed-in user who leads ONE group whose display name is "<that group's id>/x"
-- satisfied the check for EVERY object in the bucket.
--
-- Effect before this migration:
--   group-images (public bucket): any authenticated user could upload, overwrite, or delete
--     any object at any path.
--   study-materials: any member of group G who also leads a crafted group could delete all
--     of G's materials (the leader check was similarly unbound).
--
-- Fix: qualify the object path as storage.objects.name via the `objects` alias and use
-- explicit aliases for the joined tables. Policy intent is unchanged (leader writes group
-- images, members read them; any member uploads materials, only the leader deletes them).
--
-- NOT APPLIED. Review, then apply with the normal migration flow.

begin;

drop policy if exists "group_image_insert" on storage.objects;
create policy "group_image_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-images'
    and exists (
      select 1
      from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.leader_id = (select auth.uid())
    )
  );

drop policy if exists "group_image_update" on storage.objects;
create policy "group_image_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-images'
    and exists (
      select 1
      from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.leader_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'group-images'
    and exists (
      select 1
      from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.leader_id = (select auth.uid())
    )
  );

drop policy if exists "group_image_delete" on storage.objects;
create policy "group_image_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-images'
    and exists (
      select 1
      from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.leader_id = (select auth.uid())
    )
  );

drop policy if exists "materials_delete" on storage.objects;
create policy "materials_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-materials'
    and exists (
      select 1
      from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.leader_id = (select auth.uid())
    )
  );

commit;

-- Verification after applying (expect every row to reference objects.name, none groups.name):
--   select policyname, coalesce(qual, '') || coalesce(with_check, '') as expr
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname in ('group_image_insert', 'group_image_update',
--                        'group_image_delete', 'materials_delete');
