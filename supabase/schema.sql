-- Every Bible database schema: public-schema snapshot of production
--
-- Source of truth: the production project (ganmududzdzpruvdulkg), read on 2026-09-24.
-- Change history lives in supabase/migrations/; this file is a readable reference for the
-- current shape of the public schema and a bootstrap script for an EMPTY project.
--
-- How it was produced: `supabase db dump` needs Docker and the database password, which were
-- not available, so this file was rebuilt by hand from read-only catalog queries
-- (pg_attribute/pg_attrdef, pg_get_constraintdef, pg_get_indexdef, pg_policy,
-- pg_get_triggerdef, pg_get_functiondef, table/column grants and comments). Expressions are
-- copied from the catalog, with two normalizations: object names are schema-qualified, and
-- `( SELECT auth.uid() AS uid)` is written as `(select auth.uid())`. When the database has a
-- password available, prefer regenerating with:
--   supabase db dump --linked --schema public -f supabase/schema.sql
--
-- Scope: all 29 public tables (columns, defaults, constraints, indexes, RLS, policies, triggers,
-- non-default grants, comments) plus the functions those tables, policies and triggers depend
-- on. Not included (defined only in migrations): the RPC/maintenance functions
-- analytics_listened_ms, authorize_engagement_refresh, batch_track_events,
-- chapter_feedback_positive_preview, chapter_feedback_review_positive_ids,
-- chapter_feedback_review_v2, count_user_sessions, get_admin_analytics_overview,
-- get_live_mobile_content, jsonb_object_keys_count, purge_old_analytics_events,
-- refresh_analytics_monthly_rollup, refresh_engagement_summaries, refresh_my_engagement,
-- refresh_user_engagement and safe_numeric; storage buckets/policies; pg_cron jobs; Vault
-- secrets; and table data.

-- ─── Accounts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  admin_role text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_admin_role_check CHECK (((admin_role IS NULL) OR (admin_role = 'super_admin'::text))),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_progress (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  chapters_read jsonb DEFAULT '{}'::jsonb,
  streak_days integer DEFAULT 0,
  last_read_date date,
  current_book text DEFAULT 'GEN'::text,
  current_chapter integer DEFAULT 1,
  synced_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_progress_pkey PRIMARY KEY (id),
  CONSTRAINT user_progress_user_id_key UNIQUE (user_id),
  CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  font_size text DEFAULT 'medium'::text,
  theme text DEFAULT 'dark'::text,
  language text DEFAULT 'en'::text,
  notifications_enabled boolean DEFAULT false,
  reminder_time time without time zone,
  synced_at timestamp with time zone DEFAULT now(),
  country_code text,
  country_name text,
  content_language_code text,
  content_language_name text,
  content_language_native_name text,
  onboarding_completed boolean DEFAULT false,
  chapter_feedback_enabled boolean DEFAULT false NOT NULL,
  chapter_feedback_name text,
  chapter_feedback_role text,
  chapter_feedback_id_number text,
  appearance_palette text DEFAULT 'el-blue'::text NOT NULL,
  hide_play_button_from_reading_tab boolean DEFAULT false NOT NULL,
  CONSTRAINT user_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_preferences_user_id_key UNIQUE (user_id),
  CONSTRAINT user_preferences_appearance_palette_check CHECK ((appearance_palette = ANY (ARRAY['el-blue'::text, 'el-blue-brand'::text, 'ember'::text, 'sapphire'::text, 'teal'::text, 'olive'::text]))),
  CONSTRAINT user_preferences_language_check CHECK ((language = ANY (ARRAY['en'::text, 'zh'::text, 'hi'::text, 'es'::text, 'ar'::text, 'fr'::text, 'bn'::text, 'pt'::text, 'ru'::text, 'ur'::text, 'id'::text, 'de'::text, 'ja'::text, 'pa'::text, 'mr'::text, 'te'::text, 'tr'::text, 'ta'::text, 'vi'::text, 'ko'::text, 'ne'::text]))),
  CONSTRAINT user_preferences_theme_check CHECK ((theme = ANY (ARRAY['dark'::text, 'light'::text, 'low-light'::text, 'parchment'::text, 'midnight'::text]))),
  CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  push_token text NOT NULL,
  platform text NOT NULL,
  device_id text,
  app_version text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_devices_pkey PRIMARY KEY (id),
  CONSTRAINT user_devices_user_id_push_token_key UNIQUE (user_id, push_token),
  CONSTRAINT user_devices_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text]))),
  CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_annotations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  book text NOT NULL,
  chapter integer NOT NULL,
  verse_start integer NOT NULL,
  verse_end integer,
  type text NOT NULL,
  color text,
  content text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  synced_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT user_annotations_pkey PRIMARY KEY (id),
  CONSTRAINT user_annotations_type_check CHECK ((type = ANY (ARRAY['bookmark'::text, 'highlight'::text, 'note'::text]))),
  CONSTRAINT user_annotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ─── Groups and prayer ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  join_code text NOT NULL,
  leader_id uuid NOT NULL,
  current_course_id text DEFAULT 'entry-course'::text NOT NULL,
  current_lesson_id text DEFAULT 'entry-1'::text NOT NULL,
  archived_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT groups_join_code_key UNIQUE (join_code),
  CONSTRAINT groups_join_code_check CHECK ((join_code ~ '^[A-Z0-9]{6}$'::text)),
  CONSTRAINT groups_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 3) AND (char_length(TRIM(BOTH FROM name)) <= 80))),
  CONSTRAINT groups_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id),
  CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['leader'::text, 'member'::text]))),
  CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE,
  CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.group_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  course_id text NOT NULL,
  lesson_id text NOT NULL,
  notes jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid NOT NULL,
  completed_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT group_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT group_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT group_sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.prayer_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_answered boolean DEFAULT false,
  answered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT prayer_requests_pkey PRIMARY KEY (id),
  CONSTRAINT prayer_requests_content_check CHECK (((length(content) >= 1) AND (length(content) <= 500))),
  CONSTRAINT prayer_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE,
  CONSTRAINT prayer_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.prayer_interactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT prayer_interactions_pkey PRIMARY KEY (id),
  CONSTRAINT prayer_interactions_request_id_user_id_type_key UNIQUE (request_id, user_id, type),
  CONSTRAINT prayer_interactions_type_check CHECK ((type = ANY (ARRAY['prayed'::text, 'encouraged'::text]))),
  CONSTRAINT prayer_interactions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.prayer_requests(id) ON DELETE CASCADE,
  CONSTRAINT prayer_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ─── Reading plans ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reading_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  title_key text NOT NULL,
  description_key text,
  duration_days integer NOT NULL,
  category text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  cover_image_url text,
  featured boolean DEFAULT false,
  completion_count integer DEFAULT 0,
  CONSTRAINT reading_plans_pkey PRIMARY KEY (id),
  CONSTRAINT reading_plans_slug_key UNIQUE (slug),
  CONSTRAINT reading_plans_category_check CHECK ((category = ANY (ARRAY['chronological'::text, 'topical'::text, 'book-study'::text, 'devotional'::text, 'custom'::text])))
);

CREATE TABLE IF NOT EXISTS public.reading_plan_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid NOT NULL,
  day_number integer NOT NULL,
  book text NOT NULL,
  chapter_start integer NOT NULL,
  chapter_end integer,
  CONSTRAINT reading_plan_entries_pkey PRIMARY KEY (id),
  CONSTRAINT reading_plan_entries_plan_id_day_number_book_chapter_start_key UNIQUE (plan_id, day_number, book, chapter_start),
  CONSTRAINT reading_plan_entries_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.reading_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_reading_plan_progress (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  plan_id uuid,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_entries jsonb DEFAULT '{}'::jsonb,
  current_day integer DEFAULT 1,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  synced_at timestamp with time zone DEFAULT now(),
  plan_slug text,
  CONSTRAINT user_reading_plan_progress_pkey PRIMARY KEY (id),
  CONSTRAINT user_reading_plan_progress_user_id_plan_id_key UNIQUE (user_id, plan_id),
  CONSTRAINT user_reading_plan_progress_user_id_plan_slug_key UNIQUE (user_id, plan_slug),
  CONSTRAINT user_reading_plan_progress_plan_ref_required CHECK (((plan_id IS NOT NULL) OR (plan_slug IS NOT NULL))),
  CONSTRAINT user_reading_plan_progress_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.reading_plans(id) ON DELETE CASCADE,
  CONSTRAINT user_reading_plan_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.group_reading_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT group_reading_plans_pkey PRIMARY KEY (id),
  CONSTRAINT group_reading_plans_group_id_plan_id_key UNIQUE (group_id, plan_id),
  CONSTRAINT group_reading_plans_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id),
  CONSTRAINT group_reading_plans_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE,
  CONSTRAINT group_reading_plans_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.reading_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_saved_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  saved_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_saved_plans_pkey PRIMARY KEY (id),
  CONSTRAINT user_saved_plans_user_id_plan_id_key UNIQUE (user_id, plan_id),
  CONSTRAINT user_saved_plans_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.reading_plans(id) ON DELETE CASCADE,
  CONSTRAINT user_saved_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- ─── Analytics ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  event_name text NOT NULL,
  event_properties jsonb DEFAULT '{}'::jsonb,
  session_id text,
  device_platform text,
  app_version text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  geo_country_code text,
  geo_region_code text,
  geo_region_name text,
  geo_city text,
  geo_latitude double precision,
  geo_longitude double precision,
  geo_timezone text,
  geo_accuracy_km integer,
  geo_source text,
  received_at timestamp with time zone,
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.user_engagement_summary (
  user_id uuid NOT NULL,
  total_chapters_read integer DEFAULT 0,
  total_listening_minutes integer DEFAULT 0,
  total_sessions integer DEFAULT 0,
  avg_session_minutes numeric(6,2) DEFAULT 0,
  current_streak_days integer DEFAULT 0,
  longest_streak_days integer DEFAULT 0,
  last_active_date date,
  engagement_score integer DEFAULT 0,
  plans_completed integer DEFAULT 0,
  prayers_submitted integer DEFAULT 0,
  annotations_created integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  total_reading_minutes integer DEFAULT 0,
  CONSTRAINT user_engagement_summary_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_engagement_summary_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.analytics_monthly_rollup (
  day date NOT NULL,
  country_code text,
  translation_id text,
  event_family text NOT NULL,
  minutes numeric DEFAULT 0 NOT NULL,
  units integer DEFAULT 0 NOT NULL,
  event_count integer DEFAULT 0 NOT NULL,
  refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT analytics_monthly_rollup_grain UNIQUE NULLS NOT DISTINCT (day, country_code, translation_id, event_family),
  CONSTRAINT analytics_monthly_rollup_event_family_check CHECK ((event_family = ANY (ARRAY['listening'::text, 'reading'::text, 'download'::text])))
);

-- ─── Translations and Bible text ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.translation_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  translation_id text NOT NULL,
  version_number integer NOT NULL,
  changelog text,
  data_checksum text,
  total_books integer,
  total_chapters integer,
  total_verses integer,
  published_at timestamp with time zone DEFAULT now() NOT NULL,
  is_current boolean DEFAULT false,
  CONSTRAINT translation_versions_pkey PRIMARY KEY (id),
  CONSTRAINT translation_versions_translation_id_version_number_key UNIQUE (translation_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.translation_sync_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source text DEFAULT 'upstream-api'::text NOT NULL,
  state text DEFAULT 'running'::text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone,
  triggered_by uuid,
  inserted_count integer DEFAULT 0 NOT NULL,
  updated_count integer DEFAULT 0 NOT NULL,
  failed_count integer DEFAULT 0 NOT NULL,
  message text,
  upstream_endpoint text,
  upstream_payload jsonb,
  result_payload jsonb,
  CONSTRAINT translation_sync_runs_pkey PRIMARY KEY (id),
  CONSTRAINT translation_sync_runs_state_check CHECK ((state = ANY (ARRAY['idle'::text, 'running'::text, 'succeeded'::text, 'failed'::text]))),
  CONSTRAINT translation_sync_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.translation_catalog (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  translation_id text NOT NULL,
  name text NOT NULL,
  abbreviation text NOT NULL,
  language_code text DEFAULT 'en'::text NOT NULL,
  language_name text DEFAULT 'English'::text NOT NULL,
  license_type text,
  license_url text,
  source_url text,
  has_audio boolean DEFAULT false,
  has_text boolean DEFAULT true,
  is_bundled boolean DEFAULT false,
  is_available boolean DEFAULT true,
  sort_order integer DEFAULT 100,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  text_direction text DEFAULT 'ltr'::text,
  catalog jsonb,
  upstream_external_id text,
  upstream_payload jsonb,
  upstream_last_synced_at timestamp with time zone,
  distribution_state text DEFAULT 'draft'::text NOT NULL,
  admin_notes text,
  sync_run_id uuid,
  CONSTRAINT translation_catalog_pkey PRIMARY KEY (id),
  CONSTRAINT translation_catalog_translation_id_key UNIQUE (translation_id),
  CONSTRAINT translation_catalog_distribution_state_check CHECK ((distribution_state = ANY (ARRAY['draft'::text, 'ready'::text, 'published'::text, 'hidden'::text]))),
  CONSTRAINT translation_catalog_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.translation_sync_runs(id) ON DELETE SET NULL
);

-- Manual 2026-08-25 snapshot table; see the table comment below.
CREATE TABLE IF NOT EXISTS public.translation_catalog_availability_backup_2026_08_25 (
  translation_id text,
  is_available boolean,
  backed_up_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.user_translation_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  primary_translation text DEFAULT 'BSB'::text NOT NULL,
  secondary_translation text,
  audio_translation text,
  synced_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_translation_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_translation_preferences_user_id_key UNIQUE (user_id),
  CONSTRAINT user_translation_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Source rows for scripts/export_translation_text_packs.py. The app installs the exported text
-- packs and does not read this table.
CREATE TABLE IF NOT EXISTS public.bible_verses (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  translation_id text NOT NULL,
  book_id text NOT NULL,
  chapter integer NOT NULL,
  verse integer NOT NULL,
  text text NOT NULL,
  heading text,
  formatting jsonb,
  CONSTRAINT bible_verses_pkey PRIMARY KEY (id),
  CONSTRAINT bible_verses_translation_id_book_id_chapter_verse_key UNIQUE (translation_id, book_id, chapter, verse)
);

-- ─── Chapter feedback and translator review ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chapter_feedback_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  translation_id text NOT NULL,
  translation_language text NOT NULL,
  interface_language text NOT NULL,
  content_language_code text,
  content_language_name text,
  book_id text NOT NULL,
  chapter integer NOT NULL,
  sentiment text NOT NULL,
  comment text,
  source_screen text DEFAULT 'reader'::text NOT NULL,
  app_platform text,
  app_version text,
  export_status text DEFAULT 'pending'::text NOT NULL,
  exported_at timestamp with time zone,
  export_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  participant_name text,
  participant_role text,
  participant_id_number text,
  audio_response_bucket text,
  audio_response_path text,
  audio_response_mime_type text,
  audio_response_size_bytes integer,
  audio_response_duration_ms integer,
  audio_response_created_at timestamp with time zone,
  scripture_council_fixed_at timestamp with time zone,
  scripture_council_fixed_by uuid,
  scripture_council_fixed_note text,
  scripture_council_resolution text,
  client_ip_hash text,
  contributor_category text,
  feedback_sequence bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT chapter_feedback_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT chapter_feedback_audio_response_bucket_check CHECK (((audio_response_bucket IS NULL) OR (audio_response_bucket = 'chapter-feedback-audio'::text))),
  CONSTRAINT chapter_feedback_audio_response_duration_check CHECK (((audio_response_duration_ms IS NULL) OR ((audio_response_duration_ms >= 500) AND (audio_response_duration_ms <= 120000)))),
  CONSTRAINT chapter_feedback_audio_response_metadata_check CHECK ((((audio_response_bucket IS NULL) AND (audio_response_path IS NULL) AND (audio_response_mime_type IS NULL) AND (audio_response_size_bytes IS NULL) AND (audio_response_duration_ms IS NULL) AND (audio_response_created_at IS NULL)) OR ((audio_response_bucket IS NOT NULL) AND (audio_response_path IS NOT NULL) AND (audio_response_mime_type IS NOT NULL) AND (audio_response_duration_ms IS NOT NULL) AND (audio_response_created_at IS NOT NULL)))),
  CONSTRAINT chapter_feedback_audio_response_mime_type_check CHECK (((audio_response_mime_type IS NULL) OR (audio_response_mime_type = 'audio/mp4'::text))),
  CONSTRAINT chapter_feedback_audio_response_size_check CHECK (((audio_response_size_bytes IS NULL) OR ((audio_response_size_bytes >= 1) AND (audio_response_size_bytes <= 5242880)))),
  CONSTRAINT chapter_feedback_scripture_council_fixed_note_check CHECK (((scripture_council_fixed_note IS NULL) OR ((char_length(TRIM(BOTH FROM scripture_council_fixed_note)) >= 1) AND (char_length(TRIM(BOTH FROM scripture_council_fixed_note)) <= 1000)))),
  CONSTRAINT chapter_feedback_scripture_council_resolution_check CHECK (((scripture_council_resolution IS NULL) OR (scripture_council_resolution = ANY (ARRAY['fixed'::text, 'no_change_needed'::text])))),
  CONSTRAINT chapter_feedback_scripture_council_resolution_consistency_check CHECK ((((scripture_council_resolution IS NULL) AND (scripture_council_fixed_at IS NULL)) OR ((scripture_council_resolution IS NOT NULL) AND (scripture_council_fixed_at IS NOT NULL)))),
  CONSTRAINT chapter_feedback_submissions_chapter_check CHECK ((chapter >= 1)),
  CONSTRAINT chapter_feedback_submissions_comment_check CHECK (((comment IS NULL) OR ((char_length(TRIM(BOTH FROM comment)) >= 1) AND (char_length(TRIM(BOTH FROM comment)) <= 2000)))),
  CONSTRAINT chapter_feedback_submissions_contributor_category_check CHECK ((contributor_category = ANY (ARRAY['community'::text, 'scripture_council'::text]))),
  CONSTRAINT chapter_feedback_submissions_export_status_check CHECK ((export_status = ANY (ARRAY['pending'::text, 'exported'::text, 'failed'::text]))),
  CONSTRAINT chapter_feedback_submissions_sentiment_check CHECK ((sentiment = ANY (ARRAY['up'::text, 'down'::text]))),
  CONSTRAINT chapter_feedback_submissions_scripture_council_fixed_by_fkey FOREIGN KEY (scripture_council_fixed_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT chapter_feedback_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.translator_review_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ip_hash text NOT NULL,
  succeeded boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT translator_review_attempts_pkey PRIMARY KEY (id)
);

-- ─── Admin content ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  kind text NOT NULL,
  state text DEFAULT 'draft'::text NOT NULL,
  alt_text text NOT NULL,
  caption text,
  storage_bucket text DEFAULT 'content-images'::text NOT NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT content_images_pkey PRIMARY KEY (id),
  CONSTRAINT content_images_kind_check CHECK ((kind = ANY (ARRAY['hero'::text, 'verse_of_day'::text, 'promo'::text, 'feature'::text, 'social'::text]))),
  CONSTRAINT content_images_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'scheduled'::text, 'live'::text, 'archived'::text]))),
  CONSTRAINT content_images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.verse_of_day_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text,
  translation_id text NOT NULL,
  book_id text NOT NULL,
  chapter integer NOT NULL,
  verse integer NOT NULL,
  reference_label text NOT NULL,
  verse_text text NOT NULL,
  reflection text,
  state text DEFAULT 'draft'::text NOT NULL,
  image_id uuid,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT verse_of_day_entries_pkey PRIMARY KEY (id),
  CONSTRAINT verse_of_day_entries_chapter_check CHECK ((chapter >= 1)),
  CONSTRAINT verse_of_day_entries_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'scheduled'::text, 'live'::text, 'archived'::text]))),
  CONSTRAINT verse_of_day_entries_verse_check CHECK ((verse >= 1)),
  CONSTRAINT verse_of_day_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT verse_of_day_entries_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.content_images(id) ON DELETE SET NULL,
  CONSTRAINT verse_of_day_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- Primary-key and unique-constraint indexes are created by the constraints above.

CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_groups_join_code ON public.groups USING btree (join_code);
CREATE INDEX IF NOT EXISTS idx_groups_leader_id ON public.groups USING btree (leader_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_completed_at ON public.group_sessions USING btree (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_sessions_created_by ON public.group_sessions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_group_sessions_group_id ON public.group_sessions USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_active ON public.user_devices USING btree (is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_not_deleted ON public.user_annotations USING btree (user_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_annotations_user_book_chapter ON public.user_annotations USING btree (user_id, book, chapter);
CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON public.user_annotations USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user_synced ON public.user_annotations USING btree (user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_annotations_user_type ON public.user_annotations USING btree (user_id, type);
CREATE INDEX IF NOT EXISTS idx_plan_entries_plan_day ON public.reading_plan_entries USING btree (plan_id, day_number);
CREATE INDEX IF NOT EXISTS idx_plan_entries_plan_id ON public.reading_plan_entries USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_progress_plan ON public.user_reading_plan_progress USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_progress_plan_slug ON public.user_reading_plan_progress USING btree (plan_slug);
CREATE INDEX IF NOT EXISTS idx_user_plan_progress_user ON public.user_reading_plan_progress USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_group_plans_group ON public.group_reading_plans USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_group_reading_plans_assigned_by ON public.group_reading_plans USING btree (assigned_by);
CREATE INDEX IF NOT EXISTS idx_group_reading_plans_plan_id ON public.group_reading_plans USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_group ON public.prayer_requests USING btree (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_user ON public.prayer_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_request ON public.prayer_interactions USING btree (request_id);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_user ON public.prayer_interactions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON public.analytics_events USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON public.analytics_events USING btree (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_geo_location_created ON public.analytics_events USING btree (geo_country_code, geo_region_code, geo_city, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_rpc_events_created ON public.analytics_events USING btree (event_name, created_at) WHERE (event_name = ANY (ARRAY['audio_completed'::text, 'audio_playback_progress'::text, 'reading_ended'::text, 'text_translation_download_completed'::text, 'audio_download_completed'::text]));
CREATE INDEX IF NOT EXISTS idx_analytics_session ON public.analytics_events USING btree (session_id) WHERE (session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_analytics_user_created ON public.analytics_events USING btree (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user_event ON public.analytics_events USING btree (user_id, event_name) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_translation_versions_current ON public.translation_versions USING btree (translation_id) WHERE (is_current = true);
CREATE INDEX IF NOT EXISTS idx_translation_versions_tid ON public.translation_versions USING btree (translation_id);
CREATE INDEX IF NOT EXISTS idx_translation_catalog_available ON public.translation_catalog USING btree (is_available) WHERE (is_available = true);
CREATE INDEX IF NOT EXISTS idx_translation_catalog_distribution_state ON public.translation_catalog USING btree (distribution_state);
CREATE INDEX IF NOT EXISTS idx_translation_catalog_language ON public.translation_catalog USING btree (language_code);
CREATE INDEX IF NOT EXISTS idx_translation_catalog_sync_run_id ON public.translation_catalog USING btree (sync_run_id);
CREATE INDEX IF NOT EXISTS idx_user_translation_prefs_user ON public.user_translation_preferences USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bible_verses_chapter_lookup ON public.bible_verses USING btree (translation_id, book_id, chapter);
CREATE INDEX IF NOT EXISTS idx_bible_verses_translation ON public.bible_verses USING btree (translation_id);
CREATE INDEX IF NOT EXISTS chapter_feedback_review_page_idx ON public.chapter_feedback_submissions USING btree (translation_id, book_id, chapter, sentiment, feedback_sequence DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chapter_feedback_sequence_idx ON public.chapter_feedback_submissions USING btree (feedback_sequence);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_audio_response_created_at ON public.chapter_feedback_submissions USING btree (audio_response_created_at DESC) WHERE (audio_response_path IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_client_ip_hash_created_at ON public.chapter_feedback_submissions USING btree (client_ip_hash, created_at DESC) WHERE (client_ip_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_export_status_created_at ON public.chapter_feedback_submissions USING btree (export_status, created_at);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_language_book_chapter_created_at ON public.chapter_feedback_submissions USING btree (translation_language, book_id, chapter, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_review_summary ON public.chapter_feedback_submissions USING btree (translation_id, book_id, chapter, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_scripture_council_fixed_at ON public.chapter_feedback_submissions USING btree (scripture_council_fixed_at DESC) WHERE (scripture_council_fixed_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_scripture_council_open ON public.chapter_feedback_submissions USING btree (translation_id, book_id, chapter, created_at DESC) WHERE ((sentiment = 'down'::text) AND (scripture_council_fixed_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_scripture_council_unresolved ON public.chapter_feedback_submissions USING btree (translation_id, book_id, chapter) WHERE (scripture_council_resolution IS NULL);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_submissions_scripture_council_fixed_by ON public.chapter_feedback_submissions USING btree (scripture_council_fixed_by);
CREATE INDEX IF NOT EXISTS idx_chapter_feedback_user_created_at ON public.chapter_feedback_submissions USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_translation_sync_runs_started_at ON public.translation_sync_runs USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_sync_runs_triggered_by ON public.translation_sync_runs USING btree (triggered_by);
CREATE INDEX IF NOT EXISTS idx_content_images_kind_state ON public.content_images USING btree (kind, state);
CREATE INDEX IF NOT EXISTS idx_content_images_uploaded_by ON public.content_images USING btree (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_content_images_window ON public.content_images USING btree (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_created_by ON public.verse_of_day_entries USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_image_id ON public.verse_of_day_entries USING btree (image_id);
CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_state_window ON public.verse_of_day_entries USING btree (state, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_verse_of_day_entries_updated_by ON public.verse_of_day_entries USING btree (updated_by);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_user_id ON public.admin_audit_logs USING btree (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_plans_plan_id ON public.user_saved_plans USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_plans_user ON public.user_saved_plans USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_translator_review_attempts_ip_created ON public.translator_review_attempts USING btree (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_monthly_rollup_day ON public.analytics_monthly_rollup USING btree (day);

-- ─── Functions used by triggers and policies ─────────────────────────────────

-- RLS helpers. SECURITY DEFINER so group policies can check membership without recursing
-- through group_members' own SELECT policy.
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members members
    WHERE members.group_id = p_group_id
      AND members.user_id = p_user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_group_leader(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups managed_groups
    WHERE managed_groups.id = p_group_id
      AND managed_groups.leader_id = p_user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_progress (user_id)
  VALUES (NEW.id);

  INSERT INTO public.user_preferences (user_id, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'language', 'en')
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_group_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_feedback_attribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.contributor_category IS DISTINCT FROM OLD.contributor_category
      OR NEW.feedback_sequence IS DISTINCT FROM OLD.feedback_sequence) THEN
    RAISE EXCEPTION 'Feedback attribution and sequence are immutable';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.contributor_category = 'scripture_council'
      AND COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Council attribution requires verified server access';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_group_by_code(group_join_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  requesting_user_id UUID := auth.uid();
  matched_group_id UUID;
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id
  INTO matched_group_id
  FROM public.groups
  WHERE join_code = UPPER(TRIM(group_join_code))
    AND archived_at IS NULL
  LIMIT 1;

  IF matched_group_id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (matched_group_id, requesting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN matched_group_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_group(target_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  requesting_user_id UUID := auth.uid();
  promoted_leader_id UUID;
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = target_group_id
      AND user_id = requesting_user_id
  ) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = target_group_id
    AND user_id = requesting_user_id;

  SELECT user_id
  INTO promoted_leader_id
  FROM public.group_members
  WHERE group_id = target_group_id
  ORDER BY CASE WHEN role = 'leader' THEN 0 ELSE 1 END, joined_at ASC
  LIMIT 1;

  IF promoted_leader_id IS NULL THEN
    DELETE FROM public.groups WHERE id = target_group_id;
    RETURN;
  END IF;

  UPDATE public.group_members
  SET role = CASE WHEN user_id = promoted_leader_id THEN 'leader' ELSE 'member' END
  WHERE group_id = target_group_id;

  UPDATE public.groups
  SET leader_id = promoted_leader_id,
      updated_at = NOW()
  WHERE id = target_group_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  requesting_user_id UUID := auth.uid();
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = requesting_user_id;
END;
$function$;

-- Function EXECUTE grants as they stand in production. Supabase grants EXECUTE on new public
-- functions to PUBLIC, anon, authenticated and service_role by default, so the restricted
-- functions revoke that first. The trigger functions keep the default grants.
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_group_leader(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_leader(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
REVOKE ALL ON FUNCTION public.join_group_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group_by_code(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;

-- ─── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_group_timestamp();
CREATE TRIGGER update_user_devices_updated_at BEFORE UPDATE ON public.user_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON public.user_annotations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_prayer_requests_updated_at BEFORE UPDATE ON public.prayer_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_translation_catalog_updated_at BEFORE UPDATE ON public.translation_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_chapter_feedback_submissions_updated_at BEFORE UPDATE ON public.chapter_feedback_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_content_images_updated_at BEFORE UPDATE ON public.content_images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_verse_of_day_entries_updated_at BEFORE UPDATE ON public.verse_of_day_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER protect_feedback_attribution BEFORE INSERT OR UPDATE ON public.chapter_feedback_submissions FOR EACH ROW EXECUTE FUNCTION public.protect_feedback_attribution();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Every public table has RLS enabled (none forced). Tables with no policies below are
-- reachable only by service_role and the owner.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reading_plan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_reading_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_engagement_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_monthly_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_catalog_availability_backup_2026_08_25 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_translation_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_verses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translator_review_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verse_of_day_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
  WITH CHECK (((select auth.uid()) = id));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (((select auth.uid()) = id));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
  USING (((select auth.uid()) = id));

-- user_progress
CREATE POLICY "Users can insert own progress" ON public.user_progress FOR INSERT
  WITH CHECK (((select auth.uid()) = user_id));
CREATE POLICY "Users can update own progress" ON public.user_progress FOR UPDATE
  USING (((select auth.uid()) = user_id));
CREATE POLICY "Users can view own progress" ON public.user_progress FOR SELECT
  USING (((select auth.uid()) = user_id));

-- user_preferences
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT
  WITH CHECK (((select auth.uid()) = user_id));
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE
  USING (((select auth.uid()) = user_id));
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT
  USING (((select auth.uid()) = user_id));

-- user_devices
CREATE POLICY users_delete_own_devices ON public.user_devices FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY users_insert_own_devices ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));
CREATE POLICY users_select_own_devices ON public.user_devices FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY users_update_own_devices ON public.user_devices FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())));

-- user_annotations
CREATE POLICY annotations_delete_own ON public.user_annotations FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY annotations_insert_own ON public.user_annotations FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));
CREATE POLICY annotations_select_own ON public.user_annotations FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY annotations_update_own ON public.user_annotations FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())));

-- groups
CREATE POLICY "Group members can view groups" ON public.groups FOR SELECT
  USING (public.is_group_member(id, (select auth.uid())));
CREATE POLICY "Leaders can create groups" ON public.groups FOR INSERT
  WITH CHECK ((leader_id = (select auth.uid())));
CREATE POLICY "Leaders can delete groups" ON public.groups FOR DELETE
  USING ((leader_id = (select auth.uid())));
CREATE POLICY "Leaders can update groups" ON public.groups FOR UPDATE
  USING (public.is_group_leader(id, (select auth.uid())))
  WITH CHECK (public.is_group_leader(id, (select auth.uid())));

-- group_members
CREATE POLICY "Group members can view membership" ON public.group_members FOR SELECT
  USING (public.is_group_member(group_id, (select auth.uid())));
CREATE POLICY "Leaders can add group members directly" ON public.group_members FOR INSERT
  WITH CHECK (((user_id = (select auth.uid())) AND public.is_group_leader(group_id, (select auth.uid()))));
CREATE POLICY "Leaders can update membership" ON public.group_members FOR UPDATE
  USING (public.is_group_leader(group_id, (select auth.uid())))
  WITH CHECK (public.is_group_leader(group_id, (select auth.uid())));
CREATE POLICY "Users and leaders can leave groups" ON public.group_members FOR DELETE
  USING (((user_id = (select auth.uid())) OR public.is_group_leader(group_id, (select auth.uid()))));

-- group_sessions
CREATE POLICY "Group members can insert sessions" ON public.group_sessions FOR INSERT
  WITH CHECK (((created_by = (select auth.uid())) AND public.is_group_member(group_id, (select auth.uid()))));
CREATE POLICY "Group members can view sessions" ON public.group_sessions FOR SELECT
  USING (public.is_group_member(group_id, (select auth.uid())));
CREATE POLICY "Session creators can update sessions" ON public.group_sessions FOR UPDATE
  USING ((created_by = (select auth.uid())))
  WITH CHECK ((created_by = (select auth.uid())));

-- prayer_requests
CREATE POLICY prayer_delete_creator_or_leader ON public.prayer_requests FOR DELETE TO authenticated
  USING (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.groups
  WHERE ((groups.id = prayer_requests.group_id) AND (groups.leader_id = (select auth.uid())))))));
CREATE POLICY prayer_insert_member ON public.prayer_requests FOR INSERT TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = prayer_requests.group_id) AND (group_members.user_id = (select auth.uid())))))));
CREATE POLICY prayer_select_member ON public.prayer_requests FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = prayer_requests.group_id) AND (group_members.user_id = (select auth.uid()))))));
CREATE POLICY prayer_update_creator ON public.prayer_requests FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())));

-- prayer_interactions
CREATE POLICY interaction_delete_own ON public.prayer_interactions FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY interaction_insert_member ON public.prayer_interactions FOR INSERT TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM (public.prayer_requests pr
     JOIN public.group_members gm ON ((gm.group_id = pr.group_id)))
  WHERE ((pr.id = prayer_interactions.request_id) AND (gm.user_id = (select auth.uid())))))));
CREATE POLICY interaction_select_member ON public.prayer_interactions FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (public.prayer_requests pr
     JOIN public.group_members gm ON ((gm.group_id = pr.group_id)))
  WHERE ((pr.id = prayer_interactions.request_id) AND (gm.user_id = (select auth.uid()))))));

-- reading_plans / reading_plan_entries
CREATE POLICY plans_select_all ON public.reading_plans FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY plan_entries_select_all ON public.reading_plan_entries FOR SELECT TO anon, authenticated
  USING (true);

-- user_reading_plan_progress
CREATE POLICY plan_progress_delete_own ON public.user_reading_plan_progress FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY plan_progress_insert_own ON public.user_reading_plan_progress FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));
CREATE POLICY plan_progress_select_own ON public.user_reading_plan_progress FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY plan_progress_update_own ON public.user_reading_plan_progress FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())));

-- group_reading_plans
CREATE POLICY group_plans_delete_leader ON public.group_reading_plans FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.groups
  WHERE ((groups.id = group_reading_plans.group_id) AND (groups.leader_id = (select auth.uid()))))));
CREATE POLICY group_plans_insert_leader ON public.group_reading_plans FOR INSERT TO authenticated
  WITH CHECK (((assigned_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.groups
  WHERE ((groups.id = group_reading_plans.group_id) AND (groups.leader_id = (select auth.uid())))))));
CREATE POLICY group_plans_select_member ON public.group_reading_plans FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = group_reading_plans.group_id) AND (group_members.user_id = (select auth.uid()))))));

-- user_saved_plans
CREATE POLICY saved_plans_delete_own ON public.user_saved_plans FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY saved_plans_insert_own ON public.user_saved_plans FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));
CREATE POLICY saved_plans_select_own ON public.user_saved_plans FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));

-- analytics_events / user_engagement_summary
CREATE POLICY events_insert_own ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));
CREATE POLICY events_select_own ON public.analytics_events FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY engagement_select_own ON public.user_engagement_summary FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));

-- translation_versions / translation_catalog
CREATE POLICY versions_select_all ON public.translation_versions FOR SELECT TO authenticated
  USING (true);
CREATE POLICY versions_select_anon ON public.translation_versions FOR SELECT TO anon
  USING (true);
CREATE POLICY catalog_select_all ON public.translation_catalog FOR SELECT TO authenticated
  USING (true);
CREATE POLICY catalog_select_anon ON public.translation_catalog FOR SELECT TO anon
  USING (true);

-- user_translation_preferences
CREATE POLICY translation_prefs_delete_own ON public.user_translation_preferences FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY translation_prefs_insert_own ON public.user_translation_preferences FOR INSERT TO authenticated
  WITH CHECK ((user_id = (select auth.uid())));
CREATE POLICY translation_prefs_select_own ON public.user_translation_preferences FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));
CREATE POLICY translation_prefs_update_own ON public.user_translation_preferences FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())));

-- bible_verses
CREATE POLICY bible_verses_select_anon ON public.bible_verses FOR SELECT TO anon
  USING (true);
CREATE POLICY bible_verses_select_authenticated ON public.bible_verses FOR SELECT TO authenticated
  USING (true);

-- chapter_feedback_submissions (no client INSERT/UPDATE policy; writes use service_role)
CREATE POLICY chapter_feedback_select_own ON public.chapter_feedback_submissions FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));

-- ─── Non-default table grants ────────────────────────────────────────────────
-- Every other public table keeps Supabase's default full grants to anon, authenticated and
-- service_role; RLS above is what limits access.

-- profiles: clients cannot write admin_role. INSERT/UPDATE are granted per column.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT INSERT (id, email, display_name, avatar_url, created_at, updated_at) ON public.profiles TO authenticated;
GRANT UPDATE (id, email, display_name, avatar_url, created_at, updated_at) ON public.profiles TO authenticated;

REVOKE ALL ON public.translation_catalog_availability_backup_2026_08_25 FROM anon, authenticated;

-- ─── Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.translation_catalog_availability_backup_2026_08_25 IS 'Manual 2026-08-25 R2 cutover snapshot of translation_catalog availability flags. RLS enabled with no policies and client roles revoked: service-role / owner access only.';
COMMENT ON COLUMN public.bible_verses.formatting IS 'Optional verse formatting payload for preserved line breaks and poetry indentation.';
COMMENT ON COLUMN public.chapter_feedback_submissions.client_ip_hash IS 'SHA-256 hex digest of the submitting client IP (cf-connecting-ip preferred). Used only to scope the anonymous submission rate limit (S6); never exposed to translator review.';
COMMENT ON COLUMN public.translation_catalog.catalog IS 'Delivery contract for translation text/audio packs consumed by runtime catalog hydration and offline download flows.';
COMMENT ON COLUMN public.profiles.admin_role IS 'Internal admin role for web-platform access. Null means no admin access.';
