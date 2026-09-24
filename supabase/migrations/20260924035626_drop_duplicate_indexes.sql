-- Performance advisor cleanup (2026-09-24): exact duplicate indexes.
-- docs/research/supabase-advisors-cleanup-2026-09-24.md
--
-- Each index below has the same single key column, opclass and sort order as a UNIQUE
-- constraint index on the same table. The unique index answers every query the plain one
-- can, with the same plan shape, so the plain copy is pure write and cache overhead. The
-- advisor's duplicate_index lint misses these because one side backs a constraint.
--
-- | Dropped (plain btree)             | Kept (UNIQUE constraint index)            | scans since 2025-12-08 |
-- |-----------------------------------|-------------------------------------------|------------------------|
-- | groups.idx_groups_join_code       | groups_join_code_key (join_code)          | 0 (also unused_index)  |
-- | user_preferences.idx_user_preferences_user_id | user_preferences_user_id_key (user_id) | 72 |
-- | user_progress.idx_user_progress_user_id       | user_progress_user_id_key (user_id)    | 6,541 |
-- | user_translation_preferences.idx_user_translation_prefs_user | user_translation_preferences_user_id_key (user_id) | 455 |
--
-- The scan counts on the dropped copies move to the unique index; the planner picks the
-- smaller of two identical indexes, and both are 16 kB here. ON CONFLICT (user_id) upserts
-- infer the UNIQUE index, never the plain one, so the sync upserts are unaffected.
--
-- Safety: the DO block drops an index only if, at apply time, a valid btree on the same table
-- still covers exactly its key columns, the index does not back a constraint, is not the
-- replica identity and is not clustered. Otherwise it keeps it and raises a NOTICE. Re-running
-- the file is a no-op.
--
-- Not CONCURRENTLY: DROP INDEX CONCURRENTLY cannot run inside the migration transaction. A
-- plain DROP INDEX holds ACCESS EXCLUSIVE on each table for milliseconds (all four tables are
-- under 30 rows). lock_timeout makes the migration fail fast instead of queueing behind a long
-- transaction. If the lead prefers zero locking, run instead, outside a transaction:
--   drop index concurrently if exists public.idx_user_progress_user_id;  -- etc.
-- No app change needed.

set lock_timeout = '5s';

do $$
declare
  v_names text[] := array[
    'idx_groups_join_code',
    'idx_user_preferences_user_id',
    'idx_user_progress_user_id',
    'idx_user_translation_prefs_user'
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
--     ('idx_groups_join_code', 'idx_user_preferences_user_id', 'idx_user_progress_user_id',
--      'idx_user_translation_prefs_user');
