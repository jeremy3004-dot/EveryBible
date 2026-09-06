# Admin language atlas

The **Languages** item under **Insights** opens `/languages`, an internal research
atlas using the existing admin identity and MapLibre globe. It provides a shared
searchable list and map, hover biographies, a selected-record inspector, source
links, related varieties and people groups, filters, and a filtered CSV export.
The default collection combines language and dialect records as **Language
varieties**; people groups and all collections remain separately selectable.

The atlas fills the viewport below a 56px header. A floating inspector holds
Map controls, Records, and Collection; on phones it collapses to a bottom sheet.
The header's Admin menu opens the other admin pages. Search shows up to ten
keyboard-accessible suggestions, with the complete filtered list in Records.
Profiles replace the inspector contents and keep source evidence in an expandable
section. Back, close, and Escape restore access to the list/search.

## Collection reconciled 2026-09-06

| Record kind / placement                        | Records |
| ---------------------------------------------- | ------: |
| Languages                                      |   9,795 |
| Dialects and varieties                         |  30,790 |
| People groups in countries                     |  16,471 |
| Total                                          |  57,056 |
| With a reference or approximate placement      |  55,550 |
| Approximate placements within the mapped total |  29,081 |
| Without a supported placement                  |   1,506 |
| Flagged for source review                      |   1,790 |

These are registry records, not a definitive count of distinct living languages.
Different registries remain separate where no verified identifier crosswalk
establishes identity. A people group is not necessarily a distinct language.

The source audit preserves every saved DIALECTS language ID (8,327), all Glottolog
5.3 languages (8,618) and dialects (13,706), and the union of saved/current ROLV
codes (12,407). Current Joshua Project contributes 16,426 people-group/country
identities; unmatched Every Language records remain separate. All 35,348 Every
Language entities are represented through their source identifiers, including
63 hierarchy nodes attached to existing explicit ISO language records without
adding another language count. All 8,590 language coordinate rows retain their
source identity. GRN's 1,476-row map layer contributes 1,395 non-null geometry
points, with 44 historical dialect records retained separately where no exact
ROLV match is verified.

## Interpreting the map

- **Recorded locations** is the default. It retains source positions and allows
  overlap, including additional positions for a record. Optional **Spread dots**
  shows one representative point per record and separates overlaps only at zoom 5
  and above. Global views retain their geography even in this optional mode. **Clusters** groups recorded positions as the user zooms
  out. Map and Globe change projection while retaining the current view. Zoom,
  Fit results, and Reset view stay above the mobile sheet and clear of the desktop inspector.
  The initial and Reset views use zoom 2.75 centered at 65°E, 25°N, filling the
  map with the closer Africa–Europe–Asia view requested in the reference screenshot.
- Colors use the Field brand's reef, ochre, clay, danger, and neutral tokens,
  with separate light and dark values shared by map dots and legends. Started and needed
  records and unverified dialects share the red **No known Scripture** display category.
  This is a visual default, not verified absence. Exact status remains in profiles and
  exports; unknown languages and people groups remain neutral. Legend filters follow
  these displayed categories.
  Labels accompany every legend swatch. Mixed clusters use a neutral color.
- **Unknown does not mean no Scripture.** Dialect coverage is not inferred from
  its ISO or parent language. The inspector shows parent-language context
  separately. People-group status describes its reported primary language.
- GRN gospel/audio resources are not automatically an audio Bible. Original
  audio and Scripture flags remain attributed source claims in the inspector.
- Source points are reference areas. Related-people-group, parent-language and
  country-center placements are explicitly approximate. Spread mode changes only
  the on-screen presentation; exact source coordinates remain retained and
  Recorded locations restore them. Unmapped records remain searchable.
- Multiple source positions and co-located records remain inspectable. A cluster
  counts points; its chooser lists distinct records, with pagination when needed.
- Displayed totals count filtered source records. Records remain separate where a
  source identity cannot yet be verified, so totals are not a definitive count of
  distinct living languages.
- Country filters follow reported associations, not a spatial boundary test.
  A language's reference point can lie in another associated country.
- CSV contains the filtered records and their representative location, preserves
  identifiers in the file, and escapes spreadsheet formulas. All additional
  locations are available in the inspector and source snapshot.

## Source precedence and discrepancies

[Every Language research](research/language-atlas/everylanguage.md),
[Joshua Project research](research/language-atlas/joshua-project.md), and
[GRN/registry research](research/language-atlas/grn-registry.md) record endpoints,
counts, schemas, versions, attribution, and reuse limits. The public Every
Language map uses Supabase data and RPCs; no private API key is needed in this
application. Joshua Project's public bulk exports supply the requested facts
without obtaining a REST API key.

The 2026-09-06 identity reconciliation joined 5,776 duplicate Every Language variety records through globally unique GRN identifiers and retained ROLV codes. Explicit parent-language conflicts are excluded; ambiguous links remain flagged. All 12,407 ROLV records, 35,348 Every Language entity IDs, 70,232 external-ID evidence rows, and 8,590 language-coordinate source references remain represented. Surviving Scripture status, scope, and parent-context values are unchanged.

Current Joshua Project language claims take precedence over saved language
claims. Conflicting values are retained. No name-only join merges entities.
ROLV IDs remain five-digit strings. Joshua Project ROG codes are mapped through
its explicit country crosswalk, never treated directly as ISO country codes.

The Every Language region table assigns `PS` to W. Sahara, while its people-group
ROG links and the direct Joshua Project crosswalk resolve `WI` to `EH`. The atlas
uses the direct crosswalk and preserves both claims and a review flag. Seven
saved ROLV codes are absent from the live feed and remain visible. Forty-eight
Every Language external-ID rows refer to 46 absent entity IDs: these stale links
remain in the raw source and build report, without inventing active entities.

Raw sources live under `data/language-atlas/sources/`, outside public assets.
Each provider retains its terms. The UI links **Data provided by Joshua Project**,
credits Glottolog and GRN, and exposes retrieval dates and rights information.
Long copyrighted narratives and media were not copied into biographies.

## Rebuild and refresh

Run from the repository root using the existing npm installation and Python 3:

```sh
npm run atlas:build
npm run atlas:check
```

The build is offline and reproducible. `atlas:check` runs importer regressions and
compares regenerated files byte-for-byte. `apps/admin/data/language-atlas/build-report.json`
records input counts, discrepancies, source SHA-256 hashes, and artifact hashes.
The installed `world-countries` dependency supplies labeled country centers.

Refresh providers explicitly; a page visit never scrapes them. Use the acquisition
scripts documented in the three research reports. Every Language's refresh reads
its public frontend key only from `EVERYLANGUAGE_PUBLIC_ANON_KEY`; credentials are
never stored in snapshots. Start in a temporary output directory, check provider
terms, response counts and identifier changes, then intentionally replace the
reviewed inputs. Update the dated GRN input paths in `build_atlas.py` for a new
release, rebuild, review the report, and run the verification gates. Keep the
saved DIALECTS registry as the original comparison layer.

## Runtime and verification

`/api/language-atlas` and `/api/language-atlas/[id]` independently require the
existing `super_admin` identity. Responses use `private, no-store`; unavailable
authentication/data returns generic retryable JSON. Source text is rendered as
text, and external links allow HTTP(S) only. No snapshot is under `public`.

The index is compressed on disk. Detail evidence is distributed by the first
SHA-256 hex digit of its record ID across sixteen gzip files. Only two detail
shards remain in the process cache, so one profile does not load the full 208 MB
evidence collection. User IDs are exact map keys; only the derived hex digit can
select a fixed file. Next standalone tracing includes the runtime snapshots.

Relevant automated gates are `npm run atlas:check`, `npm run verify:workspace`,
and `npm run admin:build`. Tests cover source scopes, identifier preservation,
hierarchy/related-record integrity, point provenance, filtering, CSV safety,
cluster/hit selection, style cancellation, authentication, bounded detail caching,
and snapshot checksums. Existing analytics camera and brand tests remain in place.

Browser QA uses the real components and full dataset with temporary local data
fixtures because this checkout has no configured admin login environment. The
preview route and fixture servers are removed before the production build.
Live account sign-in and published deployment are verified separately by the
deployment task.

Initial collection verification: **1,693 workspace tests and nine importer
regressions passed**, with lint, typecheck, deterministic rebuild, and the
production build successful. The existing Next custom-font warning remains.
All 17 runtime data files in the standalone package match their source hashes;
raw downloads and the temporary preview route are excluded. Packaged HTTP checks
use non-secret local public configuration to confirm unauthenticated denial and
that data files are not public routes. No real account session was used.

Local browser evidence is in `qa-evidence/language-atlas/` (ignored verification
artifacts): settled globe, selected map/profile, hover, mobile profile, and the
31-record Tamang CSV. Research plans and final review are in
`docs/superpowers/plans/2026-09-05-language-atlas.md`.

The subsequent experience-parity update is documented in
`docs/superpowers/plans/2026-09-05-language-atlas-experience-parity.md`.
Astra reviewed the Sol implementation against measured reference geometry and
performed browser checks at 1440×960, 390×844, and 768×1024. The update passed
1,702 workspace tests. Data files and source claims were not changed.

## Dialect color updates

Unverified dialects default to red without changing their stored Scripture evidence.
Confirmed exact-variety portions, NT, and Bible claims retain their corresponding colors.
To update an individual variety through the reviewed data pipeline, set its canonical
record's `scriptureStatus` and `scriptureScope: "dialect"` from attributed evidence,
then rebuild both snapshots. Parent-language status never changes a dialect's color.
The atlas currently has no inline status editor; snapshot files are generated and
should not be hand-edited.
