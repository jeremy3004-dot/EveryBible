-- Security hardening (audit 2026-09-24, finding L4, avatars and content-images part).
--
-- `avatar_select` (role public, bucket_id = 'avatars') and the two content_images read
-- policies let any caller run storage list() on those buckets. Avatar objects live at
-- `{userId}/avatar.{ext}`, so listing the bucket enumerated the id of every user who has
-- uploaded an avatar.
--
-- Both buckets are `public = true`. Public object URLs (/storage/v1/object/public/...) are
-- served without consulting RLS, which is how the app shows avatars
-- (storageService.uploadAvatar returns getPublicUrl) and how content images are embedded, so
-- dropping the broad SELECT policies does not break any image URL.
--
-- Signed-in users keep SELECT on their own avatar folder. Storage needs it for
-- upload(..., { upsert: true }) and for remove(), which the account deletion flow now uses
-- to clear the user's avatar before deleting the account.
--
-- Not changed here: group-images (public bucket with a members-only SELECT policy) belongs
-- to the groups work; bible-audio and verse-timestamps hold only public Bible content.
--
-- Regression check: supabase/tests/storage_public_bucket_listing.sql

begin;

drop policy if exists "avatar_select" on storage.objects;
drop policy if exists "avatar_select_own" on storage.objects;
create policy "avatar_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
  );

drop policy if exists "content_images_public_read" on storage.objects;
drop policy if exists "content_images_public_read_authenticated" on storage.objects;

commit;
