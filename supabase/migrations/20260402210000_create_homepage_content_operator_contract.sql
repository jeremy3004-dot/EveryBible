-- Phase 10: explicit homepage override contract for the OpenClaw operator

CREATE TABLE IF NOT EXISTS public.site_content_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug = 'homepage'),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'live', 'archived')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

COMMENT ON TABLE public.site_content_entries IS
'Explicit remote override contracts for approved site surfaces. Phase 10 starts with slug=homepage only.';

COMMENT ON COLUMN public.site_content_entries.content IS
'Validated homepage override payload consumed by the site and OpenClaw operator tools.';

CREATE INDEX IF NOT EXISTS idx_site_content_entries_state
  ON public.site_content_entries (state, published_at DESC NULLS LAST);

ALTER TABLE public.site_content_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_site_content_entries_updated_at
  ON public.site_content_entries;
CREATE TRIGGER update_site_content_entries_updated_at
  BEFORE UPDATE ON public.site_content_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.get_live_homepage_content(
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  live_content JSONB;
BEGIN
  SELECT entry.content
  INTO live_content
  FROM public.site_content_entries AS entry
  WHERE entry.slug = 'homepage'
    AND entry.state = 'live'
    AND (entry.published_at IS NULL OR entry.published_at <= p_now)
  ORDER BY entry.published_at DESC NULLS LAST, entry.updated_at DESC
  LIMIT 1;

  RETURN live_content;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_homepage_content(TIMESTAMPTZ)
TO anon, authenticated, service_role;
