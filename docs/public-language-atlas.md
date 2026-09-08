# Public EveryBible language atlas

The public homepage opens on the same interactive MapLibre engine as the admin
atlas. It defaults to Field's dark theme and the closer globe camera (65°E,
25°N, zoom 2.75), with overlapping Scripture-colored dots at recorded locations and the Language varieties
collection (languages plus dialects, excluding people groups). The search, record
list, filters, hover summaries, and selected profiles operate on research
records; these counts are not the app's available Bible catalog.

Dots is the default on each fresh page visit and uses spread mode. The public
controls offer only Dots and Clusters; Recorded locations is hidden for now and
remains available in the admin atlas. Spread mode shows one representative point per mapped record and separates
crowded dots at regional zoom (4 and above), one zoom level earlier than before; global views remain unshifted, and Clusters groups those positions while zoomed out. The public
collection includes languages and dialects only; people groups remain in the admin atlas. Filtered totals
count source records; unresolved source identities may remain separate.

At desktop widths (1024px and above), the atlas sits inside 48–80px page-background
gutters on both sides. Wheel scrolling in either gutter scrolls the page; map
zoom gestures stay confined to the inset map. A subtle border marks the boundary.

## Mobile controls

At widths up to 760px, the default view keeps overlapping dots, a slim search
bar, and collapsed Legend and Settings buttons. Focusing search reveals Records;
typing opens the filtered record list. Legend contains Scripture filters and
About the data. Settings contains projection,
Dots and Clusters controls. Zoom buttons, Fit results, and Reset view are omitted
from the public website; map gestures remain available. The public explorer omits the technical record-count/display note.
The spread record-count caption is hidden at every viewport size. The desktop
“Choose a dot” prompt and inline provider-credit row are also removed; source
details remain available through About the data.

Only one mobile panel opens at a time. Close buttons, Escape, and tapping
outside dismiss it without clearing the active filters. Overlapping map dots
in Clusters open a paginated group list; choosing a record
replaces that list with its profile. Dots select their individual record.
Hover summaries are disabled on mobile to avoid duplicate popups.
The floating QR/app card, direct store links, and research availability note stay
visible while panels are open. Provider source details remain available through
About the data. Desktop controls retain their expanded layout.

The shared map accepts an optional controls target for the public mobile
Settings panel, a group-selection callback for the single-panel flow, and a
hover-summary switch. Without these options, the admin map retains its existing
controls, groups, and hover summaries.

Local browser regression: run `npm run dev --workspace @everybible/site --
--hostname 127.0.0.1 --port 3100`, then pass
`scripts/browser-tests/public-atlas-mobile.js` to the managed Playwright
`browser_run_code_unsafe` tool's `filename` argument. The regression checks collapsed
defaults, panel replacement/dismissal, Settings actions, QR preservation,
320px overflow/overlap, removed public map chrome, and desktop gutters.

Field branding is defined in `packages/brand/tokens.css` and mirrored by the
existing app stylesheets: Bricolage Grotesque headings, Archivo UI, JetBrains
Mono labels, warm charcoal/cream surfaces, and blue accents. Scripture status
uses reef, ochre, clay, danger and neutral. Unverified dialects default to red
(**No known Scripture**) without asserting verified absence or altering source data.
Unknown languages also use red. Exact-variety portions, NT and Bible evidence
sets the corresponding dialect color; profiles distinguish unverified coverage.

Map panels use fully opaque surfaces. Hover popups stack above the spread-dot
canvas so dots cannot paint over their text; keep this order when changing map layers.

## Public data boundary

`scripts/language-atlas/build_public_atlas.py` reads the reviewed admin index
and explicitly selects public identity, search, summary, Scripture-scope,
location, country and source fields. The public artifact is
`apps/site/data/language-atlas/index.json.gz`. New fields added upstream do not
automatically become public. The compatibility artifact retains all 51,486
reviewed records and 75,182 source placements. The versioned startup artifact
(`startup-<sha256>.json.br` or `.json.gz`) keeps the same fields and placements
for the 35,015 language and dialect records used by the public map, while
omitting the separate people-group overlay from the initial download. Locations
are stored once and referenced by index, so every dot and profile location is
restored exactly in the browser. Original source evidence shards, raw imports,
raw active-project data, identities and operational APIs are not included in the
site endpoint. A separate explicitly selected public project summary powers the
Our languages view (see below).

`GET /api/language-atlas/startup/<sha256>` serves the immutable startup artifact
with Brotli negotiation and a one-year cache lifetime. The homepage uses the
version imported from `apps/site/lib/public-atlas-version.json`; a new snapshot
gets a new URL, so repeat visits can reuse the compressed response without a
five-minute freshness expiry. `GET /api/language-atlas` remains as a compatible
gzip endpoint. The admin endpoints independently continue to require an
authorized identity and return private/no-store responses. Next tracing must
include the site's startup artifacts and compatibility snapshot, never the
admin detail shards. Root `/data` remains excluded from Vercel uploads; nested
app runtime data must remain included.

Regenerate after any admin snapshot update:

```sh
python3 scripts/language-atlas/build_public_atlas.py
python3 scripts/language-atlas/build_public_atlas.py --check
python3 -m unittest discover -s scripts/language-atlas -p 'test_*.py'
```

Joshua Project's current terms were reviewed at
https://joshuaproject.net/help/terms on 2026-09-05. The owner explicitly confirmed
existing permission covers public republication in this release. Preserve the
linked “Data provided by Joshua Project” acknowledgment, Glottolog's CC BY 4.0
attribution, and each provider's source links and terms. The public view adds
cross-registry language/dialect identity, exact-scope Scripture distinctions,
and explicitly labeled location precision; it does not copy source photos,
audio or long biographies.

## App downloads

Canonical destinations remain in `apps/site/lib/site-links.ts`. The existing
QR was decoded and verified to contain `https://everybible.app/download`.
That smart route chooses the Apple or Google store by device and sends desktop
visitors to `/#download`; the homepage must retain this anchor. Provide direct
store buttons as well as the QR, with a white quiet zone for reliable scanning.

## Release verification

Run workspace lint, typechecks and tests, public-snapshot regeneration checks,
and both production builds. Inspect the site API trace for the exact public
snapshot and absence of private shards. Check desktop/mobile first load,
search/filter/profile interactions, map/globe and spread/recorded/cluster switches, source
attribution, download routing, and unauthenticated admin API rejection.
The deployment task owns main integration and both Vercel deployments.

### Local verification completed 2026-09-05

- Workspace lint and typechecks passed; 1,704 tests passed. Both production
  builds passed. Python source/projection tests and deterministic snapshot checks passed.
- Public route trace includes exactly one atlas file, the site snapshot; no
  private admin shards. SHA-256:
  `7c6f47cf354b3ae4e75bfe04fc831dbec0a74754c320fd45c0039a00eee1b658`.
- Browser review: desktop 1440×960, phones 390×844 and 320×740; admin light/dark
  palette; globe/flat-map and individual/cluster switches; exact Phu search and
  profile (unknown exact variety, separate started parent context); source
  attribution; Escape and profile scroll reset; dark About page.
- QA fixed inherited broken navigation anchors, small-screen CTA wrapping,
  attribution overlap, and stale ready state during MapLibre instance replacement.
  The lifecycle regression verifies replacement maps are not treated as loaded.
- Temporary local-only admin preview route and fixture servers were removed
  before builds. Final live verification belongs to the deployment task.

### Spread-view update 2026-09-06

The shared canvas overlay projects one representative location per record. Starting at zoom 4, dots can move up to 24 screen pixels along a land-only path, using a mask of the loaded basemap water polygons. Nearby land must have room for the dot; records that cannot fit remain individual colored dots overlapping at their original references. Zooming closer or searching exposes the records; Dots mode does not create clickable groups. Every source ID remains accessible and counts include all records. During camera motion or incomplete basemap loading, points stay at their recorded references. Source points already offshore are not silently relocated. Globe occlusion remains in use; actual coordinates and reconciled identities remain unchanged.

The source reconciliation removes 5,776 proven duplicate variety records while preserving source evidence and exact Scripture scopes. Remaining ambiguous registry identities are still identified as source records, not asserted to be a definitive count of distinct living languages. Historical public snapshot SHA-256: `3402fe0e8eb27591072b371b88ce62d78ebac3169d159e45568df44e1e5b35ac`.

### No known Scripture presentation

All unknown-status records now use red alongside started/needed records under
**No known Scripture**. There is no separate gray Unknown legend filter.
Profiles and hover biographies say **No known Scripture in this language/dialect**;
Agbirigba's identity, classification and country remain visible. This wording is
applied at presentation time so provider statuses and evidence remain unchanged.
Confirmed portions, NT and full-Bible records retain their corresponding colors.
Neutral cluster circles still represent mixed groups, not Scripture status.

### Public profile overview

Selected profiles begin with a concise identity line. A dialect or variety with
a resolved parent is described as a variety of that parent, followed by a
wrapping **Where spoken** area that lists each associated country with a flag
when its two-letter code is valid. Country names remain visible when a flag
cannot be derived.

When a selected record carries source-reported spoken-region labels, the
profile shows those exact labels below the country chips. Identical labels are
collapsed, exact country-name duplicates already shown in the chips are
suppressed, and no labels are inferred from a parent language or another
record.

The overview renders a reported population only when that record has a
non-null, finite source value. It does not inherit a parent's population or
turn a people-group estimate into a speaker count. The public snapshot
currently has no supported population value for Momveda.

Public hover cards show a short name, country flags and names, a plain-language
identity, and Scripture status naming the selected language or variety. A parent
prefix is removed only when it matches the resolved parent name. Missing country
information is omitted, and longer country lists show three countries plus a count.
The location note distinguishes approximate placement from a mapped reference area.
Clicking the dot opens the profile; the hover hint describes that action explicitly.
Both Dots and Clusters use this preview, and mobile continues to open profiles directly.

The profile uses the same short name and named Scripture wording. It omits the
parent-language Scripture paragraph. Stored parent context, original identities,
and exact-variety evidence remain unchanged; confirmed statuses are never inherited
from the parent. Identifiers and reference locations remain below the overview.
No pilot research claims or population estimates were imported by this change.

The historical public snapshot for the initial overview update had SHA-256
`5d6c003cf6d8179329e805fd422e09e249c3479859c5a3eb8594d31982f83151`.

### Startup performance verification

The homepage preloads the versioned snapshot with anonymous CORS credentials,
matching the browser fetch, and includes the map module in its initial script
loading graph. Keep these aligned: a mismatched preload can create two requests.
The public map suppresses its empty-selection message until data is ready.

The initial September 2026 startup snapshot was 1,991,632 Brotli bytes (2,494,993 gzip bytes),
down from 4,604,051 gzip bytes; decoded JSON falls from 51,719,404 to 17,149,655
bytes. Complete public profiles remain available immediately after startup.
The compatibility endpoint and authenticated admin data remain unchanged.

`public-atlas-transport.test.ts` verifies the content hash, compression parity,
all public fields, every placement, representative dots, and search results
against the compatibility snapshot. The version route tests cover negotiation,
invalid/missing versions and immutable cache headers. Run `npm run verify:workspace`,
the atlas Python tests, `npm run atlas:public:check`, and `npm run site:build`.
Browser checks should include cold and repeat loading, a failed snapshot followed
by retry, hover and dot selection, full profiles, search/filter/pagination,
Dots/Clusters and Globe/Map switching, and 320/390 px mobile layouts.

Before release, desktop (1200 × 837) and mobile (390 × 844 at DPR 3) screenshots
were pixel-identical to the previous live site. This confirms those tested
views; it is not a guarantee about every device, camera position or network.

On desktop, opening a profile temporarily hides the fixed legend and gives the
profile more height so its country and Scripture status remain visible on shorter
windows. Closing the profile restores the legend. The download card stays visible.

## Our languages and project progress

**Our languages** opens a project-first list with the 23 projects the owner
approved from the September 7 LangQuest portfolio: activity reported within
30 days of the snapshot. Search includes project names, not just atlas names.
Other map records fade; reviewed project language matches pulse in Dots and
Clusters. CSS animates only the small rings, and reduced motion disables it.
Every project remains discoverable even when its exact map link is unconfirmed;
those profiles say “Map location awaiting confirmation” instead of guessing a
related dialect. The existing Scripture colors retain their original meaning.

The primary metric is the CSV's **Chapters Recorded %**, preserved verbatim as
a number. It is not recomputed from **Total Chapters**, which covers a different
scope. Bhujel therefore shows **38.9%**, **463 chapters recorded**, and **677
chapters listed in the project**. Gospels, NT, and OT percentages remain separate;
blank values display “Not reported,” never zero. Recording activity expands to
show source counts and last activity relative to the snapshot. Recording does
not establish review, approval, publication, or availability in EveryBible.

The public summary is `apps/site/data/language-atlas/projects.json`. Regenerate:

```sh
python3 scripts/language-atlas/build_public_projects.py
python3 scripts/language-atlas/build_public_projects.py --check
```

The exporter reads the preserved owner-supplied
`data/language-atlas/sources/langquest-status-2026-09-07.csv` and reviewed
`langquest-project-atlas-links.json`. The CSV retains its generated timestamp
and “live, unaudited — NOT a pay artifact” provenance. This is a dated snapshot,
not a live API. Link evidence is kept separately from source metrics. Existing
Every Language entity links are reused; additional spelling/variety matches
are explicitly recorded for review, never inferred at runtime. Missing links
remain null and do not remove a project from the list. Raw sources and admin
evidence shards are not imported by the public application.

Browser regression: `scripts/browser-tests/public-atlas-projects.js` verifies
all 23 project rows, source metrics, source-date labeling, project-name search,
map selection, Dots/Clusters, reduced motion and 320/390px mobile controls.

## Global identity reconciliation — 2026-09-07

The reviewed build consolidates 2,512 additional Glottolog/ROLV duplicate records,
including Paachsai/Paanchsai and Sinja. The public map now contains 38,073 language
and dialect records. People groups remain a separate collection. Original source
IDs are retained as `alternateIds` in both public artifacts and search; reviewed
project references resolve to their canonical record. Source names, evidence,
locations and exact-variety Scripture scopes are preserved.

The final startup version is
`d3c458414205d37b277a61c2c7d1d51237ed718ffc9ea010fd990db0d88da7a8`: 1,950,480
Brotli bytes, 2,433,309 gzip bytes and 16,517,901 decoded bytes.

These are reviewed contextual identity inferences, with ambiguous names and
classification conflicts retained separately. See the
[lead review](research/language-atlas/reconciliation-lead-review.md) and its
machine-readable outcomes for scope, retained cases and validation.

### Conservative second pass

Astra agents at low reasoning reviewed the remaining candidates, with final lead
adjudication. Twelve additional source pairs were reconciled using fresh primary
source corroboration and verified GRN snapshot aliases. The map now has 38,061
language/dialect records. Uncertain identities remain separate; all original IDs,
source locations and Scripture claims survive. See the
[second-pass review](research/language-atlas/reconciliation-pass2-review.md).

Current startup version:
`ec3548b24a76c988dd0437e8f330266a401b9f3479537e120a49bdbaeff7ee66`
(1,950,829 Brotli bytes; 2,432,898 gzip bytes; 16,514,780 decoded bytes).

### Atlas-wide naming equivalence

The next reviewed pass consolidates 3,046 additional cross-registry identity
pairs, including Kyrgyz: Northern / Northern Kirghiz and the Southern pair.
North and South remain distinct; Kyrgyz: China is retained separately despite its
confusing Northern alias. Matching uses source-attested parent labels and exact
scoped names; phonemic punctuation and nested directions are preserved.

The current public map has 35,015 language/dialect records. Startup version:
`66821d6102ebe7712d6117768f4b9486a67b712667daa312bfe49b81f41245bf`
(1,901,629 Brotli bytes; 2,355,025 gzip bytes; 15,742,669 decoded bytes).
See the [completion report](research/language-atlas/reconciliation-naming-completion.md)
for approved groups, exclusions and conservation checks.
