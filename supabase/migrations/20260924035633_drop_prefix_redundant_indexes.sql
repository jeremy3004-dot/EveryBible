-- Performance advisor cleanup (2026-09-24): indexes that are a leading-column prefix of
-- another index on the same table.
-- docs/research/supabase-advisors-cleanup-2026-09-24.md
--
-- A btree on (a, b, c) serves every equality or range lookup, and every ORDER BY, on (a) or
-- (a, b) that a separate (a) or (a, b) index serves. Each index below is such a prefix of a
-- kept index (almost always a UNIQUE constraint index that must stay anyway), so it only adds
-- write cost, WAL and buffer pressure. Three of them are also on the unused_index advisor list.
--
-- | Dropped                                   | Covered by (kept)                                            | scans* | rows  |
-- |-------------------------------------------|--------------------------------------------------------------|--------|-------|
-- | group_reading_plans.idx_group_plans_group (group_id) | UNIQUE (group_id, plan_id)                        | 0      | 0     |
-- | prayer_interactions.idx_prayer_interactions_request (request_id) | UNIQUE (request_id, user_id, type)    | 0      | 0     |
-- | user_annotations.idx_annotations_user_id (user_id) | idx_annotations_user_type (user_id, type) and 3 more | 0   | 0     |
-- | user_devices.idx_user_devices_user_id (user_id) | UNIQUE (user_id, push_token)                         | 22     | 1     |
-- | user_reading_plan_progress.idx_user_plan_progress_user (user_id) | UNIQUE (user_id, plan_slug) / (user_id, plan_id) | 117 | 15 |
-- | user_saved_plans.idx_user_saved_plans_user (user_id) | UNIQUE (user_id, plan_id)                       | 5      | 0     |
-- | translation_versions.idx_translation_versions_tid (translation_id) | UNIQUE (translation_id, version_number) | 7 | 37 |
-- | reading_plan_entries.idx_plan_entries_plan_id (plan_id) | UNIQUE (plan_id, day_number, book, chapter_start) | 1 | 2,793 |
-- | reading_plan_entries.idx_plan_entries_plan_day (plan_id, day_number) | same UNIQUE                   | 12     | 2,793 |
-- | analytics_monthly_rollup.idx_analytics_monthly_rollup_day (day) | UNIQUE analytics_monthly_rollup_grain (day, country_code, translation_id, event_family) | 108 | ~620 |
-- | bible_verses.idx_bible_verses_chapter_lookup (translation_id, book_id, chapter), 10 MB | UNIQUE (translation_id, book_id, chapter, verse) | 200, last 2026-04-03 | ~870k |
-- * idx_scan since stats reset 2025-12-08 (pg_stat_user_indexes, read 2026-09-24).
--
-- Foreign keys: every FK whose referencing column one of these covered is still covered by the
-- kept index (live check: group_reading_plans_group_id_fkey, prayer_interactions_request_id_fkey,
-- user_annotations_user_id_fkey, user_saved_plans_user_id_fkey, reading_plan_entries_plan_id_fkey
-- all have a remaining index led by the FK column), so unindexed_foreign_keys stays clear.
--
-- Deliberately kept: bible_verses.idx_bible_verses_translation (translation_id). It is also a
-- prefix of the unique key, but the text-pack export pages by translation_id and the single
-- column index is ~10x smaller than the 55 MB unique key; the disk-IO follow-up
-- (docs/research/supabase-disk-io-followup-2026-09-24.md) keeps it until a
-- (translation_id, id) index replaces it.
--
-- Safety: the DO block drops an index only if, at apply time, a valid btree on the same table
-- (not in this drop list) still has exactly its key columns as a leading prefix with the same
-- opclass, collation and sort option; and the index does not back a constraint, is not the
-- replica identity and is not clustered. Otherwise it keeps it and raises a NOTICE (for
-- example if a concurrent change removed a unique key). Re-running the file is a no-op.
--
-- Not CONCURRENTLY: DROP INDEX CONCURRENTLY cannot run inside the migration transaction. A
-- plain DROP INDEX holds ACCESS EXCLUSIVE on each table for milliseconds; nothing reads
-- bible_verses (last index scan of the chapter index was 2026-04-03). lock_timeout makes the
-- migration fail fast instead of queueing behind a long transaction. For zero locking, run
-- each as `drop index concurrently if exists public.<name>;` outside a transaction instead.
-- No app change needed.

set lock_timeout = '5s';

do $$
declare
  v_names text[] := array[
    'idx_group_plans_group',
    'idx_prayer_interactions_request',
    'idx_annotations_user_id',
    'idx_user_devices_user_id',
    'idx_user_plan_progress_user',
    'idx_user_saved_plans_user',
    'idx_translation_versions_tid',
    'idx_plan_entries_plan_id',
    'idx_plan_entries_plan_day',
    'idx_analytics_monthly_rollup_day',
    'idx_bible_verses_chapter_lookup'
  ];
  v_name text;
  v_idx oid;
  v_cover text;
begin
  foreach v_name in array v_names loop
    v_idx := to_regclass(format('public.%I', v_name));
    if v_idx is null then
      raise notice 'skip %: already dropped', v_name;
      continue;
    end if;

    -- A valid btree on the same table whose leading key columns (same opclass, collation and
    -- sort option) are exactly this index's key columns, and which is not itself being dropped.
    select cover_class.relname into v_cover
    from pg_index redundant
    join pg_class redundant_class on redundant_class.oid = redundant.indexrelid
    join pg_index cover on cover.indrelid = redundant.indrelid
      and cover.indexrelid <> redundant.indexrelid
    join pg_class cover_class on cover_class.oid = cover.indexrelid
    where redundant.indexrelid = v_idx
      and redundant_class.relam = (select oid from pg_am where amname = 'btree')
      and cover_class.relam = redundant_class.relam
      and redundant.indpred is null and redundant.indexprs is null
      and redundant.indnatts = redundant.indnkeyatts
      and not redundant.indisunique
      and not redundant.indisreplident and not redundant.indisclustered
      and not exists (select 1 from pg_constraint k where k.conindid = redundant.indexrelid)
      and cover.indisvalid and cover.indisready and cover.indislive
      and cover.indpred is null and cover.indexprs is null
      and cover.indnkeyatts >= redundant.indnkeyatts
      and (cover.indkey::int2[])[0:redundant.indnkeyatts - 1]
          = (redundant.indkey::int2[])[0:redundant.indnkeyatts - 1]
      and (cover.indclass::oid[])[0:redundant.indnkeyatts - 1]
          = (redundant.indclass::oid[])[0:redundant.indnkeyatts - 1]
      and (cover.indcollation::oid[])[0:redundant.indnkeyatts - 1]
          = (redundant.indcollation::oid[])[0:redundant.indnkeyatts - 1]
      and (cover.indoption::int2[])[0:redundant.indnkeyatts - 1]
          = (redundant.indoption::int2[])[0:redundant.indnkeyatts - 1]
      and cover_class.relname <> all (v_names)
    order by cover.indisunique desc, cover.indnkeyatts
    limit 1;

    if v_cover is null then
      raise notice 'kept %: no valid covering index found', v_name;
      continue;
    end if;

    execute format('drop index if exists public.%I', v_name);
    raise notice 'dropped % (covered by %)', v_name, v_cover;
  end loop;
end
$$;

reset lock_timeout;

-- Verification (run after applying): returns 0 rows.
--   select indexrelname from pg_stat_user_indexes where schemaname = 'public' and indexrelname in
--     ('idx_group_plans_group', 'idx_prayer_interactions_request', 'idx_annotations_user_id',
--      'idx_user_devices_user_id', 'idx_user_plan_progress_user', 'idx_user_saved_plans_user',
--      'idx_translation_versions_tid', 'idx_plan_entries_plan_id', 'idx_plan_entries_plan_day',
--      'idx_analytics_monthly_rollup_day', 'idx_bible_verses_chapter_lookup');
--   -- and the unindexed_foreign_keys advisor stays empty (every FK these covered is still led
--   -- by a kept unique index).
