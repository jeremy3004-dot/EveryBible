# GRN / ROLV registry research

Snapshot date: 2026-09-05. The source manifest at [`registry-source-manifest.json`](../../../data/language-atlas/sources/registry-source-manifest.json) records retrieval metadata, exact URLs, response paths, hashes, terms notes, and the local source paths. The raw source files are kept under [`data/language-atlas/sources/`](../../../data/language-atlas/sources/).

## Local inventory

The source folder searched was `/Users/dev/Documents/ChatGPT/DIALECTS`, using `rg --files --hidden --no-ignore` with `.git` and `node_modules` excluded. The preserved prior run is under `dialect-study/.work/01a02720-79ba-7ef2-80c2-b43c27fdc073/`. The simplified XLSX named in the earlier report is absent from that run's output directory, but its source data is present as `workbook_data.json` and is preserved in [`registry-workbook-data-20260822.json.gz`](../../../data/language-atlas/sources/registry-workbook-data-20260822.json.gz).

The normalized workbook tables contain 8,327 `language_crosswalk` rows, 12,406 `rolv_varieties` rows, 5,396 `glottolog_omt_enriched` rows, 60,041 `unified_source_index` rows, and 975 `review_queue` rows. The raw Glottolog 5.3 table has 27,178 rows including one header row, or 27,177 data rows: 4,853 `family`, 8,618 `language`, and 13,706 `dialect`. Keep all three levels for traceability, while excluding family and subfamily nodes from mapped language counts. Glottolog `id` values are stable Glottocodes and `parent_id` is the explicit parent link. The OMT enriched table is a taxonomic source view and contains 5,396 rows; it must not replace the raw language/dialect table.

## Current official ROLV data

The current public GraphQL code list is preserved as [`grn-rolv-codes-20260905.json`](../../../data/language-atlas/sources/grn-rolv-codes-20260905.json). It contains 12,400 records at `data.ROLVCodes`, with these fields:

```text
LanguageCode, LanguageName, ROLVCode, LanguageTag,
VarietyName, CountryCode, LocationName
```

The exact query is:

```graphql
{ROLVCodes{LanguageCode,LanguageName,ROLVCode,LanguageTag,VarietyName,CountryCode,LocationName}}
```

The official [ROLV documentation](https://globalrecordings.net/en/rolv) describes `LanguageCode` as the ISO 639-3 parent, `ROLVCode` as a unique five-digit variety identifier, `LanguageTag` as the BCP-47 variety/script tag, `CountryCode` as the ISO 3166-1 country where the variety is predominantly spoken, and `LocationName` as the primary spoken location. The API serializes `ROLVCode` as a number, so every importer must convert it to exactly five ASCII digits with leading zeroes (`7262` becomes `07262`). Keep the explicit ISO parent in every variety record. Country and location strings are placement evidence, not coordinates.

The current [alternate-name list](../../../data/language-atlas/sources/grn-rolv-alternate-names-20260905.json) has 29,300 rows and fields `ROLVCode`, `LanguageTag`, `AlternateName`. The current [change list](../../../data/language-atlas/sources/grn-rolv-changes-20260905.json) has 50,614 rows and fields `ROLVCode`, `LanguageTag`, `Date`, `ChangeType`, `PrevLanguageCode`, `Explanation`. Keep these as separate source records; `A`, `M`, `U`, and `R` history explains why current and earlier snapshots differ.

The local source had 12,406 rows. It remains available as [`registry-rolv-local-20260822.json`](../../../data/language-atlas/sources/registry-rolv-local-20260822.json), rather than being overwritten. The exact tuple `LanguageCode|ROLVCode (zero-padded)|LanguageTag` gives 12,406 old keys and 12,400 current keys. [`registry-rolv-delta-20260905.json`](../../../data/language-atlas/sources/registry-rolv-delta-20260905.json) records 7 removed rows, 1 added row, and 14 changed rows. The removed entries are `csl/21198`, `hau/30735`, `inl/27484`, `ins/20848`, `ins/26019`, `ins/28690`, and `ysm/26195`; the added entry is `vjk/31764` (`Bajjika: Madhesi`). The union for review therefore has 12,407 unique source keys, with current and local provenance retained.

## Coordinates and normalized MapApp point mapping

The [GRN MapApp ArcGIS service](https://gis.lightsys.org/server/rest/services/LanguageResources_v6/MapServer) exposes layer 1, `Language Varieties`, as a point Feature Layer. The retrieved service metadata reports `Map,Query,Data`, `maxRecordCount: 2000`, `singleFusedMapCache: false`, and GeoJSON support. A `returnCountOnly` query reports 1,476 and a `returnIdsOnly` query returns 1,476 object IDs; the all-features GeoJSON query therefore contains the complete currently published layer, without a pagination or tile-cache omission. This validates completeness of that layer, not completeness of all ROLV points.

The audit responses are preserved as [`grn-mapapp-service-metadata-20260905.json`](../../../data/language-atlas/sources/grn-mapapp-service-metadata-20260905.json), [`grn-mapapp-language-varieties-metadata-20260905.json`](../../../data/language-atlas/sources/grn-mapapp-language-varieties-metadata-20260905.json), [`grn-mapapp-language-varieties-count-20260905.json`](../../../data/language-atlas/sources/grn-mapapp-language-varieties-count-20260905.json), and [`grn-mapapp-language-varieties-object-ids-20260905.json`](../../../data/language-atlas/sources/grn-mapapp-language-varieties-object-ids-20260905.json).

The raw layer is [`grn-mapapp-language-varieties-20260905.geojson`](../../../data/language-atlas/sources/grn-mapapp-language-varieties-20260905.geojson). Its properties are:

```text
objectid, iso, grn_num, iso_lang_name, grn_name, scope, state,
parent_num, longitude, latitude, location
```

There are 989 `Dialect` records and 487 `ISO_Lang` records. 1,419 are `Verified` and 57 are `Unverified`; 1,395 features have a Point geometry and 81 have null geometry. By scope, 935 of 989 dialect records and 460 of 487 ISO language records have geometry. Every dialect row has a `parent_num` in this layer; the ISO language rows generally do not, with one source exception.

The derived [`grn-mapapp-language-variety-index-20260905.json`](../../../data/language-atlas/sources/grn-mapapp-language-variety-index-20260905.json) gives each point a stable `source_id` of the form `grnmapapp:LanguageResources_v6/MapServer/1:objectid:<objectid>`. It preserves `iso639_3`, `grn_language_number`, `scope`, `state`, `parent_grn_language_number`, `grn_name`, `iso_language_name`, `location`, `source_coordinates` from GeoJSON `[longitude, latitude]`, and `attribute_coordinates` from the layer fields. Its explicit `match_basis` values are:

* `rolv_code_exact` for 945 dialect points whose zero-padded `grn_num` exactly matches a current ROLV code;
* `iso639_3_language_area` for 487 ISO language points, joined by the explicit `iso` field;
* `source_record_unmatched` for 44 older dialect points whose `grn_num` has no current ROLV key.

`grn_num` is the GRN language number. A dialect page demonstrates why it often equals its ROLV number: [Alumu-Tesu: Alumu](https://globalrecordings.net/en/language/7262) displays GRN Language Number `7262` and ROLV `07262`, while the MapApp row has `scope=Dialect`, `grn_num=7262`, and `parent_num=2140`. For `scope=ISO_Lang`, `grn_num` is the parent language number, so it must never be treated as a ROLV code. Merge a point to a dialect only through an exact ROLV match; merge an ISO language-area point only through its explicit ISO code. Preserve the 44 unmatched dialect source rows for historical review.

The GeoJSON geometry is the more precise source point and can differ from the rounded layer attributes. For example, the Ghotuo feature has geometry `[6.1478010331, 6.5906914187]` but attribute coordinates `longitude=6`, `latitude=6.5`. Store both with their provenance and label the geometry as a source placement. Neither is necessarily a surveyed boundary or a claim that every speaker lives at that point. The GraphQL ROLV code list exposes no coordinate fields, so coordinates must not be fabricated from `CountryCode`, `LocationName`, or an ISO parent.

## Audio and evidence links

The ROLV GraphQL code list is a registry identity source only; it has no audio, Scripture, resource count, or coordinate fields. GRN publishes those details on individual language/variety pages, whose URL pattern is `https://globalrecordings.net/en/language/vvvvv` (the public site may canonicalize a leading-zero numeric path). For example, [Aja: Tohoun-gbe](https://globalrecordings.net/en/language/23908) shows ISO parent `ajg`, scope `Language Variety`, verified state, ROLV `23908`, downloadable media, audio programs, and related-source links. [Alumu-Tesu: Alumu](https://globalrecordings.net/en/language/7262) explicitly says that no recordings are currently available in that exact variety, even though related-language recordings are listed. This is why an ISO parent’s media must not be copied onto a dialect record.

GRN’s [ROLV verification criteria](https://globalrecordings.net/en/rolv) include audio/video, literature including Bible translations, Ethnologue descriptions, Joshua Project/Glottolog/Wikipedia references, documented intelligibility, documented requests, and qualified fieldworker changes. These are evidence categories, not a bulk dialect-specific Scripture status feed. The local workbook’s Joshua Project Bible/audio columns remain parent-language evidence and must stay labeled as such. For exact variety claims, link the GRN profile or a directly identified external source and retain the evidence URL and source scope.

GRN program pages state that recordings may be copied for personal or local ministry use when unmodified and not sold or bundled with sold products; other redistribution requires GRN permission. The atlas should link to GRN pages rather than copy media. The ROLV page supplies registry documentation but no separate API license text, and the ArcGIS metadata supplies no explicit license or copyright text in the retrieved response. Confirm attribution and permission before republishing either registry content or coordinates.

## Reproduction

[`grn-acquire.py`](../../../data/language-atlas/sources/grn-acquire.py) uses only Python’s standard library and the public GET endpoint/query strings above. It preserves response bodies, fetches the full MapApp GeoJSON layer, and builds the derived point index. Run from the repository root with:

```bash
python3 data/language-atlas/sources/grn-acquire.py \
  --output-dir data/language-atlas/sources --date YYYYMMDD
```

To rebuild only the derived index from an existing snapshot:

```bash
python3 data/language-atlas/sources/grn-acquire.py \
  --index-only --output-dir data/language-atlas/sources --date 20260905
```

The script passed `python3 -m py_compile` and the index-only run reproduced 1,476 unique source IDs with 945 exact current ROLV matches, 487 ISO language-area matches, and 44 unmatched historical dialect records.
