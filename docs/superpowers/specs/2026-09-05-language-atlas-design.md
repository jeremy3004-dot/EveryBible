# Language and dialect atlas

## Purpose

Add `/languages` to EveryBible's authenticated admin. Operators can find every
language and dialect represented in the DIALECTS source collection, inspect
related people groups, and explore the same records on a flat map or globe.
Research and source acquisition precede application implementation. The user
authorized autonomous planning, Luna research, Astra implementation and review.

## Decisions

Reuse Next.js 15, React 19, the existing Field design system, and MapLibre GL JS
5.21.1. Extract only shared basemap presentation from the activity atlas; keep
its analytics behavior intact. Cluster GeoJSON features instead of mounting a
DOM marker for every record. No new mapping service, package, database or paid
API is needed.

Three approaches were considered: live scraping on page load, a new geospatial
database/service, and a reproducible source snapshot served by existing admin
routes. Choose the snapshot: predictable loading, auditable sources, no external
service dependency during research sessions, and a smaller operational surface.
Refresh explicitly through the documented import command. New research data
must not silently replace verified local values.

## Research and evidence

Source reports live in `docs/research/language-atlas/`. Preserve original source
identifiers, retrieval dates, source release dates where known, source URLs,
license/attribution, input hashes, and record counts. Sources include the user's
DIALECTS collection, Glottolog, GRN/ROLV, Joshua Project bulk exports, and public
Every Language map data. Prefer official bulk/API reads over per-page crawling.
Keep unsupported or unavailable sources explicit in the coverage report.

Language, dialect/variety, and people group are distinct record kinds. ROLV IDs
remain five-digit strings. Glottolog family/subfamily rows are hierarchy context,
not extra languages. Match source records by explicit identifiers and documented
crosswalks; name resemblance alone never establishes identity. Unmatched rows
remain visible. Distinct registries retain their own records when no exact
crosswalk proves equivalence.

Scripture categories: complete Bible, New Testament, portions, translation
started, translation needed, and unknown. A dialect does not inherit confirmed
coverage from its ISO parent. Show parent-language context separately and mark
it as context. Unknown is not no Scripture. GRN gospel recordings are an audio
resource signal, not proof of a complete audio Bible. People-group populations
are not summed into a language speaker estimate. Bios are short factual summaries
with links, not copied long narratives.

Coordinates are reference locations, not precise settlement boundaries. Keep
source language/dialect/people-group locations separate from parent-language and
country-center approximations. Never invent scatter/jitter coordinates. Records
without placement remain in the searchable list with an explicit unmapped count.
Multiple records at one coordinate stay selectable, including at maximum zoom.

## Operator experience

The new sidebar item is “Languages” under Insights. A compact introduction and
coverage strip lead into a dominant atlas, searchable results, and a persistent
record inspector. Show overall counts and filtered counts with clear labels.

Search names, aliases and identifiers. Filter record kind, country, Scripture
status, and mapped/unmapped or approximate placement. Search/filter state applies
to both list and map. Pagination bounds DOM size. A record selection from either
surface opens its inspector and focuses its map location. Keyboard and touch
users can reach the same details through list controls. Show hover bios on dots;
click pins the full profile. Cluster interactions expose coincident records.

Map/globe, fit results, reset view, a labelled Scripture color legend, source
attribution and a coverage explanation are always available. The inspector shows
identifiers, family/parent, geographic precision, short bio, Scripture evidence,
audio context, related dialects/people groups, and source links. Text labels
accompany colors. Mobile stacks the same data without page overflow. Light/dark
themes and reduced motion follow existing admin behavior.

## Data delivery and security

Build compact index and detail snapshots into `apps/admin/data/language-atlas/`.
Serve index and individual details from `/api/language-atlas` and
`/api/language-atlas/[id]`, each independently requiring the existing admin
identity. Do not place snapshots in `public` or expose a credentials bypass.
Cache the index and at most two of sixteen detail shards per server process; preserve data files in Next's
standalone output using explicit tracing. Return actionable JSON errors and
offer retry for load failures. Do not embed API keys or external HTML in clients.

The index contains only fields needed for searching, filtering, plotting and
hover cards. Longer source evidence is requested when a record is selected.
Use abort/stale-response handling so rapid selection cannot show the wrong bio.
CSV exports reflect the filtered list and escape spreadsheet formulas.

## Verification

Test identifier preservation, source precedence, dialect Scripture scope,
coordinate validity and precision, unmatched records, count reconciliation,
search/filter selection, CSV safety, and route authentication. Check all admin
tests, lint, typecheck and production build. Verify the real component in a local
browser with the full snapshot: map/globe, colored points, hover/click, dense
clusters, search, filters, detail races, export, error/empty states, keyboard,
dark theme and a 390px viewport. Confirm bundled files in the standalone trace.

Local implementation and verification are this task's completion boundary.
Publishing follows the repository's separate deployment handoff when requested.
