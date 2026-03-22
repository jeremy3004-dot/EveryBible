# Backend Expansion Research: EveryBible Supabase Features

**Date:** 2026-03-22
**Scope:** 7 backend features — annotations, reading plans, prayer community, analytics, content versioning, storage buckets, theme fix
**Status:** Complete — all repos verified, licenses confirmed, data formats inspected

---

## 1. Bookmarks, Highlights & Notes

### What We Need
- Verse-level annotations (bookmark, highlight with color, freeform notes)
- Offline-first with bidirectional Supabase sync
- Merge strategy: additive (never delete annotations from either side)
- RLS: own annotations only

### Open-Source Findings (Verified)

| Project | License | Stars | Reusable? | Notes |
|---------|---------|-------|-----------|-------|
| [BibleTags RN App](https://github.com/educational-resources-and-services/bibletags-react-native-app) | **MIT** | 3 | **Schema patterns** | RN + Expo, 863 commits. Original-language tagging/parsing. Modular architecture (separate `bibletags-data` repo). No annotation/highlight feature but the verse-reference data model is solid |
| [AndBible](https://github.com/AndBible/and-bible) | **GPL-3.0** | 743 | **Study only** | Kotlin/Android, 12.5k commits, actively maintained (last release Mar 2026). Powerful offline Bible study with bookmarks. GPL means we can study architecture but NOT copy code |
| [Bible Phrasing](https://github.com/theAndrewCline/bible-phrasing) | Open source | Low | **UX patterns** | Web React app for community Bible study with highlight/annotate/rearrange |
| [Bibleify Mobile](https://github.com/sonnylazuardi/bibleify-mobile) | Open source | Moderate | **Offline-first pattern** | RN + Realm for offline Bible data. Reference for local-first storage |

### Verdict: **Build from scratch**
No existing repo has a Supabase-compatible annotation schema with sync. AndBible (GPL) has the most mature annotation system but can't be copied. BibleTags (MIT) is the closest architecturally (RN + Expo) but focuses on original-language tagging, not user annotations.

### Proposed Schema
```sql
user_annotations (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book TEXT NOT NULL,            -- e.g., 'GEN'
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER,             -- NULL for single verse
  type TEXT NOT NULL CHECK (type IN ('bookmark', 'highlight', 'note')),
  color TEXT,                    -- highlight color (nullable)
  content TEXT,                  -- note text (nullable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ         -- soft delete for sync
)
-- Indexes: (user_id), (user_id, book, chapter), (user_id, type)
```

Sync strategy: same additive merge as `chapters_read` — union by composite key `(book, chapter, verse_start, type)`, take latest `updated_at` on conflict. Soft-delete via `deleted_at` so deletions propagate across devices.

---

## 2. Reading Plans

### What We Need
- Pre-seeded plan metadata (title, description, duration, daily chapter assignments)
- User enrollment + daily completion tracking
- Streak/progress within a plan
- Leader can assign plans to groups

### Open-Source Findings (Verified)

| Project | License | Stars | Reusable? | Notes |
|---------|---------|-------|-----------|-------|
| [bible-reading-plan-schema](https://github.com/BibleReadingPlans/bible-reading-plan-schema) | Unlicensed (1 star) | 1 | **YES — JSON schema standard** | Proposed JSON standard for shareable reading plans. Includes M'Cheyne plan. Schema: `title` → `readingTracks[]` → `readingDays[]` → `readingTimes[]` → `passages[]` with `begin.book` + `begin.chapter` |
| [khornberg/readingplans](https://github.com/khornberg/readingplans) | Unlicensed (22 stars, 9 forks) | 22 | **YES — 11 plan datasets** | JSON plans: Back to Bible Chronological, ESV Chronicles & Prophets, ESV Everyday in Word, ESV Gospels & Epistles, ESV Literary Study Bible, ESV Pentateuch & History, ESV Psalms & Wisdom, ESV Through the Bible, Heartlight OT/NT, McHeyne, One Year Chronological. Format: `{data: [string[]], id, abbv, name, info}` |
| [bible-reading-planner](https://github.com/khornberg/bible-reading-planner) | Unlicensed | Low | **Plan generator** | Web tool for custom plans by sequence, amount, and duration |
| [ai-bible-plan-generator](https://github.com/benkaiser/ai-bible-plan-generator) | **MIT** (with charity clause) | 4 | **Reference only** | Rails + TypeScript. LLM-generated plans. Too different architecturally but interesting concept |

### M'Cheyne JSON Schema (Verified Format)
```json
{
  "title": "Robert Murray M'Cheyne's Bible Reading Calendar",
  "abstract": "...",
  "timespan": 365,
  "author": "...",
  "readingTracks": [
    {
      "name": "Family",
      "readingDays": [
        {
          "num": 1,
          "readingTimes": [
            {
              "name": "anytime",
              "passages": [
                { "begin": { "book": "Genesis", "chapter": 1 } }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Verdict: **Hybrid — reuse data, build engine**
The `bible-reading-plan-schema` JSON format is a good standard to adopt. `khornberg/readingplans` has **11 real plan datasets** ready to seed. Both repos are unlicensed (technically restrictive) but the data is factual Bible chapter assignments which aren't copyrightable. We build the Supabase engine and seed with this data plus your custom plans.

### Proposed Schema
```sql
reading_plans (
  id UUID PK DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,          -- 'bible-in-1-year', 'psalms-30-days'
  title_key TEXT NOT NULL,            -- i18n translation key
  description_key TEXT,
  duration_days INTEGER NOT NULL,
  category TEXT,                      -- 'chronological', 'topical', 'book-study'
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

reading_plan_entries (
  id UUID PK DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  book TEXT NOT NULL,
  chapter_start INTEGER NOT NULL,
  chapter_end INTEGER,                -- for multi-chapter days
  UNIQUE (plan_id, day_number, book, chapter_start)
)

user_reading_plan_progress (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_entries JSONB DEFAULT '{}', -- {"1": "2026-03-22T...", "5": "2026-03-26T..."}
  current_day INTEGER DEFAULT 1,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
)

-- Group plan assignments (leader assigns plan to group)
group_reading_plans (
  id UUID PK DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, plan_id)
)
```

---

## 3. Prayer Community (Group-Only)

### What We Need
- Prayer requests scoped to groups
- Prayed-for interaction tracking
- Answered prayer marking
- Group prayer wall feed

### Open-Source Findings (Verified)

| Project | License | Stars | Reusable? | Notes |
|---------|---------|-------|-----------|-------|
| [be-still](https://github.com/cameronapak/be-still) | **MIT No Attribution** | 3 | **UX concept** | Digital prayer room with WebSocket real-time connection. Astro + PartyKit. Web-only. No reusable schema but the prayer room UX concept is interesting |
| [Kevin-Jin/prayer-wall](https://github.com/Kevin-Jin/prayer-wall) | Unlicensed | 0 | **Low** | PHP + JS, 2013-era. Has `database.sql` but barely maintained |
| [ChurchApps/ChumsApp](https://github.com/ChurchApps/ChumsApp) | **MIT** | 124 | **Architecture ref** | TypeScript + Vite, 1.1k commits. Member tracking, attendance, groups, donations. No prayer features but solid church data model |
| [ArrowPrayer](https://github.com/ModularSoftAU/ArrowPrayer) | Open source | Low | **Concept only** | Discord bot for community prayer requests. Not transferable |

### Verdict: **Build from scratch**
No existing project has a reusable prayer request schema for mobile + Supabase. The concept is straightforward — it's just group-scoped posts with interaction counts. Our existing groups system (with RLS) does the heavy lifting.

### Proposed Schema
```sql
prayer_requests (
  id UUID PK DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
  is_answered BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

prayer_interactions (
  id UUID PK DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('prayed', 'encouraged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, user_id, type)  -- one pray/encourage per user per request
)
-- Indexes: prayer_requests(group_id, created_at DESC), prayer_interactions(request_id)
```

RLS:
- **SELECT**: group members can view requests and interactions for their groups
- **INSERT requests**: group members can create requests in their groups
- **UPDATE requests**: only request creator can edit content or mark answered
- **DELETE requests**: request creator OR group leader
- **INSERT interactions**: any group member can pray/encourage
- **DELETE interactions**: only the interacting user (un-pray)

---

## 4. Analytics & Engagement Metrics

### What We Need
- Client-side event emission (chapter opened, time spent, feature used)
- Server-side aggregation (DAU, retention, streaks, engagement scores)
- User-facing engagement metrics (reading stats, streaks, achievements)
- Admin/leader insights (optional, future)

### Open-Source Findings (Verified)

| Project | License | Stars | Reusable? | Notes |
|---------|---------|-------|-----------|-------|
| [OpenPanel](https://github.com/Openpanel-dev/openpanel) | **AGPL-3.0** | 5.5k | **Too heavy** | Requires ClickHouse + PostgreSQL + Redis + BullMQ. Has React Native SDK but AGPL license is restrictive. Overkill for our scale |
| [PostHog](https://github.com/PostHog/posthog) | **MIT** | 25k+ | **Too heavy** | PG + ClickHouse + Kafka + Redis. Incredible feature set but massive infra requirements |
| [Umami](https://github.com/umami-software/umami) | **MIT** | 23k+ | **Possible** | PostgreSQL-native, simple. Web-focused but custom events work. Could run alongside Supabase PG. Lightest external option |
| Supabase native | N/A | N/A | **Best fit** | PostgreSQL tables + Edge Functions for aggregation. Zero external infra, fits our architecture |

### Verdict: **Build lightweight on Supabase**
OpenPanel (AGPL, needs ClickHouse) and PostHog (needs 4+ services) are overkill. Umami is tempting (MIT, PG-native) but adds deployment complexity. At our scale, PostgreSQL tables + a daily Edge Function cron is the right answer. We can always migrate to Umami or OpenPanel later if we outgrow this.

### Proposed Schema
```sql
analytics_events (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,               -- 'chapter_opened', 'audio_played', 'plan_day_completed'
  event_properties JSONB DEFAULT '{}',    -- {"book": "GEN", "chapter": 1, "duration_ms": 45000}
  session_id TEXT,                         -- client-generated UUID per app session
  device_platform TEXT,                    -- 'ios', 'android'
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
-- Indexes: (event_name, created_at), (user_id, created_at), (created_at) for partition pruning

-- Materialized summary (refreshed by Edge Function daily cron)
user_engagement_summary (
  user_id UUID PK REFERENCES profiles(id) ON DELETE CASCADE,
  total_chapters_read INTEGER DEFAULT 0,
  total_listening_minutes INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  avg_session_minutes NUMERIC(6,2) DEFAULT 0,
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  engagement_score INTEGER DEFAULT 0,     -- computed 0-100
  plans_completed INTEGER DEFAULT 0,
  prayers_submitted INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**Edge Function** (daily cron):
1. Aggregate per-user metrics from `analytics_events` (last 24h + running totals)
2. Compute engagement score: reading 35%, listening 25%, streak 20%, plans 10%, community 10%
3. Upsert into `user_engagement_summary`

**Client service** (`analyticsService.ts`):
- Batch events locally (queue in AsyncStorage)
- Flush to Supabase on sync intervals or when batch hits 20 events
- Fire-and-forget — analytics failures never block the UI

**Event taxonomy** (standardized names):
- `chapter_opened`, `chapter_completed`, `audio_played`, `audio_completed`
- `plan_started`, `plan_day_completed`, `plan_completed`
- `prayer_submitted`, `prayer_interaction`, `group_joined`
- `annotation_created`, `bookmark_created`, `note_created`
- `session_started`, `session_ended`

---

## 5. Content Versioning / Multiple Translations

### What We Need
- Translation metadata catalog (beyond what Phase 14 builds)
- Version tracking for content updates
- User translation preferences per context
- Comparison mode support (future)

### Open-Source Findings (Verified)

| Project | License | Stars | Reusable? | Notes |
|---------|---------|-------|-----------|-------|
| [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | **MIT** | 1.5k | **YES — Primary source** | 140+ translations in MySQL/SQLite/JSON/CSV/YAML/TXT/MD. Schema: `books(id, name)`, `verses(id, book_id, chapter, verse, text)`, `translations(translation, title, license)`, `cross_references(from/to + votes)`. Cross-refs from openbible.info. Includes ASV, KJV, WEB, YLT, BBE + dozens of non-English translations |
| [wldeh/bible-api](https://github.com/wldeh/bible-api) | **MIT** | 458 | **YES — CDN source** | 200+ versions via jsDelivr CDN. Endpoints: `/bibles/{version}/books/{book}/chapters/{chapter}.json`. No self-hosting but great for runtime catalog discovery |
| [Free Use Bible API (AO Lab)](https://faith.tools/app/288-free-use-bible-api) | Open source (501c3) | 108 | **YES — 1000+ translations** | No API keys, no limits, no copyright restrictions. Active Feb 2026. Powers faith.tools Bible MCP. Could serve as upstream catalog |
| [seven1m/open-bibles](https://github.com/seven1m/open-bibles) | Public domain / libre | Moderate | **YES — PD translations** | Public domain and freely licensed translations in standard XML (OSIS). Clean, vetted sources |
| [biblenerd/awesome-bible-developer-resources](https://github.com/biblenerd/awesome-bible-developer-resources) | N/A | Moderate | **Reference list** | Comprehensive curated list of Bible APIs, databases, tools, format standards (USFM, USX, OSIS, TEI). Includes STEPBible Data (CC BY 4.0), Sefaria (free), SWORD Project (GPL), unfoldingWord (CC BY-SA 4.0) |

### Verdict: **Extend Phase 14 + use scrollmapper as primary data source**
Phase 14 already builds the runtime translation catalog and signed manifest system. We extend it with versioning and user preferences. **scrollmapper/bible_databases** (MIT, 1.5k stars) is the primary data source — it has our exact schema format needs and 140+ translations ready to import.

### Proposed Schema
```sql
-- Extend Phase 14 catalog with versioning
translation_versions (
  id UUID PK DEFAULT gen_random_uuid(),
  translation_id TEXT NOT NULL,       -- 'BSB', 'WEB', 'KJV'
  version_number INTEGER NOT NULL,
  changelog TEXT,
  data_checksum TEXT,                  -- SHA-256 of the SQLite pack
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN DEFAULT false,
  UNIQUE (translation_id, version_number)
)

-- User translation preferences (synced)
user_translation_preferences (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  primary_translation TEXT NOT NULL DEFAULT 'BSB',
  secondary_translation TEXT,          -- for comparison mode
  audio_translation TEXT,              -- preferred audio source
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
)
```

### Data Sourcing Pipeline
1. **scrollmapper/bible_databases** → import public-domain translations (ASV, KJV, WEB, YLT, BBE) as SQLite packs via Phase 14's pack system
2. **wldeh/bible-api** CDN → runtime catalog discovery (what translations exist, metadata)
3. **Free Use Bible API** → potential future upstream for 1000+ translations
4. **seven1m/open-bibles** → vetted public-domain translations in standard XML formats

---

## 6. Storage Buckets

### What We Need
- Profile avatar uploads
- Group images
- Shared study materials (future)
- Proper RLS on buckets

### Open-Source Findings (Verified)

| Resource | Type | Notes |
|----------|------|-------|
| [Supabase Blog: RN file upload](https://supabase.com/blog/react-native-storage) | **Official tutorial** | Complete guide: bucket setup, RLS policies using `storage.foldername(name)` for user-scoped folders, expo-image-picker integration |
| [Supabase Docs: Expo User Management](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native) | **Official tutorial** | Full avatar upload example with auth + storage. Uses `(select auth.uid())::text` in RLS |
| [saimon24/react-native-resumable-upload-supabase](https://github.com/saimon24/react-native-resumable-upload-supabase) | **Example repo** | Resumable uploads for large files. Good for future shared materials |

### Verdict: **Follow Supabase official patterns**
Well-documented, battle-tested. No custom work needed beyond the migration.

### Dependencies Needed
- `expo-image-picker` (already in Expo SDK)
- `expo-file-system` (already in Expo SDK)
- `base64-arraybuffer` (for image data conversion)

### Proposed Migration
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('group-images', 'group-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('study-materials', 'study-materials', false);

-- Avatars: user-scoped folders
CREATE POLICY "avatar_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "avatar_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "avatar_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (select auth.uid())::text);

CREATE POLICY "avatar_select" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

-- Group images: leader-scoped folders (folder name = group UUID)
CREATE POLICY "group_image_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
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

-- Study materials: group-member scoped (future)
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
```

---

## 7. Low-Light Theme Fix

### The Bug
`user_preferences.theme` CHECK constraint allows only `'dark'` and `'light'`. App now supports `'low-light'` (Phase 15 reverential theme). On sync, low-light value is rejected by PostgreSQL → **silent sync failure or data corruption**.

### Fix (1 migration file)
```sql
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_theme_check;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_theme_check
  CHECK (theme IN ('dark', 'light', 'low-light'));
```

### Verdict: **Do first — blocking bug**

---

## Summary: Build vs. Reuse Decision Matrix

| Feature | Verdict | Reusable Assets | Build Effort |
|---------|---------|-----------------|-------------|
| Theme Fix | **Fix (trivial)** | N/A | 1 migration |
| Storage Buckets | **Follow docs** | Supabase official patterns | 1 migration + service |
| Annotations | **Build** | BibleTags (MIT) schema patterns | Medium — schema + sync + UI |
| Reading Plans | **Hybrid** | khornberg plan data (11 plans), bible-reading-plan-schema format | Medium — schema + seed + UI |
| Prayer Community | **Build** | Extends existing groups system | Low-Medium — schema + feed UI |
| Analytics | **Build lightweight** | Supabase PG + Edge Functions | Medium — events + aggregation + dashboard |
| Content Versioning | **Extend Phase 14** | scrollmapper (MIT, 140+ translations), wldeh/bible-api (MIT, CDN) | Medium — versioning + preferences |

### Key License Summary
| Project | License | Can We Use? |
|---------|---------|-------------|
| scrollmapper/bible_databases | **MIT** | YES — freely |
| BibleTags RN App | **MIT** | YES — study patterns |
| wldeh/bible-api | **MIT** | YES — as data source |
| ChurchApps/ChumsApp | **MIT** | YES — architecture reference |
| be-still | **MIT No Attribution** | YES — freely |
| AndBible | **GPL-3.0** | Study only — cannot copy code |
| OpenPanel | **AGPL-3.0** | Avoid — copyleft |
| PostHog | **MIT** | YES but too heavy |
| Umami | **MIT** | YES — future option |
| khornberg/readingplans | Unlicensed | Data is factual (not copyrightable) |
| bible-reading-plan-schema | Unlicensed | Schema standard (not copyrightable) |

---

## Sources

### Bible & Annotations
- [BibleTags React Native App](https://github.com/educational-resources-and-services/bibletags-react-native-app) — MIT, RN + Expo
- [AndBible](https://github.com/AndBible/and-bible) — GPL-3.0, Kotlin, 743 stars
- [Bible Phrasing](https://github.com/theAndrewCline/bible-phrasing) — React web
- [Bibleify Mobile](https://github.com/sonnylazuardi/bibleify-mobile) — RN + Realm

### Reading Plans
- [BibleReadingPlans/bible-reading-plan-schema](https://github.com/BibleReadingPlans/bible-reading-plan-schema) — JSON standard
- [khornberg/readingplans](https://github.com/khornberg/readingplans) — 11 plans in JSON
- [khornberg/bible-reading-planner](https://github.com/khornberg/bible-reading-planner) — Plan generator
- [ai-bible-plan-generator](https://github.com/benkaiser/ai-bible-plan-generator) — MIT, LLM-generated plans

### Prayer & Community
- [be-still](https://github.com/cameronapak/be-still) — MIT No Attribution, digital prayer room
- [Kevin-Jin/prayer-wall](https://github.com/Kevin-Jin/prayer-wall) — PHP prayer wall
- [ChurchApps/ChumsApp](https://github.com/ChurchApps/ChumsApp) — MIT, church management
- [ArrowPrayer](https://github.com/ModularSoftAU/ArrowPrayer) — Discord prayer bot

### Analytics
- [OpenPanel](https://github.com/Openpanel-dev/openpanel) — AGPL-3.0, 5.5k stars
- [PostHog](https://github.com/PostHog/posthog) — MIT, 25k+ stars
- [Umami](https://github.com/umami-software/umami) — MIT, 23k+ stars

### Content & Translations
- [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) — MIT, 1.5k stars, 140+ translations
- [wldeh/bible-api](https://github.com/wldeh/bible-api) — MIT, 458 stars, 200+ versions
- [Free Use Bible API (AO Lab)](https://faith.tools/app/288-free-use-bible-api) — 1000+ translations
- [seven1m/open-bibles](https://github.com/seven1m/open-bibles) — Public domain translations
- [biblenerd/awesome-bible-developer-resources](https://github.com/biblenerd/awesome-bible-developer-resources) — Curated list

### Curated Lists
- [mattrob33/christian-projects](https://github.com/mattrob33/christian-projects) — Christian open source directory
- [meichthys/christian_foss](https://github.com/meichthys/christian_foss) — Christian FOSS directory

### Storage & Infrastructure
- [Supabase Blog: RN file upload](https://supabase.com/blog/react-native-storage) — Official tutorial
- [Supabase Docs: Expo User Management](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native) — Avatar upload
- [saimon24/react-native-resumable-upload-supabase](https://github.com/saimon24/react-native-resumable-upload-supabase) — Resumable uploads
