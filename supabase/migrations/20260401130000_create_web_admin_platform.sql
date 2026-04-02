-- Web platform phases 3-9: admin auth, sync operations, content ops, and audit rails

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS admin_role TEXT
  CHECK (admin_role IS NULL OR admin_role IN ('super_admin'));

COMMENT ON COLUMN public.profiles.admin_role IS
'Internal admin role for web-platform access. Null means no admin access.';

CREATE TABLE IF NOT EXISTS public.translation_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'upstream-api',
  state TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('idle', 'running', 'succeeded', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  triggered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  upstream_endpoint TEXT,
  upstream_payload JSONB,
  result_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_translation_sync_runs_started_at
  ON public.translation_sync_runs (started_at DESC);

ALTER TABLE public.translation_catalog
ADD COLUMN IF NOT EXISTS upstream_external_id TEXT,
ADD COLUMN IF NOT EXISTS upstream_payload JSONB,
ADD COLUMN IF NOT EXISTS upstream_last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS distribution_state TEXT NOT NULL DEFAULT 'draft'
  CHECK (distribution_state IN ('draft', 'ready', 'published', 'hidden')),
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS sync_run_id UUID REFERENCES public.translation_sync_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_translation_catalog_distribution_state
  ON public.translation_catalog (distribution_state);

CREATE TABLE IF NOT EXISTS public.content_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hero', 'verse_of_day', 'promo', 'feature', 'social')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'scheduled', 'live', 'archived')),
  alt_text TEXT NOT NULL,
  caption TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'content-images',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_images_kind_state
  ON public.content_images (kind, state);

CREATE INDEX IF NOT EXISTS idx_content_images_window
  ON public.content_images (starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.verse_of_day_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  translation_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL CHECK (chapter >= 1),
  verse INTEGER NOT NULL CHECK (verse >= 1),
  reference_label TEXT NOT NULL,
  verse_text TEXT NOT NULL,
  reflection TEXT,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'scheduled', 'live', 'archived')),
  image_id UUID REFERENCES public.content_images(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_state_window
  ON public.verse_of_day_entries (state, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
  ON public.admin_audit_logs (entity_type, entity_id);

ALTER TABLE public.translation_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verse_of_day_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_content_images_updated_at
  ON public.content_images;
CREATE TRIGGER update_content_images_updated_at
  BEFORE UPDATE ON public.content_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_verse_of_day_entries_updated_at
  ON public.verse_of_day_entries;
CREATE TRIGGER update_verse_of_day_entries_updated_at
  BEFORE UPDATE ON public.verse_of_day_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "content_images_public_read" ON storage.objects;
CREATE POLICY "content_images_public_read"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'content-images');

DROP POLICY IF EXISTS "content_images_public_read_authenticated" ON storage.objects;
CREATE POLICY "content_images_public_read_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'content-images');

DROP POLICY IF EXISTS "content_images_service_upload" ON storage.objects;
CREATE POLICY "content_images_service_upload"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'content-images');

DROP POLICY IF EXISTS "content_images_service_update" ON storage.objects;
CREATE POLICY "content_images_service_update"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'content-images');

DROP POLICY IF EXISTS "content_images_service_delete" ON storage.objects;
CREATE POLICY "content_images_service_delete"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'content-images');
