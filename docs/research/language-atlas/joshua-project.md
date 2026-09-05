# Joshua Project source research

Accessed 2026-09-05. This is an internal, authenticated, nonprofit ministry-research snapshot for the EveryBible language atlas. It is a source layer, not a public Joshua Project replica and not a canonical language/variety crosswalk.

## Current source paths

Joshua Project currently exposes the following bulk downloads from its [Datasets & API page](https://m.joshuaproject.net/resources/datasets):

| Dataset | Official URL | Shipped source | Data rows | Use |
| --- | --- | --- | ---: | --- |
| All people groups in country (PGIC) | `https://m.joshuaproject.net/resources/datasets/1` | [joshua-project-pgic-all.csv](../../../data/language-atlas/sources/joshua-project-pgic-all.csv) | 16,426 | One row per `PeopleID3` + `ROG3`; names, populations, Scripture status, and map-dot coordinates |
| All countries | `https://m.joshuaproject.net/resources/datasets/4` | [joshua-project-countries-all.csv](../../../data/language-atlas/sources/joshua-project-countries-all.csv) | 238 | `ROG3` to ISO country mapping and country context |
| People-country-language table | `https://m.joshuaproject.net/resources/datasets/5` | [joshua-project-people-country-language.csv](../../../data/language-atlas/sources/joshua-project-people-country-language.csv) | 45,352 | Separate relationship table; primary/secondary language and dialect links |
| All language data | `https://m.joshuaproject.net/resources/datasets/6` | [joshua-project-languages-all.csv](../../../data/language-atlas/sources/joshua-project-languages-all.csv) | 7,135 | Language-level Scripture, audio, Jesus Film, and country/people-group counts |
| General field descriptions | `https://m.joshuaproject.net/resources/datasets/7` | [joshua-project-field-definitions.csv](../../../data/language-atlas/sources/joshua-project-field-definitions.csv) | 226 | Field meanings and code notes |

The live-download response was CSV UTF-8 with BOM and included a two-line title preamble plus a footer containing Bible-status labels and contact text. The raw files above preserve those bytes. Derived files exclude the footer and carry `source_file` and one-based `source_row` provenance:

- [joshua-project-atlas.json.gz](../../../data/language-atlas/sources/joshua-project-atlas.json.gz) contains the manifest, code definitions, language records, PGIC records, people-language records, country records, and short derived language bios. Its arrays are intentionally separate source layers. Decompress it for ingestion.
- [joshua-project-source-manifest.json](../../../data/language-atlas/sources/joshua-project-source-manifest.json) records URLs, retrieval times, content types, byte sizes, SHA-256 hashes, columns, and row counts.

To refresh this snapshot from the public bulk endpoints, run `python3 data/language-atlas/sources/joshua-project-refresh.py` from the repository root. The script uses bounded retries for transient HTTP errors, sends no API key, preserves the source CSV preamble/footer, and writes a gzip-compressed JSON atlas plus the source manifest. Review the resulting hashes and terms before any release or public display.

The two other publicly listed bulk exports, unreached PGIC (`/2`) and PGAC (`/3`), were fetched during research but are not shipped because the all-PGIC source already supplies the requested people-country locations and the extra exports duplicate that layer. Their temporary copies are outside the repository and are not part of this snapshot.

## Provenance and row counts

The manifest records each exact download. Retrieval times are the HTTP `Date` values from the server:

| File | Retrieved UTC | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `joshua-project-pgic-all.csv` | 2026-09-05T11:41:03Z | 4,286,716 | `7e82dab12e31aac1acbab2cb8e3f6b4489dcf9ecfd1298a74c9e687e44de4464` |
| `joshua-project-countries-all.csv` | 2026-09-05T11:41:45Z | 34,987 | `03ca732b969700bcf6f76e57c47557bdca78f14d8816807b30e13adc6fc3ad89` |
| `joshua-project-people-country-language.csv` | 2026-09-05T11:41:11Z | 1,913,060 | `49da019b729ab4c7e3c2cb40b0c47f7875e6555776e18555fb4deb2596b97c01` |
| `joshua-project-languages-all.csv` | 2026-09-05T11:41:14Z | 273,937 | `d6f9def56c1eaad2606faf3e96d0e62722c4ad4ae018354ccf9b212d7ebcb944` |
| `joshua-project-field-definitions.csv` | 2026-09-05T11:41:16Z | 16,181 | `a51772a8c73db5f7f56dc2a309a4836f96ef6f73b6833a70dfbde375f66267bb` |

Observed derived counts:

- 7,135 distinct `ROL3` language records.
- 16,426 PGIC records covering 10,422 distinct `PeopleID3` values and 6,163 distinct `ROL3` values.
- Every PGIC source row has a latitude and longitude in the valid geographic range. These are map-dot coordinates, not a claim that a people group lives at one point.
- 45,352 people-language relationship rows; 16,426 distinct `PeopleID3` + `ROG3` relationship keys. A country/people key can have many languages; the maximum observed was 145.
- 1,758 relationship rows have a nonzero `ROL4` dialect code.
- 238 country records. `ROG3` and ISO-2 differ in 145 records; the country crosswalk is therefore required.

## API status and access requirements

The official [API documentation](https://api.joshuaproject.net/v1/docs/available_api_requests) lists REST resources for languages, countries, PGIC, PGAC, regions, continents, totals, and the daily unreached feed. The public [OpenAPI document](https://api.joshuaproject.net/api-docs.json) says the required query parameter is `api_key`; response format is `json` or `xml`; list endpoints support `page` and `limit`, with a documented default limit of 250. A read-only request to each of `https://api.joshuaproject.net/v1/languages.json`, `/v1/people_groups.json`, and `/v1/countries.json` without a key returned HTTP 401 with “You are missing your API key.” No key was obtained, stored, or reused. Bulk CSV downloads are the current source for this snapshot.

The API documentation describes language/country filters as using two-letter FIPS 10-4 codes and language filters as three-letter ISO codes. Treat these as API query conventions, not permission to assume FIPS codes are ISO codes.

## Terms and permitted use

The [Joshua Project Terms of Use](https://m.joshuaproject.net/help/terms) state that the information is for non-commercial missions research and educational use. The granted license is non-exclusive, non-transferable, revocable, and free of charge. Commercial use is prohibited. Pages displaying Joshua Project data must show the visible attribution **“Data provided by Joshua Project”** with a hyperlink. Public use must not directly replicate Joshua Project’s service/presentation or reproduce substantial amounts of its data; a value-added presentation is required. Access must not be abused. If API access is terminated, the terms require downloaded or cached API data to be deleted. Photos, maps, and profile text can carry separate third-party copyrights; do not copy them into the atlas. Link to a profile for longer narrative material instead of importing it.

This work therefore includes structured facts and short derived bios only. It does not copy Joshua Project profile narratives, prayer text, photos, maps, or resource descriptions. Any future user-facing deployment must be reviewed against these terms and retain the required attribution/link. The current intended use is an internal authenticated nonprofit ministry atlas.

## Registry and join rules

The current [Joshua Project definitions](https://m.joshuaproject.net/help/definitions) and [FAQ](https://m.joshuaproject.net/help/faqs) define the identifiers as follows:

- `PeopleID3` is the Joshua Project five-digit people ID for one people group across every country in which it lives. In the PGIC table it is repeated by country.
- A PGIC row is identified by `PeopleID3` + `ROG3`, which represents that people group in one country. It is the correct grain for map points, country population, and country-specific status.
- `ROG3` is the two-letter FIPS/HIS country code. Join it to ISO2/ISO3 only through the `country_records` array in the snapshot (derived from `joshua-project-countries-all.csv`); do not label `ROG3` as ISO2. For example, Joshua Project `CH` maps to ISO2 `CN` / ISO3 `CHN` for China.
- `ROL3` is the three-letter Joshua Project/HIS language code described by Joshua Project as an ISO/Ethnologue code. Join only on the exact code. The current files contain codes with no PGIC rows, and one PGIC/crosswalk code (`BOD`) absent from the language export; those are source facts, not automatic errors or canonical matches.
- `ROL4` is the Joshua Project/HIS dialect code. The current CSV serializes it as an integer-like value (`7966`); the normalized relationship file stores `07966` as text to preserve the five-character identifier convention used by the broader HIS/ROLV work. Joshua Project’s public pages call it a dialect code and examples in profiles identify it as a Global Recordings listing. This confirms its role as a dialect-level relationship key, but it does not by itself prove that every `ROL4` is a current ROLV record. Cross-reference to an authoritative ROLV/HIS release before promoting it to a canonical variety ID. Local comparison to the prior ROLV export matched 932 of 1,758 nonzero `ROL4` rows by exact `ROL3` + zero-padded code; names and country codes differed often enough that this must remain a reviewable source relation.

Keep Joshua Project language records, PGIC records, and people-language relationships as separate source layers. A language record’s `NbrPGICs` and `NbrCountries` are Joshua Project’s own counts; they are not speaker counts. A PGIC `Population` is population in one country. The relationship table’s `Speakers` field is described as world speakers and can repeat for each people-language relationship; do not sum it. Do not sum relationship rows to derive a language population, and do not collapse primary (`P`) and secondary (`S`) links into one undifferentiated language list.

## Scripture and map semantics

The explicit Bible-status table in the current field-definition export and Joshua Project’s definitions page is:

| Code | Meaning |
| ---: | --- |
| 0 | Unspecified |
| 1 | Translation needed |
| 2 | Translation started |
| 3 | Portions |
| 4 | New Testament |
| 5 | Complete Bible |

Some legacy field-description rows in the CSV truncate or show an older off-by-one description for `BibleStatus`; use the explicit status table at the file footer and the current definitions page above. Keep `BibleStatus`, `BibleYear`, `NTYear`, and `PortionsYear` separate. A year in one field must not be promoted to a full-Bible claim without its status code. `JF` and `AudioRecordings` are source availability flags, not a claim that a complete Bible exists in text or audio.

The current PGIC export includes `Latitude` and `Longitude`. Joshua Project’s API column description says these are the latitude/longitude of a language polygon or highest-density-district centroid for map dots; the older methodology also describes centroids of mapping polygons. The atlas should render them as approximate source map points, include a source label, and avoid publishing them as exact settlement coordinates. This is especially important for sensitive people groups.

Joshua Project’s current data guidance says populations, progress scales, frontier/least-reached labels, and related values are estimates that change over time. Its FAQ says country populations are scaled using current UN country growth rates. Use these values as dated orientation data and preserve retrieval dates. Verify operational decisions with local partners.

South Asia needs special handling: Joshua Project’s methodology and definitions explain that people groups in Nepal, India, Pakistan, Bangladesh, Sri Lanka, and Bhutan may be defined by caste/community, religion, geography, and shared history rather than language alone. A single language can therefore be linked to many PGIC rows, and one PGIC can list many primary/secondary languages. Do not infer a language-defined people group from a language join.

## Suggested atlas contract

The existing MapLibre globe can consume the `people_group_country_records` array from `joshua-project-atlas.json.gz` as an optional source layer with one point per PGIC record and the `language_records` array as the language list/hover enrichment. Use source IDs in joins:

```text
language source key:          ROL3
people-country source key:    PeopleID3 + ROG3
relationship source key:      PeopleID3 + ROG3 + ROL3 + ROL4
country display mapping:      ROG3 -> ISO2 / ISO3 via country crosswalk
```

Canonical language or ROLV matching belongs in a separate reviewable layer. It must retain the Joshua Project source values and confidence/decision metadata alongside any match. The snapshot intentionally contains no automatic ROLV or canonical join.
