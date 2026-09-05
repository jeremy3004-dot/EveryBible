# Every Language map data research

Research and public-data snapshot date: **2026-09-05** (UTC; the API response dates were 11:44–12:00 UTC). The map is publicly reachable at [map.everylanguage.com/map](https://map.everylanguage.com/map).

The public map is a Next.js application using MapLibre for the map and a Supabase PostgREST project for its data. The Supabase project is `mmcvtfxzntimcjfncdea` at `https://mmcvtfxzntimcjfncdea.supabase.co`. The browser frontend includes a public Supabase anon header, which was used only for these read requests. No credential string is included in this report or in the checked-in snapshots.

## Findings for the build contract

- The complete active language hierarchy is available in one public table response: **35,348 entities**.
- The hierarchy has **12,835 language**, **22,449 dialect**, **63 family**, and **1 mother_tongue** rows. The active rows have 12,455 null parents.
- The world language coordinate RPC returns **8,590** map rows. It includes the internal entity UUID, name, country/region UUID and name, latitude/longitude, location source, external IDs, and Bible/media flags.
- The world people-group coordinate RPC returns **16,368** map rows for **10,403 unique people-group IDs** across 238 regions. The people-group source tables contain 10,404 canonical groups, so one group has no coordinate row.
- Language profiles are aggregate `language_stats` rows, not narrative bios. They include population, country and people-group counts, Bible/media flags, religion context, external IDs, computed years, and links to GRN, FCBH, and Joshua Project resources.
- The map's country view returns **242** countries with simplified GeoJSON boundaries and language Scripture aggregates. The active region hierarchy has **281 rows**: 252 countries, 22 world regions, and 7 continents. `region_stats.region_id` is the exact join to `regions.id`; every country `region_stats` row has an `iso2` and `iso3`.
- All current computed language and region statistics carry `computed_at = 2026-09-05T11:30:00.254136+00:00`.
- The map's dashboard totals are a separate one-row public view. The snapshot records 35,348 languages, 782 full audio Bibles, 7,084 audio-portion languages, 6,054 text-portion languages, 9 active projects, 1 completed project, and 3,460 completed chapters.

The raw response snapshots are gzip-compressed JSON arrays in `data/language-atlas/sources/`. Their checksums, row counts, request URLs, response fields, and notes are in [everylanguage-snapshot-manifest.json](../../../data/language-atlas/sources/everylanguage-snapshot-manifest.json). Decompress with `gzip -dc path.json.gz | jq`.

## Exact joins and external IDs

Use UUIDs as canonical joins and retain every provider mapping beside the canonical record. Do not join these records by display name.

| Canonical record | Exact join fields | Snapshot |
| --- | --- | --- |
| Language entity | `language_entities.id` | `everylanguage-language-entities.json.gz` |
| Language profile | `language_stats.language_entity_id` → `language_entities.id` | `everylanguage-language-stats.json.gz` |
| Language coordinate | `language_entity_id` → `language_entities.id` | `everylanguage-language-coordinates.json.gz` |
| Language-to-region | `language_entities_regions.language_entity_id`, `region_id` | `everylanguage-language-entities-regions.json.gz` |
| Language external ID | `language_entity_sources.language_entity_id` plus `external_id_type`, `external_id`, `source`, `version` | `everylanguage-language-entity-sources.json.gz` |
| People group | `people_groups.id` | `everylanguage-people-groups.json.gz` |
| People-group profile | `people_groups_stats.people_group_id` → `people_groups.id` | `everylanguage-people-groups-stats.json.gz` |
| People-group coordinate | `people_group_id` → `people_groups.id` | `everylanguage-people-coordinates.json.gz` |
| People-group-to-region | `people_groups_regions.people_group_id`, `region_id` | `everylanguage-people-groups-regions.json.gz` |
| People-group external ID | `people_groups_sources.people_group_id` plus `external_id_type`, `external_id`, `source`, `version` | `everylanguage-people-groups-sources.json.gz` |
| Country/region | `region_stats.region_id` → `regions.id`; `region_stats.iso2`/`iso3` are explicit codes | `everylanguage-region-stats.json.gz`, `everylanguage-regions.json.gz` |

A representative `language_entity_sources` record is:

```json
{
  "language_entity_id": "000121a4-ddc2-4d5d-820c-46ee77b42efa",
  "external_id_type": "iso-639-3",
  "external_id": "pom",
  "source": "SIL",
  "version": "2025",
  "is_external": true,
  "created_at": "2025-08-05T22:45:59.944872+00:00",
  "deleted_at": null
}
```

The same entity also has `joshua_project`/`iso-639-3` and `jp`/`iso639_3` mappings in the snapshot. The full 70,280-row source crosswalk contains these type/provider counts:

| Source/type | Rows |
| --- | ---: |
| `grn` / `grn_language_id` | 23,726 |
| `SIL` / `iso-639-3` | 7,923 |
| `SIL` / `iso-639-1` | 184 |
| `jp` / `iso639_3` | 7,134 |
| `joshua_project` / `iso-639-3` | 7,134 |
| `GRN` / `rolv_code` | 12,094 |
| `IETF` / `bcp-47` | 12,085 |

All 35,348 language entity IDs have at least one active external source row. The spelling and source differences are meaningful for provenance: preserve the original `external_id_type` and `source`, and use a derived provider-specific crosswalk if the EveryBible registry needs one.

The people-group crosswalk is public at the same API project even though it was not referenced by the map bundle's table-name list. It has **26,773** active rows for **10,404** groups: 10,404 `jp_people_id3` values and 16,369 `jp_people_id3_rog3` values, all from `Joshua Project`. A representative group has `people_groups.people_id3 = 11613`, source `external_id = "11613"`, and a region-level ROG3 value such as `11613PP`. Keep the numeric base ID and the string source value as separate fields when normalizing.

For countries, `region_stats` is the explicit code relation. It has 252 rows, 252 `iso2` values, and 252 `iso3` values. It also includes Joshua Project's `rog3`, which is a different provider code. For example, Nepal joins by `region_id = 6a2f60b7-c438-41c1-8eff-b55226da2607`, with `iso2 = NP`, `iso3 = NPL`, and `rog3 = NP`.

Preserve the provider conflict for the `W. Sahara` row rather than forcing a single country code: the Every Language `region_stats` row has `iso2 = PS`, `iso3 = PSE`, and `rog3 = WE`, while the direct Joshua Project country crosswalk used by the importer identifies the ROG mapping as `WI → EH`. Ten `people_groups_regions` records for this region carry `people_id3_rog3` values ending in `WI`. Keep the raw Every Language values and the direct Joshua Project mapping in separate provenance fields, and use the direct JP country crosswalk for JP joins.

## Response contracts

The following requests were made against the public Supabase REST project. Table responses were requested with `Prefer: count=exact`; RPC responses do not expose an exact total in `Content-Range`, so their snapshot array lengths are the observed totals.

### Languages

`GET /rest/v1/language_entities?select=id,parent_id,name,level,created_at,updated_at,deleted_at&deleted_at=is.null&order=id.asc&limit=50000` returned 35,348 rows (`Content-Range: 0-35347/35348`). Fields are `id`, `parent_id`, `name`, `level`, `created_at`, `updated_at`, and `deleted_at`.

`GET /rest/v1/language_entity_sources?...&deleted_at=is.null&is_external=eq.true&...&limit=50000` returned the first 50,000 of 70,280 rows; `offset=50000&limit=50000` returned the remaining 20,280. The combined snapshot is ordered by `language_entity_id` and retains `external_id_type`, `external_id`, `source`, `version`, `is_external`, and timestamps.

`GET /rest/v1/language_stats?select=*&limit=40000` returned 35,348 rows. The profile fields are:

```text
language_entity_id, language_name, iso639_3, rolv_code,
bible_status, has_full_audio_bible, has_new_testament, has_portions,
has_whole_bible, has_audio_recordings, has_audio_portions,
has_jesus_film, population, least_reached_population, frontier_population,
people_group_count, country_count, hub_country, jp_scale,
percent_christian, percent_evangelical, primary_religion, religion_code,
least_reached, status, country_code, translation_need_questionable,
bible_year, nt_year, portions_year, fcbh_url, jf_url, grn_url,
nbr_pgics, nbr_countries, computed_at
```

`POST /rest/v1/rpc/get_all_language_coordinates` with:

```json
{
  "p_min_lng": -180,
  "p_min_lat": -90,
  "p_max_lng": 180,
  "p_max_lat": 90,
  "p_limit": 20000,
  "p_location_source": null
}
```

returned 8,590 rows. The map consumes `language_entity_id`, `language_name`, `region_id`, `region_name`, `longitude`, `latitude`, `location_source`, `has_full_audio_bible`, `has_audio_portions`, `has_text_portions`, `bible_status`, `has_jesus_film`, `iso639_3`, `rolv_code`, and `bible_stats_computed_at`. The frontend warns if the result reaches its 20,000-row limit; the global response is below that cap.

`GET /rest/v1/language_entities_regions?...&deleted_at=is.null&limit=50000` returned 21,092 active links. There are 19,179 unique language entities, 232 regions, and 8,591 rows with a non-null location. One non-null location is an orphan relation whose entity UUID is not present in the active `language_entities` response; the map RPC therefore returns 8,590. Use the RPC for map points and retain the table for the full relationship audit.

`GET /rest/v1/languages_regions_stats?select=*&limit=50000` returned 21,088 rows with `bible_status`, `language_entity_id`, `people_group_count`, `population`, and `region_id`.

`GET /rest/v1/languages_people_groups_stats?select=*&limit=50000` returned 16,369 rows with `bible_status`, `is_primary`, `language_entity_id`, `people_group_id`, `population`, and `region_count`. All observed rows have `is_primary = true`.

### People groups

`GET /rest/v1/people_groups?select=*&deleted_at=is.null&order=id.asc&limit=50000` returned 10,404 active canonical groups. Fields are `id`, `parent_id`, `name`, `people_id3`, `population_pgac`, and timestamps.

`GET /rest/v1/people_groups_stats?select=*&order=people_group_id.asc&limit=50000` returned 10,404 rows. It includes names, population, language/country counts, primary-language ROLV3, primary-language name and Bible status, JP scale, frontier/least-reached flags, religion, Scripture years, media flags, image URL, source links (`jf`, `grn`), and `computed_at`.

`GET /rest/v1/people_groups_sources?...&deleted_at=is.null&is_external=eq.true&limit=50000` returned 26,773 rows. Fields are `people_group_id`, `source`, `version`, `is_external`, `external_id_type`, `external_id`, `created_at`, and `deleted_at`.

`POST /rest/v1/rpc/get_all_people_group_coordinates` with the same global bbox and `p_limit = 20000` returned 16,368 rows. The map consumes `people_group_id`, `people_group_name`, `region_id`, `region_name`, `longitude`, `latitude`, `peop_name_in_country`, `population`, `language_count`, `country_count`, `primary_language_rol3`, `primary_language_name`, `primary_language_bible_status`, `image_url`, `jpscale`, `least_reached`, `frontier`, `primary_religion`, `percent_evangelical`, `percent_christian_pc`, `bible_status`, `has_audio_recordings`, `has_jesus_film`, and `stats_computed_at`.

`GET /rest/v1/people_groups_regions?select=*&deleted_at=is.null&order=people_group_id.asc,population.desc&limit=50000` returned 16,369 links. Fields include `people_group_id`, `region_id`, `population`, `latitude`, `longitude`, `location_point`, `peop_name_in_country`, `primary_language_rol3`, `people_id3_rog3`, and timestamps.

### Regions and dashboard

`GET /rest/v1/regions?...&deleted_at=is.null&limit=50000` returned the 281-row hierarchy. Fields include `id`, `parent_id`, `name`, `level`, bbox coordinates, center coordinates, and timestamps. Of these rows, 242 have a bbox and center; country shapes are supplied separately by the country RPC.

`GET /rest/v1/region_stats?select=*&limit=50000` returned 252 country rows. Besides codes and names, fields include population, language/people-group counts, Scripture-status counts, religion percentages, Joshua Project scale values, security level, and `computed_at`.

`POST /rest/v1/rpc/get_countries_with_bible_status` with `{}` returned 242 rows. Each row has `region_id`, `region_name`, `boundary_simplified` (GeoJSON `MultiPolygon`/`Polygon` with `EPSG:4326` coordinates), `language_count`, `languages_no_scripture`, `languages_portions`, `languages_new_testament`, `languages_full_bible`, and `bible_status_score`.

`GET /rest/v1/global_translation_statistics?select=*&limit=100` returned one row with the dashboard totals. `POST /rest/v1/rpc/get_active_projects_with_progress` with `{}` returned nine project records with `project_id`, `project_name`, `language_name`, `has_audio`, `has_text`, `completed_chapters`, `total_chapters`, and `progress_percentage`. Both responses are included in the snapshot directory. `everylanguage-active-project-links.json.gz` is a small normalized join that adds each project's exact `target_language_entity_id` and `region_id` from the public `projects` table; its manifest entry points back to the raw active-progress source.

The nine public progress rows at retrieval were:

| Project | Map language | Chapters | Progress |
| --- | --- | ---: | ---: |
| Lunguda Jessu | Longuda: Jessu | 1,188 / 1,189 | 99.92% |
| Oyo-KAJOLA | Yoruba: Oyo | 1,167 / 1,189 | 98.15% |
| Bhujel | Bhujel: Andimul | 621 / 1,189 | 52.23% |
| English - BSB | English: USA | 478 / 1,189 | 40.20% |
| Rasuwa Tamang | Tamang, Western: Northeastern | 6 / 1,189 | 0.50% |
| Birat Rajbanshi | Rajbanshi: Eastern | 0 / 1,189 | 0.00% |
| Santhali | Santali: Manjhi | 0 / 1,189 | 0.00% |
| Kitli Sedang | Sedang: Kotua | 0 / 1,189 | 0.00% |
| IMODI-IJASI-IJEBU | Yoruba: Ijebu | 0 / 1,189 | 0.00% |

## Bible and audio evidence

The frontend maps status codes as follows: `5` = Full Bible, `4` = New Testament, `1–3` = Portions, and `0` or null = No Scripture. This is the presentation grouping in the public map bundle; retain the raw code and boolean fields in EveryBible.

In `language_stats` (35,348 language entities), the raw `bible_status` counts are:

| Raw status | Rows |
| ---: | ---: |
| null | 28,219 |
| 0 | 1,075 |
| 1 | 506 |
| 2 | 1,498 |
| 3 | 1,459 |
| 4 | 1,809 |
| 5 | 782 |

The same profile view has 782 `has_full_audio_bible` rows, 7,084 `has_audio_portions` rows, 7,084 `has_audio_recordings` rows, and 2,026 `has_jesus_film` rows. The separate dashboard view reports 6,054 text-portion languages. The coordinate RPC is a location-scoped representation and has different row-level boolean counts; do not mix its counts with the dashboard totals.

`language_stats` has Scripture year fields (`bible_year`, `nt_year`, `portions_year`) and aggregate flags (`has_whole_bible`, `has_new_testament`, `has_portions`). A non-null status or shared ISO/ROLV value is evidence in the source aggregate, not proof of coverage for every dialect entity that shares a parent or code. In particular, do not mark dialect-specific full Bible/NT/portions coverage by inheriting a parent language's status unless the source explicitly scopes that status to the dialect.

People-group profiles carry a parallel set of aggregate fields, including `primary_language_bible_status`, `primary_language_has_whole_bible`, `primary_language_has_new_testament`, `primary_language_has_portions`, `bible_status`, `has_audio_recordings`, and `has_jesus_film`. Keep these as people-group evidence and do not use them to overwrite a language entity's status.

## Profiles and bios

The map profile route is `/map/language/{language_entity_uuid}`. A browser inspection of `English: USA` showed the language name, parent/hierarchy context, a language sample section, Gospel Recordings, and resources. The public stats row supplies the structured profile fields and provider URLs. It does not supply a narrative biography field.

Every Language's public WordPress pages provide short, human-written project context for selected language projects. Useful source pages for factual, short summaries include [Skou – Indonesia](https://everylanguage.com/language/skou-indonesia/), [Burji – Ethiopia & Kenya](https://everylanguage.com/language/burji-ethiopia-kenya/), [Sabu (Hawu) – Indonesia](https://everylanguage.com/languagefund/sabu-hawu-indonesia/), [Oriya (Odia), India](https://everylanguage.com/language/oriya-odia-india/), and [Halbi, India](https://everylanguage.com/language/halbi-india/). The [Languages](https://everylanguage.com/languages/) page describes active projects and reports eight nations and 38 language groups on that page; this editorial count differs from the map's current nine active-project RPC rows and should not be merged into the map totals.

Use these pages for brief factual bios with a source URL. Do not bulk-copy long narrative or testimony text into the atlas. For structured media, retain the `grn_url`, `fcbh_url`, `jf_url`, and `image_url` values as external-source links and verify their respective reuse terms before redistributing media or images.

## Terms, robots, and reuse limits

On 2026-09-05, `https://map.everylanguage.com/robots.txt` returned `Allow: /map` and disallowed administrative routes such as `/dashboard`, `/partner-org`, `/profile`, `/project`, and `/team`. Cloudflare's content signal was `search=yes,ai-train=no,use=reference`; the same content-signal block appeared on `https://everylanguage.com/robots.txt`. These signals support public page inspection and short source-linked reference. They do not grant a data license for republishing the Supabase tables.

The homepage had no linked privacy/terms URL in the inspected HTML, and common `privacy-policy`, `terms`, `conditions`, and `terms-of-use` paths returned 404 during this pass. This is an access finding, not a legal conclusion. Before publishing a derivative atlas, confirm reuse terms directly with Every Language and the underlying providers (GRN, SIL/IETF, Joshua Project, FCBH, OpenStreetMap, and CARTO where applicable). Preserve provider attribution and source URLs in the admin data model.

The public map's API is not a documented bulk-download API. The frontend's coordinate RPC accepts a viewport and has a 20,000-row limit. This snapshot's global responses are below that limit, while the 70,280-row source crosswalk required two pages because PostgREST capped one response at 50,000 rows. A future refresh should paginate table reads, cap concurrency, honor 429 responses, and record response headers and checksums alongside each refresh.

## Snapshot inventory

The checked-in files prefixed `everylanguage-` under `data/language-atlas/sources/` are raw response arrays compressed with `gzip -n`, except for the explicitly marked normalized active-project links file. They include language entities, language sources, language stats, language coordinates, language-region links/stats, language-people-group stats, people groups, people-group sources/stats/coordinates/region links, regions, region stats, country boundaries, dashboard totals, and active project progress. The manifest records each URL, method, request note/body, observed row count, fields, byte sizes, and SHA-256 checksum, and records the raw source file for the normalized join.

The failed probe `people_groups_regions_stats` is not included: the public REST route returned HTTP 500. The equivalent relationship and location values are available from `people_groups_regions` and `languages_people_groups_stats` and are included.

## Refresh instructions

Use [everylanguage-refresh.py](../../../data/language-atlas/sources/everylanguage-refresh.py) with the public frontend anon value supplied only through `EVERYLANGUAGE_PUBLIC_ANON_KEY`; never put that value in a command committed to the repository or in a manifest. Stage a refresh in a temporary directory first:

```sh
export EVERYLANGUAGE_PUBLIC_ANON_KEY='(obtain from the current public map frontend)'
python3 data/language-atlas/sources/everylanguage-refresh.py \
  --output-dir /private/tmp/everylanguage-atlas-refresh
```

The script uses only read-only GETs and RPC POSTs, paginates table responses, retries 429/5xx responses with a bounded delay, rejects truncated coordinate RPCs, validates required response fields and `Content-Range`, writes deterministic gzip arrays, and records checksums and response metadata. It warns when counts differ from the 2026-09-05 reference; `--strict-current-counts` turns those warnings into failures. Review the temporary manifest and data before replacing the checked-in files. The refresher does not scrape narrative pages or download media.
