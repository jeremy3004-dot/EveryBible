# Supabase Disk IO follow-up

Follow-up to `docs/research/supabase-disk-io-2026-09-15.md`. Checked on September 23, 2026, around 22:50 UTC, against project `ganmududzdzpruvdulkg`. The database was only read: SELECT, non-executing EXPLAIN, `pg_stat_*`, and advisors. Nothing was written, analyzed, vacuumed, or migrated. The preference-sync constraint mismatch is out of scope because another change is handling it.

## Summary

- **The legacy Postgres verse downloader no longer runs.** Current app builds cannot reach it, and nothing has scanned `bible_verses` since July 10. It did not cause the September 11 alert.
- **The text-pack export script still ran the expensive query pattern.** It was the largest single contributor to the recorded temp-file writes. It is fixed in code: it now pages by an id cursor instead of OFFSET.
- **No migrations were written.** The candidate `(translation_id, id)` index is no longer justified; see below.
- The September 11 alert is still unexplained. It needs Supabase's own metric series; SQL counters cannot answer it.

## Is the legacy verse-download path still live?

**App code: it cannot be reached.**

- `downloadCloudTranslation` and `getCloudTranslationVerseCount` in `src/services/bible/cloudTranslationService.ts` are exported but only tests call them.
- `bibleStore.downloadTranslation` has installed only catalog text packs since commit `61ec3345` (April 3, 2026, app version 1.0.0, around build 243). It throws `This Bible is not published to the EveryBible library yet.` when a translation has no pack URL. The comment `// Cloud download from Supabase bible_verses table` in `src/stores/bibleStore.ts` is out of date.
- Nothing under `apps/` (site, admin) or `supabase/functions/` reads `bible_verses`.

**Old installed builds: effectively unreachable too.**

- Builds from before April 3 fell back to Postgres only for a catalog translation that had no text pack. Today `translation_catalog` has exactly 1 available text translation, and it has a pack URL (0 available without one). Of the 28 translations stored in `bible_verses`, only 1 is available, which fits the R2 disconnect of August 25.

**Live counters confirm no traffic since July.**

| Evidence                                                      | Value                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `bible_verses` last index scan (any index)                    | 2026-07-10 16:21 UTC (`idx_bible_verses_translation`)      |
| `bible_verses` last seq scan                                  | 2026-08-19 (22 total; likely a manual/ad-hoc query)        |
| `ORDER BY id LIMIT/OFFSET` statements (3 role/shape variants) | 541 + 929 + 227 = **1,697 calls, unchanged since Sept 15** |
| Unified logs mentioning `bible_verses`, last 24 h             | 0                                                          |

**Where the 10.8 GB of temp writes came from.** The statement shapes identify the callers:

- **anon, explicit column list without `formatting`** (929 calls, 490,899 temp blocks written). This select list matches `scripts/export_translation_text_packs.py` before commit `9d7b84ac` (April 12). No app build used it.
- **anon/authenticated, `select=*`** (227 + 541 calls). These are the app's `downloadCloudTranslation` from before April 3, plus the export script after April 12.

## What was fixed

### 1. Export script: cursor paging instead of OFFSET (commit `44e4c96f`)

`scripts/export_translation_text_packs.py` → `fetch_translation_verses` used `order=id.asc&limit=N&offset=K`. For each page, Postgres fetched every earlier row of the translation and sorted it, and those sorts spilled to temp files. It now requests `id=gt.<last id>`, so each page's sort holds at most `page_size` rows (about 250 KB at 1,000 rows, well under `work_mem` of 3.5 MB). Row content and order are unchanged.

EXPLAIN results (plans only, not executed):

- Old, `engbsb` at OFFSET 25000: index scan over 33,655 rows, then a Sort on `id`.
- New, first page: an index scan on `translation_id` with a top-N sort limited by the LIMIT.
- New, later pages: `bible_verses_pkey` scan starting at `id > cursor` with a `translation_id` filter. Translations sit in contiguous id ranges (checked: each translation's id span equals its row count), so every row the scan reads matches.

Test: `scripts/test_export_translation_text_packs.py` has 4 behavioural cases against a fake PostgREST. The cursor case failed on the old code and passes now.

```bash
python3 -m unittest discover -s scripts -p 'test_export_translation_text_packs.py'
```

This Python test is not part of `npm test`. It follows the pattern of `scripts/test_android_startup_metrics.py`.

### Not changed (deliberately)

- **The dead app downloader** (`downloadCloudTranslation`, `getCloudTranslationVerseCount`) still uses OFFSET paging. It is unreachable, so changing its query would not reduce any I/O. It is a candidate for deletion, together with its tests in `cloudTranslationService.behavior.test.ts`, as dead-code cleanup rather than a Disk IO fix.
- **`user_devices` upsert loop** (1,568,023 calls, 345 MB WAL). The counter is unchanged since Sept 15. The table has 1 row, and its last autovacuum was March 28. This is historical; current code deduplicates.
- **`profiles` upsert on every sync cycle** (`ensureCloudProfile` in `syncService.ts`, about 9.5k HOT updates for 25 users since March). It is harmless at this scale. It was not touched because `syncService.ts` is being edited by the preference-sync fix.
- **`analytics_events`**: 8 indexes, all used, a few MB in total. 179 MB of WAL over 5,773 batched inserts is not a problem at current volume.

## Migrations pending

**None written.** The September 15 note offered a `(translation_id, id)` index as a candidate if the legacy path stayed in use. It is not in use:

- The app path is dead, and the export script no longer needs the index to avoid temp files.
- The index would add about 30 MB. The pkey alone is 19 MB, and the new index cannot deduplicate the way the 5.8 MB single-column `translation_id` index does. That space would go to a table no running client reads, on a Micro instance with 256 MB of shared buffers.

If a Postgres verse download is ever reintroduced, use a cursor query and add the index then:

```sql
CREATE INDEX IF NOT EXISTS idx_bible_verses_translation_id_id
  ON public.bible_verses (translation_id, id);
-- the single-column index becomes a redundant prefix:
DROP INDEX IF EXISTS public.idx_bible_verses_translation;
```

Other observations, none of which justified a migration:

- `bible_verses` statistics are stale. The last autoanalyze was March 24, with 64,295 rows modified since. The planner estimates 1 row for `spavbl`, which really has 31,102. This does not matter while nothing queries the table. Run `ANALYZE public.bible_verses;` before any export run if plans look wrong. It was not run here because this pass was read-only.
- `idx_bible_verses_chapter_lookup (translation_id, book_id, chapter)` is a strict prefix of the unique `(translation_id, book_id, chapter, verse)` key, so it is redundant (10 MB). Dropping it is optional cleanup, not an I/O fix.
- Performance advisor: 0 WARN-level lints. It reports INFO only: 5 tables without a primary key (backup and rollup tables), 30 unused indexes, and Auth limited to 10 absolute connections.

## What to check in the dashboard

1. **Reports → Database → Disk IOPS / Disk throughput.** On Sept 15 these panels showed "Unable to load data". If they load now, look for any spike on September 11 around 15:00 UTC (11:01 AM New York time).
2. **Settings → Infrastructure → Disk IO budget / burst balance** for September 10–11. The email's trigger metric should show up there if anywhere.
3. **Observability → Query performance**, sorted by total time and by temp usage. After the export fix, no `bible_verses ... OFFSET` statement should gain calls. If one does, a pre-April build or an unknown client is hitting PostgREST directly, and the role column will say which.
4. **If none of that explains the alert:** open the support ticket from the Sept 15 note (project ref, email timestamp, and a request for the trigger metric and burst-credit series).
5. **Before any future `export_translation_text_packs.py` run:** optionally run `ANALYZE public.bible_verses` from the SQL editor (see above).
