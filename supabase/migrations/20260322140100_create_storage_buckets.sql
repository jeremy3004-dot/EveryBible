-- Phase 16: Create Supabase storage buckets for avatars, group images, and study materials

-- Create buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('group-images', 'group-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('study-materials', 'study-materials', false, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;

-- Avatars: user-scoped folders (folder name = user UUID)
CREATE POLICY "avatar_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "avatar_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "avatar_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "avatar_select" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

-- Group images: leader can upload (folder name = group UUID)
CREATE POLICY "group_image_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group-images'
  AND EXISTS (
    SELECT 1 FROM public.groups
    WHERE id::text = (storage.foldername(name))[1]
    AND leader_id = (select auth.uid())
  )
);

CREATE POLICY "group_image_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'group-images'
  AND EXISTS (
    SELECT 1 FROM public.groups
    WHERE id::text = (storage.foldername(name))[1]
    AND leader_id = (select auth.uid())
  )
);

CREATE POLICY "group_image_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'group-images'
  AND EXISTS (
    SELECT 1 FROM public.groups
    WHERE id::text = (storage.foldername(name))[1]
    AND leader_id = (select auth.uid())
  )
);

CREATE POLICY "group_image_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'group-images'
  AND EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id::text = (storage.foldername(name))[1]
    AND user_id = (select auth.uid())
  )
);

-- Study materials: group-member scoped (folder name = group UUID)
CREATE POLICY "materials_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'study-materials'
  AND EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id::text = (storage.foldername(name))[1]
    AND user_id = (select auth.uid())
  )
);

CREATE POLICY "materials_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'study-materials'
  AND EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id::text = (storage.foldername(name))[1]
    AND user_id = (select auth.uid())
  )
);

CREATE POLICY "materials_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'study-materials'
  AND EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id::text = (storage.foldername(name))[1]
    AND user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.groups
      WHERE id::text = (storage.foldername(name))[1]
      AND leader_id = (select auth.uid())
    )
  )
);
